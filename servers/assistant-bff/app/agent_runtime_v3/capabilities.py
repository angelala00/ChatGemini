from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from app.llm_kernel import ImageContent, TextContent, ToolDefinition


CapabilityType = Literal["tool", "skill", "agent"]
CapabilityRisk = Literal["read", "write", "high"]


@dataclass(slots=True, frozen=True)
class CapabilityDescriptor:
    id: str
    type: CapabilityType
    name: str
    description: str
    enabled: bool = True
    risk: CapabilityRisk = "read"
    requires_confirmation: bool = False
    authorization_policy: str | None = None
    required_permissions: tuple[str, ...] = ()
    timeout_seconds: float = 30.0
    configuration: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("capability id must not be empty")
        if not self.name.strip():
            raise ValueError("capability name must not be empty")
        if isinstance(self.timeout_seconds, bool) or not isinstance(
            self.timeout_seconds, (int, float)
        ):
            raise ValueError("capability timeout_seconds must be a number")
        if self.timeout_seconds <= 0 or self.timeout_seconds > 300:
            raise ValueError(
                "capability timeout_seconds must be greater than 0 and at most 300"
            )


@dataclass(slots=True, frozen=True)
class ExecutionContext:
    run_id: str
    step_index: int
    capability_id: str
    tool_call_id: str
    metadata: dict[str, Any]


@dataclass(slots=True)
class ToolExecutionOutput:
    content: list[TextContent | ImageContent] = field(default_factory=list)
    details: Any = None


class ToolHandler(Protocol):
    async def __call__(
        self,
        context: ExecutionContext,
        arguments: dict[str, Any],
    ) -> ToolExecutionOutput: ...


@dataclass(slots=True, frozen=True)
class RegisteredTool:
    descriptor: CapabilityDescriptor
    definition: ToolDefinition
    handler: ToolHandler


class CapabilityRegistry:
    def __init__(self) -> None:
        self._by_id: dict[str, RegisteredTool] = {}
        self._by_tool_name: dict[str, RegisteredTool] = {}

    def register_tool(
        self,
        descriptor: CapabilityDescriptor,
        definition: ToolDefinition,
        handler: ToolHandler,
    ) -> None:
        if descriptor.type != "tool":
            raise ValueError("register_tool requires a tool capability descriptor")
        if descriptor.id in self._by_id:
            raise ValueError(f'capability "{descriptor.id}" is already registered')
        if definition.name in self._by_tool_name:
            raise ValueError(f'tool name "{definition.name}" is already registered')

        registered = RegisteredTool(descriptor, definition, handler)
        self._by_id[descriptor.id] = registered
        self._by_tool_name[definition.name] = registered

    def get_tool(self, tool_name: str) -> RegisteredTool:
        registered = self._by_tool_name.get(tool_name)
        if registered is None or not registered.descriptor.enabled:
            raise ValueError(f'tool "{tool_name}" is not available')
        return registered

    def get_capability(self, capability_id: str) -> RegisteredTool:
        registered = self._by_id.get(capability_id)
        if registered is None:
            raise ValueError(f'capability "{capability_id}" is not registered')
        return registered

    def list_tools(
        self,
        capability_ids: list[str] | None = None,
    ) -> list[RegisteredTool]:
        if capability_ids is None:
            candidates = list(self._by_id.values())
        else:
            candidates = []
            for capability_id in dict.fromkeys(capability_ids):
                registered = self._by_id.get(capability_id)
                if registered is None:
                    raise ValueError(f'capability "{capability_id}" is not registered')
                candidates.append(registered)
        return [item for item in candidates if item.descriptor.enabled]

    def tool_definitions(
        self,
        capability_ids: list[str] | None = None,
    ) -> list[ToolDefinition]:
        return [item.definition for item in self.list_tools(capability_ids)]
