from __future__ import annotations

from typing import Any

from app.attachments.tools import execute_attachment_tool
from app.llm_kernel import ToolDefinition

from ..capabilities import (
    CapabilityDescriptor,
    CapabilityRegistry,
    ExecutionContext,
    ToolExecutionOutput,
)


KNOWLEDGE_LIST_TOOL_NAME = "knowledge_list"
KNOWLEDGE_READ_TEXT_TOOL_NAME = "knowledge_read_text"

KNOWLEDGE_TOOL_DEFINITIONS = [
    ToolDefinition(
        name=KNOWLEDGE_LIST_TOOL_NAME,
        description="List the knowledge files configured for the current assistant.",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
    ),
    ToolDefinition(
        name=KNOWLEDGE_READ_TEXT_TOOL_NAME,
        description="Read text from knowledge files configured for the current assistant.",
        parameters={
            "type": "object",
            "properties": {
                "file_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                },
                "max_chars": {"type": "integer", "minimum": 200},
                "page": {"type": "integer", "minimum": 1},
                "page_from": {"type": "integer", "minimum": 1},
                "page_to": {"type": "integer", "minimum": 1},
                "sheet_name": {"type": "string"},
                "sheet_index": {"type": "integer", "minimum": 0},
            },
            "additionalProperties": False,
        },
    ),
]


def register_knowledge_tools(registry: CapabilityRegistry) -> list[str]:
    capability_ids: list[str] = []
    for definition in KNOWLEDGE_TOOL_DEFINITIONS:
        capability_id = f"knowledge.{definition.name}"

        async def handler(
            context: ExecutionContext,
            arguments: dict[str, Any],
            *,
            tool_name: str = definition.name,
        ) -> ToolExecutionOutput:
            knowledge_file_ids = context.metadata.get("knowledge_file_ids", [])
            if not isinstance(knowledge_file_ids, list):
                raise ValueError("knowledge_file_ids must be a list")
            attachment_tool_name = (
                "document_list"
                if tool_name == KNOWLEDGE_LIST_TOOL_NAME
                else "document_read_text"
            )
            execution = await execute_attachment_tool(
                attachment_tool_name,
                arguments,
                available_file_ids=knowledge_file_ids,
            )
            return ToolExecutionOutput(
                content=execution.content,
                details=execution.details,
            )

        registry.register_tool(
            CapabilityDescriptor(
                id=capability_id,
                type="tool",
                name=definition.name,
                description=definition.description,
                authorization_policy="assistant_knowledge",
            ),
            definition,
            handler,
        )
        capability_ids.append(capability_id)
    return capability_ids
