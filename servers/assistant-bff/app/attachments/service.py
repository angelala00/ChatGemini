import base64
import time
from dataclasses import dataclass
from typing import Optional

from app.llm_kernel import ImageContent, TextContent, UserMessage
from app.logger import gpt_logger
from app.routes.file_routes import (
    get_file_paths,
    load_file_mapping,
    safe_display_filename,
    split_file_ids_by_type,
)
from app.utils.image_utils import detect_image_mime_type

@dataclass(frozen=True)
class AttachmentSelection:
    image_file_ids: Optional[str]
    document_file_ids: Optional[str]
    image_paths: list[str]
    document_paths: list[str]


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
                "如果你需要附件内容，先调用附件工具，不要臆测文件内容。",
                f"可用文档工具：{'、'.join(available_tools)}。",
            ]
        )
    else:
        lines.append("请先根据附件清单和用户问题判断是否真的需要读取正文内容。")
    image_file_id_set = set(_split_file_ids(selection.image_file_ids))
    for file_id in [item.strip() for item in file_ids.split(",") if item.strip()]:
        item = file_mapping.get(file_id)
        if not item:
            continue
        file_kind = "image" if file_id in image_file_id_set else "document"
        lines.append(
            f"- name: {safe_display_filename(item.get('filename'))} | type: {file_kind} | file_id: {file_id}"
        )
    return "\n".join(lines) + "\n"


def _split_file_ids(file_ids: Optional[str]) -> list[str]:
    if not file_ids:
        return []
    return [item.strip() for item in file_ids.split(",") if item.strip()]


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
        "- If the answer depends on attachment contents, call document_list or document_read_text first.",
    ]
    if selection.image_file_ids:
        if model_supports_native_images:
            lines.append("- Native image input is available for this model. You may use document_load_images when explicit image loading is useful.")
        else:
            lines.append("- This model does not have native image input for uploaded files.")
            lines.append("- For image questions, prefer document_read_text and do not claim to directly see the uploaded image.")
    if selection.document_file_ids:
        lines.append("- For documents, use document_read_text before answering detailed content questions.")
    return "\n".join(lines)


async def build_user_message_from_attachments(
    *,
    query: str,
    file_ids: Optional[str],
    model_id: str,
    model_supports_native_images: bool,
) -> UserMessage:
    user_text = query
    selection = resolve_attachment_selection(file_ids)
    has_attachments = bool(selection.document_file_ids or selection.image_file_ids)

    gpt_logger.info(
        "attachment_selection_resolved file_ids=%s image_file_ids=%s document_file_ids=%s image_count=%s document_count=%s model=%s tool_first=%s native_image_input=%s",
        file_ids,
        selection.image_file_ids,
        selection.document_file_ids,
        len(selection.image_paths),
        len(selection.document_paths),
        model_id,
        True,
        model_supports_native_images,
    )

    if has_attachments:
        user_text += _render_attachment_manifest_for_model(
            file_ids=file_ids,
            selection=selection,
            model_supports_native_images=model_supports_native_images,
            include_tooling=True,
        )
        gpt_logger.info(
            "attachment_manifest_injected model=%s file_ids=%s native_image_input=%s",
            model_id,
            file_ids,
            model_supports_native_images,
        )

    if selection.image_file_ids and model_supports_native_images:
        blocks: list[TextContent | ImageContent] = [TextContent(text=user_text)]
        for path in selection.image_paths:
            blocks.append(_encode_image_content(path))
        gpt_logger.info(
            "attachment_native_images_attached model=%s file_ids=%s image_count=%s",
            model_id,
            selection.image_file_ids,
            len(selection.image_paths),
        )
        return UserMessage(content=blocks, timestamp=int(time.time() * 1000))

    return UserMessage(content=user_text, timestamp=int(time.time() * 1000))
