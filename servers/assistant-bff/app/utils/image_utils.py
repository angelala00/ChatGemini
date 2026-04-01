import mimetypes
import os
import struct


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


def detect_image_dimensions_from_bytes(data: bytes) -> tuple[int, int] | None:
    image_type = detect_image_type_from_bytes(data[:32])
    if image_type == "png":
        if len(data) < 24:
            return None
        width = struct.unpack(">I", data[16:20])[0]
        height = struct.unpack(">I", data[20:24])[0]
        return width, height

    if image_type == "jpeg":
        index = 2
        data_len = len(data)
        while index + 9 < data_len:
            if data[index] != 0xFF:
                index += 1
                continue
            marker = data[index + 1]
            index += 2
            if marker in {0xD8, 0xD9}:
                continue
            if index + 2 > data_len:
                return None
            segment_length = struct.unpack(">H", data[index:index + 2])[0]
            if segment_length < 2 or index + segment_length > data_len:
                return None
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                if index + 7 > data_len:
                    return None
                height = struct.unpack(">H", data[index + 3:index + 5])[0]
                width = struct.unpack(">H", data[index + 5:index + 7])[0]
                return width, height
            index += segment_length
        return None

    return None


def detect_image_mime_type(file_path: str) -> str:
    image_type = detect_image_type(file_path)
    if image_type:
        return _IMAGE_MIME_TYPES.get(image_type, "image/jpeg")
    guessed_type, _ = mimetypes.guess_type(file_path)
    if guessed_type and guessed_type.startswith("image/"):
        return guessed_type
    return "image/jpeg"
