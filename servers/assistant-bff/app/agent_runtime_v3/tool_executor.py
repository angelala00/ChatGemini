from __future__ import annotations

import asyncio
import hashlib
import json
import time
from typing import Any

from app.llm_kernel import TextContent, ToolResultMessage, validate_tool_call

from .agent_definition import (
    CapabilityAccessContext,
    CapabilityAuthorizer,
    DefaultCapabilityAuthorizer,
)
from .capabilities import CapabilityRegistry, ExecutionContext, RegisteredTool
from .confirmation import issue_confirmation_token, verify_confirmation_token
from .errors import CapabilityExecutionError, RuntimeFailure
from .types import CapabilityExecutionRequest


class ToolExecutor:
    def __init__(
        self,
        registry: CapabilityRegistry,
        *,
        authorizer: CapabilityAuthorizer | None = None,
    ) -> None:
        self._registry = registry
        self._authorizer = authorizer or DefaultCapabilityAuthorizer()

    async def __call__(
        self,
        request: CapabilityExecutionRequest,
    ) -> list[ToolResultMessage]:
        results: list[ToolResultMessage] = []
        tool_calls = [
            block
            for block in request.assistant_message.content
            if getattr(block, "type", None) == "tool_call"
        ]
        for tool_call in tool_calls:
            try:
                arguments = self._validate_call(request, tool_call)
                registered = self._resolve_tool(tool_call.name)
                self._authorize(request, registered)
                self._require_confirmation(request, registered, arguments)
                output = await asyncio.wait_for(
                    registered.handler(
                        ExecutionContext(
                            run_id=request.run_id,
                            step_index=request.step_index,
                            capability_id=registered.descriptor.id,
                            tool_call_id=tool_call.id,
                            metadata=dict(request.metadata),
                        ),
                        arguments,
                    ),
                    timeout=registered.descriptor.timeout_seconds,
                )
                results.append(
                    ToolResultMessage(
                        tool_call_id=tool_call.id,
                        tool_name=tool_call.name,
                        content=output.content,
                        details=output.details,
                        is_error=False,
                        timestamp=int(time.time() * 1000),
                    )
                )
            except asyncio.TimeoutError:
                results.append(
                    _error_result(
                        tool_call.id,
                        tool_call.name,
                        RuntimeFailure(
                            code="CAPABILITY_TIMEOUT",
                            message="Capability execution timed out.",
                            retryable=True,
                        ),
                    )
                )
            except CapabilityExecutionError as exc:
                results.append(
                    _error_result(tool_call.id, tool_call.name, exc.failure)
                )
            except Exception as exc:
                results.append(
                    _error_result(
                        tool_call.id,
                        tool_call.name,
                        RuntimeFailure(
                            code="CAPABILITY_EXECUTION_FAILED",
                            message="Capability execution failed.",
                            details={"error_type": type(exc).__name__},
                        ),
                    )
                )
        return results

    @staticmethod
    def _validate_call(request: CapabilityExecutionRequest, tool_call: Any) -> dict[str, Any]:
        try:
            return validate_tool_call(request.tools, tool_call)
        except Exception as exc:
            raise CapabilityExecutionError(
                RuntimeFailure(
                    code="INVALID_CAPABILITY_ARGUMENTS",
                    message="Capability arguments are invalid.",
                    details={"validation_error": str(exc)},
                )
            ) from exc

    def _resolve_tool(self, tool_name: str) -> RegisteredTool:
        try:
            return self._registry.get_tool(tool_name)
        except Exception as exc:
            raise CapabilityExecutionError(
                RuntimeFailure(
                    code="CAPABILITY_NOT_AVAILABLE",
                    message="Capability is not available for this run.",
                )
            ) from exc

    def _authorize(
        self,
        request: CapabilityExecutionRequest,
        registered: RegisteredTool,
    ) -> None:
        access = CapabilityAccessContext(
            user_id=str(request.metadata.get("user_id") or ""),
            permissions=frozenset(
                _string_list(request.metadata.get("capability_permissions"))
            ),
            policy_grants=frozenset(
                _string_list(request.metadata.get("capability_policy_grants"))
            ),
            metadata=dict(request.metadata),
        )
        decision = self._authorizer.authorize(registered.descriptor, access)
        if not decision.allowed:
            raise CapabilityExecutionError(
                RuntimeFailure(
                    code="CAPABILITY_ACCESS_DENIED",
                    message="Capability access denied.",
                    details={"reason": decision.reason or "access denied"},
                )
            )

    @staticmethod
    def _require_confirmation(
        request: CapabilityExecutionRequest,
        registered: RegisteredTool,
        arguments: dict[str, Any],
    ) -> None:
        descriptor = registered.descriptor
        needs_confirmation = descriptor.requires_confirmation or descriptor.risk in {
            "write",
            "high",
        }
        if not needs_confirmation:
            return

        fingerprint = confirmation_fingerprint(descriptor.id, arguments)
        user_id = str(request.metadata.get("user_id") or "")
        tokens = _string_list(request.metadata.get("confirmed_action_tokens"))
        if not any(
            verify_confirmation_token(
                token,
                user_id=user_id,
                fingerprint=fingerprint,
            )
            for token in tokens
        ):
            raise CapabilityExecutionError(
                RuntimeFailure(
                    code="CONFIRMATION_REQUIRED",
                    message="User confirmation is required before this capability can run.",
                    details={
                        "capability_id": descriptor.id,
                        "risk": descriptor.risk,
                        "confirmation_fingerprint": fingerprint,
                        "confirmation_token": issue_confirmation_token(
                            user_id=user_id,
                            fingerprint=fingerprint,
                        ),
                        "expires_in_seconds": 300,
                    },
                )
            )


def confirmation_fingerprint(
    capability_id: str,
    arguments: dict[str, Any],
) -> str:
    canonical = json.dumps(
        {"capability_id": capability_id, "arguments": arguments},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, (list, tuple, set, frozenset)):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _error_result(
    call_id: str,
    tool_name: str,
    failure: RuntimeFailure,
) -> ToolResultMessage:
    return ToolResultMessage(
        tool_call_id=call_id,
        tool_name=tool_name,
        content=[TextContent(text=failure.message)],
        details={"error": failure.as_dict()},
        is_error=True,
        timestamp=int(time.time() * 1000),
    )
