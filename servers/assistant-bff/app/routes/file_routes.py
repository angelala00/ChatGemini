import time
import os
import uuid
from pathlib import Path
from apscheduler.schedulers.background import BackgroundScheduler
from ..utils import extract_text
from fastapi import APIRouter, Request, Depends, File, UploadFile, HTTPException, status, Form
from fastapi.responses import JSONResponse, FileResponse
from datetime import datetime, timezone
import mimetypes
from app.auth.auth_routes import get_current_user
from app.logger import gpt_logger
from app.base_config import model_config
from app.gpts.config_gpts import gpts, refresh_gpts
from app.utils.model_tool import (
    MODEL_NAME_INSTRUCT,
    MODEL_NAME_THINKING,
    MODEL_NAME_VL,
)
from app.utils.image_utils import detect_image_dimensions_from_bytes, is_image_file
from app.storage.business_store import (
    count_file_mappings,
    delete_file_mapping,
    get_file_mapping,
    insert_file_mapping,
    list_file_mappings,
)
from app.storage.object_store import (
    delete_object,
    ensure_local_path,
    local_cache_path,
    store_bytes,
)

router = APIRouter(prefix="/api", tags=["auth"])

DOCUMENT_EXTENSIONS = {"txt", "md", "csv", "pdf", "doc", "docx", "xlsx", "pptx"}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png"}

MODEL_UPLOAD_RULES = {
    "auto": {"documents": True, "images": True},
    MODEL_NAME_THINKING: {"documents": True, "images": False},
    MODEL_NAME_INSTRUCT: {"documents": True, "images": False},
    MODEL_NAME_VL: {"documents": False, "images": True},
}
FILE_LIFETIME_DAYS = 7  # 可配置的过期时间，单位为天
DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
DEFAULT_IMAGE_MAX_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_ACTIVE_FILES = 2000
DEFAULT_IMAGE_MAX_WIDTH = 4096
DEFAULT_IMAGE_MAX_HEIGHT = 4096
DEFAULT_IMAGE_MAX_PIXELS = 12_000_000


def _get_gptassistant_model_ids():
    refresh_gpts()
    assistant_config = gpts.get("gptassistant", {})
    return {
        item["id"]
        for item in assistant_config.get("models", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }


def _get_gptassistant_upload_rule():
    assistant_config = gpts.get("gptassistant", {})
    upload_types = assistant_config.get("upload_file_types", [])
    return {
        "documents": "document" in upload_types,
        "images": "image" in upload_types,
    }


def _get_gptassistant_upload_limits():
    assistant_config = gpts.get("gptassistant", {})

    def positive_int(key: str, default: int) -> int:
        value = assistant_config.get(key)
        return value if isinstance(value, int) and value > 0 else default

    return {
        "upload_max_bytes": positive_int("upload_max_bytes", DEFAULT_UPLOAD_MAX_BYTES),
        "image_max_bytes": positive_int("image_max_bytes", DEFAULT_IMAGE_MAX_BYTES),
        "max_active_files": positive_int("max_active_files", DEFAULT_MAX_ACTIVE_FILES),
        "image_max_width": positive_int("image_max_width", DEFAULT_IMAGE_MAX_WIDTH),
        "image_max_height": positive_int("image_max_height", DEFAULT_IMAGE_MAX_HEIGHT),
        "image_max_pixels": positive_int("image_max_pixels", DEFAULT_IMAGE_MAX_PIXELS),
    }


# 判断文件扩展名是否允许
def _get_allowed_extensions_by_model(model_id: str):
    if model_id in _get_gptassistant_model_ids():
        model_rule = _get_gptassistant_upload_rule()
    else:
        model_rule = MODEL_UPLOAD_RULES.get(model_id) or MODEL_UPLOAD_RULES["auto"]
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


def _validate_upload_limits(filename: str, file_content: bytes, model_rule: dict) -> None:
    limits = _get_gptassistant_upload_limits()
    current_file_count = count_file_mappings("gptassistant")
    if current_file_count >= limits["max_active_files"]:
        gpt_logger.warning(
            "upload_validation_failed reason=max_active_files filename=%s current_file_count=%s limit=%s model_rule=%s",
            filename,
            current_file_count,
            limits["max_active_files"],
            model_rule,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many uploaded files. Limit: {limits['max_active_files']}",
        )

    file_size = len(file_content)
    extension = os.path.splitext(filename)[1].lower()
    is_image = extension.lstrip(".") in IMAGE_EXTENSIONS and model_rule.get("images")
    max_bytes = limits["image_max_bytes"] if is_image else limits["upload_max_bytes"]
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

    dimensions = detect_image_dimensions_from_bytes(file_content)
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

def load_gid_file_mapping(gid):
    return list_file_mappings(gid)


def load_file_mapping():
    return load_gid_file_mapping("gptassistant")


def _normalize_file_extension(value: str | None) -> str:
    extension = (value or "").strip().lower()
    if extension and not extension.startswith("."):
        extension = f".{extension}"
    return extension


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
    mime_type, _ = mimetypes.guess_type(entry.get("filename") or local_path or "")
    return {
        "file_id": file_id,
        "found": True,
        "filename": entry.get("filename"),
        "file_extension": file_extension,
        "path": local_path,
        "upload_time": entry.get("uploadTime"),
        "mime_type": mime_type or "application/octet-stream",
        "kind": kind,
        "exists": exists,
        "size_bytes": size_bytes,
        "size_kb": size_kb,
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


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    model_id: str = Form("auto"),
    user: dict = Depends(get_current_user),
):
    gpt_logger.info(f"path=upload_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")

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

    try:
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1]
        file_content = await file.read()
        gpt_logger.info(
            "upload_request_received model_id=%s filename=%s content_type=%s extension=%s file_size=%s model_rule=%s",
            model_id,
            file.filename,
            file.content_type,
            file_extension.lower(),
            len(file_content),
            model_rule,
        )
        _validate_upload_limits(file.filename, file_content, model_rule)

        object_meta = store_bytes(
            file_id=file_id,
            filename=file.filename,
            content=file_content,
            content_type=file.content_type,
        )

        insert_file_mapping(
            file_id,
            filename=file.filename,
            file_extension=file_extension,
            content_type=file.content_type,
            bucket=str(object_meta["bucket"]),
            object_key=str(object_meta["object_key"]),
            storage_backend=str(object_meta["storage_backend"]),
            size_bytes=int(object_meta["size_bytes"]),
        )
        gpt_logger.info(
            "upload_request_succeeded model_id=%s filename=%s file_id=%s storage_backend=%s object_key=%s",
            model_id,
            file.filename,
            file_id,
            object_meta["storage_backend"],
            object_meta["object_key"],
        )

        return JSONResponse(
            {"message": "File successfully uploaded", "file_id": file_id, "original_filename": file.filename})
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
        gpt_logger.exception(
            "upload_request_failed_unexpected model_id=%s filename=%s content_type=%s error=%s",
            model_id,
            file.filename,
            file.content_type,
            str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File save failed: {str(e)}"
        )


# 通过文件ID下载文件
@router.get("/g/{gid}/file/{file_id}")
async def get_file_by_gid(gid: str, file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file_by_gid user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = _get_mapping_or_404(file_id, gid)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    mime_type = entry.get("contentType") or mimetypes.guess_type(entry["filename"])[0] or "application/octet-stream"

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=entry['filename']
    )


# 通过文件ID下载文件
@router.get("/file/{file_id}")
async def get_file(file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = _get_mapping_or_404(file_id)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path or not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    mime_type = entry.get("contentType") or mimetypes.guess_type(entry["filename"])[0] or "application/octet-stream"

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=entry['filename']
    )


# 获取文件的原始文件名
@router.get("/file_name/{file_id}")
async def get_file_name(file_id, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file_name user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = _get_mapping_or_404(file_id)
    original_filename = entry['filename']
    return JSONResponse({"file_id": file_id, "original_filename": original_filename})


# 删除过期文件的函数
def delete_expired_files():
    now = datetime.now(timezone.utc)
    file_mapping = load_file_mapping()

    for file_id, file_data in list(file_mapping.items()):
        upload_time_raw = str(file_data.get("uploadTime") or "")
        try:
            upload_time = datetime.fromisoformat(upload_time_raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if (now - upload_time).total_seconds() <= FILE_LIFETIME_DAYS * 86400:
            continue
        try:
            delete_object({"file_id": file_id, **file_data})
        except Exception:
            pass
        cache_path = local_cache_path({"file_id": file_id, **file_data})
        if cache_path and Path(cache_path).exists():
            try:
                Path(cache_path).unlink()
            except OSError:
                pass
        delete_file_mapping(file_id)


_cleanup_scheduler: BackgroundScheduler | None = None


def start_file_retention_scheduler() -> None:
    global _cleanup_scheduler
    if _cleanup_scheduler is not None and _cleanup_scheduler.running:
        return
    scheduler = BackgroundScheduler()
    scheduler.add_job(delete_expired_files, "interval", days=1)
    scheduler.start()
    _cleanup_scheduler = scheduler


def stop_file_retention_scheduler() -> None:
    global _cleanup_scheduler
    if _cleanup_scheduler is None:
        return
    _cleanup_scheduler.shutdown(wait=False)
    _cleanup_scheduler = None


@router.get("/extract_text_from_file/{file_id}")
async def extract_text_from_file(file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=extract_text_from_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    entry = _get_mapping_or_404(file_id)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "FilePath not found")

    extension = entry['fileExtension']
    result = await extract_text.extract_text_from_file(file_path, extension)
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
    file_mapping = load_file_mapping()
    content = "\n[上传文件内容]:\n"
    gpt_logger.info("extract_text_from_file_ids_start file_ids=%s", file_ids)
    truncated = False
    for file_id in file_ids.split(","):
        if file_id not in file_mapping:
            print(f"file_id:{file_id} is not found")
            continue

        file_path = _ensure_entry_local_path(file_id, file_mapping[file_id])
        file_name = file_mapping[file_id]['filename']
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
        result = await extract_text.extract_text_from_file(
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


# TODO: 目前为了演示，临时增加的审批表文件获取路由；日后应当在上传功能完善后归到其中处理
@router.get("/file/{gid}/{file_path:path}")
async def get_gid_file(gid: str, file_path: str, request: Request, user: dict = Depends(get_current_user)):
    arrs = file_path.split(".")
    if len(arrs) > 1:
        suffix = arrs[1]
    else:
        suffix = "pdf"
    file_dir = f"{model_config.FILE_BASE}/{gid}/{suffix}/"

    file_path = arrs[0]

    gpt_logger.info(f"path=get_file/{gid} user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    file_full_path = file_dir + file_path + "." + suffix
    print("===="+file_full_path)

    if not os.path.isfile(file_full_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    file_name = file_path + "." + suffix

    # 获取文件的 MIME 类型
    mime_type, _ = mimetypes.guess_type(file_full_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    # 自定义 header，让浏览器直接打开而非下载
    headers = {
        "Content-Disposition": f'inline',
        "Accept-Ranges": "bytes",
    }

    return FileResponse(
        file_full_path,
        media_type=mime_type,
        headers=headers,
        filename=file_name
    )
