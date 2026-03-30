import os
import imghdr
import time

from app.logger import gpt_logger
from app.utils.model_tool import convert_image_message, MODEL_NAME_VL
from app.utils import text_extractor


async def extract_text_from_file(file_path: str, file_type: str):
    if not os.path.exists(file_path):
        raise FileNotFoundError("FilePath not found")

    started_at = time.perf_counter()

    # if file_type == '.xlsx':
    #     result = parse_excel(file_path)
    #     return {"text": result}
    # elif file_type == '.docx' or file_type == '.doc':
    #     result = parse_word(file_path)
    #     return {"text": result}
    # elif file_type == '.pdf':
    #     result = parse_pdf(file_path)
    #     return {"text": result}
    # else:
    #     raise Exception(f"UnSupport file type:{file_type}")

    if imghdr.what(file_path) is not None:
        from app.chat_service import _ask_once_stream

        gpt_logger.info(
            "image_text_extract_start path=%s model=%s",
            file_path,
            MODEL_NAME_VL,
        )
        query = "提取图片信息"
        messages = [{"role": "user", "content": convert_image_message(file_path, query)}]
        text_content = ""
        try:
            async for event in _ask_once_stream(messages, None, MODEL_NAME_VL):
                if event.get("type") == "text.delta":
                    text_content += event.get("data")["text"]
            gpt_logger.info(
                "image_text_extract_complete path=%s model=%s elapsed_ms=%.1f text_len=%s",
                file_path,
                MODEL_NAME_VL,
                (time.perf_counter() - started_at) * 1000,
                len(text_content),
            )
        except Exception:
            gpt_logger.exception(
                "image_text_extract_failed path=%s model=%s elapsed_ms=%.1f",
                file_path,
                MODEL_NAME_VL,
                (time.perf_counter() - started_at) * 1000,
            )
            raise
        return text_content
    else:
        gpt_logger.info(
            "document_text_extract_start path=%s file_type=%s",
            file_path,
            file_type,
        )
        text = text_extractor.extract_text(file_path, file_type)
        gpt_logger.info(
            "document_text_extract_complete path=%s file_type=%s elapsed_ms=%.1f text_len=%s",
            file_path,
            file_type,
            (time.perf_counter() - started_at) * 1000,
            len(text or ""),
        )
    return text
