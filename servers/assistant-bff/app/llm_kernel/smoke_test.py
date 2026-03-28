from __future__ import annotations

import asyncio
from types import SimpleNamespace

from .bootstrap import register_openai_compat_provider
from .providers.openai_compat import OpenAICompatProvider
from .stream import complete, stream
from .transform_messages import transform_messages
from .types import (
    AssistantMessage,
    Context,
    ImageContent,
    Model,
    OpenAICompatOptions,
    TextContent,
    ToolCallContent,
    ToolDefinition,
    ToolResultMessage,
    ThinkingContent,
    UserMessage,
)
from .validation import validate_tool_call


class _FakeOpenAIStream:
    def __init__(self, chunks):
        self._chunks = chunks

    def __aiter__(self):
        self._iter = iter(self._chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _FakeChatCompletions:
    def __init__(self, response_sets):
        self._response_sets = response_sets
        self.calls = []
        self._index = 0

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if self._index >= len(self._response_sets):
            raise RuntimeError("No fake response set remaining")
        chunks = self._response_sets[self._index]
        self._index += 1
        return _FakeOpenAIStream(chunks)


class _FakeChat:
    def __init__(self, response_sets):
        self.completions = _FakeChatCompletions(response_sets)


class _FakeClient:
    def __init__(self, response_sets):
        self.chat = _FakeChat(response_sets)


def _chunk(*, chunk_id="resp_fake", content=None, reasoning=None, tool_calls=None, finish_reason=None):
    delta = SimpleNamespace(
        content=content,
        reasoning=reasoning,
        tool_calls=tool_calls,
        reasoning_details=None,
    )
    choice = SimpleNamespace(delta=delta, finish_reason=finish_reason)
    return SimpleNamespace(id=chunk_id, choices=[choice], usage=None)


def _tool_call(index: int, tool_id: str | None = None, name: str | None = None, arguments: str | None = None):
    function = SimpleNamespace(name=name, arguments=arguments)
    return SimpleNamespace(index=index, id=tool_id, function=function)


async def run_smoke_test() -> dict[str, object]:
    first_round_chunks = [
        _chunk(reasoning="Let me think."),
        _chunk(content="Hello "),
        _chunk(content="world"),
        _chunk(tool_calls=[_tool_call(index=0, tool_id="call_1", name="lookup_weather", arguments='{"city":"Hang')]),
        _chunk(tool_calls=[_tool_call(index=0, arguments='zhou"}')]),
        _chunk(finish_reason="tool_calls"),
    ]

    client = _FakeClient([first_round_chunks, first_round_chunks])
    register_openai_compat_provider(client)

    model = Model(
        id="fake-model",
        name="Fake Model",
        api="openai-compat-chat-completions",
        provider="fake-openai",
        reasoning=True,
    )
    context = Context(
        system_prompt="You are a helpful assistant.",
        messages=[
            UserMessage(content="Say hello and call a tool if needed.", timestamp=1),
            ToolResultMessage(
                tool_call_id="old_call",
                tool_name="old_tool",
                content=[TextContent(text="old result")],
                timestamp=2,
            ),
        ],
        tools=[
            ToolDefinition(
                name="lookup_weather",
                description="Look up weather by city",
                parameters={
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"},
                    },
                    "required": ["city"],
                },
            )
        ],
    )

    event_types = []
    kernel_stream = stream(model, context)
    async for event in kernel_stream:
        event_types.append(event.type)

    final_message = await kernel_stream.result()
    second_result = await complete(model, context)

    return {
        "event_types": event_types,
        "final_stop_reason": final_message.stop_reason,
        "final_content_types": [block.type for block in final_message.content],
        "final_text": [block.text for block in final_message.content if isinstance(block, TextContent)],
        "tool_calls": [
            {"id": block.id, "name": block.name, "arguments": block.arguments}
            for block in final_message.content
            if block.type == "tool_call"
        ],
        "response_id": final_message.response_id,
        "complete_matches_stream": second_result.stop_reason == final_message.stop_reason
        and [block.type for block in second_result.content] == [block.type for block in final_message.content],
        "request_count": len(client.chat.completions.calls),
        "validated_tool_args": [
            validate_tool_call(context.tools, block)
            for block in final_message.content
            if block.type == "tool_call"
        ],
    }


async def run_multi_round_smoke_test() -> dict[str, object]:
    first_round_chunks = [
        _chunk(content="Checking weather. "),
        _chunk(tool_calls=[_tool_call(index=0, tool_id="call_weather_1", name="lookup_weather", arguments='{"city":"Hang')]),
        _chunk(tool_calls=[_tool_call(index=0, arguments='zhou"}')]),
        _chunk(finish_reason="tool_calls"),
    ]
    second_round_chunks = [
        _chunk(content="The weather in Hangzhou is sunny."),
        _chunk(finish_reason="stop"),
    ]

    client = _FakeClient([first_round_chunks, second_round_chunks])
    register_openai_compat_provider(client)

    model = Model(
        id="fake-model",
        name="Fake Model",
        api="openai-compat-chat-completions",
        provider="fake-openai",
        reasoning=True,
    )
    context = Context(
        system_prompt="You are a helpful assistant.",
        messages=[
            UserMessage(content="Check Hangzhou weather.", timestamp=1),
        ],
        tools=[
            ToolDefinition(
                name="lookup_weather",
                description="Look up weather by city",
                parameters={
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"},
                    },
                    "required": ["city"],
                },
            )
        ],
    )

    first_message = await complete(model, context)
    context.messages.append(first_message)
    context.messages.append(
        ToolResultMessage(
            tool_call_id="call_weather_1",
            tool_name="lookup_weather",
            content=[TextContent(text="Sunny, 24C")],
            timestamp=2,
        )
    )
    second_message = await complete(model, context)

    second_request_messages = client.chat.completions.calls[1]["messages"]
    assistant_tool_call_present = any(
        message.get("role") == "assistant" and message.get("tool_calls")
        for message in second_request_messages
    )
    tool_result_present = any(
        message.get("role") == "tool" and message.get("tool_call_id") == "call_weather_1"
        for message in second_request_messages
    )

    return {
        "first_stop_reason": first_message.stop_reason,
        "first_content_types": [block.type for block in first_message.content],
        "validated_first_tool_args": [
            validate_tool_call(context.tools, block)
            for block in first_message.content
            if block.type == "tool_call"
        ],
        "second_stop_reason": second_message.stop_reason,
        "second_text": [block.text for block in second_message.content if isinstance(block, TextContent)],
        "request_count": len(client.chat.completions.calls),
        "assistant_tool_call_present_in_round_2": assistant_tool_call_present,
        "tool_result_present_in_round_2": tool_result_present,
    }


async def run_validation_retry_smoke_test() -> dict[str, object]:
    first_round_chunks = [
        _chunk(tool_calls=[_tool_call(index=0, tool_id="call_retry_1", name="lookup_weather", arguments='{"city":"HZ"}')]),
        _chunk(finish_reason="tool_calls"),
    ]
    second_round_chunks = [
        _chunk(content="Retrying with corrected arguments."),
        _chunk(tool_calls=[_tool_call(index=0, tool_id="call_retry_2", name="lookup_weather", arguments='{"city":"Hangzhou","units":"celsius"}')]),
        _chunk(finish_reason="tool_calls"),
    ]

    client = _FakeClient([first_round_chunks, second_round_chunks])
    register_openai_compat_provider(client)

    tools = [
        ToolDefinition(
            name="lookup_weather",
            description="Look up weather by city",
            parameters={
                "type": "object",
                "properties": {
                    "city": {"type": "string", "minLength": 3},
                    "units": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["city", "units"],
            },
        )
    ]
    model = Model(
        id="fake-model",
        name="Fake Model",
        api="openai-compat-chat-completions",
        provider="fake-openai",
        reasoning=False,
    )
    context = Context(
        system_prompt="You are a helpful assistant.",
        messages=[UserMessage(content="Check Hangzhou weather.", timestamp=1)],
        tools=tools,
    )

    first_message = await complete(model, context)
    context.messages.append(first_message)

    validation_error = None
    for block in first_message.content:
        if block.type != "tool_call":
            continue
        try:
            validate_tool_call(tools, block)
        except Exception as exc:
            validation_error = str(exc)
            context.messages.append(
                ToolResultMessage(
                    tool_call_id=block.id,
                    tool_name=block.name,
                    content=[TextContent(text=validation_error)],
                    is_error=True,
                    timestamp=2,
                )
            )

    second_message = await complete(model, context)
    second_request_messages = client.chat.completions.calls[1]["messages"]
    error_tool_result_present = any(
        message.get("role") == "tool"
        and message.get("tool_call_id") == "call_retry_1"
        and validation_error in (message.get("content") or "")
        for message in second_request_messages
    )

    return {
        "first_stop_reason": first_message.stop_reason,
        "validation_error": validation_error,
        "error_tool_result_present_in_round_2": error_tool_result_present,
        "second_stop_reason": second_message.stop_reason,
        "second_content_types": [block.type for block in second_message.content],
        "second_tool_calls": [
            {"id": block.id, "name": block.name, "arguments": block.arguments}
            for block in second_message.content
            if block.type == "tool_call"
        ],
    }


def run_payload_conversion_smoke_test() -> dict[str, object]:
    client = _FakeClient([])
    provider = OpenAICompatProvider(client)
    model = Model(
        id="fake-model",
        name="Fake Model",
        api="openai-compat-chat-completions",
        provider="fake-openai",
        image_input=True,
    )
    assistant_message = AssistantMessage(
        content=[],
        api=model.api,
        provider=model.provider,
        model=model.id,
    )
    tool_result = ToolResultMessage(
        tool_call_id="call_image_1",
        tool_name="render_chart",
        content=[
            TextContent(text="Chart rendered successfully"),
            ImageContent(data="ZmFrZV9pbWFnZQ==", mime_type="image/png"),
        ],
        timestamp=2,
    )
    context = Context(
        system_prompt="You are a helpful assistant.",
        messages=[
            UserMessage(content="Show me the chart.", timestamp=1),
            assistant_message,
            tool_result,
        ],
    )

    payload = provider._build_payload(
        model,
        context,
        options=OpenAICompatOptions(),
    )
    messages = payload["messages"]
    return {
        "message_roles": [message["role"] for message in messages],
        "empty_assistant_removed": not any(
            message["role"] == "assistant" and message.get("content") is None and not message.get("tool_calls")
            for message in messages
        ),
        "tool_message_present": any(message["role"] == "tool" for message in messages),
        "tool_result_image_replayed_as_user_image": any(
            message["role"] == "user"
            and isinstance(message.get("content"), list)
            and any(part.get("type") == "image_url" for part in message["content"])
            for message in messages
        ),
    }


def run_thinking_replay_smoke_test() -> dict[str, object]:
    client = _FakeClient([])
    provider = OpenAICompatProvider(client)
    model = Model(
        id="fake-model",
        name="Fake Model",
        api="openai-compat-chat-completions",
        provider="fake-openai",
        image_input=False,
    )
    same_model_assistant = AssistantMessage(
        content=[
            ThinkingContent(thinking="internal chain", thinking_signature="reasoning"),
            TextContent(text="final answer"),
        ],
        api=model.api,
        provider=model.provider,
        model=model.id,
    )
    cross_model_assistant = AssistantMessage(
        content=[
            ThinkingContent(thinking="cross model thought", thinking_signature="reasoning"),
        ],
        api=model.api,
        provider=model.provider,
        model="different-model",
    )

    same_payload = provider._build_payload(
        model,
        Context(messages=[same_model_assistant]),
        options=OpenAICompatOptions(),
    )["messages"][0]
    transformed_cross = transform_messages([cross_model_assistant], model)
    cross_payload = provider._build_payload(
        model,
        Context(messages=transformed_cross),
        options=OpenAICompatOptions(),
    )["messages"][0]

    return {
        "same_model_has_reasoning_field": "reasoning" in same_payload,
        "same_model_content": same_payload.get("content"),
        "cross_model_content": cross_payload.get("content"),
        "cross_model_has_reasoning_field": "reasoning" in cross_payload,
    }


def run_validation_failure_smoke_test() -> dict[str, object]:
    tools = [
        ToolDefinition(
            name="lookup_weather",
            description="Look up weather by city",
            parameters={
                "type": "object",
                "properties": {
                    "city": {"type": "string", "minLength": 3},
                    "units": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["city", "units"],
            },
        )
    ]
    invalid_tool_call = AssistantMessage(
        content=[],
        api="openai-compat-chat-completions",
        provider="fake-openai",
        model="fake-model",
    )
    tool_call = _tool_call(index=0, tool_id="call_invalid", name="lookup_weather", arguments='{"city":"HZ"}')
    block = _tool_call_to_content_block(tool_call)
    invalid_tool_call.content.append(block)

    try:
        validate_tool_call(tools, block)
    except Exception as exc:
        return {
            "validation_failed": True,
            "error_message": str(exc),
            "tool_call_name": block.name,
            "partial_arguments": block.arguments,
        }

    return {
        "validation_failed": False,
        "tool_call_name": block.name,
    }


def _tool_call_to_content_block(tool_call) -> object:
    block = ToolCallContent()
    block.id = getattr(tool_call, "id", "") or ""
    block.name = getattr(tool_call.function, "name", "") or ""
    raw_arguments = getattr(tool_call.function, "arguments", "") or ""
    block.partial_arguments_raw = raw_arguments
    import json as _json

    try:
        parsed = _json.loads(raw_arguments)
        block.arguments = parsed if isinstance(parsed, dict) else {"value": parsed}
    except Exception:
        block.arguments = {"_partial": raw_arguments}
    return block


def main() -> None:
    result = asyncio.run(
        _run_all_smoke_tests()
    )
    print(result)


async def _run_all_smoke_tests() -> dict[str, object]:
    basic = await run_smoke_test()
    multi_round = await run_multi_round_smoke_test()
    validation_failure = run_validation_failure_smoke_test()
    validation_retry = await run_validation_retry_smoke_test()
    payload_conversion = run_payload_conversion_smoke_test()
    thinking_replay = run_thinking_replay_smoke_test()
    return {
        "basic": basic,
        "multi_round": multi_round,
        "validation_failure": validation_failure,
        "validation_retry": validation_retry,
        "payload_conversion": payload_conversion,
        "thinking_replay": thinking_replay,
    }


if __name__ == "__main__":
    main()
