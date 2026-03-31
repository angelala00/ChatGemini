from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace

from app.llm_kernel.api_registry import clear_api_providers, get_api_provider, list_registered_apis
from app.llm_kernel.models import (
    ModelRegistry,
    clear_models,
    get_model,
    get_models,
    get_providers,
    has_model,
    models_are_equal,
    register_model,
    register_models,
    supports_xhigh,
)
from app.llm_kernel.providers.openai_compat import OpenAICompatProvider
from app.llm_kernel.stream import complete, register_provider
from app.llm_kernel.transform_messages import transform_messages
from app.llm_kernel.types import (
    AssistantMessage,
    Context,
    ImageContent,
    Model,
    ModelCost,
    OpenAICompatOptions,
    OpenAICompletionsCompat,
    TextContent,
    ThinkingContent,
    ToolCallContent,
    ToolDefinition,
    ToolResultMessage,
    UserMessage,
)
from app.llm_kernel.validation import validate_tool_call


class FakeOpenAIStream:
    def __init__(self, chunks):
        self._chunks = chunks

    def __aiter__(self):
        self._iterator = iter(self._chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class FakeChatCompletions:
    def __init__(self, response_sets):
        self._response_sets = response_sets
        self.calls = []
        self.index = 0

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        chunks = self._response_sets[self.index]
        self.index += 1
        return FakeOpenAIStream(chunks)


class FakeChat:
    def __init__(self, response_sets):
        self.completions = FakeChatCompletions(response_sets)


class FakeClient:
    def __init__(self, response_sets):
        self.chat = FakeChat(response_sets)


class CancelledChatCompletions:
    async def create(self, **kwargs):
        raise asyncio.CancelledError()


class CancelledChat:
    def __init__(self):
        self.completions = CancelledChatCompletions()


class CancelledClient:
    def __init__(self):
        self.chat = CancelledChat()


def chunk(*, chunk_id="resp_fake", content=None, reasoning=None, tool_calls=None, finish_reason=None, usage=None):
    delta = SimpleNamespace(
        content=content,
        reasoning=reasoning,
        tool_calls=tool_calls,
        reasoning_details=None,
    )
    choice = SimpleNamespace(delta=delta, finish_reason=finish_reason)
    return SimpleNamespace(id=chunk_id, choices=[choice], usage=usage)


def tool_call(index: int, tool_id: str | None = None, name: str | None = None, arguments: str | None = None):
    function = SimpleNamespace(name=name, arguments=arguments)
    return SimpleNamespace(index=index, id=tool_id, function=function)


def build_model(**overrides):
    params = {
        "id": "fake-model",
        "name": "Fake Model",
        "api": "openai-compat-chat-completions",
        "provider": "fake-openai",
        "reasoning": False,
        "input": ["text"],
        "image_input": False,
    }
    params.update(overrides)
    return Model(**params)


class LLMKernelTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        clear_api_providers()
        clear_models()
        self.tools = [
            ToolDefinition(
                name="lookup_weather",
                description="Look up weather by city",
                parameters={
                    "type": "object",
                    "properties": {
                        "city": {"type": "string", "minLength": 3},
                        "units": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                    },
                    "required": ["city"],
                },
            )
        ]

    def test_api_registry_registers_and_lists_provider(self):
        provider = OpenAICompatProvider(FakeClient([]))
        register_provider(provider)

        self.assertIs(get_api_provider("openai-compat-chat-completions"), provider)
        self.assertEqual(list_registered_apis(), ["openai-compat-chat-completions"])

    def test_model_registry_helpers_are_queryable_and_sorted(self):
        alpha = build_model(id="alpha", provider="provider-b")
        beta = build_model(id="beta", provider="provider-a")
        gamma = build_model(id="gamma", provider="provider-a")
        register_models([alpha, gamma, beta])

        self.assertEqual(get_providers(), ["provider-a", "provider-b"])
        self.assertEqual([model.id for model in get_models("provider-a")], ["beta", "gamma"])
        self.assertTrue(has_model("provider-b", "alpha"))
        self.assertIs(get_model("provider-b", "alpha"), alpha)

    def test_model_registry_instance_supports_batch_register_and_clear(self):
        registry = ModelRegistry()
        alpha = build_model(id="alpha", provider="provider-a")
        beta = build_model(id="beta", provider="provider-a")
        registry.register_many([beta, alpha])

        self.assertEqual([model.id for model in registry.get_models("provider-a")], ["alpha", "beta"])
        self.assertTrue(registry.has_model("provider-a", "alpha"))

        registry.clear()
        self.assertEqual(registry.get_providers(), [])

    def test_model_helpers_match_pi_ai_style_model_comparisons(self):
        openai_gpt = build_model(id="gpt-5.4", provider="openai")
        openai_same = build_model(id="gpt-5.4", provider="openai")
        anthropic_same_id = build_model(id="gpt-5.4", provider="anthropic")
        opus = build_model(id="opus-4.6", provider="anthropic")
        metadata_xhigh = build_model(id="custom-model", provider="custom", metadata={"supports_xhigh": True})

        self.assertTrue(models_are_equal(openai_gpt, openai_same))
        self.assertFalse(models_are_equal(openai_gpt, anthropic_same_id))
        self.assertFalse(models_are_equal(openai_gpt, None))
        self.assertTrue(supports_xhigh(openai_gpt))
        self.assertTrue(supports_xhigh(opus))
        self.assertTrue(supports_xhigh(metadata_xhigh))

    def test_model_normalizes_pi_ai_style_capability_fields(self):
        model = build_model(
            input=["image"],
            image_input=False,
            context_window=200000,
            max_output_tokens=8192,
            headers={"x-test": "1"},
            compat={"requires_tool_result_name": True},
        )

        self.assertEqual(model.input, ["text", "image"])
        self.assertTrue(model.supports_input("text"))
        self.assertTrue(model.supports_input("image"))
        self.assertTrue(model.image_input)
        self.assertEqual(model.context_window, 200000)
        self.assertEqual(model.max_output_tokens, 8192)
        self.assertEqual(model.headers["x-test"], "1")
        self.assertIsInstance(model.compat, OpenAICompletionsCompat)
        self.assertEqual(model.compat.requires_tool_result_name, True)

    async def test_stream_complete_round_trip_with_tool_use(self):
        client = FakeClient(
            [[
                chunk(reasoning="Let me think."),
                chunk(content="Hello "),
                chunk(content="world"),
                chunk(tool_calls=[tool_call(index=0, tool_id="call_1", name="lookup_weather", arguments='{"city":"Hang')]),
                chunk(tool_calls=[tool_call(index=0, arguments='zhou"}')]),
                chunk(finish_reason="tool_calls"),
            ]]
        )
        register_provider(OpenAICompatProvider(client))

        model = build_model(reasoning=True)
        context = Context(
            system_prompt="You are a helpful assistant.",
            messages=[UserMessage(content="Say hello.", timestamp=1)],
            tools=self.tools,
        )

        message = await complete(model, context)

        self.assertEqual(message.stop_reason, "tool_use")
        self.assertEqual([block.type for block in message.content], ["thinking", "text", "tool_call"])
        self.assertEqual(
            [block.arguments for block in message.content if isinstance(block, ToolCallContent)],
            [{"city": "Hangzhou"}],
        )

    async def test_multi_round_tool_continuation_replays_tool_result(self):
        client = FakeClient(
            [
                [
                    chunk(content="Checking weather. "),
                    chunk(tool_calls=[tool_call(index=0, tool_id="call_weather_1", name="lookup_weather", arguments='{"city":"Hangzhou"}')]),
                    chunk(finish_reason="tool_calls"),
                ],
                [
                    chunk(content="The weather in Hangzhou is sunny."),
                    chunk(finish_reason="stop"),
                ],
            ]
        )
        register_provider(OpenAICompatProvider(client))

        model = build_model(reasoning=True)
        context = Context(
            system_prompt="You are a helpful assistant.",
            messages=[UserMessage(content="Check Hangzhou weather.", timestamp=1)],
            tools=self.tools,
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
        self.assertEqual(first_message.stop_reason, "tool_use")
        self.assertEqual(second_message.stop_reason, "stop")
        self.assertTrue(any(message.get("role") == "tool" for message in second_request_messages))
        self.assertEqual(
            [block.text for block in second_message.content if isinstance(block, TextContent)],
            ["The weather in Hangzhou is sunny."],
        )

    def test_validate_tool_call_success_and_failure(self):
        valid_call = ToolCallContent(
            id="call_valid",
            name="lookup_weather",
            arguments={"city": "Hangzhou", "units": "celsius"},
        )
        invalid_call = ToolCallContent(
            id="call_invalid",
            name="lookup_weather",
            arguments={"city": "HZ"},
        )

        validated = validate_tool_call(self.tools, valid_call)
        self.assertEqual(validated, {"city": "Hangzhou", "units": "celsius"})

        with self.assertRaisesRegex(ValueError, 'root.city must be at least 3 characters|root.units is required'):
            validate_tool_call(self.tools, invalid_call)

    def test_validate_tool_call_coerces_scalar_types_and_enforces_stricter_schema_rules(self):
        tool = ToolDefinition(
            name="search_catalog",
            description="Search catalog with strict arguments",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "query": {"type": "string", "minLength": 2, "maxLength": 10},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 20},
                    "exact": {"type": "boolean"},
                    "scores": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 2,
                        "items": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                },
                "required": ["query", "limit", "exact", "scores"],
            },
        )
        call = ToolCallContent(
            id="call_coerce",
            name="search_catalog",
            arguments={
                "query": 1234,
                "limit": "5",
                "exact": "true",
                "scores": ["0.3", 1],
            },
        )

        validated = validate_tool_call([tool], call)

        self.assertEqual(
            validated,
            {
                "query": "1234",
                "limit": 5,
                "exact": True,
                "scores": [0.3, 1],
            },
        )

    def test_validate_tool_call_rejects_additional_properties_and_max_constraints(self):
        tool = ToolDefinition(
            name="search_catalog",
            description="Search catalog with strict arguments",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "query": {"type": "string", "maxLength": 3},
                    "scores": {
                        "type": "array",
                        "maxItems": 1,
                        "items": {"type": "number", "maximum": 1},
                    },
                },
                "required": ["query", "scores"],
            },
        )

        with self.assertRaisesRegex(ValueError, "root.extra is not allowed"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_extra",
                    name="search_catalog",
                    arguments={"query": "abc", "scores": [0.5], "extra": "nope"},
                ),
            )

        with self.assertRaisesRegex(ValueError, "root.query must be at most 3 characters"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_long",
                    name="search_catalog",
                    arguments={"query": "abcd", "scores": [0.5]},
                ),
            )

        with self.assertRaisesRegex(ValueError, "root.scores must contain at most 1 item\\(s\\)"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_many",
                    name="search_catalog",
                    arguments={"query": "abc", "scores": [0.5, 0.6]},
                ),
            )

    def test_validate_tool_call_supports_pattern_nullable_and_additional_property_schema(self):
        tool = ToolDefinition(
            name="submit_profile",
            description="Submit a profile with schema-rich validation",
            parameters={
                "type": "object",
                "minProperties": 2,
                "maxProperties": 4,
                "additionalProperties": {"type": "integer", "minimum": 0},
                "properties": {
                    "email": {"type": "string", "pattern": r"^[^@\s]+@[^@\s]+\.[^@\s]+$"},
                    "nickname": {"type": ["string", "null"], "maxLength": 8},
                },
                "required": ["email"],
            },
        )

        validated = validate_tool_call(
            [tool],
            ToolCallContent(
                id="call_profile",
                name="submit_profile",
                arguments={
                    "email": "user@example.com",
                    "nickname": None,
                    "age": "3",
                },
            ),
        )

        self.assertEqual(
            validated,
            {
                "email": "user@example.com",
                "nickname": None,
                "age": 3,
            },
        )

    def test_validate_tool_call_rejects_pattern_and_property_count_violations(self):
        tool = ToolDefinition(
            name="submit_profile",
            description="Submit a profile with schema-rich validation",
            parameters={
                "type": "object",
                "minProperties": 2,
                "maxProperties": 3,
                "additionalProperties": {"type": "integer", "minimum": 0},
                "properties": {
                    "email": {"type": "string", "pattern": r"^[^@\s]+@[^@\s]+\.[^@\s]+$"},
                    "nickname": {"type": ["string", "null"], "maxLength": 8},
                },
                "required": ["email"],
            },
        )

        with self.assertRaisesRegex(ValueError, "root.email must match pattern"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_bad_pattern",
                    name="submit_profile",
                    arguments={"email": "not-an-email", "age": "3"},
                ),
            )

        with self.assertRaisesRegex(ValueError, "root must contain at least 2 propertie\\(s\\)"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_too_few",
                    name="submit_profile",
                    arguments={"email": "user@example.com"},
                ),
            )

        with self.assertRaisesRegex(ValueError, "root must contain at most 3 propertie\\(s\\)"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_too_many",
                    name="submit_profile",
                    arguments={
                        "email": "user@example.com",
                        "nickname": "hello",
                        "age": "3",
                        "score": "4",
                    },
                ),
            )

    def test_validate_tool_call_supports_jsonschema_format_rules(self):
        tool = ToolDefinition(
            name="submit_contact",
            description="Submit contact info with format validation",
            parameters={
                "type": "object",
                "properties": {
                    "email": {"type": "string", "format": "email"},
                },
                "required": ["email"],
            },
        )

        validated = validate_tool_call(
            [tool],
            ToolCallContent(
                id="call_contact_ok",
                name="submit_contact",
                arguments={"email": "user@example.com"},
            ),
        )
        self.assertEqual(validated, {"email": "user@example.com"})

        with self.assertRaisesRegex(ValueError, "root.email must match format email"):
            validate_tool_call(
                [tool],
                ToolCallContent(
                    id="call_contact_bad",
                    name="submit_contact",
                    arguments={"email": "not-an-email"},
                ),
            )

    def test_transform_messages_preserves_same_model_thinking_and_downgrades_cross_model(self):
        model = build_model()
        same_model_assistant = AssistantMessage(
            content=[ThinkingContent(thinking="", thinking_signature="reasoning", redacted=False)],
            api=model.api,
            provider=model.provider,
            model=model.id,
        )
        different_model_assistant = AssistantMessage(
            content=[ThinkingContent(thinking="cross model thought", thinking_signature="reasoning")],
            api=model.api,
            provider=model.provider,
            model="different-model",
        )

        transformed = transform_messages([same_model_assistant, different_model_assistant], model)

        self.assertIsInstance(transformed[0].content[0], ThinkingContent)
        self.assertIsInstance(transformed[1].content[0], TextContent)
        self.assertEqual(transformed[1].content[0].text, "cross model thought")

    def test_openai_payload_replays_tool_result_images_as_user_images(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(input=["text", "image"])
        context = Context(
            system_prompt="You are a helpful assistant.",
            messages=[
                UserMessage(content="Show me the chart.", timestamp=1),
                AssistantMessage(content=[], api=model.api, provider=model.provider, model=model.id),
                ToolResultMessage(
                    tool_call_id="call_image_1",
                    tool_name="render_chart",
                    content=[
                        TextContent(text="Chart rendered successfully"),
                        ImageContent(data="ZmFrZV9pbWFnZQ==", mime_type="image/png"),
                    ],
                    timestamp=2,
                ),
            ],
        )

        payload = provider._build_payload(
            model,
            context,
            options=OpenAICompatOptions(),
        )
        roles = [message["role"] for message in payload["messages"]]

        self.assertEqual(roles, ["system", "user", "tool", "assistant", "user"])
        self.assertTrue(
            any(
                message["role"] == "user"
                and isinstance(message.get("content"), list)
                and any(part.get("type") == "image_url" for part in message["content"])
                for message in payload["messages"]
            )
        )

    def test_openai_payload_keeps_same_model_thinking_signature(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model()
        assistant_message = AssistantMessage(
            content=[
                ThinkingContent(thinking="internal chain", thinking_signature="reasoning"),
                TextContent(text="final answer"),
            ],
            api=model.api,
            provider=model.provider,
            model=model.id,
        )

        payload = provider._build_payload(
            model,
            Context(messages=[assistant_message]),
            options=OpenAICompatOptions(),
        )
        message = payload["messages"][0]

        self.assertIn("reasoning", message)
        self.assertEqual(message["content"], "final answer")

    def test_openai_compat_options_are_applied_to_payload(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(reasoning=True, headers={"x-model-header": "yes"})
        payload = provider._build_payload(
            model,
            Context(messages=[UserMessage(content="hello", timestamp=1)]),
            options=OpenAICompatOptions(
                max_tokens=123,
                temperature=0.2,
                tool_choice="required",
                reasoning_effort="high",
            ),
        )

        self.assertEqual(payload["max_tokens"], 123)
        self.assertEqual(payload["temperature"], 0.2)
        self.assertEqual(payload["tool_choice"], "required")
        self.assertEqual(payload["reasoning_effort"], "high")
        self.assertEqual(payload["extra_headers"]["x-model-header"], "yes")
        self.assertEqual(payload["stream_options"], {"include_usage": True})

    def test_openai_compat_respects_model_compat_overrides(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(
            reasoning=True,
            compat={
                "supports_developer_role": True,
                "supports_reasoning_effort": False,
                "max_tokens_field": "max_completion_tokens",
            },
        )
        payload = provider._build_payload(
            model,
            Context(
                system_prompt="You are a reasoning assistant.",
                messages=[UserMessage(content="hello", timestamp=1)],
            ),
            options=OpenAICompatOptions(
                max_tokens=123,
                reasoning_effort="high",
            ),
        )

        self.assertEqual(payload["messages"][0]["role"], "developer")
        self.assertEqual(payload["max_completion_tokens"], 123)
        self.assertNotIn("max_tokens", payload)
        self.assertNotIn("reasoning_effort", payload)

    def test_openai_compat_supports_openrouter_reasoning_format(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(
            reasoning=True,
            compat={
                "reasoning_parameter_format": "openrouter",
                "reasoning_effort_map": {"high": "adaptive"},
            },
        )
        payload = provider._build_payload(
            model,
            Context(messages=[UserMessage(content="hello", timestamp=1)]),
            options=OpenAICompatOptions(reasoning_effort="high"),
        )

        self.assertEqual(payload["extra_body"]["reasoning"], {"effort": "adaptive"})
        self.assertNotIn("reasoning_effort", payload)

    def test_openai_compat_supports_qwen_chat_template_reasoning_format(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(
            reasoning=True,
            compat={
                "reasoning_parameter_format": "qwen-chat-template",
            },
        )
        payload = provider._build_payload(
            model,
            Context(messages=[UserMessage(content="hello", timestamp=1)]),
            options=OpenAICompatOptions(reasoning_effort="medium"),
        )

        self.assertEqual(
            payload["extra_body"]["chat_template_kwargs"],
            {"enable_thinking": True},
        )
        self.assertNotIn("reasoning_effort", payload)

    def test_openai_compat_can_disable_tool_name_bridge_and_signature_replay(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(
            input=["text", "image"],
            compat={
                "requires_tool_result_name": False,
                "requires_assistant_after_tool_result": False,
                "requires_thinking_as_text": True,
            },
        )
        context = Context(
            messages=[
                AssistantMessage(
                    content=[
                        ThinkingContent(thinking="internal chain", thinking_signature="reasoning"),
                        TextContent(text="final answer"),
                    ],
                    api=model.api,
                    provider=model.provider,
                    model=model.id,
                ),
                ToolResultMessage(
                    tool_call_id="call_image_1",
                    tool_name="render_chart",
                    content=[
                        TextContent(text="Chart rendered successfully"),
                        ImageContent(data="ZmFrZV9pbWFnZQ==", mime_type="image/png"),
                    ],
                    timestamp=2,
                ),
            ],
        )

        payload = provider._build_payload(
            model,
            context,
            options=OpenAICompatOptions(),
        )
        assistant_message = payload["messages"][0]
        tool_message = payload["messages"][1]
        image_replay_message = payload["messages"][2]

        self.assertEqual(assistant_message["content"], "internal chainfinal answer")
        self.assertNotIn("reasoning", assistant_message)
        self.assertEqual(tool_message["role"], "tool")
        self.assertNotIn("name", tool_message)
        self.assertEqual(image_replay_message["role"], "user")

    async def test_openai_stream_usage_parses_cache_and_reasoning_tokens(self):
        usage = SimpleNamespace(
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            prompt_tokens_details=SimpleNamespace(cached_tokens=30),
            completion_tokens_details=SimpleNamespace(reasoning_tokens=20),
        )
        client = FakeClient(
            [[
                chunk(content="Hello", usage=usage),
                chunk(finish_reason="stop"),
            ]]
        )
        register_provider(OpenAICompatProvider(client))

        model = build_model(
            reasoning=True,
            cost=ModelCost(input=1.0, output=2.0, cache_read=0.5, cache_write=0.0),
        )
        context = Context(messages=[UserMessage(content="hello", timestamp=1)])

        message = await complete(model, context)

        self.assertEqual(message.usage.input, 70)
        self.assertEqual(message.usage.output, 70)
        self.assertEqual(message.usage.cache_read, 30)
        self.assertEqual(message.usage.total_tokens, 170)
        self.assertGreater(message.usage.cost.total, 0.0)

    def test_openai_compat_can_disable_stream_usage_request(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(
            compat={"supports_usage_in_streaming": False},
        )
        payload = provider._build_payload(
            model,
            Context(messages=[UserMessage(content="hello", timestamp=1)]),
            options=OpenAICompatOptions(include_usage=True),
        )

        self.assertNotIn("stream_options", payload)

    def test_openai_tools_include_strict_flag_by_default(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model()
        payload = provider._build_payload(
            model,
            Context(
                messages=[UserMessage(content="hello", timestamp=1)],
                tools=self.tools,
            ),
            options=OpenAICompatOptions(),
        )

        self.assertEqual(payload["tools"][0]["function"]["strict"], False)

    def test_openai_compat_can_disable_strict_and_still_send_empty_tools_for_history(self):
        provider = OpenAICompatProvider(FakeClient([]))
        model = build_model(
            compat={"supports_strict_mode": False},
        )
        payload_with_tools = provider._build_payload(
            model,
            Context(
                messages=[UserMessage(content="hello", timestamp=1)],
                tools=self.tools,
            ),
            options=OpenAICompatOptions(),
        )
        payload_with_history = provider._build_payload(
            model,
            Context(
                messages=[
                    AssistantMessage(
                        content=[ToolCallContent(id="call_1", name="lookup_weather", arguments={"city": "HZ"})],
                        api=model.api,
                        provider=model.provider,
                        model=model.id,
                    ),
                    ToolResultMessage(
                        tool_call_id="call_1",
                        tool_name="lookup_weather",
                        content=[TextContent(text="bad input")],
                        timestamp=2,
                    ),
                ],
            ),
            options=OpenAICompatOptions(),
        )

        self.assertNotIn("strict", payload_with_tools["tools"][0]["function"])
        self.assertEqual(payload_with_history["tools"], [])

    async def test_openai_finish_reason_content_filter_becomes_error(self):
        client = FakeClient(
            [[
                chunk(content="blocked"),
                chunk(finish_reason="content_filter"),
            ]]
        )
        register_provider(OpenAICompatProvider(client))

        model = build_model()
        message = await complete(model, Context(messages=[UserMessage(content="hello", timestamp=1)]))

        self.assertEqual(message.stop_reason, "error")
        self.assertEqual(message.error_message, "Provider finish_reason: content_filter")

    async def test_openai_unknown_finish_reason_becomes_error(self):
        client = FakeClient(
            [[
                chunk(finish_reason="provider_weird_failure"),
            ]]
        )
        register_provider(OpenAICompatProvider(client))

        model = build_model()
        message = await complete(model, Context(messages=[UserMessage(content="hello", timestamp=1)]))

        self.assertEqual(message.stop_reason, "error")
        self.assertEqual(message.error_message, "Provider finish_reason: provider_weird_failure")

    async def test_openai_cancelled_request_becomes_aborted(self):
        register_provider(OpenAICompatProvider(CancelledClient()))

        model = build_model()
        message = await complete(model, Context(messages=[UserMessage(content="hello", timestamp=1)]))

        self.assertEqual(message.stop_reason, "aborted")


if __name__ == "__main__":
    unittest.main()
