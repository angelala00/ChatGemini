import asyncio
import base64
import imghdr
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from app.llm_kernel import ImageContent, TextContent, UserMessage
from app.logger import gpt_logger
from app.routes.file_routes import (
    extract_text_from_file_ids,
    get_file_paths,
    load_file_mapping,
    split_file_ids_by_type,
)


IMAGE_PREPROCESS_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class AttachmentSelection:
    image_file_ids: Optional[str]
    document_file_ids: Optional[str]
    image_paths: list[str]
    document_paths: list[str]


async def _noop_emit_event(_event_name: str, **_payload) -> None:
    return None


def _encode_image_content(path: str) -> ImageContent:
    with open(path, "rb") as file_obj:
        raw = file_obj.read()
    image_kind = imghdr.what(path)
    mime_type = f"image/{image_kind}" if image_kind else "image/jpeg"
    return ImageContent(
        data=base64.b64encode(raw).decode("ascii"),
        mime_type=mime_type,
    )


def resolve_attachment_selection(file_ids: Optional[str]) -> AttachmentSelection:
    image_file_ids, document_file_ids = split_file_ids_by_type(file_ids)
    image_paths = get_file_paths(image_file_ids) or []
    document_paths = get_file_paths(document_file_ids) or []
    return AttachmentSelection(
        image_file_ids=image_file_ids,
        document_file_ids=document_file_ids,
        image_paths=image_paths,
        document_paths=document_paths,
    )


def _render_attachment_manifest(file_ids: Optional[str], selection: AttachmentSelection) -> str:
    return _render_attachment_manifest_for_model(
        file_ids=file_ids,
        selection=selection,
        model_supports_native_images=True,
    )


def _render_attachment_manifest_for_model(
    *,
    file_ids: Optional[str],
    selection: AttachmentSelection,
    model_supports_native_images: bool,
) -> str:
    if not file_ids:
        return ""
    available_tools = ["attachment_list", "attachment_extract_text"]
    if model_supports_native_images:
        available_tools.append("attachment_load_images")
    file_mapping = load_file_mapping()
    lines = [
        "",
        "[附件清单]",
        "本轮请求附带了附件。如果你需要读取附件内容，请优先调用附件工具，而不是臆测文件内容。",
        f"可用附件工具：{'、'.join(available_tools)}。",
    ]
    for file_id in [item.strip() for item in file_ids.split(",") if item.strip()]:
        item = file_mapping.get(file_id)
        if not item:
            continue
        file_kind = "image" if selection.image_file_ids and file_id in selection.image_file_ids.split(",") else "document"
        lines.append(
            f"- name: {item.get('filename')} | type: {file_kind} | file_id: {file_id}"
        )
    return "\n".join(lines) + "\n"


def build_attachment_tool_guidance(
    *,
    file_ids: Optional[str],
    model_supports_native_images: bool,
) -> str:
    selection = resolve_attachment_selection(file_ids)
    if not selection.document_file_ids and not selection.image_file_ids:
        return ""

    lines = [
        "",
        "Attachment handling policy:",
        "- This request includes uploaded attachments.",
        "- Do not invent attachment contents.",
        "- If you need file contents, call attachment_list or attachment_extract_text first.",
    ]
    if selection.image_file_ids:
        if model_supports_native_images:
            lines.append("- Native image input is available for this model. You may use attachment_load_images when explicit image loading is useful.")
        else:
            lines.append("- This model does not have native image input for uploaded files.")
            lines.append("- For image questions, prefer attachment_extract_text and do not claim to directly see the uploaded image.")
    if selection.document_file_ids:
        lines.append("- For documents, prefer attachment_extract_text before answering detailed content questions.")
    return "\n".join(lines)


async def build_user_message_from_attachments(
    *,
    query: str,
    file_ids: Optional[str],
    model_id: str,
    model_supports_native_images: bool,
    emit_event: Optional[Callable[..., Awaitable[None]]] = None,
    image_preprocess_timeout_seconds: int = IMAGE_PREPROCESS_TIMEOUT_SECONDS,
    document_strategy: str = "tool_only",
    non_native_image_strategy: str = "preprocess_text",
) -> UserMessage:
    emit = emit_event or _noop_emit_event
    user_text = query
    selection = resolve_attachment_selection(file_ids)

    gpt_logger.info(
        "attachment_selection_resolved file_ids=%s image_file_ids=%s document_file_ids=%s image_count=%s document_count=%s model=%s document_strategy=%s non_native_image_strategy=%s",
        file_ids,
        selection.image_file_ids,
        selection.document_file_ids,
        len(selection.image_paths),
        len(selection.document_paths),
        model_id,
        document_strategy,
        non_native_image_strategy,
    )

    if selection.document_file_ids:
        if document_strategy == "preload_text":
            document_started_at = time.perf_counter()
            await emit(
                "preprocess_start",
                stage="document_text_extraction",
                message="正在提取附件文本内容",
            )
            user_text += await extract_text_from_file_ids(selection.document_file_ids)
            gpt_logger.info(
                "attachment_document_extract_complete model=%s file_ids=%s elapsed_ms=%.1f",
                model_id,
                selection.document_file_ids,
                (time.perf_counter() - document_started_at) * 1000,
            )
            await emit(
                "preprocess_complete",
                stage="document_text_extraction",
            )
        else:
            user_text += _render_attachment_manifest_for_model(
                file_ids=file_ids,
                selection=selection,
                model_supports_native_images=model_supports_native_images,
            )
            gpt_logger.info(
                "attachment_document_manifest_injected model=%s file_ids=%s",
                model_id,
                selection.document_file_ids,
            )

    if selection.image_file_ids and not model_supports_native_images:
        if non_native_image_strategy == "tool_only":
            user_text += _render_attachment_manifest_for_model(
                file_ids=file_ids,
                selection=selection,
                model_supports_native_images=model_supports_native_images,
            )
            gpt_logger.info(
                "attachment_image_manifest_injected model=%s file_ids=%s",
                model_id,
                selection.image_file_ids,
            )
        else:
            image_started_at = time.perf_counter()
            await emit(
                "preprocess_start",
                stage="image_text_extraction",
                message="当前模型不支持直接看图，正在先解析图片内容",
            )
            try:
                extracted_image_text = await asyncio.wait_for(
                    extract_text_from_file_ids(selection.image_file_ids),
                    timeout=image_preprocess_timeout_seconds,
                )
            except TimeoutError as exc:
                gpt_logger.error(
                    "attachment_image_extract_timeout model=%s file_ids=%s timeout_seconds=%s elapsed_ms=%.1f",
                    model_id,
                    selection.image_file_ids,
                    image_preprocess_timeout_seconds,
                    (time.perf_counter() - image_started_at) * 1000,
                )
                await emit(
                    "preprocess_error",
                    stage="image_text_extraction",
                    message=f"图片内容解析超时（>{image_preprocess_timeout_seconds}秒）",
                )
                raise RuntimeError("image preprocessing timed out") from exc
            except Exception as exc:
                gpt_logger.exception(
                    "attachment_image_extract_failed model=%s file_ids=%s elapsed_ms=%.1f",
                    model_id,
                    selection.image_file_ids,
                    (time.perf_counter() - image_started_at) * 1000,
                )
                await emit(
                    "preprocess_error",
                    stage="image_text_extraction",
                    message=f"图片内容解析失败：{str(exc)}",
                )
                raise RuntimeError(f"image preprocessing failed: {str(exc)}") from exc
            if not extracted_image_text.strip():
                gpt_logger.error(
                    "attachment_image_extract_empty model=%s file_ids=%s elapsed_ms=%.1f",
                    model_id,
                    selection.image_file_ids,
                    (time.perf_counter() - image_started_at) * 1000,
                )
                await emit(
                    "preprocess_error",
                    stage="image_text_extraction",
                    message="图片内容解析结果为空",
                )
                raise RuntimeError("image preprocessing returned empty text")
            user_text += extracted_image_text
            gpt_logger.info(
                "attachment_image_extract_complete model=%s file_ids=%s elapsed_ms=%.1f text_len=%s",
                model_id,
                selection.image_file_ids,
                (time.perf_counter() - image_started_at) * 1000,
                len(extracted_image_text),
            )
            await emit(
                "preprocess_complete",
                stage="image_text_extraction",
            )

    if selection.image_file_ids and model_supports_native_images:
        blocks: list[TextContent | ImageContent] = [TextContent(text=user_text)]
        for path in selection.image_paths:
            blocks.append(_encode_image_content(path))
        return UserMessage(content=blocks, timestamp=int(time.time() * 1000))

    return UserMessage(content=user_text, timestamp=int(time.time() * 1000))
