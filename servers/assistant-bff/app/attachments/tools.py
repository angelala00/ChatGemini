from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.llm_kernel import ImageContent, TextContent, ToolDefinition
from app.routes.file_routes import extract_text_from_file_ids, get_file_paths, load_file_mapping

from .service import _encode_image_content, resolve_attachment_selection


@dataclass(slots=True)
class AttachmentToolExecutionResult:
    content: list[TextContent | ImageContent] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


ATTACHMENT_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name="attachment_list",
        description="List uploaded attachments for the current request/session and return their metadata.",
        parameters={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="attachment_extract_text",
        description="Extract text from uploaded document attachments or image attachments via fallback extraction.",
        parameters={
            "type": "object",
            "properties": {
                "file_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional subset of attachment file IDs to read. Defaults to all attachments in the current request.",
                    "minItems": 1,
                },
                "mode": {
                    "type": "string",
                    "enum": ["auto", "documents", "images", "all"],
                    "description": "Which attachment subset to extract text from.",
                },
            },
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="attachment_load_images",
        description="Load uploaded image attachments as native image content blocks for image-capable models.",
        parameters={
            "type": "object",
            "properties": {
                "file_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional subset of image attachment file IDs to load. Defaults to all attachments in the current request.",
                    "minItems": 1,
                },
            },
            "additionalProperties": False,
        },
    ),
]


def get_attachment_tool_definitions(*, model_supports_native_images: bool) -> list[ToolDefinition]:
    tools = list(ATTACHMENT_TOOL_DEFINITIONS)
    if not model_supports_native_images:
        tools = [tool for tool in tools if tool.name != "attachment_load_images"]
    return tools


def _join_file_ids(file_ids: list[str]) -> Optional[str]:
    normalized = [file_id.strip() for file_id in file_ids if isinstance(file_id, str) and file_id.strip()]
    if not normalized:
        return None
    return ",".join(normalized)


async def _execute_attachment_list(file_ids: list[str]) -> AttachmentToolExecutionResult:
    joined_file_ids = _join_file_ids(file_ids)
    file_mapping = load_file_mapping()
    items: list[dict[str, Any]] = []
    for file_id in file_ids:
        current = file_mapping.get(file_id)
        if not current:
            items.append({"file_id": file_id, "found": False})
            continue
        items.append(
            {
                "file_id": file_id,
                "found": True,
                "filename": current.get("filename"),
                "file_extension": current.get("fileExtension"),
                "path": current.get("path"),
            }
        )
    return AttachmentToolExecutionResult(
        content=[TextContent(text=_render_json_text({"file_ids": joined_file_ids, "items": items}))],
        details={"items": items},
    )


async def _execute_attachment_extract_text(
    file_ids: list[str],
    *,
    mode: str = "auto",
) -> AttachmentToolExecutionResult:
    joined_file_ids = _join_file_ids(file_ids)
    if not joined_file_ids:
        return AttachmentToolExecutionResult(
            content=[TextContent(text="No attachment file IDs were provided.")],
            details={"selected_file_ids": None},
        )
    selection = resolve_attachment_selection(joined_file_ids)
    selected_file_ids: Optional[str]
    if mode == "documents":
        selected_file_ids = selection.document_file_ids
    elif mode == "images":
        selected_file_ids = selection.image_file_ids
    elif mode == "all":
        selected_file_ids = joined_file_ids
    else:
        document_ids = selection.document_file_ids
        image_ids = selection.image_file_ids
        if document_ids and image_ids:
            selected_file_ids = f"{document_ids},{image_ids}"
        else:
            selected_file_ids = document_ids or image_ids

    if not selected_file_ids:
        return AttachmentToolExecutionResult(
            content=[TextContent(text="No matching attachments were found for the requested extraction mode.")],
            details={
                "selected_file_ids": None,
                "mode": mode,
                "image_file_ids": selection.image_file_ids,
                "document_file_ids": selection.document_file_ids,
            },
        )

    extracted_text = await extract_text_from_file_ids(selected_file_ids)
    return AttachmentToolExecutionResult(
        content=[TextContent(text=extracted_text)],
        details={
            "selected_file_ids": selected_file_ids,
            "mode": mode,
            "image_file_ids": selection.image_file_ids,
            "document_file_ids": selection.document_file_ids,
        },
    )


async def _execute_attachment_load_images(file_ids: list[str]) -> AttachmentToolExecutionResult:
    joined_file_ids = _join_file_ids(file_ids)
    if not joined_file_ids:
        return AttachmentToolExecutionResult(
            content=[TextContent(text="No image attachment file IDs were provided.")],
            details={"selected_file_ids": None},
        )
    selection = resolve_attachment_selection(joined_file_ids)
    images = [_encode_image_content(path) for path in selection.image_paths]
    details = {
        "selected_file_ids": selection.image_file_ids,
        "loaded_count": len(images),
        "requested_file_ids": joined_file_ids,
        "paths": get_file_paths(selection.image_file_ids) or [],
    }
    if not images:
        return AttachmentToolExecutionResult(
            content=[TextContent(text="No image attachments were found for the provided file IDs.")],
            details=details,
        )
    return AttachmentToolExecutionResult(content=images, details=details)


async def execute_attachment_tool(
    name: str,
    arguments: dict[str, Any],
    *,
    available_file_ids: list[str],
) -> AttachmentToolExecutionResult:
    raw_file_ids = arguments.get("file_ids")
    if raw_file_ids is None:
        file_ids = list(available_file_ids)
    elif isinstance(raw_file_ids, list):
        file_ids = raw_file_ids
    else:
        raise ValueError("attachment tool file_ids must be a list of strings when provided")

    if name == "attachment_list":
        return await _execute_attachment_list(file_ids)
    if name == "attachment_extract_text":
        mode = arguments.get("mode", "auto")
        return await _execute_attachment_extract_text(file_ids, mode=mode)
    if name == "attachment_load_images":
        return await _execute_attachment_load_images(file_ids)
    raise ValueError(f'Unknown attachment tool "{name}"')


def _render_json_text(value: dict[str, Any]) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, indent=2)
