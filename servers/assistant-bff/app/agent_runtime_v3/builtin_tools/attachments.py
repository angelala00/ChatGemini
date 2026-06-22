from __future__ import annotations

from typing import Any

from app.attachments.tools import execute_attachment_tool, get_attachment_tool_definitions

from ..capabilities import (
    CapabilityDescriptor,
    CapabilityRegistry,
    ExecutionContext,
    ToolExecutionOutput,
)


ATTACHMENT_CAPABILITY_PREFIX = "attachment."


def register_attachment_tools(
    registry: CapabilityRegistry,
    *,
    model_supports_native_images: bool,
) -> list[str]:
    capability_ids: list[str] = []
    for definition in get_attachment_tool_definitions(
        model_supports_native_images=model_supports_native_images
    ):
        capability_id = f"{ATTACHMENT_CAPABILITY_PREFIX}{definition.name}"

        async def handler(
            context: ExecutionContext,
            arguments: dict[str, Any],
            *,
            tool_name: str = definition.name,
        ) -> ToolExecutionOutput:
            available_file_ids = context.metadata.get("available_file_ids", [])
            if not isinstance(available_file_ids, list):
                raise ValueError("available_file_ids must be a list")
            execution = await execute_attachment_tool(
                tool_name,
                arguments,
                available_file_ids=available_file_ids,
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
                authorization_policy="current_request_files",
            ),
            definition,
            handler,
        )
        capability_ids.append(capability_id)
    return capability_ids
