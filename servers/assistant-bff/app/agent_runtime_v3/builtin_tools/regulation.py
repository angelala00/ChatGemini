from __future__ import annotations

from typing import Any

from app.regulation_tools import (
    REGULATION_TOOL_DEFINITIONS,
    execute_regulation_tool,
)
from app.llm_kernel import TextContent

from ..capabilities import (
    CapabilityDescriptor,
    CapabilityRegistry,
    ExecutionContext,
    ToolExecutionOutput,
)


REGULATION_CAPABILITY_PREFIX = "regulation."


def register_regulation_tools(registry: CapabilityRegistry) -> list[str]:
    capability_ids: list[str] = []
    for definition in REGULATION_TOOL_DEFINITIONS:
        capability_id = f"{REGULATION_CAPABILITY_PREFIX}{definition.name}"

        async def handler(
            context: ExecutionContext,
            arguments: dict[str, Any],
            *,
            tool_name: str = definition.name,
        ) -> ToolExecutionOutput:
            result_text, details = await execute_regulation_tool(tool_name, arguments)
            return ToolExecutionOutput(
                content=[TextContent(text=result_text)],
                details=details,
            )

        registry.register_tool(
            CapabilityDescriptor(
                id=capability_id,
                type="tool",
                name=definition.name,
                description=definition.description,
                authorization_policy="regulation_knowledge",
            ),
            definition,
            handler,
        )
        capability_ids.append(capability_id)
    return capability_ids
