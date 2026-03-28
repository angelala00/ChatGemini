from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional, Protocol, Union


Api = str
Provider = str
ThinkingLevel = Literal["minimal", "low", "medium", "high", "xhigh"]
CacheRetention = Literal["none", "short", "long"]
Transport = Literal["sse", "websocket", "auto"]
StopReason = Literal["stop", "length", "tool_use", "error", "aborted"]
ModelInput = Literal["text", "image"]


@dataclass(slots=True)
class UsageCost:
    input: float = 0.0
    output: float = 0.0
    cache_read: float = 0.0
    cache_write: float = 0.0
    total: float = 0.0


@dataclass(slots=True)
class Usage:
    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write: int = 0
    total_tokens: int = 0
    cost: UsageCost = field(default_factory=UsageCost)


@dataclass(slots=True)
class ModelCost:
    input: float = 0.0
    output: float = 0.0
    cache_read: float = 0.0
    cache_write: float = 0.0


@dataclass(slots=True)
class OpenAICompletionsCompat:
    supports_developer_role: bool = False
    supports_reasoning_effort: bool = True
    supports_usage_in_streaming: bool = True
    reasoning_effort_map: dict[ThinkingLevel, str] = field(default_factory=dict)
    thinking_format: Literal["openai", "openrouter", "zai", "qwen", "qwen-chat-template"] = "openai"
    max_tokens_field: Literal["max_tokens", "max_completion_tokens"] = "max_tokens"
    requires_tool_result_name: bool = True
    requires_assistant_after_tool_result: bool = True
    requires_thinking_as_text: bool = False
    supports_strict_mode: bool = True


@dataclass(slots=True)
class Model:
    id: str
    name: str
    api: Api
    provider: Provider
    base_url: str = ""
    reasoning: bool = False
    input: list[ModelInput] = field(default_factory=lambda: ["text"])
    context_window: int = 0
    max_output_tokens: int = 0
    headers: dict[str, str] = field(default_factory=dict)
    compat: OpenAICompletionsCompat | dict[str, Any] | None = None
    image_input: bool = False
    cost: ModelCost = field(default_factory=ModelCost)
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        normalized_input = list(dict.fromkeys(self.input or ["text"]))
        if "text" not in normalized_input:
            normalized_input.insert(0, "text")

        if self.image_input and "image" not in normalized_input:
            normalized_input.append("image")

        if "image" in normalized_input:
            self.image_input = True

        self.input = normalized_input

        if isinstance(self.compat, dict):
            self.compat = OpenAICompletionsCompat(**self.compat)

    def supports_input(self, input_type: ModelInput) -> bool:
        return input_type in self.input


@dataclass(slots=True)
class TextContent:
    type: Literal["text"] = "text"
    text: str = ""
    text_signature: Optional[str] = None


@dataclass(slots=True)
class ThinkingContent:
    type: Literal["thinking"] = "thinking"
    thinking: str = ""
    thinking_signature: Optional[str] = None
    redacted: bool = False


@dataclass(slots=True)
class ImageContent:
    type: Literal["image"] = "image"
    data: str = ""
    mime_type: str = "image/jpeg"


@dataclass(slots=True)
class ToolCallContent:
    type: Literal["tool_call"] = "tool_call"
    id: str = ""
    name: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)
    thought_signature: Optional[str] = None
    partial_arguments_raw: str = ""


ContentBlock = Union[TextContent, ThinkingContent, ImageContent, ToolCallContent]


@dataclass(slots=True)
class UserMessage:
    role: Literal["user"] = "user"
    content: Union[str, list[Union[TextContent, ImageContent]]] = ""
    timestamp: int = 0


@dataclass(slots=True)
class AssistantMessage:
    role: Literal["assistant"] = "assistant"
    content: list[Union[TextContent, ThinkingContent, ToolCallContent]] = field(default_factory=list)
    api: Api = ""
    provider: Provider = ""
    model: str = ""
    response_id: Optional[str] = None
    usage: Usage = field(default_factory=Usage)
    stop_reason: StopReason = "stop"
    error_message: Optional[str] = None
    timestamp: int = 0


@dataclass(slots=True)
class ToolResultMessage:
    role: Literal["tool_result"] = "tool_result"
    tool_call_id: str = ""
    tool_name: str = ""
    content: list[Union[TextContent, ImageContent]] = field(default_factory=list)
    details: Any = None
    is_error: bool = False
    timestamp: int = 0


Message = Union[UserMessage, AssistantMessage, ToolResultMessage]


@dataclass(slots=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(slots=True)
class Context:
    system_prompt: Optional[str] = None
    messages: list[Message] = field(default_factory=list)
    tools: list[ToolDefinition] = field(default_factory=list)


PayloadOverride = Callable[[Any, Model], Any | None]


@dataclass(slots=True)
class StreamOptions:
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    signal: Any = None
    api_key: Optional[str] = None
    transport: Transport = "auto"
    cache_retention: CacheRetention = "short"
    session_id: Optional[str] = None
    on_payload: Optional[PayloadOverride] = None
    headers: dict[str, str] = field(default_factory=dict)
    max_retry_delay_ms: int = 60000
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ProviderStreamOptions(StreamOptions):
    provider_options: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class OpenAICompatOptions(ProviderStreamOptions):
    tool_choice: Optional[Union[str, dict[str, Any]]] = None
    reasoning_effort: Optional[ThinkingLevel] = None
    include_usage: bool = True


@dataclass(slots=True)
class SimpleStreamOptions(StreamOptions):
    reasoning: Optional[ThinkingLevel] = None
    thinking_budgets: dict[ThinkingLevel, int] = field(default_factory=dict)


@dataclass(slots=True)
class StartEvent:
    type: Literal["start"] = "start"
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class TextStartEvent:
    type: Literal["text_start"] = "text_start"
    content_index: int = 0
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class TextDeltaEvent:
    type: Literal["text_delta"] = "text_delta"
    content_index: int = 0
    delta: str = ""
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class TextEndEvent:
    type: Literal["text_end"] = "text_end"
    content_index: int = 0
    content: str = ""
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ThinkingStartEvent:
    type: Literal["thinking_start"] = "thinking_start"
    content_index: int = 0
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ThinkingDeltaEvent:
    type: Literal["thinking_delta"] = "thinking_delta"
    content_index: int = 0
    delta: str = ""
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ThinkingEndEvent:
    type: Literal["thinking_end"] = "thinking_end"
    content_index: int = 0
    content: str = ""
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ToolCallStartEvent:
    type: Literal["toolcall_start"] = "toolcall_start"
    content_index: int = 0
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ToolCallDeltaEvent:
    type: Literal["toolcall_delta"] = "toolcall_delta"
    content_index: int = 0
    delta: str = ""
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ToolCallEndEvent:
    type: Literal["toolcall_end"] = "toolcall_end"
    content_index: int = 0
    tool_call: ToolCallContent = field(default_factory=ToolCallContent)
    partial: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class DoneEvent:
    type: Literal["done"] = "done"
    reason: Literal["stop", "length", "tool_use"] = "stop"
    message: AssistantMessage = field(default_factory=AssistantMessage)


@dataclass(slots=True)
class ErrorEvent:
    type: Literal["error"] = "error"
    reason: Literal["error", "aborted"] = "error"
    error: AssistantMessage = field(default_factory=AssistantMessage)


AssistantMessageEvent = Union[
    StartEvent,
    TextStartEvent,
    TextDeltaEvent,
    TextEndEvent,
    ThinkingStartEvent,
    ThinkingDeltaEvent,
    ThinkingEndEvent,
    ToolCallStartEvent,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    DoneEvent,
    ErrorEvent,
]


class StreamProvider(Protocol):
    api: Api

    def stream(
        self,
        model: Model,
        context: Context,
        options: Optional[ProviderStreamOptions] = None,
    ) -> "AssistantMessageEventStream":
        ...

    def stream_simple(
        self,
        model: Model,
        context: Context,
        options: Optional[SimpleStreamOptions] = None,
    ) -> "AssistantMessageEventStream":
        ...
