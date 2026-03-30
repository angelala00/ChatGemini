import asyncio
import json
import time
import uuid
from dataclasses import asdict
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.attachments import (
    build_attachment_tool_guidance,
    build_user_message_from_attachments,
    execute_attachment_tool,
    get_attachment_tool_definitions,
)
from app.chat_base import client, match_history, save_match_history
from app.gptassistant_planner import PlannerRuntimeCapabilities, build_execution_plan
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
    configured_compat = model_config.get("compat")
    if isinstance(configured_compat, dict):
        return OpenAICompletionsCompat(**configured_compat)

    model_name = model_config.get("model_name") or model_config.get("id") or ""
    lowered = (model_name or "").lower()
    if "qwen" in lowered:
        return OpenAICompletionsCompat(
            supports_reasoning_effort=False,
            requires_assistant_after_tool_result=False,
        )
    if lowered == "glm-4.7":
        return OpenAICompletionsCompat(
            supports_reasoning_effort=False,
        )
    if "glm" in lowered:
        return OpenAICompletionsCompat(
            supports_reasoning_effort=False,
        )
    return OpenAICompletionsCompat()


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
    save_match_history()


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


async def _execute_attachment_tool_calls(
    *,
    tools: list[Any],
    message: AssistantMessage,
    file_ids: Optional[str],
) -> list[ToolResultMessage]:
    available_file_ids = _available_file_ids(file_ids)
    results: list[ToolResultMessage] = []
    for block in _tool_call_blocks(message):
        try:
            validated_arguments = validate_tool_call(tools, block)
            execution = await execute_attachment_tool(
                block.name,
                validated_arguments,
                available_file_ids=available_file_ids,
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

    history = _load_history(conversation_id)
    preprocess_events: list[str] = []
    effective_system_prompt = system_prompt
    if file_ids and execution_plan.include_attachment_tool_guidance:
        attachment_guidance = build_attachment_tool_guidance(
            file_ids=file_ids,
            model_supports_native_images=model.supports_input("image"),
        )
        if attachment_guidance:
            effective_system_prompt = f"{system_prompt}\n\n{attachment_guidance}"

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

    try:
        user_message = await _build_user_message_with_preprocess_events(
            query,
            file_ids,
            model,
            execution_plan,
            emit_preprocess_event,
        )
        context.messages = [*history, user_message]

        for item in preprocess_events:
            yield item
        preprocess_events.clear()

        current_messages = [*history, user_message]
        context.messages = list(current_messages)

        for turn in range(MAX_TOOL_CONTINUATION_TURNS):
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
                    payload["reason"] = event.reason
                    payload["error_message"] = event.error.error_message
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
            )
            for tool_result in tool_results:
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
            raise RuntimeError("tool continuation exceeded maximum turns")

        _save_history(conversation_id, current_messages)
        finalize_tracker("success", message=final_message)
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
    except Exception as exc:
        for item in preprocess_events:
            yield item
        preprocess_events.clear()
        finalize_tracker("error", error=str(exc), message=final_message)
        if not emitted_error_event:
            yield _sse(
                "error",
                _event_payload(
                    response_id,
                    next_sequence(),
                    conversation_id,
                    error_message=str(exc),
                ),
            )
