import mimetypes
import os


_IMAGE_MIME_TYPES = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
    "tiff": "image/tiff",
}


def detect_image_type_from_bytes(header: bytes) -> str | None:
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "webp"
    if header.startswith(b"BM"):
        return "bmp"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return "tiff"
    return None


def detect_image_type(file_path: str) -> str | None:
    if not file_path or not os.path.exists(file_path):
        return None
    with open(file_path, "rb") as file_obj:
        header = file_obj.read(32)
    return detect_image_type_from_bytes(header)


def is_image_file(file_path: str) -> bool:
    return detect_image_type(file_path) is not None


def detect_image_mime_type(file_path: str) -> str:
    image_type = detect_image_type(file_path)
    if image_type:
        return _IMAGE_MIME_TYPES.get(image_type, "image/jpeg")
    guessed_type, _ = mimetypes.guess_type(file_path)
    if guessed_type and guessed_type.startswith("image/"):
        return guessed_type
    return "image/jpeg"
