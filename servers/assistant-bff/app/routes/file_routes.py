import time
import os
import uuid
import imghdr
from apscheduler.schedulers.background import BackgroundScheduler
from ..utils import extract_text
from fastapi import APIRouter, Request, Depends, File, UploadFile, HTTPException, status, Form
from fastapi.responses import JSONResponse, FileResponse
from datetime import datetime
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
from app.db import get_db

router = APIRouter(prefix="/api", tags=["auth"])

# 配置
UPLOAD_FOLDER = f"{model_config.FILE_BASE}/gptassistant/uploads"
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

DOCUMENT_EXTENSIONS = {"txt", "pdf", "doc", "docx", "xlsx"}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png"}

MODEL_UPLOAD_RULES = {
    "auto": {"documents": True, "images": True},
    MODEL_NAME_THINKING: {"documents": True, "images": False},
    MODEL_NAME_INSTRUCT: {"documents": True, "images": False},
    MODEL_NAME_VL: {"documents": False, "images": True},
}
FILE_LIFETIME_DAYS = 7  # 可配置的过期时间，单位为天


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


def init_db():
    conn = get_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS file_mapping (
              file_id TEXT PRIMARY KEY,
              filename TEXT NOT NULL,
              fileExtension TEXT NOT NULL,
              path TEXT NOT NULL,
              uploadTime TEXT NOT NULL,
              gid TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_file_mapping_gid ON file_mapping(gid);
            """
        )
    finally:
        conn.close()


init_db()


def load_gid_file_mapping(gid):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT file_id, filename, fileExtension, path, uploadTime FROM file_mapping WHERE gid=?",
            (gid,),
        ).fetchall()
    finally:
        conn.close()
    return {
        row["file_id"]: {
            "filename": row["filename"],
            "fileExtension": row["fileExtension"],
            "path": row["path"],
            "uploadTime": row["uploadTime"],
        }
        for row in rows
    }


def load_file_mapping():
    return load_gid_file_mapping("gptassistant")


def insert_file_mapping(file_id, filename, file_extension, path, gid="gptassistant"):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO file_mapping(file_id, filename, fileExtension, path, uploadTime, gid) VALUES(?, ?, ?, ?, ?, ?)",
            (file_id, filename, file_extension, path, datetime.now().isoformat(), gid),
        )
    finally:
        conn.close()


def delete_file_mapping(file_id):
    conn = get_db()
    try:
        conn.execute("DELETE FROM file_mapping WHERE file_id=?", (file_id,))
    finally:
        conn.close()


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
        allowed_types = []
        if model_rule.get("documents"):
            allowed_types.append("documents")
        if model_rule.get("images"):
            allowed_types.append("images")
        if not allowed_types:
            allowed_types.append("documents/images")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed for model '{model_id}'. Allowed types: {', '.join(allowed_types)}"
        )

    try:
        file_id = str(uuid.uuid4())
        file_extension = os.path.splitext(file.filename)[1]
        file_path = os.path.join(UPLOAD_FOLDER, file_id)

        # 保存文件
        with open(file_path, "wb") as buffer:
            file_content = await file.read()
            buffer.write(file_content)

        # 存储文件ID、文件路径和原始文件名的映射
        insert_file_mapping(file_id, file.filename, file_extension, file_path)

        return JSONResponse(
            {"message": "File successfully uploaded", "file_id": file_id, "original_filename": file.filename})
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"File save failed: {str(e)}"
        )


# 通过文件ID下载文件
@router.get("/g/{gid}/file/{file_id}")
async def get_file_by_gid(gid: str, file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file_by_gid user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    file_mapping = load_gid_file_mapping(gid)

    if file_id not in file_mapping:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    file_path = file_mapping[file_id]['path']

    if not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    # 获取文件的 MIME 类型
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    # print(f"fileinfo:{file_mapping[file_id]}")

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=file_mapping[file_id]['filename']
    )


# 通过文件ID下载文件
@router.get("/file/{file_id}")
async def get_file(file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    file_mapping = load_file_mapping()

    if file_id not in file_mapping:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    file_path = file_mapping[file_id]['path']

    if not os.path.isfile(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not exist")

    # 获取文件的 MIME 类型
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    # print(f"fileinfo:{file_mapping[file_id]}")

    return FileResponse(
        file_path,
        media_type=mime_type,
        filename=file_mapping[file_id]['filename']
    )


# 获取文件的原始文件名
@router.get("/file_name/{file_id}")
async def get_file_name(file_id, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=get_file_name user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    file_mapping = load_file_mapping()

    if file_id not in file_mapping:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    original_filename = file_mapping[file_id]['filename']
    return JSONResponse({"file_id": file_id, "original_filename": original_filename})


# 删除过期文件的函数
def delete_expired_files():
    now = time.time()
    file_mapping = load_file_mapping()

    for file_id, file_data in list(file_mapping.items()):
        file_path = file_data['path']
        if os.path.isfile(file_path):
            file_age = now - os.path.getmtime(file_path)
            if file_age > FILE_LIFETIME_DAYS * 86400:  # 86400是一天的秒数
                os.remove(file_path)
                delete_file_mapping(file_id)
                print(f"Deleted expired file: {file_id}")


# 启动定时任务
scheduler = BackgroundScheduler()
scheduler.add_job(delete_expired_files, 'interval', days=1)  # 每天检查一次
scheduler.start()


@router.get("/extract_text_from_file/{file_id}")
async def extract_text_from_file(file_id: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=extract_text_from_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    file_mapping = load_file_mapping()

    if file_id not in file_mapping:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")

    file_path = file_mapping[file_id]['path']
    if not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "FilePath not found")

    # print(f"file_path:{file_path}")
    extension = file_mapping[file_id]['fileExtension']
    result = await extract_text.extract_text_from_file(file_path, extension)
    return JSONResponse({"text": result})


def get_file_paths(file_ids: str):
    if not file_ids:
        return None
    file_mapping = load_file_mapping()
    paths = []
    for file_id in file_ids.split(","):
        if file_id not in file_mapping:
            print(f"file_id:{file_id} is not found")
            continue
        file_path = file_mapping[file_id]['path']
        if not os.path.exists(file_path):
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

        file_path = file_mapping[current_file_id]["path"]
        if not os.path.exists(file_path):
            print(f"file_path:{file_path} is not found")
            continue

        if imghdr.what(file_path) is not None:
            image_file_ids.append(current_file_id)
        else:
            document_file_ids.append(current_file_id)

    image_ids = ",".join(image_file_ids) if image_file_ids else None
    document_ids = ",".join(document_file_ids) if document_file_ids else None
    return image_ids, document_ids


async def extract_text_from_file_ids(file_ids: str):
    file_mapping = load_file_mapping()
    content = "\n[上传文件内容]:\n"
    gpt_logger.info("extract_text_from_file_ids_start file_ids=%s", file_ids)
    for file_id in file_ids.split(","):
        if file_id not in file_mapping:
            print(f"file_id:{file_id} is not found")
            continue

        file_path = file_mapping[file_id]['path']
        file_name = file_mapping[file_id]['filename']
        if not os.path.exists(file_path):
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
        result = await extract_text.extract_text_from_file(file_path, extension)
        gpt_logger.info(
            "extract_text_from_file_ids_item_complete file_id=%s filename=%s elapsed_ms=%.1f text_len=%s",
            file_id,
            file_name,
            (time.perf_counter() - started_at) * 1000,
            len(result or ""),
        )
        content += "\n[" + file_name + "]:\n" + result + "\n"
    gpt_logger.info("extract_text_from_file_ids_complete file_ids=%s total_text_len=%s", file_ids, len(content))
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
