from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.agent_runtime_v3 import (
    AgentRuntimeV3,
    RuntimeLimits,
    RuntimeRequest,
    adapt_runtime_stream,
)
from app.llm_kernel import (
    AssistantMessage,
    Model,
    TextContent,
    ToolCallContent,
    ToolDefinition,
    ToolResultMessage,
    UserMessage,
)
from app.llm_kernel.event_stream import EventStream


def build_model() -> Model:
    return Model(
        id="fake-model",
        name="Fake Model",
        api="fake-api",
        provider="fake-provider",
    )


def build_tool() -> ToolDefinition:
    return ToolDefinition(
        name="lookup",
        description="Look up a value",
        parameters={"type": "object", "properties": {}},
    )


class FakeModelStreamer:
    def __init__(self, messages: list[AssistantMessage]) -> None:
        self._messages = list(messages)
        self.contexts = []

    def __call__(self, model, context, options=None):
        self.contexts.append(context)
        message = self._messages.pop(0)
        stream = EventStream()
        stream.push(SimpleNamespace(type="text_delta", delta="chunk"))
        stream.finish(message)
        return stream


async def collect(runtime_stream):
    events = [event async for event in runtime_stream]
    result = await runtime_stream.result()
    return events, result


class AgentRuntimeV3Tests(unittest.IsolatedAsyncioTestCase):
    async def test_text_response_completes_without_capability_execution(self):
        streamer = FakeModelStreamer(
            [AssistantMessage(content=[TextContent(text="hello")], stop_reason="stop")]
        )
        runtime = AgentRuntimeV3(model_streamer=streamer)

        events, result = await collect(
            runtime.run(
                RuntimeRequest(
                    run_id="run-text",
                    model=build_model(),
                    messages=[UserMessage(content="hello")],
                )
            )
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.steps, 1)
        self.assertEqual(
            [event.type for event in events],
            [
                "run_started",
                "step_started",
                "model_event",
                "step_completed",
                "run_completed",
            ],
        )

    async def test_transport_adapter_receives_runtime_events(self):
        streamer = FakeModelStreamer(
            [AssistantMessage(content=[TextContent(text="hello")], stop_reason="stop")]
        )
        runtime = AgentRuntimeV3(model_streamer=streamer)
        runtime_stream = runtime.run(
            RuntimeRequest(
                run_id="run-adapter",
                model=build_model(),
                messages=[UserMessage(content="hello")],
            )
        )

        class EventNameAdapter:
            def adapt(self, event):
                return [event.type]

        outputs = [
            output
            async for output in adapt_runtime_stream(runtime_stream, EventNameAdapter())
        ]
        result = await runtime_stream.result()

        self.assertEqual(result.status, "completed")
        self.assertEqual(outputs[-1], "run_completed")

    async def test_tool_result_is_added_before_the_next_model_step(self):
        streamer = FakeModelStreamer(
            [
                AssistantMessage(
                    content=[ToolCallContent(id="call-1", name="lookup", arguments={})],
                    stop_reason="tool_use",
                ),
                AssistantMessage(content=[TextContent(text="answer")], stop_reason="stop"),
            ]
        )
        execution_requests = []

        async def execute(request):
            execution_requests.append(request)
            return [
                ToolResultMessage(
                    tool_call_id="call-1",
                    tool_name="lookup",
                    content=[TextContent(text="result")],
                )
            ]

        runtime = AgentRuntimeV3(
            model_streamer=streamer,
            capability_executor=execute,
        )
        events, result = await collect(
            runtime.run(
                RuntimeRequest(
                    run_id="run-tool",
                    model=build_model(),
                    messages=[UserMessage(content="question")],
                    tools=[build_tool()],
                    metadata={"user_id": "u-1"},
                )
            )
        )

        self.assertEqual(result.status, "completed")
        self.assertEqual(result.steps, 2)
        self.assertEqual(len(execution_requests), 1)
        self.assertEqual(execution_requests[0].metadata, {"user_id": "u-1"})
        self.assertIsInstance(streamer.contexts[1].messages[-1], ToolResultMessage)
        self.assertIn("capability_execution_completed", [event.type for event in events])

    async def test_missing_executor_returns_failed_result(self):
        streamer = FakeModelStreamer(
            [
                AssistantMessage(
                    content=[ToolCallContent(id="call-1", name="lookup", arguments={})],
                    stop_reason="tool_use",
                )
            ]
        )
        runtime = AgentRuntimeV3(model_streamer=streamer)

        events, result = await collect(
            runtime.run(
                RuntimeRequest(
                    run_id="run-no-executor",
                    model=build_model(),
                    messages=[UserMessage(content="question")],
                    tools=[build_tool()],
                )
            )
        )

        self.assertEqual(result.status, "failed")
        self.assertIn("no executor", result.error)
        self.assertEqual(events[-1].type, "run_failed")

    async def test_max_steps_stops_repeated_tool_calls(self):
        tool_message = AssistantMessage(
            content=[ToolCallContent(id="call-1", name="lookup", arguments={})],
            stop_reason="tool_use",
        )
        streamer = FakeModelStreamer([tool_message, tool_message])

        async def execute(request):
            return [
                ToolResultMessage(
                    tool_call_id="call-1",
                    tool_name="lookup",
                    content=[TextContent(text="result")],
                )
            ]

        runtime = AgentRuntimeV3(
            model_streamer=streamer,
            capability_executor=execute,
        )
        _, result = await collect(
            runtime.run(
                RuntimeRequest(
                    run_id="run-limit",
                    model=build_model(),
                    messages=[UserMessage(content="question")],
                    tools=[build_tool()],
                    limits=RuntimeLimits(max_steps=2),
                )
            )
        )

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.steps, 2)
        self.assertIn("maximum steps", result.error)

    async def test_model_failure_becomes_failed_run(self):
        streamer = FakeModelStreamer(
            [AssistantMessage(stop_reason="error", error_message="provider failed")]
        )
        runtime = AgentRuntimeV3(model_streamer=streamer)

        _, result = await collect(
            runtime.run(
                RuntimeRequest(
                    run_id="run-error",
                    model=build_model(),
                    messages=[UserMessage(content="hello")],
                )
            )
        )

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error, "Model execution failed.")
        self.assertEqual(result.error_code, "MODEL_EXECUTION_FAILED")
        self.assertTrue(result.retryable)


if __name__ == "__main__":
    unittest.main()
