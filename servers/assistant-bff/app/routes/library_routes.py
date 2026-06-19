from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from app.admin.access_control import (
    is_library_visible_to_user,
)
from app.auth.auth_routes import get_current_user
from app.logger import gpt_logger
from app.routes.file_routes import (
    FILE_PURPOSE_LIBRARY_FILE,
    _ensure_entry_local_path,
    _is_file_owned_by_user,
    _upload_file_core,
    get_owned_file_mapping_or_404,
    list_file_mappings,
    safe_content_type,
    safe_display_filename,
)
from app.storage.file_lifecycle import delete_file_reference

router = APIRouter(prefix="/api/library", tags=["library"])

LIBRARY_GID = "library"
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
SORT_BY_UPLOAD_TIME_DESC = "upload_time_desc"
SORT_BY_UPLOAD_TIME_ASC = "upload_time_asc"
SORT_BY_NAME_ASC = "name_asc"
SORT_BY_NAME_DESC = "name_desc"
ALLOWED_SORTS = {
    SORT_BY_UPLOAD_TIME_DESC,
    SORT_BY_UPLOAD_TIME_ASC,
    SORT_BY_NAME_ASC,
    SORT_BY_NAME_DESC,
}


def is_library_allowed(user: dict) -> bool:
    return is_library_visible_to_user(user)


def ensure_library_allowed(user: dict) -> None:
    if not is_library_allowed(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Library not enabled")


def _ensure_library_visible_entry(file_id: str, user: dict) -> dict:
    return get_owned_file_mapping_or_404(file_id, user)


def _normalize_pagination(page: int, page_size: int) -> tuple[int, int]:
    next_page = max(page, 1)
    next_page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    return next_page, next_page_size


def _matches_keyword(filename: object, keyword: str | None) -> bool:
    if not keyword:
        return True
    return keyword.lower() in safe_display_filename(filename).lower()


def _serialize_library_file(file_id: str, entry: dict) -> dict[str, object]:
    return {
        "file_id": file_id,
        "filename": safe_display_filename(entry.get("filename")),
        "file_extension": entry.get("fileExtension"),
        "mime_type": safe_content_type(entry.get("filename"), entry.get("fileExtension")),
        "size_bytes": int(entry.get("sizeBytes") or 0),
        "upload_time": entry.get("uploadTime"),
        "purpose": entry.get("purpose"),
        "gid": entry.get("gid"),
    }


@router.get("/files")
async def list_library_files(
    keyword: str | None = Query(None),
    page: int = Query(DEFAULT_PAGE),
    page_size: int = Query(DEFAULT_PAGE_SIZE),
    sort_by: str = Query(SORT_BY_UPLOAD_TIME_DESC),
    user: dict = Depends(get_current_user),
):
    ensure_library_allowed(user)
    page, page_size = _normalize_pagination(page, page_size)
    sort_by = sort_by if sort_by in ALLOWED_SORTS else SORT_BY_UPLOAD_TIME_DESC
    items: list[tuple[str, dict]] = []
    for file_id, entry in list_file_mappings().items():
        if not _is_file_owned_by_user(entry, user):
            continue
        if not _matches_keyword(entry.get("filename"), keyword):
            continue
        items.append((file_id, entry))

    if sort_by == SORT_BY_UPLOAD_TIME_ASC:
        items.sort(key=lambda item: str(item[1].get("uploadTime") or ""))
    elif sort_by == SORT_BY_NAME_ASC:
        items.sort(key=lambda item: safe_display_filename(item[1].get("filename")).lower())
    elif sort_by == SORT_BY_NAME_DESC:
        items.sort(key=lambda item: safe_display_filename(item[1].get("filename")).lower(), reverse=True)
    else:
        items.sort(key=lambda item: str(item[1].get("uploadTime") or ""), reverse=True)

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    payload = {
        "items": [_serialize_library_file(file_id, entry) for file_id, entry in items[start:end]],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    return JSONResponse(payload)


@router.post("/files:upload")
async def upload_library_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ensure_library_allowed(user)
    gpt_logger.info(
        "path=upload_library_file user=%s",
        user.get("email", ""),
    )
    payload = await _upload_file_core(
        file=file,
        model_id="auto",
        gid=LIBRARY_GID,
        purpose=FILE_PURPOSE_LIBRARY_FILE,
        conversation_id=None,
        user=user,
    )
    return JSONResponse(
        {
            "file_id": payload["file_id"],
            "filename": payload["filename"],
            "size_bytes": payload["size_bytes"],
            "upload_time": payload["upload_time"],
        }
    )


@router.get("/files/{file_id}/download")
async def download_library_file(file_id: str, user: dict = Depends(get_current_user)):
    ensure_library_allowed(user)
    gpt_logger.info("path=download_library_file user=%s file_id=%s", user.get("email", ""), file_id)
    entry = _ensure_library_visible_entry(file_id, user)
    file_path = _ensure_entry_local_path(file_id, entry)
    if not file_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not exist")
    return FileResponse(
        file_path,
        media_type=safe_content_type(entry.get("filename"), entry.get("fileExtension")),
        filename=safe_display_filename(entry.get("filename")),
    )


@router.delete("/files/{file_id}")
async def delete_library_file(file_id: str, user: dict = Depends(get_current_user)):
    ensure_library_allowed(user)
    gpt_logger.info("path=delete_library_file user=%s file_id=%s", user.get("email", ""), file_id)
    entry = _ensure_library_visible_entry(file_id, user)
    delete_file_reference(file_id, entry)
    return JSONResponse({"ok": True})


@router.get("/permission")
async def library_permission(user: dict = Depends(get_current_user)):
    return {"allowed": is_library_allowed(user)}
