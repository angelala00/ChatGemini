import asyncio
import json
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.attachments import (
    build_attachment_tool_guidance,
    build_user_message_from_attachments,
    execute_attachment_tool,
    get_attachment_tool_definitions,
)
from app.chat_base import client, match_history, save_match_history
from app.gptassistant_error_mapping import map_chat_v2_error
from app.gptassistant_planner import PlannerRuntimeCapabilities, build_execution_plan
from app.logger import gpt_logger
from app.llm_kernel import (
    AssistantMessage,
    Context,
    ErrorEvent,
    ImageContent,
    Model,
    OpenAICompatOptions,
    OpenAICompletionsCompat,
    TextContent,
    ThinkingContent,
    ToolCallContent,
    ToolResultMessage,
    Usage,
    UserMessage,
    get_api_provider,
    register_openai_compat_provider,
    stream,
    validate_tool_call,
)
from app.llm_kernel.types import DoneEvent
from app.metrics.events import UsageEventTracker


KERNEL_HISTORY_PREFIX = "llm_kernel:gptassistant:"
IMAGE_PREPROCESS_TIMEOUT_SECONDS = 30
MAX_TOOL_CONTINUATION_TURNS = 4
DEFAULT_CHAT_V2_MAX_INPUT_CHARS = 120000
DEFAULT_CHAT_V2_RECENT_TURNS = 8


class ChatContextTooLongError(RuntimeError):
    """Raised when assembled chat-v2 context exceeds the allowed budget."""


@dataclass(frozen=True)
class TrimmedHistoryResult:
    messages: list[Any]
    summary: str | None = None


def _log_preview(value: Any, *, limit: int = 1200) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = repr(value)
    if len(text) > limit:
        return f"{text[:limit]}...(truncated)"
    return text


def _sse(name: str, payload: Dict[str, Any]) -> str:
    body = {"event": name, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


def _event_payload(
    response_id: str,
    sequence: int,
    conversation_id: str,
    **extra: Any,
) -> Dict[str, Any]:
    return {
        "conversation_id": conversation_id,
        "response_id": response_id,
        "sequence": sequence,
        **extra,
    }


def _history_key(conversation_id: str) -> str:
    return f"{KERNEL_HISTORY_PREFIX}{conversation_id}"


def _ensure_openai_compat_provider() -> None:
    if get_api_provider("openai-compat-chat-completions") is None:
        register_openai_compat_provider(client)


def _model_compat(model_config: dict[str, Any]) -> OpenAICompletionsCompat:
    model_name = model_config.get("model_name") or model_config.get("id") or ""
    lowered = (model_name or "").lower()
    if "qwen" in lowered or "glm" in lowered:
        base_compat = OpenAICompletionsCompat(
            supports_reasoning_effort=False,
            requires_assistant_after_tool_result=False,
            reasoning_parameter_format="qwen-chat-template",
        )
    else:
        base_compat = OpenAICompletionsCompat()

    configured_compat = model_config.get("compat")
    if not isinstance(configured_compat, dict):
        return base_compat

    merged_compat = asdict(base_compat)
    merged_compat.update(configured_compat)
    return OpenAICompletionsCompat(**merged_compat)


def _planner_runtime_capabilities(model_name: str) -> PlannerRuntimeCapabilities:
    lowered = (model_name or "").lower()
    if lowered == "glm-4.7":
        return PlannerRuntimeCapabilities(
            supports_tool_result_continuation=False,
        )
    return PlannerRuntimeCapabilities()


def _kernel_model_from_config(model_config: dict[str, Any], reasoning_enabled: bool) -> Model:
    model_name = model_config.get("model_name") or model_config.get("id") or ""
    supports_reasoning = bool(model_config.get("supports_reasoning"))
    supports_native_image_input = bool(model_config.get("supports_native_image_input"))
    return Model(
        id=model_name,
        name=model_config.get("name") or model_name,
        api="openai-compat-chat-completions",
        provider="assistant-bff-openai-compat",
        reasoning=supports_reasoning,
        input=["text", "image"] if supports_native_image_input else ["text"],
        image_input=supports_native_image_input,
        compat=_model_compat(model_config),
    )


async def _build_user_message_with_preprocess_events(
    query: str,
    file_ids: Optional[str],
    model: Model,
    execution_plan,
    emit_event,
) -> UserMessage:
    return await build_user_message_from_attachments(
        query=query,
        file_ids=file_ids,
        model_id=model.id,
        model_supports_native_images=model.supports_input("image"),
        emit_event=emit_event,
        image_preprocess_timeout_seconds=IMAGE_PREPROCESS_TIMEOUT_SECONDS,
        document_strategy=execution_plan.document_strategy,
        non_native_image_strategy=execution_plan.non_native_image_strategy,
        attach_native_images=execution_plan.attach_native_images,
        document_preload_max_chars=execution_plan.document_preload_max_chars,
        image_preload_max_chars=execution_plan.image_preload_max_chars,
    )


def _serialize_content_block(block: Any) -> dict[str, Any]:
    return asdict(block)


def _serialize_message(message: Any) -> dict[str, Any]:
    if isinstance(message, UserMessage):
        content = message.content
        if isinstance(content, list):
            content = [_serialize_content_block(block) for block in content]
        return {
            "role": "user",
            "content": content,
            "timestamp": message.timestamp,
        }
    if isinstance(message, AssistantMessage):
        return {
            "role": "assistant",
            "content": [_serialize_content_block(block) for block in message.content],
            "api": message.api,
            "provider": message.provider,
            "model": message.model,
            "response_id": message.response_id,
            "usage": asdict(message.usage),
            "stop_reason": message.stop_reason,
            "error_message": message.error_message,
            "timestamp": message.timestamp,
        }
    if isinstance(message, ToolResultMessage):
        return {
            "role": "tool_result",
            "tool_call_id": message.tool_call_id,
            "tool_name": message.tool_name,
            "content": [_serialize_content_block(block) for block in message.content],
            "details": message.details,
            "is_error": message.is_error,
            "timestamp": message.timestamp,
        }
    raise TypeError(f"Unsupported message type: {type(message)!r}")


def _deserialize_content_block(payload: dict[str, Any]) -> Any:
    block_type = payload.get("type")
    if block_type == "text":
        return TextContent(**payload)
    if block_type == "thinking":
        return ThinkingContent(**payload)
    if block_type == "image":
        return ImageContent(**payload)
    if block_type == "tool_call":
        return ToolCallContent(**payload)
    raise ValueError(f"Unsupported content block type: {block_type}")


def _deserialize_usage(payload: dict[str, Any] | None) -> Usage:
    if not payload:
        return Usage()
    usage = Usage()
    usage.input = payload.get("input", 0)
    usage.output = payload.get("output", 0)
    usage.cache_read = payload.get("cache_read", 0)
    usage.cache_write = payload.get("cache_write", 0)
    usage.total_tokens = payload.get("total_tokens", 0)
    cost_payload = payload.get("cost", {}) or {}
    usage.cost.input = cost_payload.get("input", 0.0)
    usage.cost.output = cost_payload.get("output", 0.0)
    usage.cost.cache_read = cost_payload.get("cache_read", 0.0)
    usage.cost.cache_write = cost_payload.get("cache_write", 0.0)
    usage.cost.total = cost_payload.get("total", 0.0)
    return usage


def _deserialize_message(payload: dict[str, Any]) -> Any:
    role = payload.get("role")
    if role == "user":
        content = payload.get("content", "")
        if isinstance(content, list):
            content = [_deserialize_content_block(block) for block in content]
        return UserMessage(
            content=content,
            timestamp=payload.get("timestamp", 0),
        )
    if role == "assistant":
        return AssistantMessage(
            content=[_deserialize_content_block(block) for block in payload.get("content", [])],
            api=payload.get("api", ""),
            provider=payload.get("provider", ""),
            model=payload.get("model", ""),
            response_id=payload.get("response_id"),
            usage=_deserialize_usage(payload.get("usage")),
            stop_reason=payload.get("stop_reason", "stop"),
            error_message=payload.get("error_message"),
            timestamp=payload.get("timestamp", 0),
        )
    if role == "tool_result":
        return ToolResultMessage(
            tool_call_id=payload.get("tool_call_id", ""),
            tool_name=payload.get("tool_name", ""),
            content=[_deserialize_content_block(block) for block in payload.get("content", [])],
            details=payload.get("details"),
            is_error=bool(payload.get("is_error")),
            timestamp=payload.get("timestamp", 0),
        )
    raise ValueError(f"Unsupported message role: {role}")


def _load_history(conversation_id: str) -> list[Any]:
    raw_history = match_history.setdefault(_history_key(conversation_id), [])
    return [_deserialize_message(item) for item in raw_history]


def _save_history(conversation_id: str, messages: list[Any]) -> None:
    match_history[_history_key(conversation_id)] = [_serialize_message(item) for item in messages]
    save_match_history(_history_key(conversation_id))


def _usage_tokens(message: AssistantMessage) -> tuple[Optional[int], Optional[int]]:
    usage = message.usage
    request_tokens = usage.input + usage.cache_read + usage.cache_write
    response_tokens = usage.output
    return request_tokens or None, response_tokens or None


def _tool_call_blocks(message: AssistantMessage) -> list[ToolCallContent]:
    return [block for block in message.content if isinstance(block, ToolCallContent)]


def _available_file_ids(file_ids: Optional[str]) -> list[str]:
    if not file_ids:
        return []
    return [item.strip() for item in file_ids.split(",") if item.strip()]


def _resolve_context_char_budget(model_config: dict[str, Any]) -> int:
    # Keep char-budget resolution centralized so this can be upgraded to a
    # token-budget resolver later without changing the call sites.
    for key in ("context_char_budget", "max_input_chars", "input_char_budget"):
        value = model_config.get(key)
        if isinstance(value, int) and value > 0:
            return value
    return DEFAULT_CHAT_V2_MAX_INPUT_CHARS


def _resolve_recent_history_turns(model_config: dict[str, Any]) -> int:
    for key in ("recent_history_turns", "history_turn_limit", "max_recent_turns"):
        value = model_config.get(key)
        if isinstance(value, int) and value > 0:
            return value
    return DEFAULT_CHAT_V2_RECENT_TURNS


def _count_message_text_chars(message: Any) -> int:
    if isinstance(message, UserMessage):
        content = message.content
        if isinstance(content, str):
            return len(content)
        total = 0
        for block in content:
            if isinstance(block, TextContent):
                total += len(block.text or "")
        return total

    if isinstance(message, AssistantMessage):
        total = 0
        for block in message.content:
            if isinstance(block, TextContent):
                total += len(block.text or "")
            elif isinstance(block, ThinkingContent):
                total += len(block.thinking or "")
            elif isinstance(block, ToolCallContent):
                total += len(block.name or "")
                total += len(json.dumps(block.arguments, ensure_ascii=False, default=str))
        return total

    if isinstance(message, ToolResultMessage):
        total = len(message.tool_name or "")
        if message.details is not None:
            total += len(json.dumps(message.details, ensure_ascii=False, default=str))
        for block in message.content:
            if isinstance(block, TextContent):
                total += len(block.text or "")
        return total

    return 0


def _truncate_preview(text: str, limit: int = 240) -> str:
    normalized = " ".join((text or "").split())
    if len(normalized) <= limit:
        return normalized
    return normalized[:limit].rstrip() + "..."


def _summarize_message(message: Any) -> str | None:
    if isinstance(message, UserMessage):
        content = message.content
        if isinstance(content, str):
            text = _truncate_preview(content)
            return f"User: {text}" if text else None
        blocks: list[str] = []
        image_count = 0
        for block in content:
            if isinstance(block, TextContent):
                text = _truncate_preview(block.text)
                if text:
                    blocks.append(text)
            elif isinstance(block, ImageContent):
                image_count += 1
        joined = " ".join(blocks).strip()
        if image_count and joined:
            return f"User: {joined} [images={image_count}]"
        if image_count:
            return f"User: [images={image_count}]"
        return f"User: {joined}" if joined else None

    if isinstance(message, AssistantMessage):
        text_parts: list[str] = []
        tool_names: list[str] = []
        for block in message.content:
            if isinstance(block, TextContent):
                text = _truncate_preview(block.text)
                if text:
                    text_parts.append(text)
            elif isinstance(block, ToolCallContent):
                if block.name:
                    tool_names.append(block.name)
        text_summary = " ".join(text_parts).strip()
        if tool_names and text_summary:
            return f"Assistant: {text_summary} [tool_calls={', '.join(tool_names[:3])}]"
        if tool_names:
            return f"Assistant: [tool_calls={', '.join(tool_names[:3])}]"
        return f"Assistant: {text_summary}" if text_summary else None

    if isinstance(message, ToolResultMessage):
        status = "error" if message.is_error else "ok"
        text_parts: list[str] = []
        for block in message.content:
            if isinstance(block, TextContent):
                text = _truncate_preview(block.text, limit=160)
                if text:
                    text_parts.append(text)
        text_summary = " ".join(text_parts).strip()
        if text_summary:
            return f"Tool {message.tool_name} ({status}): {text_summary}"
        return f"Tool {message.tool_name} ({status})"

    return None


def _build_history_summary(messages: list[Any]) -> str | None:
    summary_lines: list[str] = []
    for message in messages:
        rendered = _summarize_message(message)
        if rendered:
            summary_lines.append(f"- {rendered}")
    if not summary_lines:
        return None
    return (
        "Earlier conversation summary:\n"
        "The following points summarize older turns that were compacted before this request:\n"
        + "\n".join(summary_lines[-12:])
    )


def _trim_history_to_recent_turns(
    *,
    history: list[Any],
    max_recent_turns: int,
    conversation_id: str,
    model_id: str,
) -> TrimmedHistoryResult:
    if max_recent_turns <= 0 or not history:
        return TrimmedHistoryResult(messages=[], summary=None)

    user_turns_seen = 0
    start_index = 0
    found_cut = False

    for index in range(len(history) - 1, -1, -1):
        if isinstance(history[index], UserMessage):
            user_turns_seen += 1
            if user_turns_seen > max_recent_turns:
                start_index = index + 1
                found_cut = True
                break

    if not found_cut:
        return TrimmedHistoryResult(messages=history, summary=None)

    trimmed_history = history[start_index:]
    dropped_messages = history[:start_index]
    summary = _build_history_summary(dropped_messages)
    dropped_chars = sum(_count_message_text_chars(message) for message in dropped_messages)
    kept_chars = sum(_count_message_text_chars(message) for message in trimmed_history)
    gpt_logger.info(
        "chat_v2_history_trimmed conversation_id=%s model=%s max_recent_turns=%s dropped_messages=%s kept_messages=%s dropped_chars=%s kept_chars=%s summary_chars=%s",
        conversation_id,
        model_id,
        max_recent_turns,
        len(dropped_messages),
        len(trimmed_history),
        dropped_chars,
        kept_chars,
        len(summary or ""),
    )
    return TrimmedHistoryResult(messages=trimmed_history, summary=summary)


def _raise_if_context_too_long(
    *,
    model_id: str,
    model_config: dict[str, Any],
    system_prompt: str,
    messages: list[Any],
    stage: str,
) -> None:
    budget = _resolve_context_char_budget(model_config)
    system_chars = len(system_prompt or "")
    message_chars = sum(_count_message_text_chars(message) for message in messages)
    total_chars = system_chars + message_chars

    if total_chars <= budget:
        return

    overflow = total_chars - budget
    message_breakdown = [
        (
            "user_message"
            if isinstance(message, UserMessage)
            else "assistant_message"
            if isinstance(message, AssistantMessage)
            else "tool_result"
            if isinstance(message, ToolResultMessage)
            else "message",
            _count_message_text_chars(message),
        )
        for message in messages
    ]
    dominant_source = "messages"
    dominant_value = message_chars
    if message_breakdown:
        dominant_source, dominant_value = max(message_breakdown, key=lambda item: item[1])
    if system_chars >= dominant_value:
        dominant_source = "system_prompt"

    gpt_logger.warning(
        "chat_v2_context_budget_exceeded model=%s stage=%s budget=%s total_chars=%s overflow=%s system_chars=%s message_chars=%s dominant_source=%s",
        model_id,
        stage,
        budget,
        total_chars,
        overflow,
        system_chars,
        message_chars,
        dominant_source,
    )
    raise ChatContextTooLongError(
        f"context budget exceeded: stage={stage} total_chars={total_chars} budget={budget} dominant_source={dominant_source}"
    )


async def _execute_attachment_tool_calls(
    *,
    tools: list[Any],
    message: AssistantMessage,
    file_ids: Optional[str],
    conversation_id: str,
    response_id: str,
    turn_index: int,
) -> list[ToolResultMessage]:
    available_file_ids = _available_file_ids(file_ids)
    results: list[ToolResultMessage] = []
    for block in _tool_call_blocks(message):
        gpt_logger.info(
            "tool_continuation tool_call_start conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s raw_arguments=%s available_file_ids=%s",
            conversation_id,
            response_id,
            turn_index,
            block.id,
            block.name,
            _log_preview(block.arguments),
            _log_preview(available_file_ids),
        )
        if isinstance(block.arguments, dict) and "_partial" in block.arguments:
            gpt_logger.warning(
                "tool_continuation tool_call_partial_arguments conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s partial_arguments_raw=%s partial_arguments_repr=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                _log_preview(block.partial_arguments_raw),
                _log_preview(repr(block.partial_arguments_raw)),
            )
        try:
            validated_arguments = validate_tool_call(tools, block)
            gpt_logger.info(
                "tool_continuation tool_call_validated conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s validated_arguments=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                _log_preview(validated_arguments),
            )
            execution = await execute_attachment_tool(
                block.name,
                validated_arguments,
                available_file_ids=available_file_ids,
            )
            gpt_logger.info(
                "tool_continuation tool_call_succeeded conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s details=%s content_block_types=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                _log_preview(execution.details),
                _log_preview([type(item).__name__ for item in execution.content]),
            )
            results.append(
                ToolResultMessage(
                    tool_call_id=block.id,
                    tool_name=block.name,
                    content=execution.content,
                    details=execution.details,
                    is_error=False,
                    timestamp=int(time.time() * 1000),
                )
            )
        except Exception as exc:
            gpt_logger.warning(
                "tool_continuation tool_call_failed conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s error_type=%s error=%s raw_arguments=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                type(exc).__name__,
                str(exc),
                _log_preview(block.arguments),
            )
            results.append(
                ToolResultMessage(
                    tool_call_id=block.id,
                    tool_name=block.name,
                    content=[TextContent(text=str(exc))],
                    details={"error": str(exc)},
                    is_error=True,
                    timestamp=int(time.time() * 1000),
                )
            )
    return results


async def chat_with_kernel_gptassistant(
    query: str,
    conversation_id: str,
    system_prompt: str,
    model_config: dict[str, Any],
    *,
    file_ids: Optional[str] = None,
    reasoning_enabled: bool = False,
    usage_tracker: Optional[UsageEventTracker] = None,
) -> AsyncGenerator[str, None]:
    _ensure_openai_compat_provider()

    started_at = time.perf_counter()
    response_id = f"resp_{uuid.uuid4().hex[:12]}"
    sequence = 0
    tracker_finalized = False

    def next_sequence() -> int:
        nonlocal sequence
        sequence += 1
        return sequence

    def finalize_tracker(status: str, *, error: Optional[str] = None, message: Optional[AssistantMessage] = None) -> None:
        nonlocal tracker_finalized
        if usage_tracker is None or tracker_finalized:
            return
        request_tokens = None
        response_tokens = None
        if message is not None:
            request_tokens, response_tokens = _usage_tokens(message)
        usage_tracker.finalize(
            status=status,
            latency_ms=(time.perf_counter() - started_at) * 1000,
            error=error,
            request_tokens=request_tokens,
            response_tokens=response_tokens,
        )
        tracker_finalized = True

    async def emit_preprocess_event(event_name: str, **payload: Any) -> None:
        yield_payload = _event_payload(
            response_id,
            next_sequence(),
            conversation_id,
            **payload,
        )
        preprocess_events.append(_sse(event_name, yield_payload))

    model = _kernel_model_from_config(model_config, reasoning_enabled)
    requested_reasoning_enabled = bool(model.reasoning and reasoning_enabled)
    execution_plan = build_execution_plan(
        query=query,
        has_attachments=bool(file_ids),
        runtime_capabilities=_planner_runtime_capabilities(model.id),
    )
    if usage_tracker:
        usage_tracker.set_model(model.id)

    trimmed_history = _trim_history_to_recent_turns(
        history=_load_history(conversation_id),
        max_recent_turns=_resolve_recent_history_turns(model_config),
        conversation_id=conversation_id,
        model_id=model.id,
    )
    history = trimmed_history.messages
    preprocess_events: list[str] = []
    effective_system_prompt = system_prompt
    if trimmed_history.summary:
        effective_system_prompt = f"{effective_system_prompt}\n\n{trimmed_history.summary}"
    if file_ids and execution_plan.include_attachment_tool_guidance:
        attachment_guidance = build_attachment_tool_guidance(
            file_ids=file_ids,
            model_supports_native_images=model.supports_input("image"),
        )
        if attachment_guidance:
            effective_system_prompt = f"{effective_system_prompt}\n\n{attachment_guidance}"

    context = Context(
        system_prompt=effective_system_prompt,
        messages=[],
        tools=(
            get_attachment_tool_definitions(model_supports_native_images=model.supports_input("image"))
            if file_ids and execution_plan.expose_attachment_tools
            else []
        ),
    )
    options = OpenAICompatOptions(
        reasoning_effort="high" if requested_reasoning_enabled else None,
    )
    final_message: Optional[AssistantMessage] = None
    emitted_error_event = False

    yield _sse(
        "response_start",
        _event_payload(
            response_id,
            next_sequence(),
            conversation_id,
            model=model.id,
            reasoning_enabled=requested_reasoning_enabled,
        ),
    )
    gpt_logger.info(
        "tool_continuation response_start conversation_id=%s response_id=%s model=%s reasoning_enabled=%s file_ids=%s execution_plan=%s tools=%s",
        conversation_id,
        response_id,
        model.id,
        requested_reasoning_enabled,
        _log_preview(_available_file_ids(file_ids)),
        _log_preview(asdict(execution_plan)),
        _log_preview([tool.name for tool in context.tools]),
    )

    try:
        user_message = await _build_user_message_with_preprocess_events(
            query,
            file_ids,
            model,
            execution_plan,
            emit_preprocess_event,
        )
        _raise_if_context_too_long(
            model_id=model.id,
            model_config=model_config,
            system_prompt=effective_system_prompt,
            messages=[*history, user_message],
            stage="initial_request",
        )
        context.messages = [*history, user_message]

        for item in preprocess_events:
            yield item
        preprocess_events.clear()

        current_messages = [*history, user_message]
        context.messages = list(current_messages)

        for turn in range(MAX_TOOL_CONTINUATION_TURNS):
            turn_index = turn + 1
            _raise_if_context_too_long(
                model_id=model.id,
                model_config=model_config,
                system_prompt=effective_system_prompt,
                messages=current_messages,
                stage=f"continuation_turn_{turn_index}",
            )
            gpt_logger.info(
                "tool_continuation turn_start conversation_id=%s response_id=%s turn=%s max_turns=%s message_count=%s",
                conversation_id,
                response_id,
                turn_index,
                MAX_TOOL_CONTINUATION_TURNS,
                len(context.messages),
            )
            kernel_stream = stream(model, context, options)

            async for event in kernel_stream:
                event_name = event.type
                payload: dict[str, Any] = {}

                if event_name in {"text_start", "thinking_start", "toolcall_start"}:
                    payload["content_index"] = event.content_index
                elif event_name in {"text_delta", "thinking_delta", "toolcall_delta"}:
                    payload["content_index"] = event.content_index
                    payload["delta"] = event.delta
                elif event_name in {"text_end", "thinking_end"}:
                    payload["content_index"] = event.content_index
                    payload["content"] = event.content
                elif event_name == "toolcall_end":
                    payload["content_index"] = event.content_index
                    payload["tool_call"] = _serialize_content_block(event.tool_call)
                elif isinstance(event, DoneEvent):
                    payload["stop_reason"] = event.reason
                elif isinstance(event, ErrorEvent):
                    mapped_error = map_chat_v2_error(event.error.error_message)
                    payload["reason"] = event.reason
                    payload["error_code"] = mapped_error.code
                    payload["error_message"] = mapped_error.user_message
                    emitted_error_event = True

                yield _sse(
                    event_name,
                    _event_payload(
                        response_id,
                        next_sequence(),
                        conversation_id,
                        **payload,
                    ),
                )

            final_message = await kernel_stream.result()
            gpt_logger.info(
                "tool_continuation turn_result conversation_id=%s response_id=%s turn=%s stop_reason=%s tool_call_count=%s usage=%s",
                conversation_id,
                response_id,
                turn_index,
                final_message.stop_reason,
                len(_tool_call_blocks(final_message)),
                _log_preview(asdict(final_message.usage)),
            )
            if final_message.stop_reason in {"error", "aborted"}:
                raise RuntimeError(
                    final_message.error_message or f"request ended with {final_message.stop_reason}"
                )

            current_messages.append(final_message)
            if final_message.stop_reason != "tool_use":
                break

            if not context.tools:
                raise RuntimeError("tool continuation requested but no tools are available")

            tool_results = await _execute_attachment_tool_calls(
                tools=context.tools,
                message=final_message,
                file_ids=file_ids,
                conversation_id=conversation_id,
                response_id=response_id,
                turn_index=turn_index,
            )
            for tool_result in tool_results:
                gpt_logger.info(
                    "tool_continuation tool_result_appended conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s is_error=%s details=%s",
                    conversation_id,
                    response_id,
                    turn_index,
                    tool_result.tool_call_id,
                    tool_result.tool_name,
                    tool_result.is_error,
                    _log_preview(tool_result.details),
                )
                yield _sse(
                    "tool_result",
                    _event_payload(
                        response_id,
                        next_sequence(),
                        conversation_id,
                        tool_call_id=tool_result.tool_call_id,
                        tool_name=tool_result.tool_name,
                        is_error=tool_result.is_error,
                        content=[_serialize_content_block(block) for block in tool_result.content],
                        details=tool_result.details,
                    ),
                )
            current_messages.extend(tool_results)
            context.messages = list(current_messages)
        else:
            gpt_logger.error(
                "tool_continuation exceeded_max_turns conversation_id=%s response_id=%s model=%s max_turns=%s file_ids=%s",
                conversation_id,
                response_id,
                model.id,
                MAX_TOOL_CONTINUATION_TURNS,
                _log_preview(_available_file_ids(file_ids)),
            )
            raise RuntimeError("tool continuation exceeded maximum turns")

        gpt_logger.info(
            "tool_continuation response_complete conversation_id=%s response_id=%s stop_reason=%s",
            conversation_id,
            response_id,
            final_message.stop_reason,
        )
        yield _sse(
            "response_complete",
            _event_payload(
                response_id,
                next_sequence(),
                conversation_id,
                stop_reason=final_message.stop_reason,
                usage=asdict(final_message.usage),
            ),
        )
        try:
            _save_history(conversation_id, current_messages)
            finalize_tracker("success", message=final_message)
        except Exception as exc:
            gpt_logger.exception(
                "tool_continuation post_complete_finalize_failed conversation_id=%s response_id=%s error=%s",
                conversation_id,
                response_id,
                str(exc),
            )
    except Exception as exc:
        gpt_logger.exception(
            "tool_continuation response_failed conversation_id=%s response_id=%s model=%s error=%s",
            conversation_id,
            response_id,
            model.id,
            str(exc),
        )
        for item in preprocess_events:
            yield item
        preprocess_events.clear()
        finalize_tracker("error", error=str(exc), message=final_message)
        if not emitted_error_event:
            mapped_error = map_chat_v2_error(str(exc))
            yield _sse(
                "error",
                _event_payload(
                    response_id,
                    next_sequence(),
                    conversation_id,
                    error_code=mapped_error.code,
                    error_message=mapped_error.user_message,
                ),
            )
