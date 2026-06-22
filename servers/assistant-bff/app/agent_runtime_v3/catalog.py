from __future__ import annotations

from .builtin_tools import register_attachment_tools, register_knowledge_tools
from .capabilities import CapabilityRegistry


DEFAULT_AGENT_CAPABILITY_IDS = [
    "attachment.document_list",
    "attachment.document_read_text",
    "knowledge.knowledge_list",
    "knowledge.knowledge_read_text",
]


def build_agent_capability_registry() -> CapabilityRegistry:
    registry = CapabilityRegistry()
    register_attachment_tools(registry, model_supports_native_images=False)
    register_knowledge_tools(registry)
    return registry


def list_agent_capabilities() -> list[dict]:
    registry = build_agent_capability_registry()
    items: list[dict] = []
    for registered in registry.list_tools():
        descriptor = registered.descriptor
        items.append(
            {
                "id": descriptor.id,
                "type": descriptor.type,
                "name": descriptor.name,
                "description": descriptor.description,
                "risk": descriptor.risk,
                "requires_confirmation": (
                    descriptor.requires_confirmation
                    or descriptor.risk in {"write", "high"}
                ),
                "category": descriptor.id.split(".", 1)[0],
                "default_enabled": descriptor.id in DEFAULT_AGENT_CAPABILITY_IDS,
            }
        )
    return items
