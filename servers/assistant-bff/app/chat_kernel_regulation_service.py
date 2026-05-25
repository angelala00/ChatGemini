import json
import os
import time
import uuid
from dataclasses import asdict
from typing import Any, AsyncGenerator, Optional

from app.base_config import model_config
from app.chat_base import client, match_history, save_match_history
from app.gptassistant_error_mapping import map_chat_v2_error
from app.llm_kernel import (
    AssistantMessage,
    Context,
    ErrorEvent,
    ImageContent,
    Model,
    OpenAICompletionsCompat,
    OpenAICompatOptions,
    TextContent,
    ThinkingContent,
    ToolCallContent,
    ToolDefinition,
    ToolResultMessage,
    Usage,
    UserMessage,
    get_api_provider,
    register_openai_compat_provider,
    stream,
    validate_tool_call,
)
from app.logger import gpt_logger
from app.metrics.events import UsageEventTracker
from app.tracing import ChatTraceRecorder


KERNEL_HISTORY_PREFIX = "llm_kernel:regulationassistant:"
MAX_TOOL_CONTINUATION_TURNS = 4
DEFAULT_MAX_CONTENT_CHARS = 12000
MAX_CONTENT_CHARS_LIMIT = 30000

FETCH_DOCUMENT_CATALOG_TOOL = "fetch_document_catalog"
FETCH_DOCUMENT_CONTENT_TOOL = "fetch_document_content"

REGULATION_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name=FETCH_DOCUMENT_CATALOG_TOOL,
        description="获取制度文档目录，用于判断接下来应该阅读哪些具体制度文件。",
        parameters={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name=FETCH_DOCUMENT_CONTENT_TOOL,
        description="读取指定制度文件的正文内容。仅在已经确定文件名后调用。",
        parameters={
            "type": "object",
            "properties": {
                "file_names": {
                    "type": "array",
                    "description": "需要读取的制度文件名称列表，必须与目录中的文件名一致。",
                    "items": {
                        "type": "string",
                        "minLength": 1,
                    },
                    "minItems": 1,
                },
                "max_chars": {
                    "type": "integer",
                    "description": "可选，限制本次读取返回的总字符数。",
                    "minimum": 1000,
                    "maximum": MAX_CONTENT_CHARS_LIMIT,
                },
            },
            "required": ["file_names"],
            "additionalProperties": False,
        },
    ),
]


def _log_preview(value: Any, *, limit: int = 1200) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = repr(value)
    if len(text) > limit:
        return f"{text[:limit]}...(truncated)"
    return text


def _history_key(conversation_id: str) -> str:
    return f"{KERNEL_HISTORY_PREFIX}{conversation_id}"


def _ensure_openai_compat_provider() -> None:
    if get_api_provider("openai-compat-chat-completions") is None:
        register_openai_compat_provider(client)


def _event_payload(
    response_id: str,
    sequence: int,
    conversation_id: str,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "conversation_id": conversation_id,
        "response_id": response_id,
        "sequence": sequence,
        **extra,
    }


def _model_compat(model_config: dict[str, Any]) -> OpenAICompletionsCompat:
    model_name = model_config.get("model_name") or model_config.get("id") or ""
    lowered = model_name.lower()
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


def _kernel_model_from_config(model_config: dict[str, Any], reasoning_enabled: bool) -> Model:
    model_name = model_config.get("model_name") or model_config.get("id") or ""
    supports_reasoning = bool(model_config.get("supports_reasoning")) and reasoning_enabled
    return Model(
        id=model_name,
        name=model_config.get("name") or model_name,
        api="openai-compat-chat-completions",
        provider="assistant-bff-openai-compat",
        reasoning=supports_reasoning,
        input=["text"],
        compat=_model_compat(model_config),
    )


def _serialize_content_block(block: Any) -> dict[str, Any]:
    return asdict(block)


def _serialize_message(message: Any) -> dict[str, Any]:
    if isinstance(message, UserMessage):
        return {
            "role": "user",
            "content": message.content,
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
        return UserMessage(
            content=payload.get("content", ""),
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


def _legacy_sse(event: str, conversation_id: str, answer: str) -> str:
    payload = {
        "event": event,
        "conversation_id": conversation_id,
        "answer": answer,
    }
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _usage_tokens(message: AssistantMessage) -> tuple[Optional[int], Optional[int]]:
    usage = message.usage
    request_tokens = usage.input + usage.cache_read + usage.cache_write
    response_tokens = usage.output
    return request_tokens or None, response_tokens or None


def _tool_call_blocks(message: AssistantMessage) -> list[ToolCallContent]:
    return [block for block in message.content if isinstance(block, ToolCallContent)]


def _render_tool_call_message(tool_call: ToolCallContent) -> str:
    if tool_call.name == FETCH_DOCUMENT_CATALOG_TOOL:
        return "正在检索制度目录，确认应查阅的制度文件。"

    if tool_call.name == FETCH_DOCUMENT_CONTENT_TOOL:
        file_names = tool_call.arguments.get("file_names") if isinstance(tool_call.arguments, dict) else None
        if isinstance(file_names, list) and file_names:
            joined_names = "、".join(f"《{str(name)}》" for name in file_names[:5])
            suffix = " 等文件" if len(file_names) > 5 else ""
            return f"正在读取制度文件 {joined_names}{suffix}。"
        return "正在读取相关制度文件内容。"

    return f"正在调用工具 {tool_call.name}。"


def _render_tool_result_message(tool_result: ToolResultMessage) -> str:
    if tool_result.is_error:
        return f"工具调用失败：{tool_result.tool_name}。"

    if tool_result.tool_name == FETCH_DOCUMENT_CATALOG_TOOL:
        return "已获取制度目录，正在继续定位相关制度文件。"

    if tool_result.tool_name == FETCH_DOCUMENT_CONTENT_TOOL:
        resolved_files = []
        if isinstance(tool_result.details, dict):
            detail_files = tool_result.details.get("resolved_files")
            if isinstance(detail_files, list):
                resolved_files = [str(name) for name in detail_files if str(name).strip()]
        if resolved_files:
            joined_names = "、".join(f"《{name}》" for name in resolved_files[:5])
            suffix = " 等文件" if len(resolved_files) > 5 else ""
            return f"已读取制度文件 {joined_names}{suffix}。"
        return "已读取相关制度文件内容。"

    return f"工具调用完成：{tool_result.tool_name}。"


def _normalize_document_name(file_name: str) -> str:
    normalized = (file_name or "").strip()
    if not normalized:
        raise ValueError("file_names 不能为空")
    if normalized != os.path.basename(normalized):
        raise ValueError(f"非法文件名: {file_name}")
    if ".." in normalized:
        raise ValueError(f"非法文件名: {file_name}")
    return normalized


def _catalog_file_path() -> str:
    return os.path.join(model_config.FILE_BASE, "regulationassistant", "document_catalog.json")


def _document_file_path(file_name: str) -> str:
    return os.path.join(model_config.FILE_BASE, "regulationassistant", "pdf", file_name)


def _read_document_catalog() -> str:
    with open(_catalog_file_path(), "r", encoding="utf-8") as file:
        payload = json.load(file)
    return json.dumps(payload, ensure_ascii=False, indent=2)


async def _execute_regulation_tool(tool_name: str, arguments: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    if tool_name == FETCH_DOCUMENT_CATALOG_TOOL:
        return _read_document_catalog(), {"tool_name": tool_name}

    if tool_name == FETCH_DOCUMENT_CONTENT_TOOL:
        from app.utils import text_extractor

        file_names = arguments.get("file_names") or []
        max_chars = int(arguments.get("max_chars") or DEFAULT_MAX_CONTENT_CHARS)
        max_chars = max(1000, min(max_chars, MAX_CONTENT_CHARS_LIMIT))

        sections: list[str] = []
        resolved_files: list[str] = []
        current_size = 0
        for file_name in file_names:
            normalized_name = _normalize_document_name(str(file_name))
            file_path = _document_file_path(normalized_name)
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"文件不存在: {normalized_name}")
            extracted = text_extractor.extract_text(file_path, ".pdf")
            resolved_files.append(normalized_name)
            section = f"文件《{normalized_name}》内容：\n{extracted.strip()}\n"
            remaining = max_chars - current_size
            if remaining <= 0:
                break
            if len(section) > remaining:
                section = section[:remaining]
            sections.append(section)
            current_size += len(section)
            if current_size >= max_chars:
                break

        if not sections:
            return "未读取到任何制度文件内容。", {
                "tool_name": tool_name,
                "resolved_files": resolved_files,
                "max_chars": max_chars,
            }

        return "\n".join(sections).strip(), {
            "tool_name": tool_name,
            "resolved_files": resolved_files,
            "max_chars": max_chars,
        }

    raise ValueError(f"未知工具: {tool_name}")


async def _execute_regulation_tool_calls(
    *,
    tools: list[ToolDefinition],
    message: AssistantMessage,
    conversation_id: str,
    response_id: str,
    turn_index: int,
    usage_tracker: Optional[UsageEventTracker] = None,
) -> list[ToolResultMessage]:
    results: list[ToolResultMessage] = []
    for block in _tool_call_blocks(message):
        gpt_logger.info(
            "regulation_tool_call_start conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s arguments=%s",
            conversation_id,
            response_id,
            turn_index,
            block.id,
            block.name,
            json.dumps(block.arguments, ensure_ascii=False, default=str),
        )
        try:
            if usage_tracker is not None:
                usage_tracker.mark_tool(block.name)
            validated_arguments = validate_tool_call(tools, block)
            gpt_logger.info(
                "regulation_tool_call_validated conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s validated_arguments=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                _log_preview(validated_arguments),
            )
            result_text, details = await _execute_regulation_tool(block.name, validated_arguments)
            gpt_logger.info(
                "regulation_tool_call_succeeded conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s details=%s text_len=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                _log_preview(details),
                len(result_text or ""),
            )
            results.append(
                ToolResultMessage(
                    tool_call_id=block.id,
                    tool_name=block.name,
                    content=[TextContent(text=result_text)],
                    details=details,
                    is_error=False,
                    timestamp=int(time.time() * 1000),
                )
            )
        except Exception as exc:
            gpt_logger.warning(
                "regulation_tool_call_failed conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s error=%s",
                conversation_id,
                response_id,
                turn_index,
                block.id,
                block.name,
                str(exc),
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


async def chat_with_kernel_regulation(
    query: str,
    conversation_id: str,
    system_prompt: str,
    model_config: dict[str, Any],
    gid: str,
    *,
    reasoning_enabled: bool = False,
    usage_tracker: Optional[UsageEventTracker] = None,
    show_reasoning: bool = False,
    trace_recorder: Optional[ChatTraceRecorder] = None,
) -> AsyncGenerator[str, None]:
    _ensure_openai_compat_provider()

    started_at = time.perf_counter()
    response_id = f"resp_{uuid.uuid4().hex[:12]}"
    sequence = 0
    tracker_finalized = False
    trace_finalized = False
    model = _kernel_model_from_config(model_config, reasoning_enabled)
    requested_reasoning_enabled = bool(model.reasoning and reasoning_enabled)

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

    def finalize_trace(status: str, *, error: Optional[str] = None, response_preview: Optional[str] = None) -> None:
        nonlocal trace_finalized
        if trace_recorder is None or trace_finalized:
            return
        trace_recorder.finalize(
            status=status,
            error=error,
            duration_ms=(time.perf_counter() - started_at) * 1000,
            response_preview=response_preview,
        )
        trace_finalized = True

    if usage_tracker:
        usage_tracker.set_model(model.id)
    if trace_recorder:
        trace_recorder.update(selected_model=model.id)

    history = _load_history(conversation_id)
    user_message = UserMessage(content=query, timestamp=int(time.time() * 1000))
    current_messages = [*history, user_message]
    context = Context(
        system_prompt=system_prompt,
        messages=list(current_messages),
        tools=list(REGULATION_TOOL_DEFINITIONS),
    )
    options = OpenAICompatOptions(
        reasoning_effort="high" if requested_reasoning_enabled else None,
    )
    final_message: Optional[AssistantMessage] = None
    reasoning_open = False

    gpt_logger.info(
        "regulation_kernel_start gid=%s conversation_id=%s response_id=%s model=%s reasoning_enabled=%s tools=%s",
        gid,
        conversation_id,
        response_id,
        model.id,
        requested_reasoning_enabled,
        [tool.name for tool in context.tools],
    )
    if trace_recorder:
        trace_recorder.log(
            "request.prepared",
            {
                "conversation_id": conversation_id,
                "query": query,
                "system_prompt": system_prompt,
                "model": model.id,
                "reasoning_enabled": requested_reasoning_enabled,
                "tools": [tool.name for tool in context.tools],
            },
        )

    try:
        for turn in range(MAX_TOOL_CONTINUATION_TURNS):
            turn_index = turn + 1
            gpt_logger.info(
                "regulation_kernel_turn_start gid=%s conversation_id=%s response_id=%s turn=%s max_turns=%s message_count=%s tools=%s",
                gid,
                conversation_id,
                response_id,
                turn_index,
                MAX_TOOL_CONTINUATION_TURNS,
                len(context.messages),
                _log_preview([tool.name for tool in context.tools]),
            )
            if trace_recorder:
                trace_recorder.log(
                    "model.request",
                    {
                        "conversation_id": conversation_id,
                        "response_id": response_id,
                        "turn": turn_index,
                        "model": model.id,
                        "reasoning_enabled": requested_reasoning_enabled,
                    },
                )
            kernel_stream = stream(model, context, options)

            async for event in kernel_stream:
                sequence_payload = _event_payload(
                    response_id,
                    next_sequence(),
                    conversation_id,
                )
                if event.type in {"thinking_start", "thinking_delta", "thinking_end"}:
                    continue
                if event.type == "text_delta":
                    if reasoning_open:
                        reasoning_open = False
                        yield _legacy_sse("message", conversation_id, "<step><summary>完成</summary>完成</step></think>\n\n")
                    yield _legacy_sse("message", conversation_id, event.delta or "")
                    continue
                if isinstance(event, ErrorEvent):
                    mapped_error = map_chat_v2_error(event.error.error_message)
                    gpt_logger.warning(
                        "regulation_kernel_error gid=%s conversation_id=%s response_id=%s sequence=%s error_code=%s error_message=%s",
                        gid,
                        conversation_id,
                        response_id,
                        sequence_payload["sequence"],
                        mapped_error.code,
                        mapped_error.user_message,
                    )

            final_message = await kernel_stream.result()
            gpt_logger.info(
                "regulation_kernel_turn_result gid=%s conversation_id=%s response_id=%s turn=%s stop_reason=%s tool_call_count=%s usage=%s error_message=%s",
                gid,
                conversation_id,
                response_id,
                turn_index,
                final_message.stop_reason,
                len(_tool_call_blocks(final_message)),
                _log_preview(asdict(final_message.usage)),
                final_message.error_message,
            )
            current_messages.append(final_message)
            if final_message.stop_reason in {"error", "aborted"}:
                raise RuntimeError(
                    final_message.error_message or f"request ended with {final_message.stop_reason}"
                )

            if final_message.stop_reason != "tool_use":
                break

            if show_reasoning:
                tool_calls = _tool_call_blocks(final_message)
                if tool_calls and not reasoning_open:
                    reasoning_open = True
                    yield _legacy_sse("message", conversation_id, "<think>\n")
                for tool_call in tool_calls:
                    yield _legacy_sse(
                        "message",
                        conversation_id,
                        f"<step><summary>工具调用中</summary>{_render_tool_call_message(tool_call)}</step>\n",
                    )

            tool_results = await _execute_regulation_tool_calls(
                tools=context.tools,
                message=final_message,
                conversation_id=conversation_id,
                response_id=response_id,
                turn_index=turn_index,
                usage_tracker=usage_tracker,
            )
            if show_reasoning:
                for tool_result in tool_results:
                    yield _legacy_sse(
                        "message",
                        conversation_id,
                        f"<step><summary>工具调用结果</summary>{_render_tool_result_message(tool_result)}</step>\n",
                    )
            for tool_result in tool_results:
                gpt_logger.info(
                    "regulation_tool_result_appended gid=%s conversation_id=%s response_id=%s turn=%s tool_call_id=%s tool_name=%s is_error=%s details=%s",
                    gid,
                    conversation_id,
                    response_id,
                    turn_index,
                    tool_result.tool_call_id,
                    tool_result.tool_name,
                    tool_result.is_error,
                    _log_preview(tool_result.details),
                )
            current_messages.extend(tool_results)
            context.messages = list(current_messages)
        else:
            raise RuntimeError("tool continuation exceeded maximum turns")

        if reasoning_open:
            reasoning_open = False
            yield _legacy_sse("message", conversation_id, "</think>\n\n")

        _save_history(conversation_id, current_messages)
        gpt_logger.info(
            "regulation_kernel_complete gid=%s conversation_id=%s response_id=%s stop_reason=%s",
            gid,
            conversation_id,
            response_id,
            final_message.stop_reason if final_message is not None else "unknown",
        )
        finalize_tracker("success", message=final_message)
        finalize_trace(
            "success",
            response_preview="".join(
                block.text for block in final_message.content if isinstance(block, TextContent)
            ) if final_message is not None else None,
        )
        yield _legacy_sse("message_end", conversation_id, "")
    except Exception as exc:
        gpt_logger.exception(
            "regulation_kernel_failed gid=%s conversation_id=%s response_id=%s model=%s error=%s",
            gid,
            conversation_id,
            response_id,
            model.id,
            str(exc),
        )
        if reasoning_open:
            yield _legacy_sse("message", conversation_id, "</think>\n\n")
        finalize_tracker("error", error=str(exc), message=final_message)
        finalize_trace("error", error=str(exc))
        mapped_error = map_chat_v2_error(str(exc))
        yield _legacy_sse("message", conversation_id, mapped_error.user_message)
        yield _legacy_sse("message_end", conversation_id, "")
