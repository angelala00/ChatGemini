from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Optional
from urllib.parse import urljoin

from app.logger import gpt_logger
from ..event_stream import AssistantMessageEventStream, create_assistant_message_event_stream
from ..models import calculate_cost
from ..transform_messages import transform_messages
from ..types import (
    AssistantMessage,
    Context,
    DoneEvent,
    ErrorEvent,
    ImageContent,
    Model,
    OpenAICompatOptions,
    OpenAICompletionsCompat,
    ProviderStreamOptions,
    SimpleStreamOptions,
    StartEvent,
    StreamOptions,
    TextContent,
    TextDeltaEvent,
    TextEndEvent,
    TextStartEvent,
    ThinkingContent,
    ThinkingDeltaEvent,
    ThinkingEndEvent,
    ThinkingStartEvent,
    ToolCallContent,
    ToolCallDeltaEvent,
    ToolCallEndEvent,
    ToolCallStartEvent,
    ToolResultMessage,
    Usage,
)


class OpenAICompatProvider:
    api = "openai-compat-chat-completions"

    def __init__(self, client: Any) -> None:
        self._client = client

    def stream(
        self,
        model: Model,
        context: Context,
        options: Optional[OpenAICompatOptions] = None,
    ) -> AssistantMessageEventStream:
        stream = create_assistant_message_event_stream()
        asyncio.create_task(self._run_stream(stream, model, context, options or OpenAICompatOptions()))
        return stream

    def stream_simple(
        self,
        model: Model,
        context: Context,
        options: Optional[SimpleStreamOptions] = None,
    ) -> AssistantMessageEventStream:
        provider_options = OpenAICompatOptions()
        if options:
            provider_options.temperature = options.temperature
            provider_options.max_tokens = options.max_tokens
            provider_options.signal = options.signal
            provider_options.api_key = options.api_key
            provider_options.transport = options.transport
            provider_options.cache_retention = options.cache_retention
            provider_options.session_id = options.session_id
            provider_options.on_payload = options.on_payload
            provider_options.headers = dict(options.headers)
            provider_options.max_retry_delay_ms = options.max_retry_delay_ms
            provider_options.metadata = dict(options.metadata)
            if options.reasoning:
                provider_options.reasoning_effort = options.reasoning
        return self.stream(model, context, provider_options)

    async def _run_stream(
        self,
        stream: AssistantMessageEventStream,
        model: Model,
        context: Context,
        options: OpenAICompatOptions,
    ) -> None:
        output = AssistantMessage(
            content=[],
            api=model.api,
            provider=model.provider,
            model=model.id,
            timestamp=int(time.time() * 1000),
        )
        request_snapshot: dict[str, Any] = {}

        try:
            payload = self._build_payload(model, context, options)
            if options.on_payload:
                next_payload = options.on_payload(payload, model)
                if asyncio.iscoroutine(next_payload):
                    next_payload = await next_payload
                if next_payload is not None:
                    payload = next_payload
            request_snapshot = _payload_snapshot(payload)

            openai_stream = await self._client.chat.completions.create(
                **payload,
                stream=True,
            )
            stream.push(StartEvent(partial=output))

            current_block: TextContent | ThinkingContent | ToolCallContent | None = None

            def content_index() -> int:
                return len(output.content) - 1

            def finish_current_block() -> None:
                nonlocal current_block
                if isinstance(current_block, TextContent):
                    stream.push(
                        TextEndEvent(
                            content_index=content_index(),
                            content=current_block.text,
                            partial=output,
                        )
                    )
                elif isinstance(current_block, ThinkingContent):
                    stream.push(
                        ThinkingEndEvent(
                            content_index=content_index(),
                            content=current_block.thinking,
                            partial=output,
                        )
                    )
                elif isinstance(current_block, ToolCallContent):
                    stream.push(
                        ToolCallEndEvent(
                            content_index=content_index(),
                            tool_call=current_block,
                            partial=output,
                        )
                    )
                current_block = None

            async for chunk in openai_stream:
                if getattr(chunk, "id", None):
                    output.response_id = chunk.id
                if getattr(chunk, "usage", None):
                    output.usage = _parse_chunk_usage(chunk.usage, model)

                choices = getattr(chunk, "choices", None) or []
                if not choices:
                    continue

                choice = choices[0]
                if getattr(choice, "finish_reason", None):
                    stop_reason, error_message = self._map_stop_reason(choice.finish_reason)
                    output.stop_reason = stop_reason
                    if error_message:
                        output.error_message = error_message

                delta = getattr(choice, "delta", None)
                if not delta:
                    continue

                text_delta = getattr(delta, "content", None)
                if text_delta:
                    if not isinstance(current_block, TextContent):
                        finish_current_block()
                        current_block = TextContent()
                        output.content.append(current_block)
                        stream.push(TextStartEvent(content_index=content_index(), partial=output))
                    current_block.text += text_delta
                    stream.push(
                        TextDeltaEvent(
                            content_index=content_index(),
                            delta=text_delta,
                            partial=output,
                        )
                    )

                reasoning_delta = self._extract_reasoning_delta(delta)
                if reasoning_delta:
                    if not isinstance(current_block, ThinkingContent):
                        finish_current_block()
                        current_block = ThinkingContent()
                        output.content.append(current_block)
                        stream.push(ThinkingStartEvent(content_index=content_index(), partial=output))
                    current_block.thinking += reasoning_delta
                    stream.push(
                        ThinkingDeltaEvent(
                            content_index=content_index(),
                            delta=reasoning_delta,
                            partial=output,
                        )
                    )

                tool_calls = getattr(delta, "tool_calls", None) or []
                for tool_call in tool_calls:
                    fn = getattr(tool_call, "function", None)
                    delta_args = ""
                    if fn and getattr(fn, "arguments", None):
                        delta_args = fn.arguments
                    gpt_logger.info(
                        "tool_call_delta_raw model=%s response_id=%s finish_reason=%s tool_call=%s",
                        model.id,
                        output.response_id,
                        getattr(choice, "finish_reason", None),
                        _log_preview(_tool_call_delta_snapshot(tool_call)),
                    )
                    if (
                        not isinstance(current_block, ToolCallContent)
                        or (
                            getattr(tool_call, "id", None)
                            and current_block.id
                            and getattr(tool_call, "id", None) != current_block.id
                        )
                    ):
                        finish_current_block()
                        current_block = ToolCallContent(arguments={})
                        output.content.append(current_block)
                        stream.push(ToolCallStartEvent(content_index=content_index(), partial=output))

                    if getattr(tool_call, "id", None):
                        current_block.id = tool_call.id
                    if fn and getattr(fn, "name", None):
                        current_block.name = fn.name
                    if fn and getattr(fn, "arguments", None):
                        accumulated_before = current_block.partial_arguments_raw
                        merge_result = _merge_streaming_tool_arguments(
                            current_block.partial_arguments_raw,
                            delta_args,
                        )
                        current_block.partial_arguments_raw = merge_result["raw"]
                        current_block.arguments = merge_result["arguments"]
                        gpt_logger.info(
                            "tool_call_delta_applied model=%s response_id=%s tool_call_id=%s tool_name=%s strategy=%s delta_len=%s accumulated_before=%s accumulated_after=%s parsed_arguments=%s",
                            model.id,
                            output.response_id,
                            getattr(tool_call, "id", None) or current_block.id,
                            getattr(fn, "name", None) or current_block.name,
                            merge_result["strategy"],
                            len(delta_args),
                            _log_preview(accumulated_before),
                            _log_preview(current_block.partial_arguments_raw),
                            _log_preview(current_block.arguments),
                        )
                        if (
                            isinstance(current_block.arguments, dict)
                            and "_partial" in current_block.arguments
                        ):
                            gpt_logger.warning(
                                "tool_call_arguments_partial model=%s response_id=%s tool_call_id=%s tool_name=%s raw_length=%s raw_preview=%s raw_repr=%s request_input=%s",
                                model.id,
                                output.response_id,
                                getattr(tool_call, "id", None) or current_block.id,
                                getattr(fn, "name", None) or current_block.name,
                                len(current_block.partial_arguments_raw),
                                _truncate_for_log(current_block.partial_arguments_raw),
                                _truncate_for_log(repr(current_block.partial_arguments_raw)),
                                _log_preview(request_snapshot),
                            )
                    stream.push(
                        ToolCallDeltaEvent(
                            content_index=content_index(),
                            delta=delta_args,
                            partial=output,
                        )
                    )

                reasoning_details = getattr(delta, "reasoning_details", None) or []
                if isinstance(current_block, ToolCallContent):
                    for detail in reasoning_details:
                        if (
                            getattr(detail, "type", None) == "reasoning.encrypted"
                            and getattr(detail, "id", None) == current_block.id
                            and getattr(detail, "data", None)
                        ):
                            current_block.thought_signature = json.dumps(
                                {
                                    "type": detail.type,
                                    "id": detail.id,
                                    "data": detail.data,
                                },
                                ensure_ascii=False,
                            )

            finish_current_block()
            if output.stop_reason in {"error", "aborted"}:
                stream.push(
                    ErrorEvent(
                        reason="aborted" if output.stop_reason == "aborted" else "error",
                        error=output,
                    )
                )
            else:
                done_reason = output.stop_reason if output.stop_reason in {"stop", "length", "tool_use"} else "stop"
                stream.push(DoneEvent(reason=done_reason, message=output))
            stream.finish(output)
        except asyncio.CancelledError as exc:
            output.stop_reason = "aborted"
            output.error_message = str(exc)
            request_target = _request_target_snapshot(self._client)
            gpt_logger.warning(
                "openai_compat_stream_cancelled model=%s response_id=%s target=%s error=%s request_input=%s",
                model.id,
                output.response_id,
                _log_preview(request_target),
                str(exc),
                _log_preview(request_snapshot),
            )
            stream.push(
                ErrorEvent(
                    reason="aborted",
                    error=output,
                )
            )
            stream.finish(output)
        except Exception as exc:
            output.stop_reason = "aborted" if _is_abort_error(exc) else "error"
            output.error_message = str(exc)
            request_target = _request_target_snapshot(self._client)
            gpt_logger.exception(
                "openai_compat_stream_failed model=%s response_id=%s target=%s error=%s request_input=%s",
                model.id,
                output.response_id,
                _log_preview(request_target),
                str(exc),
                _log_preview(request_snapshot),
            )
            stream.push(
                ErrorEvent(
                    reason="aborted" if output.stop_reason == "aborted" else "error",
                    error=output,
                )
            )
            stream.finish(output)

    def _build_payload(
        self,
        model: Model,
        context: Context,
        options: OpenAICompatOptions,
    ) -> dict[str, Any]:
        compat = _compat_settings(model)
        messages = []
        if context.system_prompt:
            system_role = "developer" if model.reasoning and compat.supports_developer_role else "system"
            messages.append({"role": system_role, "content": context.system_prompt})
        messages.extend(_messages_to_openai(transform_messages(context.messages, model), model, compat))

        payload: dict[str, Any] = {
            "model": model.id,
            "messages": messages,
        }
        if model.headers:
            payload["extra_headers"] = {**model.headers}
        if options.include_usage and compat.supports_usage_in_streaming:
            payload["stream_options"] = {"include_usage": True}
        if context.tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                        **({"strict": False} if compat.supports_strict_mode else {}),
                    },
                }
                for tool in context.tools
            ]
        elif _has_tool_history(context.messages):
            payload["tools"] = []
        if options.temperature is not None:
            payload["temperature"] = options.temperature
        if options.max_tokens is not None:
            payload[compat.max_tokens_field] = options.max_tokens
        if options.tool_choice is not None:
            payload["tool_choice"] = options.tool_choice
        if options.provider_options:
            payload.update(options.provider_options)
        if model.reasoning:
            _apply_reasoning_payload(payload, options, compat)
        return payload

    @staticmethod
    def _extract_reasoning_delta(delta: Any) -> str:
        for field in ("reasoning_content", "reasoning", "reasoning_text"):
            value = getattr(delta, field, None)
            if value:
                return value
        return ""

    @staticmethod
    def _map_stop_reason(finish_reason: str | None) -> tuple[str, str | None]:
        if finish_reason is None:
            return "stop", None
        if finish_reason in {"stop", "end"}:
            return "stop", None
        if finish_reason == "length":
            return "length", None
        if finish_reason in {"function_call", "tool_calls"}:
            return "tool_use", None
        if finish_reason in {"content_filter", "network_error"}:
            return "error", f"Provider finish_reason: {finish_reason}"
        return "error", f"Provider finish_reason: {finish_reason}"


def _message_to_openai(message: Any, compat: OpenAICompletionsCompat) -> dict[str, Any]:
    if message.role == "user":
        if isinstance(message.content, str):
            return {"role": "user", "content": message.content}
        return {
            "role": "user",
            "content": [
                {"type": "text", "text": block.text}
                if isinstance(block, TextContent)
                else {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{block.mime_type};base64,{block.data}",
                    },
                }
                for block in message.content
            ],
        }

    if message.role == "assistant":
        tool_calls = []
        text_parts = []
        thinking_parts = []
        thinking_signature = None
        for block in message.content:
            if isinstance(block, TextContent):
                if block.text and block.text.strip():
                    text_parts.append(block.text)
            elif isinstance(block, ThinkingContent):
                if block.thinking_signature and not thinking_signature:
                    thinking_signature = block.thinking_signature
                if block.thinking_signature or (block.thinking and block.thinking.strip()):
                    thinking_parts.append(block.thinking)
            elif isinstance(block, ToolCallContent):
                serialized_arguments = _tool_call_arguments_for_history(block)
                tool_calls.append(
                    {
                        "id": block.id,
                        "type": "function",
                        "function": {
                            "name": block.name,
                            "arguments": json.dumps(serialized_arguments, ensure_ascii=False),
                        },
                    }
                )
        payload: dict[str, Any] = {
            "role": "assistant",
            "content": "".join(text_parts) or None,
        }
        if thinking_parts:
            joined_thinking = "\n\n".join(part for part in thinking_parts if part)
            if compat.requires_thinking_as_text and joined_thinking:
                payload["content"] = f"{joined_thinking}{payload['content'] or ''}" or None
            elif thinking_signature:
                payload[thinking_signature] = joined_thinking
            elif joined_thinking:
                payload["content"] = f"{joined_thinking}{payload['content'] or ''}" or None
        if tool_calls:
            payload["tool_calls"] = tool_calls
        return payload

    return {
        "role": "tool",
        "tool_call_id": message.tool_call_id,
        "name": message.tool_name,
        "content": "\n".join(
            block.text
            for block in message.content
            if isinstance(block, TextContent)
        ),
    }


def _messages_to_openai(
    messages: list[Any],
    model: Model,
    compat: OpenAICompletionsCompat | None = None,
) -> list[dict[str, Any]]:
    compat = compat or _compat_settings(model)
    output: list[dict[str, Any]] = []
    index = 0
    last_role: str | None = None

    while index < len(messages):
        message = messages[index]

        if message.role == "user":
            if compat.requires_assistant_after_tool_result and last_role == "tool_result":
                output.append({"role": "assistant", "content": "I have processed the tool results."})
                last_role = "assistant"
            payload = _message_to_openai(message, compat)
            content = payload.get("content")
            if not content:
                index += 1
                continue
            output.append(payload)
            last_role = "user"
            index += 1
            continue

        if message.role == "assistant":
            payload = _message_to_openai(message, compat)
            has_content = bool(payload.get("content"))
            has_thinking_signature = any(
                key not in {"role", "content", "tool_calls"}
                for key in payload.keys()
            )
            has_tool_calls = bool(payload.get("tool_calls"))
            if not has_content and not has_tool_calls and not has_thinking_signature:
                index += 1
                continue
            output.append(payload)
            last_role = "assistant"
            index += 1
            continue

        image_blocks: list[ImageContent] = []
        while index < len(messages) and messages[index].role == "tool_result":
            tool_result_message: ToolResultMessage = messages[index]
            text_content = "\n".join(
                block.text
                for block in tool_result_message.content
                if isinstance(block, TextContent) and block.text
            )
            tool_payload = {
                "role": "tool",
                "tool_call_id": tool_result_message.tool_call_id,
                "content": text_content or "(see attached image)",
            }
            if compat.requires_tool_result_name and tool_result_message.tool_name:
                tool_payload["name"] = tool_result_message.tool_name
            output.append(tool_payload)
            for block in tool_result_message.content:
                if isinstance(block, ImageContent):
                    image_blocks.append(block)
            last_role = "tool_result"
            index += 1

        if image_blocks:
            if compat.requires_assistant_after_tool_result:
                output.append({"role": "assistant", "content": "I have processed the tool results."})
            output.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Attached image(s) from tool result:"},
                        *[
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{block.mime_type};base64,{block.data}",
                                },
                            }
                            for block in image_blocks
                            if model.supports_input("image")
                        ],
                    ],
                }
            )
            last_role = "user"

    return output


def _compat_settings(model: Model) -> OpenAICompletionsCompat:
    compat = model.compat if isinstance(model.compat, OpenAICompletionsCompat) else OpenAICompletionsCompat()
    return OpenAICompletionsCompat(
        supports_developer_role=compat.supports_developer_role,
        supports_reasoning_effort=compat.supports_reasoning_effort,
        supports_usage_in_streaming=compat.supports_usage_in_streaming,
        reasoning_effort_map=dict(compat.reasoning_effort_map),
        reasoning_parameter_format=compat.reasoning_parameter_format,
        max_tokens_field=compat.max_tokens_field,
        requires_tool_result_name=compat.requires_tool_result_name,
        requires_assistant_after_tool_result=compat.requires_assistant_after_tool_result,
        requires_thinking_as_text=compat.requires_thinking_as_text,
        supports_strict_mode=compat.supports_strict_mode,
    )


def _map_reasoning_effort(effort: str, reasoning_effort_map: dict[str, str]) -> str:
    return reasoning_effort_map.get(effort, effort)


def _apply_reasoning_payload(
    payload: dict[str, Any],
    options: OpenAICompatOptions,
    compat: OpenAICompletionsCompat,
) -> None:
    reasoning_parameter_format = compat.reasoning_parameter_format
    mapped_effort = None
    if options.reasoning_effort is not None:
        mapped_effort = _map_reasoning_effort(
            options.reasoning_effort,
            compat.reasoning_effort_map,
        )

    def extra_body() -> dict[str, Any]:
        current = payload.get("extra_body")
        if not isinstance(current, dict):
            current = {}
            payload["extra_body"] = current
        return current

    if reasoning_parameter_format in {"zai", "qwen"}:
        extra_body()["enable_thinking"] = bool(options.reasoning_effort)
        return

    if reasoning_parameter_format == "qwen-chat-template":
        extra_body()["chat_template_kwargs"] = {
            "enable_thinking": bool(options.reasoning_effort),
        }
        return

    if reasoning_parameter_format == "openrouter":
        extra_body()["reasoning"] = {
            "effort": mapped_effort or "none",
        }
        return

    if mapped_effort is not None and compat.supports_reasoning_effort:
        payload["reasoning_effort"] = mapped_effort


def _parse_chunk_usage(raw_usage: Any, model: Model) -> Any:
    cached_tokens = getattr(getattr(raw_usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0
    reasoning_tokens = getattr(
        getattr(raw_usage, "completion_tokens_details", None),
        "reasoning_tokens",
        0,
    ) or 0
    input_tokens = max((getattr(raw_usage, "prompt_tokens", 0) or 0) - cached_tokens, 0)
    output_tokens = (getattr(raw_usage, "completion_tokens", 0) or 0) + reasoning_tokens
    total_tokens = input_tokens + output_tokens + cached_tokens

    usage = Usage()
    usage.input = input_tokens
    usage.output = output_tokens
    usage.cache_read = cached_tokens
    usage.cache_write = 0
    usage.total_tokens = total_tokens
    calculate_cost(model, usage)
    return usage


def _parse_streaming_json_best_effort(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except Exception:
        return {"_partial": raw}


def _parse_complete_json_object(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _merge_streaming_tool_arguments(current_raw: str, delta_raw: str) -> dict[str, Any]:
    if not delta_raw:
        return {
            "raw": current_raw,
            "arguments": _parse_streaming_json_best_effort(current_raw),
            "strategy": "noop",
        }

    if not current_raw:
        return {
            "raw": delta_raw,
            "arguments": _parse_streaming_json_best_effort(delta_raw),
            "strategy": "init",
        }

    appended_raw = f"{current_raw}{delta_raw}"
    appended_object = _parse_complete_json_object(appended_raw)
    delta_object = _parse_complete_json_object(delta_raw)
    current_object = _parse_complete_json_object(current_raw)

    if appended_object is not None:
        return {
            "raw": appended_raw,
            "arguments": appended_object,
            "strategy": "append_complete",
        }

    if delta_object is not None:
        strategy = "replace_complete"
        if current_object is not None and delta_raw.startswith(current_raw):
            strategy = "replace_snapshot"
        return {
            "raw": delta_raw,
            "arguments": delta_object,
            "strategy": strategy,
        }

    if delta_raw.startswith(current_raw):
        return {
            "raw": delta_raw,
            "arguments": _parse_streaming_json_best_effort(delta_raw),
            "strategy": "replace_prefix_growth",
        }

    return {
        "raw": appended_raw,
        "arguments": _parse_streaming_json_best_effort(appended_raw),
        "strategy": "append_partial",
    }


def _tool_call_arguments_for_history(block: ToolCallContent) -> dict[str, Any]:
    if not isinstance(block.arguments, dict) or "_partial" not in block.arguments:
        return block.arguments

    reparsed_arguments = _parse_complete_json_object(block.partial_arguments_raw)
    if reparsed_arguments is not None:
        return reparsed_arguments

    gpt_logger.warning(
        "tool_call_arguments_history_sanitized tool_call_id=%s tool_name=%s raw_preview=%s raw_repr=%s",
        block.id,
        block.name,
        _truncate_for_log(block.partial_arguments_raw),
        _truncate_for_log(repr(block.partial_arguments_raw)),
    )
    return {}


def _truncate_for_log(value: str, limit: int = 1500) -> str:
    if len(value) > limit:
        return f"{value[:limit]}...(truncated)"
    return value


def _log_preview(value: Any, limit: int = 2000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = repr(value)
    if len(text) > limit:
        return f"{text[:limit]}...(truncated)"
    return text


def _tool_call_delta_snapshot(tool_call: Any) -> dict[str, Any]:
    fn = getattr(tool_call, "function", None)
    return {
        "index": getattr(tool_call, "index", None),
        "id": getattr(tool_call, "id", None),
        "type": getattr(tool_call, "type", None),
        "function": {
            "name": getattr(fn, "name", None) if fn else None,
            "arguments": getattr(fn, "arguments", None) if fn else None,
        },
    }


def _payload_snapshot(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "model": payload.get("model"),
        "messages": payload.get("messages"),
        "tools": payload.get("tools"),
        "tool_choice": payload.get("tool_choice"),
        "extra_body": payload.get("extra_body"),
        "stream_options": payload.get("stream_options"),
    }


def _request_target_snapshot(client: Any) -> dict[str, Any]:
    base_url = str(getattr(client, "base_url", "") or "")
    normalized_base_url = base_url.rstrip("/")
    chat_completions_url = (
        urljoin(f"{normalized_base_url}/", "chat/completions")
        if normalized_base_url
        else ""
    )
    api_key = getattr(client, "api_key", None)
    api_key_last4 = api_key[-4:] if isinstance(api_key, str) and len(api_key) >= 4 else ""
    return {
        "base_url": base_url,
        "chat_completions_url": chat_completions_url,
        "api_key_last4": api_key_last4,
    }


def _is_abort_error(exc: Exception) -> bool:
    name = exc.__class__.__name__
    return name == "CancelledError" or "abort" in str(exc).lower()


def _has_tool_history(messages: list[Any]) -> bool:
    for message in messages:
        if getattr(message, "role", None) == "tool_result":
            return True
        if getattr(message, "role", None) == "assistant":
            if any(isinstance(block, ToolCallContent) for block in getattr(message, "content", [])):
                return True
    return False
