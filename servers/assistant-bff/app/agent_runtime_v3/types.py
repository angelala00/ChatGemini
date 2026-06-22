from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Protocol

from app.llm_kernel import (
    AssistantMessage,
    AssistantMessageEvent,
    Context,
    Message,
    Model,
    ProviderStreamOptions,
    ToolDefinition,
    ToolResultMessage,
)


RunStatus = Literal["created", "running", "completed", "failed", "cancelled", "waiting"]
MAX_RUNTIME_STEPS = 20
MAX_RUNTIME_CAPABILITY_CALLS = 50
RuntimeEventType = Literal[
    "run_started",
    "step_started",
    "model_event",
    "step_completed",
    "capability_execution_started",
    "capability_execution_completed",
    "run_completed",
    "run_failed",
]


@dataclass(slots=True, frozen=True)
class RuntimeLimits:
    max_steps: int = 4
    max_capability_calls: int = 8

    def __post_init__(self) -> None:
        if isinstance(self.max_steps, bool) or not isinstance(self.max_steps, int):
            raise ValueError("max_steps must be an integer")
        if self.max_steps < 1 or self.max_steps > MAX_RUNTIME_STEPS:
            raise ValueError(f"max_steps must be between 1 and {MAX_RUNTIME_STEPS}")
        if isinstance(self.max_capability_calls, bool) or not isinstance(
            self.max_capability_calls, int
        ):
            raise ValueError("max_capability_calls must be an integer")
        if (
            self.max_capability_calls < 0
            or self.max_capability_calls > MAX_RUNTIME_CAPABILITY_CALLS
        ):
            raise ValueError(
                "max_capability_calls must be between "
                f"0 and {MAX_RUNTIME_CAPABILITY_CALLS}"
            )


@dataclass(slots=True)
class RuntimeRequest:
    model: Model
    messages: list[Message]
    system_prompt: Optional[str] = None
    tools: list[ToolDefinition] = field(default_factory=list)
    options: Optional[ProviderStreamOptions] = None
    limits: RuntimeLimits = field(default_factory=RuntimeLimits)
    run_id: str = field(default_factory=lambda: f"run_{uuid.uuid4().hex}")
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True, frozen=True)
class CapabilityExecutionRequest:
    run_id: str
    step_index: int
    assistant_message: AssistantMessage
    tools: list[ToolDefinition]
    metadata: dict[str, Any]


@dataclass(slots=True, frozen=True)
class RuntimeEvent:
    type: RuntimeEventType
    run_id: str
    step_index: int = 0
    data: Any = None


@dataclass(slots=True)
class RunResult:
    run_id: str
    status: RunStatus
    messages: list[Message]
    steps: int
    final_message: Optional[AssistantMessage] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    retryable: bool = False


class ModelEventStream(Protocol):
    def __aiter__(self) -> "ModelEventStream": ...

    async def __anext__(self) -> AssistantMessageEvent: ...

    async def result(self) -> AssistantMessage: ...


class ModelStreamer(Protocol):
    def __call__(
        self,
        model: Model,
        context: Context,
        options: Optional[ProviderStreamOptions] = None,
    ) -> ModelEventStream: ...


class CapabilityExecutor(Protocol):
    async def __call__(
        self,
        request: CapabilityExecutionRequest,
    ) -> list[ToolResultMessage]: ...
