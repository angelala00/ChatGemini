import asyncio
import multiprocessing
import os
import time
from typing import Any

from app.logger import gpt_logger
from app.utils.image_utils import is_image_file
from app.utils.model_tool import convert_image_message, MODEL_NAME_VL
from app.utils import text_extractor

def _extract_document_worker(
    connection,
    file_path: str,
    file_type: str,
    kwargs: dict[str, Any],
    max_chars: int | None,
) -> None:
    try:
        text = text_extractor.extract_text(file_path, file_type, max_chars=max_chars, **kwargs)
        if max_chars is not None and max_chars > 0 and len(text) > max_chars:
            text = text[:max_chars].rstrip() + "\n\n[已截断]"
        connection.send(("ok", text))
    except BaseException as exc:
        connection.send(("error", f"{type(exc).__name__}: {exc}"))
    finally:
        connection.close()


def _extract_document_in_process(
    file_path: str,
    file_type: str,
    kwargs: dict[str, Any],
    timeout_seconds: int,
    max_chars: int | None,
) -> str:
    context = multiprocessing.get_context("spawn")
    parent_connection, child_connection = context.Pipe(duplex=False)
    process = context.Process(
        target=_extract_document_worker,
        args=(child_connection, file_path, file_type, kwargs, max_chars),
        daemon=True,
    )
    process.start()
    child_connection.close()
    try:
        if not parent_connection.poll(timeout_seconds):
            process.terminate()
            process.join(timeout=2)
            if process.is_alive():
                process.kill()
                process.join(timeout=2)
            raise TimeoutError("File text extraction timed out")
        result_type, payload = parent_connection.recv()
        process.join(timeout=2)
        if result_type == "error":
            raise RuntimeError(payload)
        return str(payload)
    finally:
        parent_connection.close()
        if process.is_alive():
            process.terminate()
            process.join(timeout=2)


async def extract_text_from_file(
    file_path: str,
    file_type: str,
    *,
    page: int | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    sheet_name: str | None = None,
    sheet_index: int | None = None,
    timeout_seconds: int = 60,
    max_chars: int | None = None,
):
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

    if is_image_file(file_path):
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
        text = await asyncio.to_thread(
            _extract_document_in_process,
            file_path,
            file_type,
            {
                "page": page,
                "page_from": page_from,
                "page_to": page_to,
                "sheet_name": sheet_name,
                "sheet_index": sheet_index,
            },
            timeout_seconds,
            max_chars,
        )
        gpt_logger.info(
            "document_text_extract_complete path=%s file_type=%s elapsed_ms=%.1f text_len=%s",
            file_path,
            file_type,
            (time.perf_counter() - started_at) * 1000,
            len(text or ""),
        )
    return text
