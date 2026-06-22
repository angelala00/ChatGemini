from __future__ import annotations

import json
import os
from typing import Any

from app.llm_kernel import ToolDefinition
from app.storage.business_store import list_file_mappings
from app.storage.object_store import ensure_local_path


DEFAULT_MAX_CONTENT_CHARS = 12000
MAX_CONTENT_CHARS_LIMIT = 30000

FETCH_DOCUMENT_CATALOG_TOOL = "fetch_document_catalog"
FETCH_DOCUMENT_CONTENT_TOOL = "fetch_document_content"

REGULATION_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name=FETCH_DOCUMENT_CATALOG_TOOL,
        description="获取制度文档目录，用于判断接下来应该阅读哪些具体制度文件。",
        parameters={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name=FETCH_DOCUMENT_CONTENT_TOOL,
        description="读取指定制度文件的正文内容。仅在已经确定文件名后调用。",
        parameters={
            "type": "object",
            "properties": {
                "file_names": {
                    "type": "array",
                    "description": "需要读取的制度文件名称列表，必须与目录中的文件名一致。",
                    "items": {
                        "type": "string",
                        "minLength": 1,
                    },
                    "minItems": 1,
                },
                "max_chars": {
                    "type": "integer",
                    "description": "可选，限制本次读取返回的总字符数。",
                    "minimum": 1000,
                    "maximum": MAX_CONTENT_CHARS_LIMIT,
                },
            },
            "required": ["file_names"],
            "additionalProperties": False,
        },
    ),
]


def _normalize_document_name(file_name: str) -> str:
    normalized = (file_name or "").strip()
    if not normalized:
        raise ValueError("file_names 不能为空")
    if normalized != os.path.basename(normalized):
        raise ValueError(f"非法文件名: {file_name}")
    if ".." in normalized:
        raise ValueError(f"非法文件名: {file_name}")
    return normalized


def _regulation_knowledge_files() -> list[dict[str, Any]]:
    files = [
        entry
        for entry in list_file_mappings("regulationassistant").values()
        if entry.get("purpose") == "assistant_knowledge"
    ]
    files.sort(key=lambda item: str(item.get("filename") or "").lower())
    return files


def _document_knowledge_entry(file_name: str) -> dict[str, Any] | None:
    normalized_name = _normalize_document_name(file_name)
    for entry in _regulation_knowledge_files():
        if str(entry.get("filename") or "").strip() == normalized_name:
            return entry
    return None


def _current_document_catalog_files() -> list[dict[str, Any]]:
    return [
        {
            "file_name": entry.get("filename"),
            "file_extension": entry.get("fileExtension"),
            "content_type": entry.get("contentType"),
            "size_bytes": entry.get("sizeBytes"),
            "upload_time": entry.get("uploadTime"),
        }
        for entry in _regulation_knowledge_files()
        if str(entry.get("filename") or "").strip() != "document_catalog.json"
    ]


def _read_document_catalog() -> str:
    current_files = _current_document_catalog_files()
    catalog_entry = _document_knowledge_entry("document_catalog.json")
    if catalog_entry:
        catalog_path = ensure_local_path(catalog_entry)
        with open(catalog_path, "r", encoding="utf-8") as file:
            raw_catalog = file.read()
        try:
            payload = json.loads(raw_catalog)
        except json.JSONDecodeError:
            payload = {}
        if isinstance(payload, dict):
            configured_files = payload.get("files")
            configured_by_name = {
                str(item.get("file_name") or "").strip(): item
                for item in configured_files
                if isinstance(item, dict) and str(item.get("file_name") or "").strip()
            } if isinstance(configured_files, list) else {}
            payload["files"] = [
                {
                    **configured_by_name.get(str(item.get("file_name") or "").strip(), {}),
                    **item,
                }
                for item in current_files
            ]
            return json.dumps(payload, ensure_ascii=False, indent=2)

    payload = {
        "source": "regulationassistant_knowledge_files",
        "files": current_files,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


async def execute_regulation_tool(
    tool_name: str,
    arguments: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    if tool_name == FETCH_DOCUMENT_CATALOG_TOOL:
        return _read_document_catalog(), {"tool_name": tool_name}

    if tool_name == FETCH_DOCUMENT_CONTENT_TOOL:
        from app.utils import text_extractor

        file_names = arguments.get("file_names") or []
        max_chars = int(arguments.get("max_chars") or DEFAULT_MAX_CONTENT_CHARS)
        max_chars = max(1000, min(max_chars, MAX_CONTENT_CHARS_LIMIT))

        sections: list[str] = []
        resolved_files: list[str] = []
        current_size = 0
        for file_name in file_names:
            normalized_name = _normalize_document_name(str(file_name))
            entry = _document_knowledge_entry(normalized_name)
            if not entry:
                raise FileNotFoundError(f"文件不存在: {normalized_name}")
            file_path = ensure_local_path(entry)
            extracted = text_extractor.extract_text(
                file_path,
                str(entry.get("fileExtension") or ""),
            )
            resolved_files.append(normalized_name)
            section = f"文件《{normalized_name}》内容：\n{extracted.strip()}\n"
            remaining = max_chars - current_size
            if remaining <= 0:
                break
            if len(section) > remaining:
                section = section[:remaining]
            sections.append(section)
            current_size += len(section)
            if current_size >= max_chars:
                break

        if not sections:
            return "未读取到任何制度文件内容。", {
                "tool_name": tool_name,
                "resolved_files": resolved_files,
                "max_chars": max_chars,
            }

        return "\n".join(sections).strip(), {
            "tool_name": tool_name,
            "resolved_files": resolved_files,
            "max_chars": max_chars,
        }

    raise ValueError(f"未知工具: {tool_name}")
