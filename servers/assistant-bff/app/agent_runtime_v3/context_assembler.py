from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.llm_kernel import (
    Message,
    Model,
    ProviderStreamOptions,
    ToolDefinition,
    UserMessage,
)

from .capabilities import CapabilityRegistry
from .types import RuntimeLimits, RuntimeRequest


RESOURCE_METADATA_KEYS = {
    "available_file_ids",
    "attachment_file_ids",
    "knowledge_file_ids",
}


@dataclass(slots=True, frozen=True)
class ResourceContext:
    attachment_file_ids: list[str] = field(default_factory=list)
    knowledge_file_ids: list[str] = field(default_factory=list)
    attachment_guidance: Optional[str] = None
    knowledge_guidance: Optional[str] = None


@dataclass(slots=True)
class ContextAssemblyRequest:
    platform_instructions: Optional[str]
    agent_instructions: Optional[str]
    history: list[Message]
    user_message: UserMessage
    capability_ids: list[str] = field(default_factory=list)
    history_summary: Optional[str] = None
    resources: ResourceContext = field(default_factory=ResourceContext)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AssembledContext:
    system_prompt: Optional[str]
    messages: list[Message]
    tools: list[ToolDefinition]
    capability_ids: list[str]
    metadata: dict[str, Any]

    def to_runtime_request(
        self,
        *,
        model: Model,
        options: Optional[ProviderStreamOptions] = None,
        limits: Optional[RuntimeLimits] = None,
        run_id: Optional[str] = None,
    ) -> RuntimeRequest:
        arguments: dict[str, Any] = {
            "model": model,
            "system_prompt": self.system_prompt,
            "messages": list(self.messages),
            "tools": list(self.tools),
            "options": options,
            "limits": limits or RuntimeLimits(),
            "metadata": dict(self.metadata),
        }
        if run_id is not None:
            arguments["run_id"] = run_id
        return RuntimeRequest(**arguments)


class ContextAssembler:
    def __init__(self, registry: CapabilityRegistry) -> None:
        self._registry = registry

    def assemble(self, request: ContextAssemblyRequest) -> AssembledContext:
        conflicting_keys = RESOURCE_METADATA_KEYS.intersection(request.metadata)
        if conflicting_keys:
            joined_keys = ", ".join(sorted(conflicting_keys))
            raise ValueError(
                f"resource metadata must be provided through ResourceContext: {joined_keys}"
            )

        attachment_file_ids = _normalize_ids(request.resources.attachment_file_ids)
        knowledge_file_ids = _normalize_ids(request.resources.knowledge_file_ids)
        capability_ids = _normalize_ids(request.capability_ids)
        registered_tools = self._registry.list_tools(capability_ids)
        enabled_capability_ids = [item.descriptor.id for item in registered_tools]

        sections = [
            _prompt_section("Platform Rules", request.platform_instructions),
            _prompt_section("Agent Instructions", request.agent_instructions),
            _prompt_section("Conversation Summary", request.history_summary),
            _prompt_section("Attachment Resources", request.resources.attachment_guidance),
            _prompt_section("Knowledge Resources", request.resources.knowledge_guidance),
        ]
        system_prompt = "\n\n".join(section for section in sections if section) or None

        metadata = {
            **request.metadata,
            # Existing attachment handlers consume available_file_ids. Keep the
            # semantic alias scoped to user/session attachments only.
            "available_file_ids": attachment_file_ids,
            "attachment_file_ids": attachment_file_ids,
            "knowledge_file_ids": knowledge_file_ids,
            "enabled_capability_ids": enabled_capability_ids,
        }
        return AssembledContext(
            system_prompt=system_prompt,
            messages=[*request.history, request.user_message],
            tools=[item.definition for item in registered_tools],
            capability_ids=enabled_capability_ids,
            metadata=metadata,
        )


def _normalize_ids(values: list[str]) -> list[str]:
    return list(
        dict.fromkeys(
            value.strip()
            for value in values
            if isinstance(value, str) and value.strip()
        )
    )


def _prompt_section(title: str, content: Optional[str]) -> Optional[str]:
    normalized = (content or "").strip()
    if not normalized:
        return None
    return f"## {title}\n{normalized}"
