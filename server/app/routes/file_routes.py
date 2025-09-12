import time
import os
import uuid
import json
from apscheduler.schedulers.background import BackgroundScheduler
from ..utils import extract_text
from fastapi import APIRouter, Request, Depends, File, UploadFile, HTTPException, status
from fastapi.responses import JSONResponse, FileResponse
from datetime import datetime
import mimetypes
from app.auth.auth_routes import get_current_user
from app.logger import gpt_logger
from app.base_config import model_config

router = APIRouter(prefix="/api", tags=["auth"])

# 配置
UPLOAD_FOLDER = f"{model_config.FILE_BASE}/gptassistant/uploads"
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx', 'xlsx', 'jpg', 'png'}
FILE_LIFETIME_DAYS = 7  # 可配置的过期时间，单位为天


# 用于存储文件的ID、文件路径和原始文件名的映射的文件路径
def get_gid_file_mapping_path(gid: str) -> str:
    return f"{model_config.FILE_BASE}/{gid}/file_mapping.json"


# 判断文件扩展名是否允许
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# 加载文件映射
def load_gid_file_mapping(gid):
    if os.path.exists(get_gid_file_mapping_path(gid)):
        with open(get_gid_file_mapping_path(gid), 'r') as f:
            return json.load(f)
    return {}


# 加载文件映射
def load_file_mapping():
    if os.path.exists(get_gid_file_mapping_path("gptassistant")):
        with open(get_gid_file_mapping_path("gptassistant"), 'r') as f:
            return json.load(f)
    return {}


# 保存文件映射
def save_file_mapping(file_mapping):
    with open(get_gid_file_mapping_path("gptassistant"), 'w') as f:
        json.dump(file_mapping, f)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=upload_file user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    file_mapping = load_file_mapping()

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

    if not allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File type not allowed"
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
        file_mapping[file_id] = {'filename': file.filename, 'fileExtension': file_extension, 'path': file_path,
                                 'uploadTime': datetime.now().isoformat()}

        save_file_mapping(file_mapping)

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
                del file_mapping[file_id]
                print(f"Deleted expired file: {file_id}")

    # 删除过期文件后保存文件映射
    save_file_mapping(file_mapping)


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
    result = extract_text.extract_text_from_file(file_path, extension)
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


async def extract_text_from_file_ids(file_ids: str):
    file_mapping = load_file_mapping()
    content = "\n[上传文件内容]:\n"
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

        # print(f"file_path:{file_path}")
        extension = file_mapping[file_id]['fileExtension']
        result = await extract_text.extract_text_from_file(file_path, extension)
        content += "\n[" + file_name + "]:\n" + result + "\n"
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
