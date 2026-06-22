from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from app.llm_kernel import Message, Model, ProviderStreamOptions, UserMessage

from .capabilities import CapabilityDescriptor, CapabilityRegistry
from .context_assembler import AssembledContext, ContextAssemblyRequest, ResourceContext
from .types import (
    MAX_RUNTIME_CAPABILITY_CALLS,
    MAX_RUNTIME_STEPS,
    RuntimeLimits,
    RuntimeRequest,
)


MAX_HISTORY_MESSAGES = 200


@dataclass(slots=True, frozen=True)
class ContextPolicy:
    include_history: bool = True
    include_history_summary: bool = True
    allow_attachments: bool = True
    allow_knowledge: bool = True
    max_history_messages: Optional[int] = None


@dataclass(slots=True, frozen=True)
class AgentDefinition:
    agent_id: str
    instructions: str
    enabled_capability_ids: tuple[str, ...] = ()
    runtime_limits: RuntimeLimits = field(default_factory=RuntimeLimits)
    context_policy: ContextPolicy = field(default_factory=ContextPolicy)

    @classmethod
    def from_config(cls, agent_id: str, config: dict[str, Any]) -> "AgentDefinition":
        normalized_agent_id = (agent_id or "").strip()
        if not normalized_agent_id:
            raise ValueError("agent_id must not be empty")
        if not isinstance(config, dict):
            raise ValueError("agent config must be an object")

        instructions = config.get("system_prompt", "")
        if not isinstance(instructions, str):
            raise ValueError("system_prompt must be a string")

        enabled_capabilities = config.get("enabled_capabilities", [])
        if enabled_capabilities is None:
            enabled_capabilities = []
        if not isinstance(enabled_capabilities, list) or any(
            not isinstance(item, str) for item in enabled_capabilities
        ):
            raise ValueError("enabled_capabilities must be a list of strings")

        runtime_limits = _parse_runtime_limits(config.get("runtime_limits"))
        context_policy = _parse_context_policy(config.get("context_policy"))
        return cls(
            agent_id=normalized_agent_id,
            instructions=instructions.strip(),
            enabled_capability_ids=tuple(_normalize_ids(enabled_capabilities)),
            runtime_limits=runtime_limits,
            context_policy=context_policy,
        )


@dataclass(slots=True, frozen=True)
class CapabilityAccessContext:
    user_id: str
    permissions: frozenset[str] = frozenset()
    policy_grants: frozenset[str] = frozenset()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True, frozen=True)
class AuthorizationDecision:
    allowed: bool
    reason: Optional[str] = None


class CapabilityAuthorizer(Protocol):
    def authorize(
        self,
        descriptor: CapabilityDescriptor,
        access: CapabilityAccessContext,
    ) -> AuthorizationDecision: ...


class DefaultCapabilityAuthorizer:
    def authorize(
        self,
        descriptor: CapabilityDescriptor,
        access: CapabilityAccessContext,
    ) -> AuthorizationDecision:
        missing_permissions = set(descriptor.required_permissions).difference(
            access.permissions
        )
        if missing_permissions:
            return AuthorizationDecision(
                False,
                f"missing permissions: {', '.join(sorted(missing_permissions))}",
            )
        if (
            descriptor.authorization_policy
            and descriptor.authorization_policy not in access.policy_grants
        ):
            return AuthorizationDecision(
                False,
                f"authorization policy not granted: {descriptor.authorization_policy}",
            )
        return AuthorizationDecision(True)


@dataclass(slots=True, frozen=True)
class ResolvedAgentDefinition:
    definition: AgentDefinition
    capability_ids: tuple[str, ...]
    denied_capabilities: dict[str, str]
    access: CapabilityAccessContext

    def build_runtime_request(
        self,
        assembled_context: AssembledContext,
        *,
        model: Model,
        options: Optional[ProviderStreamOptions] = None,
        run_id: Optional[str] = None,
    ) -> RuntimeRequest:
        return assembled_context.to_runtime_request(
            model=model,
            options=options,
            limits=self.definition.runtime_limits,
            run_id=run_id,
        )

    def build_context_request(
        self,
        *,
        platform_instructions: Optional[str],
        history: list[Message],
        user_message: UserMessage,
        history_summary: Optional[str] = None,
        resources: Optional[ResourceContext] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> ContextAssemblyRequest:
        policy = self.definition.context_policy
        selected_history = list(history) if policy.include_history else []
        if policy.max_history_messages is not None:
            selected_history = selected_history[-policy.max_history_messages :]

        resource_context = resources or ResourceContext()
        if not policy.allow_attachments:
            resource_context = ResourceContext(
                knowledge_file_ids=resource_context.knowledge_file_ids,
                knowledge_guidance=resource_context.knowledge_guidance,
            )
        if not policy.allow_knowledge:
            resource_context = ResourceContext(
                attachment_file_ids=resource_context.attachment_file_ids,
                attachment_guidance=resource_context.attachment_guidance,
            )

        return ContextAssemblyRequest(
            platform_instructions=platform_instructions,
            agent_instructions=self.definition.instructions,
            history=selected_history,
            user_message=user_message,
            capability_ids=list(self.capability_ids),
            history_summary=(
                history_summary if policy.include_history_summary else None
            ),
            resources=resource_context,
            metadata={
                **dict(metadata or {}),
                "user_id": self.access.user_id,
                "capability_permissions": sorted(self.access.permissions),
                "capability_policy_grants": sorted(self.access.policy_grants),
            },
        )


class AgentDefinitionResolver:
    def __init__(
        self,
        registry: CapabilityRegistry,
        *,
        authorizer: Optional[CapabilityAuthorizer] = None,
    ) -> None:
        self._registry = registry
        self._authorizer = authorizer or DefaultCapabilityAuthorizer()

    def resolve(
        self,
        definition: AgentDefinition,
        access: CapabilityAccessContext,
    ) -> ResolvedAgentDefinition:
        allowed: list[str] = []
        denied: dict[str, str] = {}
        for capability_id in definition.enabled_capability_ids:
            registered = self._registry.get_capability(capability_id)
            descriptor = registered.descriptor
            if not descriptor.enabled:
                denied[capability_id] = "capability is disabled"
                continue
            decision = self._authorizer.authorize(descriptor, access)
            if decision.allowed:
                allowed.append(capability_id)
            else:
                denied[capability_id] = decision.reason or "access denied"
        return ResolvedAgentDefinition(
            definition=definition,
            capability_ids=tuple(allowed),
            denied_capabilities=denied,
            access=access,
        )


def _parse_runtime_limits(value: Any) -> RuntimeLimits:
    if value is None:
        return RuntimeLimits()
    if not isinstance(value, dict):
        raise ValueError("runtime_limits must be an object")
    max_steps = value.get("max_steps", RuntimeLimits().max_steps)
    if isinstance(max_steps, bool) or not isinstance(max_steps, int):
        raise ValueError("runtime_limits.max_steps must be an integer")
    if max_steps < 1 or max_steps > MAX_RUNTIME_STEPS:
        raise ValueError(
            f"runtime_limits.max_steps must be between 1 and {MAX_RUNTIME_STEPS}"
        )
    max_capability_calls = value.get(
        "max_capability_calls",
        RuntimeLimits().max_capability_calls,
    )
    if isinstance(max_capability_calls, bool) or not isinstance(
        max_capability_calls, int
    ):
        raise ValueError("runtime_limits.max_capability_calls must be an integer")
    if (
        max_capability_calls < 0
        or max_capability_calls > MAX_RUNTIME_CAPABILITY_CALLS
    ):
        raise ValueError(
            "runtime_limits.max_capability_calls must be between "
            f"0 and {MAX_RUNTIME_CAPABILITY_CALLS}"
        )
    return RuntimeLimits(
        max_steps=max_steps,
        max_capability_calls=max_capability_calls,
    )


def _parse_context_policy(value: Any) -> ContextPolicy:
    if value is None:
        return ContextPolicy()
    if not isinstance(value, dict):
        raise ValueError("context_policy must be an object")

    boolean_fields = {
        "include_history": True,
        "include_history_summary": True,
        "allow_attachments": True,
        "allow_knowledge": True,
    }
    parsed_booleans: dict[str, bool] = {}
    for field_name, default in boolean_fields.items():
        field_value = value.get(field_name, default)
        if not isinstance(field_value, bool):
            raise ValueError(f"context_policy.{field_name} must be a boolean")
        parsed_booleans[field_name] = field_value

    max_history_messages = value.get("max_history_messages")
    if max_history_messages is not None:
        if isinstance(max_history_messages, bool) or not isinstance(
            max_history_messages, int
        ):
            raise ValueError(
                "context_policy.max_history_messages must be an integer or null"
            )
        if max_history_messages < 1 or max_history_messages > MAX_HISTORY_MESSAGES:
            raise ValueError(
                "context_policy.max_history_messages must be between "
                f"1 and {MAX_HISTORY_MESSAGES}"
            )
    return ContextPolicy(
        **parsed_booleans,
        max_history_messages=max_history_messages,
    )


def _normalize_ids(values: list[str]) -> list[str]:
    return list(
        dict.fromkeys(
            value.strip()
            for value in values
            if isinstance(value, str) and value.strip()
        )
    )
