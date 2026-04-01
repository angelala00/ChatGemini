import asyncio
import base64
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
from app.utils.image_utils import detect_image_mime_type


IMAGE_PREPROCESS_TIMEOUT_SECONDS = 30

@dataclass(frozen=True)
class AttachmentSelection:
    image_file_ids: Optional[str]
    document_file_ids: Optional[str]
    image_paths: list[str]
    document_paths: list[str]


@dataclass(frozen=True)
class ExtractedTextBudgetResult:
    text: str
    truncated: bool


class AttachmentContentTooLongError(RuntimeError):
    """Raised when attachment preload text exceeds the allowed budget."""


async def _noop_emit_event(_event_name: str, **_payload) -> None:
    return None


def _encode_image_content(path: str) -> ImageContent:
    with open(path, "rb") as file_obj:
        raw = file_obj.read()
    return ImageContent(
        data=base64.b64encode(raw).decode("ascii"),
        mime_type=detect_image_mime_type(path),
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
        include_tooling=True,
    )


def _render_attachment_manifest_for_model(
    *,
    file_ids: Optional[str],
    selection: AttachmentSelection,
    model_supports_native_images: bool,
    include_tooling: bool = True,
) -> str:
    if not file_ids:
        return ""
    file_mapping = load_file_mapping()
    lines = [
        "",
        "[附件清单]",
        "本轮请求附带了附件。",
    ]
    if include_tooling:
        available_tools = ["document_list", "document_read_text"]
        if model_supports_native_images:
            available_tools.append("document_load_images")
        lines.extend(
            [
                "如果你需要读取附件内容，请优先调用附件工具，而不是臆测文件内容。",
                f"可用文档工具：{'、'.join(available_tools)}。",
                "兼容别名：resource_list、resource_read_text、resource_load_images，以及 attachment_*（如适用）。",
            ]
        )
    else:
        lines.append("请先根据附件清单和用户问题判断是否真的需要读取正文内容。")
    for file_id in [item.strip() for item in file_ids.split(",") if item.strip()]:
        item = file_mapping.get(file_id)
        if not item:
            continue
        file_kind = "image" if selection.image_file_ids and file_id in selection.image_file_ids.split(",") else "document"
        lines.append(
            f"- name: {item.get('filename')} | type: {file_kind} | file_id: {file_id}"
        )
    return "\n".join(lines) + "\n"


def _split_file_ids(file_ids: Optional[str]) -> list[str]:
    if not file_ids:
        return []
    return [item.strip() for item in file_ids.split(",") if item.strip()]


def _strip_upload_content_header(text: str) -> str:
    prefix = "\n[上传文件内容]:\n"
    if text.startswith(prefix):
        return text[len(prefix):]
    return text


async def _extract_text_with_balanced_budget(
    file_ids: Optional[str],
    *,
    total_max_chars: int,
) -> ExtractedTextBudgetResult:
    normalized_file_ids = _split_file_ids(file_ids)
    if not normalized_file_ids:
        return ExtractedTextBudgetResult(text="", truncated=False)

    rendered_chunks: list[str] = []
    remaining_budget = max(total_max_chars, 0)
    truncated = False

    for index, current_file_id in enumerate(normalized_file_ids):
        remaining_files = len(normalized_file_ids) - index
        if remaining_budget <= 0:
            truncated = True
            break

        per_file_budget = max(2000, remaining_budget // max(remaining_files, 1))
        extracted = await extract_text_from_file_ids(
            current_file_id,
            max_chars=per_file_budget,
        )
        normalized = _strip_upload_content_header(extracted).strip()
        if not normalized:
            continue

        candidate = normalized if not rendered_chunks else f"\n{normalized}"
        if len(candidate) > remaining_budget:
            candidate = candidate[:remaining_budget].rstrip()
            truncated = True
        rendered_chunks.append(candidate)
        remaining_budget -= len(candidate)

        if normalized.endswith("[已截断]"):
            truncated = True
            gpt_logger.info(
                "attachment_text_budget_item_truncated file_id=%s per_file_budget=%s remaining_budget=%s",
                current_file_id,
                per_file_budget,
                remaining_budget,
            )

    if not rendered_chunks:
        return ExtractedTextBudgetResult(text="", truncated=truncated)

    combined = "\n[上传文件内容]:\n" + "".join(rendered_chunks).rstrip()
    if truncated and not combined.endswith("[已截断]"):
        combined = combined.rstrip() + "\n\n[已截断]"
    if truncated:
        gpt_logger.warning(
            "attachment_text_budget_truncated file_count=%s total_max_chars=%s final_chars=%s",
            len(normalized_file_ids),
            total_max_chars,
            len(combined),
        )
    return ExtractedTextBudgetResult(text=combined, truncated=truncated)


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
        "- If you need file contents, call document_list or document_read_text first.",
        "- Compatible aliases resource_list/resource_read_text and attachment_list/attachment_extract_text are also supported.",
    ]
    if selection.image_file_ids:
        if model_supports_native_images:
            lines.append("- Native image input is available for this model. You may use document_load_images when explicit image loading is useful.")
            lines.append("- Compatible aliases resource_load_images and attachment_load_images are also supported.")
        else:
            lines.append("- This model does not have native image input for uploaded files.")
            lines.append("- For image questions, prefer document_read_text and do not claim to directly see the uploaded image.")
    if selection.document_file_ids:
        lines.append("- For documents, prefer document_read_text before answering detailed content questions.")
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
    attach_native_images: bool = True,
    document_preload_max_chars: int = 80000,
    image_preload_max_chars: int = 20000,
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
            extracted_document_text = await _extract_text_with_balanced_budget(
                selection.document_file_ids,
                total_max_chars=document_preload_max_chars,
            )
            if extracted_document_text.truncated:
                multiple_documents = len(_split_file_ids(selection.document_file_ids)) > 1
                await emit(
                    "preprocess_error",
                    stage="document_text_extraction",
                    message=(
                        "本次上传的文件总内容过长，请减少文件数量或拆分提问后重试。"
                        if multiple_documents
                        else "附件文本内容过长，请减少文件内容或拆分提问后重试。"
                    ),
                )
                raise AttachmentContentTooLongError(
                    "too many files exceed preload budget"
                    if multiple_documents
                    else "document content exceeds preload budget"
                )
            user_text += extracted_document_text.text
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
                include_tooling=document_strategy == "tool_only",
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
                include_tooling=True,
            )
            gpt_logger.info(
                "attachment_image_manifest_injected model=%s file_ids=%s",
                model_id,
                selection.image_file_ids,
            )
        elif non_native_image_strategy == "manifest_only":
            user_text += _render_attachment_manifest_for_model(
                file_ids=file_ids,
                selection=selection,
                model_supports_native_images=model_supports_native_images,
                include_tooling=False,
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
                    _extract_text_with_balanced_budget(
                        selection.image_file_ids,
                        total_max_chars=image_preload_max_chars,
                    ),
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
            if extracted_image_text.truncated:
                multiple_images = len(_split_file_ids(selection.image_file_ids)) > 1
                await emit(
                    "preprocess_error",
                    stage="image_text_extraction",
                    message=(
                        "本次上传的图片总内容过长，请减少图片数量或缩小问题范围后重试。"
                        if multiple_images
                        else "图片解析结果过长，请缩小问题范围后重试。"
                    ),
                )
                raise AttachmentContentTooLongError(
                    "too many files exceed preload budget"
                    if multiple_images
                    else "image content exceeds preload budget"
                )
            if not extracted_image_text.text.strip():
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
            user_text += extracted_image_text.text
            gpt_logger.info(
                "attachment_image_extract_complete model=%s file_ids=%s elapsed_ms=%.1f text_len=%s",
                model_id,
                selection.image_file_ids,
                (time.perf_counter() - image_started_at) * 1000,
                len(extracted_image_text.text),
            )
            await emit(
                "preprocess_complete",
                stage="image_text_extraction",
            )

    if selection.image_file_ids and model_supports_native_images and attach_native_images:
        blocks: list[TextContent | ImageContent] = [TextContent(text=user_text)]
        for path in selection.image_paths:
            blocks.append(_encode_image_content(path))
        return UserMessage(content=blocks, timestamp=int(time.time() * 1000))

    return UserMessage(content=user_text, timestamp=int(time.time() * 1000))
