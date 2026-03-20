import os
import base64
from pathlib import Path
from typing import Union, List
import imghdr
import mimetypes

from dotenv import load_dotenv


_current_file = Path(__file__).resolve()
_env_candidates = []
if len(_current_file.parents) >= 5:
    _env_candidates.append(_current_file.parents[4] / ".env")
if len(_current_file.parents) >= 3:
    _env_candidates.append(_current_file.parents[2] / ".env")

for _env_file in _env_candidates:
    if load_dotenv(_env_file, override=False):
        break


MODEL_NAME_VL = os.getenv("MODEL_NAME_VL", "qwen3-vl-8b-instruct")
MODEL_NAME_INSTRUCT = os.getenv("MODEL_NAME_INSTRUCT", "qwen3.5-35b-a3b")
MODEL_NAME_THINKING = os.getenv("MODEL_NAME_THINKING", "deepseek-r1-distill-qwen-32b")
MODEL_NAME_QWQ = os.getenv("MODEL_NAME_QWQ", "QwQ-32B")
MODEL_NAME_DS = os.getenv("MODEL_NAME_DS", "deepseek-r1-distill-qwen-32b")


def convert_image_message(file_path: Union[str, List[str]], query):
    if isinstance(file_path, str):
        file_path = [file_path]
    if not file_path:
        raise ValueError("file_path is None")
    message_content = []
    for path in file_path:
        image_data_url = get_image_data_url(path)
        if image_data_url:
            message_content.append({"type": "image_url", "image_url": {"url": image_data_url}})
    message_content.append({"type": "text", "text": query})
    return message_content


def get_image_base64(file_path: str):
    if not os.path.exists(file_path):
        print(f"FilePath:{file_path} not found")
        return None
    with open(file_path, "rb") as image_file:
        encoded_bytes = base64.b64encode(image_file.read())
        encoded_str = encoded_bytes.decode("utf-8")
        return encoded_str


def _detect_image_mime_type(file_path: str):
    image_type = imghdr.what(file_path)
    if image_type == "jpeg":
        return "image/jpeg"
    if image_type == "png":
        return "image/png"
    if image_type == "gif":
        return "image/gif"
    if image_type == "webp":
        return "image/webp"
    guessed_type, _ = mimetypes.guess_type(file_path)
    if guessed_type and guessed_type.startswith("image/"):
        return guessed_type
    return "image/jpeg"


def get_image_data_url(file_path: str):
    img_base64_str = get_image_base64(file_path)
    if not img_base64_str:
        return None
    mime_type = _detect_image_mime_type(file_path)
    return f"data:{mime_type};base64,{img_base64_str}"


def is_image_only(file_paths: str):
    if not file_paths:
        return False
    for file_path in file_paths:
        if not os.path.exists(file_path):
            print(f"file_path:{file_path} is not found")
            continue
        with open(file_path, "rb") as f:
            header = f.read(32)
        if imghdr.what(None, header) is None:
            return False
    return True
