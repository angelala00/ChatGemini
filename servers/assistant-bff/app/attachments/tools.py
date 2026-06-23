from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.llm_kernel import ImageContent, TextContent, ToolDefinition

from .service import _encode_image_content, resolve_attachment_selection


def _file_routes():
    from app.routes import file_routes

    return file_routes


def _get_gptassistant_upload_limits():
    return _file_routes()._get_gptassistant_upload_limits()


def describe_file_mapping_entry(file_id: str, entry: dict | None) -> dict:
    return _file_routes().describe_file_mapping_entry(file_id, entry)


async def extract_text_from_file_ids(
    file_ids: str,
    max_chars: int | None = None,
    *,
    page: int | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    sheet_name: str | None = None,
    sheet_index: int | None = None,
):
    return await _file_routes().extract_text_from_file_ids(
        file_ids,
        max_chars=max_chars,
        page=page,
        page_from=page_from,
        page_to=page_to,
        sheet_name=sheet_name,
        sheet_index=sheet_index,
    )


def load_file_mapping():
    return _file_routes().load_file_mapping()


@dataclass(slots=True)
class AttachmentToolExecutionResult:
    content: list[TextContent | ImageContent] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


RESOURCE_LIST_TOOL_NAME = "resource_list"
RESOURCE_READ_TEXT_TOOL_NAME = "resource_read_text"
RESOURCE_LOAD_IMAGES_TOOL_NAME = "resource_load_images"

DOCUMENT_LIST_TOOL_NAME = "document_list"
DOCUMENT_READ_TEXT_TOOL_NAME = "document_read_text"
DOCUMENT_LOAD_IMAGES_TOOL_NAME = "document_load_images"

ATTACHMENT_LIST_TOOL_NAME = "attachment_list"
ATTACHMENT_EXTRACT_TEXT_TOOL_NAME = "attachment_extract_text"
ATTACHMENT_LOAD_IMAGES_TOOL_NAME = "attachment_load_images"
DEFAULT_ATTACHMENT_TOOL_MAX_CHARS = 30000

RESOURCE_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name=RESOURCE_LIST_TOOL_NAME,
        description="List uploaded resources for the current request/session and return their metadata.",
        parameters={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name=RESOURCE_READ_TEXT_TOOL_NAME,
        description="Read text from uploaded resources in the current request/session, including documents and image OCR fallback.",
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
                "max_chars": {
                    "type": "integer",
                    "description": "Optional maximum number of characters to return across the extracted text output.",
                    "minimum": 200,
                },
                "page": {
                    "type": "integer",
                    "description": "Optional 1-based page number to read from PDF documents.",
                    "minimum": 1,
                },
                "page_from": {
                    "type": "integer",
                    "description": "Optional 1-based inclusive start page for PDF reads.",
                    "minimum": 1,
                },
                "page_to": {
                    "type": "integer",
                    "description": "Optional 1-based inclusive end page for PDF reads.",
                    "minimum": 1,
                },
                "sheet_name": {
                    "type": "string",
                    "description": "Optional exact sheet name to read from spreadsheet documents.",
                },
                "sheet_index": {
                    "type": "integer",
                    "description": "Optional 0-based sheet index to read from spreadsheet documents.",
                    "minimum": 0,
                },
            },
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name=RESOURCE_LOAD_IMAGES_TOOL_NAME,
        description="Load uploaded image resources as native image content blocks for image-capable models.",
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

DOCUMENT_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name=DOCUMENT_LIST_TOOL_NAME,
        description="List uploaded documents and images for the current request/session and return their metadata.",
        parameters=RESOURCE_TOOL_DEFINITIONS[0].parameters,
    ),
    ToolDefinition(
        name=DOCUMENT_READ_TEXT_TOOL_NAME,
        description="Read text from uploaded documents and image OCR for the current request/session.",
        parameters=RESOURCE_TOOL_DEFINITIONS[1].parameters,
    ),
    ToolDefinition(
        name=DOCUMENT_LOAD_IMAGES_TOOL_NAME,
        description="Load uploaded image documents as native image content blocks for image-capable models.",
        parameters=RESOURCE_TOOL_DEFINITIONS[2].parameters,
    ),
]

LEGACY_ATTACHMENT_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name=ATTACHMENT_LIST_TOOL_NAME,
        description="Legacy alias of resource_list for uploaded attachments in the current request/session.",
        parameters=RESOURCE_TOOL_DEFINITIONS[0].parameters,
    ),
    ToolDefinition(
        name=ATTACHMENT_EXTRACT_TEXT_TOOL_NAME,
        description="Legacy alias of resource_read_text for uploaded attachments in the current request/session.",
        parameters=RESOURCE_TOOL_DEFINITIONS[1].parameters,
    ),
    ToolDefinition(
        name=ATTACHMENT_LOAD_IMAGES_TOOL_NAME,
        description="Legacy alias of resource_load_images for uploaded image attachments in the current request/session.",
        parameters=RESOURCE_TOOL_DEFINITIONS[2].parameters,
    ),
]


def get_attachment_tool_definitions(*, model_supports_native_images: bool) -> list[ToolDefinition]:
    tools = list(DOCUMENT_TOOL_DEFINITIONS)
    if not model_supports_native_images:
        tools = [
            tool
            for tool in tools
            if tool.name
            not in {
                DOCUMENT_LOAD_IMAGES_TOOL_NAME,
            }
        ]
    return tools


def _join_file_ids(file_ids: list[str]) -> Optional[str]:
    normalized = list(
        dict.fromkeys(
            file_id.strip()
            for file_id in file_ids
            if isinstance(file_id, str) and file_id.strip()
        )
    )
    if not normalized:
        return None
    return ",".join(normalized)


async def _execute_attachment_list(file_ids: list[str]) -> AttachmentToolExecutionResult:
    joined_file_ids = _join_file_ids(file_ids)
    file_mapping = load_file_mapping()
    items: list[dict[str, Any]] = []
    for file_id in file_ids:
        items.append(describe_file_mapping_entry(file_id, file_mapping.get(file_id)))
    return AttachmentToolExecutionResult(
        content=[TextContent(text=_render_json_text({"file_ids": joined_file_ids, "items": items}))],
        details={"items": items},
    )


async def _execute_attachment_extract_text(
    file_ids: list[str],
    *,
    mode: str = "auto",
    max_chars: int | None = None,
    page: int | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    sheet_name: str | None = None,
    sheet_index: int | None = None,
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

    if page is not None and (page_from is not None or page_to is not None):
        raise ValueError("Use either page or page_from/page_to, not both")
    if sheet_name is not None and sheet_index is not None:
        raise ValueError("Use either sheet_name or sheet_index, not both")
    if page_from is not None and page_to is not None and page_from > page_to:
        raise ValueError("page_from must be less than or equal to page_to")

    extracted_text = await extract_text_from_file_ids(
        selected_file_ids,
        max_chars=max_chars,
        page=page,
        page_from=page_from,
        page_to=page_to,
        sheet_name=sheet_name,
        sheet_index=sheet_index,
    )
    return AttachmentToolExecutionResult(
        content=[TextContent(text=extracted_text)],
        details={
            "selected_file_ids": selected_file_ids,
            "mode": mode,
            "image_file_ids": selection.image_file_ids,
            "document_file_ids": selection.document_file_ids,
            "max_chars": max_chars,
            "page": page,
            "page_from": page_from,
            "page_to": page_to,
            "sheet_name": sheet_name,
            "sheet_index": sheet_index,
            "truncated": extracted_text.endswith("[已截断]"),
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

    if any(not isinstance(file_id, str) for file_id in file_ids):
        raise ValueError("attachment tool file_ids must contain only strings")
    file_ids = list(dict.fromkeys(file_id.strip() for file_id in file_ids if file_id.strip()))
    allowed_file_ids = {
        file_id.strip()
        for file_id in available_file_ids
        if isinstance(file_id, str) and file_id.strip()
    }
    if any(file_id not in allowed_file_ids for file_id in file_ids):
        raise ValueError("attachment tool can only access files attached to the current request")

    if name in {DOCUMENT_LIST_TOOL_NAME, RESOURCE_LIST_TOOL_NAME, ATTACHMENT_LIST_TOOL_NAME}:
        return await _execute_attachment_list(file_ids)
    if name in {
        DOCUMENT_READ_TEXT_TOOL_NAME,
        RESOURCE_READ_TEXT_TOOL_NAME,
        ATTACHMENT_EXTRACT_TEXT_TOOL_NAME,
    }:
        mode = arguments.get("mode", "auto")
        max_chars = arguments.get("max_chars")
        if isinstance(max_chars, bool) or not isinstance(max_chars, int) or max_chars <= 0:
            max_chars = DEFAULT_ATTACHMENT_TOOL_MAX_CHARS
        max_chars = min(max_chars, _get_gptassistant_upload_limits()["max_attachment_text_chars"])
        return await _execute_attachment_extract_text(
            file_ids,
            mode=mode,
            max_chars=max_chars,
            page=arguments.get("page"),
            page_from=arguments.get("page_from"),
            page_to=arguments.get("page_to"),
            sheet_name=arguments.get("sheet_name"),
            sheet_index=arguments.get("sheet_index"),
        )
    if name in {
        DOCUMENT_LOAD_IMAGES_TOOL_NAME,
        RESOURCE_LOAD_IMAGES_TOOL_NAME,
        ATTACHMENT_LOAD_IMAGES_TOOL_NAME,
    }:
        return await _execute_attachment_load_images(file_ids)
    raise ValueError(f'Unknown attachment tool "{name}"')


def _render_json_text(value: dict[str, Any]) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, indent=2)
