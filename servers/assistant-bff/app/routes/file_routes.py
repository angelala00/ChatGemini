import asyncio
import hashlib
import time
import os
import uuid
import zipfile
from pathlib import Path
from apscheduler.schedulers.background import BackgroundScheduler
from ..utils import extract_text
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status, Form
from fastapi.responses import JSONResponse, FileResponse
from datetime import datetime, timezone
from app.auth.auth_routes import GLOBAL_AUTH_PROVIDER, get_current_auth_provider, get_current_user
from app.base_config import model_config
from app.admin.access_control import resolve_user_permissions
from app.logger import gpt_logger
from app.gpts.config_gpts import gpts, refresh_gpts
from app.utils.model_tool import (
    MODEL_NAME_INSTRUCT,
    MODEL_NAME_THINKING,
    MODEL_NAME_VL,
)
from app.utils.image_utils import detect_image_dimensions_from_bytes, is_image_file
from app.storage.business_store import (
    FileUploadQuotaExceeded,
    distributed_task_lock,
    find_owned_file_mapping_by_content,
    get_file_mapping,
    insert_file_mapping,
    list_admin_model_configs,
    list_file_mappings,
    release_file_upload_slot,
    reserve_file_upload_slot,
)
from app.storage.object_store import (
    ensure_local_path,
    store_file,
)
from app.storage.file_lifecycle import (
    delete_file_reference,
    delete_unreferenced_object,
    file_object_lock_name,
)

router = APIRouter(prefix="/api", tags=["auth"])

DOCUMENT_EXTENSIONS = {"txt", "md", "csv", "pdf", "doc", "docx", "xlsx", "pptx"}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png"}
SAFE_CONTENT_TYPES = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

MODEL_UPLOAD_RULES = {
    "auto": {"documents": True, "images": True},
    MODEL_NAME_THINKING: {"documents": True, "images": False},
    MODEL_NAME_INSTRUCT: {"documents": True, "images": False},
    MODEL_NAME_VL: {"documents": False, "images": True},
}
FILE_LIFETIME_DAYS = model_config.FILE_LIFETIME_DAYS
DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
DEFAULT_IMAGE_MAX_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_ACTIVE_FILES = 2000
DEFAULT_MAX_ACTIVE_FILES_PER_USER = 200
DEFAULT_MAX_CHAT_ATTACHMENTS = 10
DEFAULT_MAX_CHAT_ATTACHMENT_BYTES = 30 * 1024 * 1024
DEFAULT_MAX_FILE_IDS_FIELD_CHARS = 2048
DEFAULT_MAX_ATTACHMENT_TEXT_CHARS = 100_000
DEFAULT_EXTRACTION_TIMEOUT_SECONDS = 60
DEFAULT_MAX_CONCURRENT_EXTRACTIONS = 4
DEFAULT_OFFICE_MAX_ENTRIES = 2000
DEFAULT_OFFICE_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
DEFAULT_OFFICE_MAX_COMPRESSION_RATIO = 100
DEFAULT_UPLOAD_REQUEST_OVERHEAD_BYTES = 1024 * 1024
DEFAULT_MAX_UPLOAD_FILENAME_CHARS = 255
DEFAULT_MAX_MODEL_ID_CHARS = 200
FILE_PURPOSE_SESSION_ATTACHMENT = "session_attachment"
FILE_PURPOSE_ASSISTANT_KNOWLEDGE = "assistant_knowledge"
FILE_PURPOSE_LIBRARY_FILE = "library_file"
ALLOWED_FILE_PURPOSES = {
    FILE_PURPOSE_SESSION_ATTACHMENT,
    FILE_PURPOSE_ASSISTANT_KNOWLEDGE,
    FILE_PURPOSE_LIBRARY_FILE,
}
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024
DEFAULT_IMAGE_MAX_WIDTH = 4096
DEFAULT_IMAGE_MAX_HEIGHT = 4096
DEFAULT_IMAGE_MAX_PIXELS = 12_000_000
_EXTRACTION_SEMAPHORE = asyncio.Semaphore(DEFAULT_MAX_CONCURRENT_EXTRACTIONS)
_UPLOAD_SEMAPHORE = asyncio.Semaphore(4)


def _upload_rule_from_types(upload_types: object) -> dict[str, bool]:
    normalized_types = upload_types if isinstance(upload_types, list) else []
    return {
        "documents": "document" in normalized_types,
        "images": "image" in normalized_types,
    }


def _intersect_upload_rules(first: dict[str, bool], second: dict[str, bool]) -> dict[str, bool]:
    return {
        "documents": first["documents"] and second["documents"],
        "images": first["images"] and second["images"],
    }


def _get_gptassistant_upload_rule(model_id: str) -> dict[str, bool] | None:
    refresh_gpts()
    assistant_config = gpts.get("gptassistant", {})
    if not assistant_config.get("file_upload_enabled", False):
        return {"documents": False, "images": False}
    global_rule = _upload_rule_from_types(assistant_config.get("upload_file_types"))

    base_model = next(
        (
            item
            for item in assistant_config.get("models", [])
            if isinstance(item, dict) and item.get("id") == model_id
        ),
        None,
    )
    admin_model = next(
        (
            item
            for item in list_admin_model_configs()
            if isinstance(item, dict) and item.get("model_id") == model_id
        ),
        None,
    )
    if admin_model is not None and not admin_model.get("enabled", False):
        return None
    if admin_model is not None and isinstance(admin_model.get("allowed_upload_types"), list):
        return _intersect_upload_rules(
            global_rule,
            _upload_rule_from_types(admin_model["allowed_upload_types"]),
        )
    if base_model is not None and isinstance(base_model.get("upload_file_types"), list):
        return _intersect_upload_rules(
            global_rule,
            _upload_rule_from_types(base_model["upload_file_types"]),
        )
    if base_model is not None or admin_model is not None:
        return global_rule
    if model_id in MODEL_UPLOAD_RULES:
        compatibility_rule = MODEL_UPLOAD_RULES[model_id]
        return _intersect_upload_rules(global_rule, compatibility_rule)
    return None


def _get_gptassistant_upload_limits():
    assistant_config = gpts.get("gptassistant", {})

    def positive_int(key: str, default: int) -> int:
        value = assistant_config.get(key)
        return value if isinstance(value, int) and value > 0 else default

    return {
        "upload_max_bytes": positive_int("upload_max_bytes", DEFAULT_UPLOAD_MAX_BYTES),
        "image_max_bytes": positive_int("image_max_bytes", DEFAULT_IMAGE_MAX_BYTES),
        "max_active_files": positive_int("max_active_files", DEFAULT_MAX_ACTIVE_FILES),
        "max_active_files_per_user": positive_int(
            "max_active_files_per_user",
            DEFAULT_MAX_ACTIVE_FILES_PER_USER,
        ),
        "max_chat_attachments": positive_int("max_chat_attachments", DEFAULT_MAX_CHAT_ATTACHMENTS),
        "max_chat_attachment_bytes": positive_int(
            "max_chat_attachment_bytes",
            DEFAULT_MAX_CHAT_ATTACHMENT_BYTES,
        ),
        "max_attachment_text_chars": positive_int(
            "max_attachment_text_chars",
            DEFAULT_MAX_ATTACHMENT_TEXT_CHARS,
        ),
        "extraction_timeout_seconds": positive_int(
            "extraction_timeout_seconds",
            DEFAULT_EXTRACTION_TIMEOUT_SECONDS,
        ),
        "office_max_entries": positive_int("office_max_entries", DEFAULT_OFFICE_MAX_ENTRIES),
        "office_max_uncompressed_bytes": positive_int(
            "office_max_uncompressed_bytes",
            DEFAULT_OFFICE_MAX_UNCOMPRESSED_BYTES,
        ),
        "office_max_compression_ratio": positive_int(
            "office_max_compression_ratio",
            DEFAULT_OFFICE_MAX_COMPRESSION_RATIO,
        ),
        "image_max_width": positive_int("image_max_width", DEFAULT_IMAGE_MAX_WIDTH),
        "image_max_height": positive_int("image_max_height", DEFAULT_IMAGE_MAX_HEIGHT),
        "image_max_pixels": positive_int("image_max_pixels", DEFAULT_IMAGE_MAX_PIXELS),
    }


def get_upload_request_max_bytes() -> int:
    limits = _get_gptassistant_upload_limits()
    return max(limits["upload_max_bytes"], limits["image_max_bytes"]) + DEFAULT_UPLOAD_REQUEST_OVERHEAD_BYTES


# 判断文件扩展名是否允许
def _get_allowed_extensions_by_model(model_id: str):
    model_rule = _get_gptassistant_upload_rule(model_id)
    if model_rule is None:
        return set(), {}
    allowed_extensions = set()
    if model_rule.get("documents"):
        allowed_extensions.update(DOCUMENT_EXTENSIONS)
    if model_rule.get("images"):
        allowed_extensions.update(IMAGE_EXTENSIONS)
    return allowed_extensions, model_rule


def allowed_file(filename, model_id: str):
    if "." not in filename:
        return False, {}
    extension = filename.rsplit(".", 1)[1].lower()
    allowed_extensions, model_rule = _get_allowed_extensions_by_model(model_id)
    return extension in allowed_extensions, model_rule


def _get_upload_max_bytes(filename: str, model_rule: dict, limits: dict) -> int:
    extension = os.path.splitext(filename)[1].lower()
    is_image = extension.lstrip(".") in IMAGE_EXTENSIONS and model_rule.get("images")
    return limits["image_max_bytes"] if is_image else limits["upload_max_bytes"]


async def _scan_upload(
    file: UploadFile,
    filename: str,
    model_rule: dict,
    limits: dict,
) -> tuple[int, bytes | None, str]:
    max_bytes = _get_upload_max_bytes(filename, model_rule, limits)
    extension = os.path.splitext(filename)[1].lower()
    is_image = extension.lstrip(".") in IMAGE_EXTENSIONS and model_rule.get("images")
    image_content = bytearray() if is_image else None
    file_size = 0
    content_hasher = hashlib.sha256()
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        file_size += len(chunk)
        content_hasher.update(chunk)
        if file_size > max_bytes:
            gpt_logger.warning(
                "upload_validation_failed reason=file_too_large filename=%s file_size_over=%s max_bytes=%s",
                filename,
                file_size,
                max_bytes,
            )
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File too large. Limit: {max_bytes} bytes",
            )
        if image_content is not None:
            image_content.extend(chunk)
    return (
        file_size,
        bytes(image_content) if image_content is not None else None,
        content_hasher.hexdigest(),
    )


def _validate_upload_content(
    filename: str,
    file_size: int,
    image_content: bytes | None,
    model_rule: dict,
    limits: dict,
) -> None:
    extension = os.path.splitext(filename)[1].lower()
    is_image = extension.lstrip(".") in IMAGE_EXTENSIONS and model_rule.get("images")
    max_bytes = _get_upload_max_bytes(filename, model_rule, limits)
    if file_size > max_bytes:
        gpt_logger.warning(
            "upload_validation_failed reason=file_too_large filename=%s file_size=%s max_bytes=%s is_image=%s model_rule=%s",
            filename,
            file_size,
            max_bytes,
            is_image,
            model_rule,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large: {file_size} bytes (limit: {max_bytes} bytes)",
        )

    if not is_image:
        return

    dimensions = detect_image_dimensions_from_bytes(image_content or b"")
    if not dimensions:
        gpt_logger.warning(
            "upload_validation_failed reason=image_dimensions_unreadable filename=%s file_size=%s model_rule=%s",
            filename,
            file_size,
            model_rule,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to read image dimensions",
        )
    width, height = dimensions
    if width > limits["image_max_width"] or height > limits["image_max_height"]:
        gpt_logger.warning(
            "upload_validation_failed reason=image_dimensions_too_large filename=%s width=%s height=%s max_width=%s max_height=%s",
            filename,
            width,
            height,
            limits["image_max_width"],
            limits["image_max_height"],
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Image dimensions too large: {width}x{height} "
                f"(limit: {limits['image_max_width']}x{limits['image_max_height']})"
            ),
        )
    if width * height > limits["image_max_pixels"]:
        gpt_logger.warning(
            "upload_validation_failed reason=image_pixels_too_large filename=%s pixels=%s max_pixels=%s",
            filename,
            width * height,
            limits["image_max_pixels"],
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Image pixel count too large: {width * height} "
                f"(limit: {limits['image_max_pixels']})"
            ),
        )


def _validate_office_archive(content_file, filename: str, limits: dict) -> None:
    extension = os.path.splitext(filename)[1].lower()
    if extension not in {".docx", ".xlsx", ".pptx"}:
        return
    current_position = content_file.tell()
    try:
        content_file.seek(0)
        with zipfile.ZipFile(content_file) as archive:
            entries = archive.infolist()
            total_uncompressed = sum(item.file_size for item in entries)
            total_compressed = sum(item.compress_size for item in entries)
    except (OSError, zipfile.BadZipFile) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Office document") from exc
    finally:
        content_file.seek(current_position)

    compression_ratio = total_uncompressed / max(total_compressed, 1)
    expected_prefix = {
        ".docx": "word/",
        ".xlsx": "xl/",
        ".pptx": "ppt/",
    }[extension]
    if (
        not any(item.filename.startswith(expected_prefix) for item in entries)
        or "[Content_Types].xml" not in {item.filename for item in entries}
        or len(entries) > limits["office_max_entries"]
        or total_uncompressed > limits["office_max_uncompressed_bytes"]
        or compression_ratio > limits["office_max_compression_ratio"]
    ):
        gpt_logger.warning(
            "upload_validation_failed reason=unsafe_office_archive filename=%s entries=%s total_uncompressed=%s total_compressed=%s compression_ratio=%.1f",
            filename,
            len(entries),
            total_uncompressed,
            total_compressed,
            compression_ratio,
        )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Office document is too complex")


def _validate_file_signature(content_file, filename: str, image_content: bytes | None) -> None:
    extension = os.path.splitext(filename)[1].lower()
    if extension in {".jpg", ".jpeg", ".png"}:
        if not image_content or not detect_image_dimensions_from_bytes(image_content):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid image file")
        return
    current_position = content_file.tell()
    try:
        content_file.seek(0)
        header = content_file.read(4096)
    finally:
        content_file.seek(current_position)
    if extension == ".pdf" and b"%PDF-" not in header[:1024]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid PDF document")
    if extension == ".doc" and not header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid DOC document")
    if extension in {".txt", ".md", ".csv"} and b"\x00" in header:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid text document")


def load_gid_file_mapping(gid):
    return list_file_mappings(gid)


def load_file_mapping():
    return list_file_mappings()


def _normalize_file_extension(value: str | None) -> str:
    extension = (value or "").strip().lower()
    if extension and not extension.startswith("."):
        extension = f".{extension}"
    return extension


def safe_content_type(filename: str | None = None, file_extension: str | None = None) -> str:
    extension = _normalize_file_extension(file_extension or os.path.splitext(filename or "")[1])
    return SAFE_CONTENT_TYPES.get(extension, "application/octet-stream")


def safe_display_filename(filename: object, max_chars: int = 200) -> str:
    normalized = "".join(
        character if character.isprintable() and character not in "\r\n" else " "
        for character in str(filename or "")
    )
    return " ".join(normalized.split())[:max_chars] or "attachment"


def normalize_upload_filename(filename: str) -> str:
    basename = filename.replace("\\", "/").rsplit("/", 1)[-1]
    if (
        not basename
        or len(basename) > DEFAULT_MAX_UPLOAD_FILENAME_CHARS
        or any(not character.isprintable() or character in "\r\n" for character in basename)
        or "." not in basename
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid upload filename")
    return basename


def classify_file_kind(file_path: str, file_extension: str | None = None) -> str:
    normalized_extension = _normalize_file_extension(file_extension)
    if os.path.exists(file_path) and is_image_file(file_path):
        return "image"
    if normalized_extension in {".txt", ".md", ".csv", ".pdf", ".doc", ".docx", ".xlsx", ".pptx"}:
        return "document"
    return "unknown"


def describe_file_mapping_entry(file_id: str, entry: dict | None) -> dict:
    if not entry:
        return {"file_id": file_id, "found": False}

    local_path = _ensure_entry_local_path(file_id, entry)
    file_extension = _normalize_file_extension(entry.get("fileExtension"))
    exists = bool(local_path and os.path.exists(local_path))
    kind = classify_file_kind(local_path, file_extension) if local_path else "unknown"
    size_bytes = os.path.getsize(local_path) if exists else entry.get("sizeBytes")
    size_kb = round(size_bytes / 1024, 1) if isinstance(size_bytes, int) else None
    return {
        "file_id": file_id,
        "found": True,
        "filename": safe_display_filename(entry.get("filename")),
        "file_extension": file_extension,
        "upload_time": entry.get("uploadTime"),
        "mime_type": safe_content_type(entry.get("filename"), file_extension),
        "kind": kind,
        "exists": exists,
        "size_bytes": size_bytes,
        "size_kb": size_kb,
        "purpose": entry.get("purpose") or FILE_PURPOSE_SESSION_ATTACHMENT,
        "gid": entry.get("gid"),
    }


def _ensure_entry_local_path(file_id: str, entry: dict | None) -> str | None:
    if not entry:
        return None
    try:
        enriched = {"file_id": file_id, **entry}
        return ensure_local_path(enriched)
    except Exception:
        return None


def _get_mapping_or_404(file_id: str, gid: str | None = None) -> dict:
    entry = get_file_mapping(file_id, gid)
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return entry


def _is_file_owned_by_user(entry: dict, user: dict) -> bool:
    owner_user_id = str(entry.get("ownerUserId") or "").strip()
    owner_user_email = str(entry.get("ownerUserEmail") or "").strip()
    user_id = str(user.get("sub") or "").strip()
    user_email = str(user.get("email") or "").strip()
    file_provider = str(entry.get("authProvider") or "").strip() or GLOBAL_AUTH_PROVIDER
    current_provider = get_current_auth_provider(user)
    if owner_user_id:
        return bool(user_id and owner_user_id == user_id) and file_provider in {
            current_provider,
            GLOBAL_AUTH_PROVIDER,
        }
    if owner_user_email:
        if not bool(user_email and owner_user_email == user_email):
            return False
    else:
        return False
    return file_provider in {current_provider, GLOBAL_AUTH_PROVIDER}


def get_owned_file_mapping_or_404(file_id: str, user: dict, gid: str | None = None) -> dict:
    entry = _get_mapping_or_404(file_id, gid)
    if not _is_file_owned_by_user(entry, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return entry


def ensure_file_ids_owned_by_user(
    file_ids: str | None,
    user: dict,
    gid: str | None = None,
) -> str | None:
    if not file_ids:
        return None
    if len(file_ids) > DEFAULT_MAX_FILE_IDS_FIELD_CHARS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Attachment file ID list is too long",
        )
    normalized_file_ids = list(
        dict.fromkeys(file_id.strip() for file_id in file_ids.split(",") if file_id.strip())
    )
    max_attachments = _get_gptassistant_upload_limits()["max_chat_attachments"]
    if len(normalized_file_ids) > max_attachments:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Too many attachments. Limit: {max_attachments}",
        )
    total_bytes = 0
    for current_file_id in normalized_file_ids:
        entry = get_owned_file_mapping_or_404(current_file_id, user, gid)
        total_bytes += int(entry.get("sizeBytes") or 0)
    max_total_bytes = _get_gptassistant_upload_limits()["max_chat_attachment_bytes"]
    if total_bytes > max_total_bytes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Attachments are too large. Combined limit: {max_total_bytes} bytes",
        )
    return ",".join(normalized_file_ids) or None


async def _store_upload_object(
    *,
    cleanup_lock_acquired: bool = False,
    **kwargs,
) -> dict[str, object]:
    store_task = asyncio.create_task(asyncio.to_thread(store_file, **kwargs))
    try:
        return await asyncio.shield(store_task)
    except asyncio.CancelledError:
        object_meta = await store_task
        try:
            await asyncio.to_thread(
                delete_unreferenced_object,
                kwargs["file_id"],
                object_meta,
                lock_acquired=cleanup_lock_acquired,
            )
        except Exception:
            gpt_logger.exception(
                "cancelled_upload_orphan_object_delete_failed file_id=%s storage_backend=%s object_key=%s",
                kwargs["file_id"],
                object_meta.get("storage_backend"),
                object_meta.get("object_key"),
            )
        raise


async def _upload_file_core(
    *,
    file: UploadFile,
    model_id: str,
    gid: str,
    purpose: str,
    conversation_id: str | None,
    user: dict,
) -> dict[str, object]:
    if not file:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file part"
        )

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No selected file"
        )

    file.filename = normalize_upload_filename(file.filename)
    model_id = model_id.strip()
    if not model_id or len(model_id) > DEFAULT_MAX_MODEL_ID_CHARS or not model_id.isprintable():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid model ID")
    gid = gid.strip() if isinstance(gid, str) else "gptassistant"
    purpose = (
        purpose.strip()
        if isinstance(purpose, str)
        else FILE_PURPOSE_SESSION_ATTACHMENT
    )
    conversation_id = conversation_id.strip() if isinstance(conversation_id, str) else None
    if not gid or len(gid) > 200 or not gid.isprintable():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid GPT ID")
    if purpose not in ALLOWED_FILE_PURPOSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid file purpose")

    owner_user_id = str(user.get("sub") or "").strip() or None
    owner_user_email = str(user.get("email") or "").strip() or None
    current_provider = get_current_auth_provider(user)
    if not owner_user_id and not owner_user_email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authenticated user identity is required")
    if purpose == FILE_PURPOSE_ASSISTANT_KNOWLEDGE:
        from app.routes.gpts_routes import ensure_owned_custom_gpt, is_gpt_visible_to_provider

        refresh_gpts()
        assistant_config = ensure_owned_custom_gpt(gid, user)
        provider_scope = str(assistant_config.get("provider_scope") or "global").strip().lower()
        if not is_gpt_visible_to_provider(assistant_config, current_provider):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "GPT not found")
        if os.path.splitext(file.filename)[1].lower().lstrip(".") not in DOCUMENT_EXTENSIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Knowledge files must be documents")
        file_auth_provider = GLOBAL_AUTH_PROVIDER if provider_scope == "global" else current_provider
    else:
        file_auth_provider = current_provider

    is_allowed, model_rule = allowed_file(file.filename, model_id)
    if not is_allowed:
        allowed_extensions, _ = _get_allowed_extensions_by_model(model_id)
        allowed_types = []
        if model_rule.get("documents"):
            allowed_types.append("documents")
        if model_rule.get("images"):
            allowed_types.append("images")
        if not allowed_types:
            allowed_types.append("documents/images")
        gpt_logger.warning(
            "upload_validation_failed reason=file_type_not_allowed model_id=%s filename=%s content_type=%s allowed_types=%s allowed_extensions=%s model_rule=%s",
            model_id,
            file.filename,
            file.content_type,
            allowed_types,
            sorted(allowed_extensions),
            model_rule,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed for model '{model_id}'. Allowed types: {', '.join(allowed_types)}"
        )

    object_meta: dict[str, object] | None = None
    mapping_inserted = False
    object_stored = False
    reservation_id: str | None = None
    try:
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1]
        limits = _get_gptassistant_upload_limits()
        try:
                reservation_id = reserve_file_upload_slot(
                    gid,
                    owner_user_id=owner_user_id,
                    owner_user_email=owner_user_email,
                    auth_provider=file_auth_provider,
                    max_user_files=limits["max_active_files_per_user"],
                    max_system_files=limits["max_active_files"],
                )
        except FileUploadQuotaExceeded as exc:
            if exc.scope == "user":
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"Too many uploaded files for this user. Limit: {limits['max_active_files_per_user']}",
                ) from exc
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "File upload capacity is temporarily unavailable",
            ) from exc
        async with _UPLOAD_SEMAPHORE:
            file_size, image_content, content_sha256 = await _scan_upload(
                file,
                file.filename,
                model_rule,
                limits,
            )
            _validate_upload_content(file.filename, file_size, image_content, model_rule, limits)
            await file.seek(0)
            await asyncio.to_thread(_validate_file_signature, file.file, file.filename, image_content)
            await asyncio.to_thread(_validate_office_archive, file.file, file.filename, limits)
            with distributed_task_lock(
                file_object_lock_name({"content_sha256": content_sha256})
            ) as acquired:
                if not acquired:
                    raise HTTPException(
                        status.HTTP_503_SERVICE_UNAVAILABLE,
                        "Identical file content is currently being modified",
                    )
                reusable_entry = await asyncio.to_thread(
                    find_owned_file_mapping_by_content,
                    content_sha256,
                    owner_user_id=owner_user_id,
                    owner_user_email=owner_user_email,
                    auth_provider=file_auth_provider,
                )
                if reusable_entry:
                    object_meta = {
                        "bucket": reusable_entry.get("bucket") or "",
                        "object_key": reusable_entry.get("objectKey") or "",
                        "storage_backend": reusable_entry.get("storageBackend") or "",
                        "size_bytes": reusable_entry.get("sizeBytes") or file_size,
                        "content_sha256": content_sha256,
                    }
                else:
                    await file.seek(0)
                    object_meta = await _store_upload_object(
                        file_id=file_id,
                        filename=file.filename,
                        content_file=file.file,
                        length=file_size,
                        content_type=safe_content_type(file.filename, file_extension),
                        content_sha256=content_sha256,
                        cleanup_lock_acquired=True,
                    )
                    object_meta["content_sha256"] = content_sha256
                    object_stored = True

                insert_file_mapping(
                    file_id,
                    filename=file.filename,
                    file_extension=file_extension,
                    content_type=safe_content_type(file.filename, file_extension),
                    bucket=str(object_meta["bucket"]),
                    object_key=str(object_meta["object_key"]),
                    storage_backend=str(object_meta["storage_backend"]),
                    size_bytes=int(object_meta["size_bytes"]),
                    content_sha256=content_sha256,
                    owner_user_id=owner_user_id,
                    owner_user_email=owner_user_email,
                    auth_provider=file_auth_provider,
                    gid=gid,
                    purpose=purpose,
                    conversation_id=conversation_id,
                )
                mapping_inserted = True
        gpt_logger.info(
            "upload_request_received model_id=%s filename=%s content_type=%s extension=%s file_size=%s model_rule=%s",
            model_id,
            file.filename,
            file.content_type,
            file_extension.lower(),
            file_size,
            model_rule,
        )

        gpt_logger.info(
            "upload_request_succeeded model_id=%s filename=%s file_id=%s storage_backend=%s object_key=%s purpose=%s gid=%s",
            model_id,
            file.filename,
            file_id,
            object_meta["storage_backend"],
            object_meta["object_key"],
            purpose,
            gid,
        )

        return {
            "message": "File successfully uploaded",
            "file_id": file_id,
            "original_filename": file.filename,
            "filename": safe_display_filename(file.filename),
            "size_bytes": file_size,
            "upload_time": get_file_mapping(file_id, gid).get("uploadTime"),
        }
    except HTTPException as exc:
        gpt_logger.warning(
            "upload_request_failed model_id=%s filename=%s content_type=%s detail=%s",
            model_id,
            file.filename,
            file.content_type,
            exc.detail,
        )
        raise
    except Exception as e:
        if object_meta is not None and object_stored and not mapping_inserted:
            try:
                delete_unreferenced_object(file_id, object_meta)
                gpt_logger.info(
                    "upload_orphan_object_deleted file_id=%s storage_backend=%s object_key=%s",
                    file_id,
                    object_meta.get("storage_backend"),
                    object_meta.get("object_key"),
                )
            except Exception:
                gpt_logger.exception(
                    "upload_orphan_object_delete_failed file_id=%s storage_backend=%s object_key=%s",
                    file_id,
                    object_meta.get("storage_backend"),
                    object_meta.get("object_key"),
                )
        gpt_logger.exception(
            "upload_request_failed_unexpected model_id=%s filename=%s content_type=%s error=%s",
            model_id,
            file.filename,
            file.content_type,
            str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File upload failed",
        )
    finally:
        try:
            release_file_upload_slot(reservation_id)
        except Exception:
            gpt_logger.exception(
                "upload_reservation_release_failed reservation_id=%s",
                reservation_id,
            )


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    model_id: str = Form("auto"),
    gid: str = Form("gptassistant"),
    purpose: str = Form(FILE_PURPOSE_SESSION_ATTACHMENT),
    conversation_id: str | None = Form(None),
    user: dict = Depends(get_current_user),
):
    gpt_logger.info(f"path=upload_file user={user.get('email', '')} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    payload = await _upload_file_core(
        file=file,
        model_id=model_id,
        gid=gid,
        purpose=purpose,
        conversation_id=conversation_id,
        user=user,
    )
    return JSONResponse(payload)


# 通过文件ID下载文件
@router.get("/g/{gid}/file/{file_id}")
async def get_file_by_gid(gid: str, file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file_by_gid user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = get_owned_file_mapping_or_404(file_id, user, gid)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    mime_type = safe_content_type(entry.get("filename"), entry.get("fileExtension"))

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=safe_display_filename(entry["filename"]),
    )


# 通过文件ID下载文件
@router.get("/file/{file_id}")
async def get_file(file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = get_owned_file_mapping_or_404(file_id, user)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    mime_type = safe_content_type(entry.get("filename"), entry.get("fileExtension"))

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=safe_display_filename(entry["filename"]),
    )


# 获取文件的原始文件名
@router.get("/file_name/{file_id}")
async def get_file_name(file_id, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file_name user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = get_owned_file_mapping_or_404(file_id, user)
    original_filename = safe_display_filename(entry["filename"])
    return JSONResponse({"file_id": file_id, "original_filename": original_filename})


# 删除过期文件的函数
def delete_expired_files():
    gpt_logger.info(
        "expired_file_cleanup_skipped reason=retention_disabled file_lifetime_days=%s",
        FILE_LIFETIME_DAYS,
    )


_cleanup_scheduler: BackgroundScheduler | None = None


def start_file_retention_scheduler() -> None:
    global _cleanup_scheduler
    if _cleanup_scheduler is not None and _cleanup_scheduler.running:
        return
    gpt_logger.info(
        "file_retention_scheduler_not_started reason=retention_disabled file_lifetime_days=%s",
        FILE_LIFETIME_DAYS,
    )


def stop_file_retention_scheduler() -> None:
    global _cleanup_scheduler
    if _cleanup_scheduler is None:
        return
    _cleanup_scheduler.shutdown(wait=False)
    _cleanup_scheduler = None


@router.get("/extract_text_from_file/{file_id}")
async def extract_text_from_file(file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=extract_text_from_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = get_owned_file_mapping_or_404(file_id, user)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "FilePath not found")

    extension = entry['fileExtension']
    result = await _extract_text_with_limits(file_path, extension)
    max_chars = _get_gptassistant_upload_limits()["max_attachment_text_chars"]
    if len(result) > max_chars:
        result = result[:max_chars].rstrip() + "\n\n[已截断]"
    return JSONResponse({"text": result})


def get_file_paths(file_ids: str):
    if not file_ids:
        return None
    paths = []
    for file_id in file_ids.split(","):
        current_file_id = file_id.strip()
        if not current_file_id:
            continue
        entry = get_file_mapping(current_file_id)
        if not entry:
            print(f"file_id:{file_id} is not found")
            continue
        file_path = _ensure_entry_local_path(current_file_id, entry)
        if not file_path or not os.path.exists(file_path):
            print(f"file_path:{file_path} is not found")
            continue
        paths.append(file_path)
    return paths


def split_file_ids_by_type(file_ids: str):
    if not file_ids:
        return None, None

    file_mapping = load_file_mapping()
    image_file_ids = []
    document_file_ids = []
    for file_id in file_ids.split(","):
        current_file_id = file_id.strip()
        if not current_file_id:
            continue
        if current_file_id not in file_mapping:
            print(f"file_id:{current_file_id} is not found")
            continue

        file_path = _ensure_entry_local_path(current_file_id, file_mapping[current_file_id])
        if not file_path or not os.path.exists(file_path):
            print(f"file_path:{file_path} is not found")
            continue

        if is_image_file(file_path):
            image_file_ids.append(current_file_id)
        else:
            document_file_ids.append(current_file_id)

    image_ids = ",".join(image_file_ids) if image_file_ids else None
    document_ids = ",".join(document_file_ids) if document_file_ids else None
    return image_ids, document_ids


async def extract_text_from_file_ids(
    file_ids: str,
    max_chars: int | None = None,
    *,
    page: int | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    sheet_name: str | None = None,
    sheet_index: int | None = None,
):
    if max_chars is None:
        max_chars = _get_gptassistant_upload_limits()["max_attachment_text_chars"]
    file_mapping = load_file_mapping()
    content = "\n[上传文件内容]:\n"
    gpt_logger.info("extract_text_from_file_ids_start file_ids=%s", file_ids)
    truncated = False
    for file_id in file_ids.split(","):
        if file_id not in file_mapping:
            print(f"file_id:{file_id} is not found")
            continue

        file_path = _ensure_entry_local_path(file_id, file_mapping[file_id])
        file_name = safe_display_filename(file_mapping[file_id]["filename"])
        if not file_path or not os.path.exists(file_path):
            print(f"file_path:{file_path} is not found")
            continue
            # raise HTTPException(status.HTTP_404_NOT_FOUND, "FilePath not found")

        extension = file_mapping[file_id]['fileExtension']
        started_at = time.perf_counter()
        gpt_logger.info(
            "extract_text_from_file_ids_item_start file_id=%s filename=%s path=%s extension=%s",
            file_id,
            file_name,
            file_path,
            extension,
        )
        result = await _extract_text_with_limits(
            file_path,
            extension,
            page=page,
            page_from=page_from,
            page_to=page_to,
            sheet_name=sheet_name,
            sheet_index=sheet_index,
        )
        gpt_logger.info(
            "extract_text_from_file_ids_item_complete file_id=%s filename=%s elapsed_ms=%.1f text_len=%s",
            file_id,
            file_name,
            (time.perf_counter() - started_at) * 1000,
            len(result or ""),
        )
        content += "\n[" + file_name + "]:\n" + result + "\n"
        if max_chars is not None and max_chars > 0 and len(content) > max_chars:
            content = content[:max_chars].rstrip() + "\n\n[已截断]"
            truncated = True
            break
    gpt_logger.info(
        "extract_text_from_file_ids_complete file_ids=%s total_text_len=%s truncated=%s",
        file_ids,
        len(content),
        truncated,
    )
    return content


async def _extract_text_with_limits(file_path: str, extension: str, **kwargs) -> str:
    limits = _get_gptassistant_upload_limits()
    timeout_seconds = limits["extraction_timeout_seconds"]
    try:
        async with _EXTRACTION_SEMAPHORE:
            if _normalize_file_extension(extension) in {".docx", ".xlsx", ".pptx"}:
                def validate_existing_office_file() -> None:
                    with open(file_path, "rb") as content_file:
                        _validate_office_archive(content_file, f"attachment{extension}", limits)

                await asyncio.to_thread(validate_existing_office_file)
            return await asyncio.wait_for(
                extract_text.extract_text_from_file(
                    file_path,
                    extension,
                    timeout_seconds=timeout_seconds,
                    max_chars=limits["max_attachment_text_chars"],
                    **kwargs,
                ),
                timeout=timeout_seconds + 1,
            )
    except asyncio.TimeoutError as exc:
        gpt_logger.error(
            "file_text_extract_timed_out path=%s extension=%s timeout_seconds=%s",
            file_path,
            extension,
            timeout_seconds,
        )
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT,
            "File text extraction timed out",
        ) from exc
