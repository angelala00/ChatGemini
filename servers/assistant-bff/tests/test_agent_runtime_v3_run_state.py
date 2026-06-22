from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace

from app.agent_runtime_v3 import (
    AgentRuntimeV3,
    InMemoryRunStore,
    RunTracker,
    RuntimeLimits,
    RuntimeRequest,
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


def model() -> Model:
    return Model(
        id="fake-model",
        name="Fake Model",
        api="fake-api",
        provider="fake-provider",
    )


class FakeModelStreamer:
    def __init__(self, messages):
        self._messages = list(messages)

    def __call__(self, model, context, options=None):
        stream = EventStream()
        stream.push(SimpleNamespace(type="text_delta", delta="chunk"))
        stream.finish(self._messages.pop(0))
        return stream


class CollectingObserver:
    def __init__(self):
        self.events = []

    def record(self, event, payload):
        self.events.append((event, payload))


async def consume(runtime_stream):
    _ = [event async for event in runtime_stream]
    return await runtime_stream.result()


class AgentRuntimeV3RunStateTests(unittest.IsolatedAsyncioTestCase):
    async def test_completed_run_records_status_step_and_duration(self):
        store = InMemoryRunStore()
        observer = CollectingObserver()
        runtime = AgentRuntimeV3(
            model_streamer=FakeModelStreamer(
                [AssistantMessage(content=[TextContent(text="ok")], stop_reason="stop")]
            ),
            run_tracker=RunTracker(store, observer=observer),
        )

        await consume(
            runtime.run(
                RuntimeRequest(
                    run_id="run-complete",
                    model=model(),
                    messages=[UserMessage(content="hello")],
                    metadata={"agent_id": "agent-1"},
                )
            )
        )
        record = store.get("run-complete")

        self.assertEqual(record.status, "completed")
        self.assertEqual(record.metadata["agent_id"], "agent-1")
        self.assertIsNotNone(record.duration_ms)
        self.assertEqual(len(record.steps), 1)
        self.assertEqual(record.steps[0].status, "completed")
        self.assertIn("run.finished", [event for event, _ in observer.events])

    async def test_tool_call_and_result_are_recorded_as_action_call(self):
        store = InMemoryRunStore()
        streamer = FakeModelStreamer(
            [
                AssistantMessage(
                    content=[
                        ToolCallContent(
                            id="call-1",
                            name="lookup",
                            arguments={"query": "value"},
                        )
                    ],
                    stop_reason="tool_use",
                ),
                AssistantMessage(content=[TextContent(text="done")], stop_reason="stop"),
            ]
        )

        async def execute(request):
            return [
                ToolResultMessage(
                    tool_call_id="call-1",
                    tool_name="lookup",
                    content=[TextContent(text="result")],
                    details={"count": 1},
                )
            ]

        runtime = AgentRuntimeV3(
            model_streamer=streamer,
            capability_executor=execute,
            run_store=store,
        )
        await consume(
            runtime.run(
                RuntimeRequest(
                    run_id="run-action",
                    model=model(),
                    messages=[UserMessage(content="question")],
                    tools=[
                        ToolDefinition(
                            name="lookup",
                            description="lookup",
                            parameters={"type": "object", "properties": {}},
                        )
                    ],
                )
            )
        )
        action = store.get("run-action").steps[0].action_calls[0]

        self.assertEqual(action.call_id, "call-1")
        self.assertEqual(action.arguments, {"query": "value"})
        self.assertEqual(action.status, "completed")
        self.assertEqual(action.result_details, {"count": 1})
        self.assertIsNotNone(action.duration_ms)

    async def test_failed_run_closes_open_action_and_step(self):
        store = InMemoryRunStore()
        runtime = AgentRuntimeV3(
            model_streamer=FakeModelStreamer(
                [
                    AssistantMessage(
                        content=[ToolCallContent(id="call-1", name="lookup", arguments={})],
                        stop_reason="tool_use",
                    )
                ]
            ),
            run_store=store,
        )

        result = await consume(
            runtime.run(
                RuntimeRequest(
                    run_id="run-failed",
                    model=model(),
                    messages=[UserMessage(content="question")],
                    tools=[
                        ToolDefinition(
                            name="lookup",
                            description="lookup",
                            parameters={"type": "object", "properties": {}},
                        )
                    ],
                )
            )
        )
        record = store.get("run-failed")

        self.assertEqual(result.status, "failed")
        self.assertEqual(record.status, "failed")
        self.assertEqual(record.steps[0].action_calls[0].status, "failed")

    async def test_max_steps_failure_is_recorded(self):
        store = InMemoryRunStore()
        tool_message = AssistantMessage(
            content=[ToolCallContent(id="call-1", name="lookup", arguments={})],
            stop_reason="tool_use",
        )

        async def execute(request):
            return [
                ToolResultMessage(
                    tool_call_id="call-1",
                    tool_name="lookup",
                    content=[TextContent(text="result")],
                )
            ]

        runtime = AgentRuntimeV3(
            model_streamer=FakeModelStreamer([tool_message]),
            capability_executor=execute,
            run_store=store,
        )
        await consume(
            runtime.run(
                RuntimeRequest(
                    run_id="run-limit",
                    model=model(),
                    messages=[UserMessage(content="question")],
                    tools=[
                        ToolDefinition(
                            name="lookup",
                            description="lookup",
                            parameters={"type": "object", "properties": {}},
                        )
                    ],
                    limits=RuntimeLimits(max_steps=1),
                )
            )
        )

        record = store.get("run-limit")
        self.assertEqual(record.status, "failed")
        self.assertIn("maximum steps", record.error)

    async def test_capability_call_budget_stops_before_executor(self):
        store = InMemoryRunStore()
        tool_message = AssistantMessage(
            content=[ToolCallContent(id="call-1", name="lookup", arguments={})],
            stop_reason="tool_use",
        )
        execution_count = 0

        async def execute(request):
            nonlocal execution_count
            execution_count += 1
            return []

        runtime = AgentRuntimeV3(
            model_streamer=FakeModelStreamer([tool_message]),
            capability_executor=execute,
            run_store=store,
        )
        result = await consume(
            runtime.run(
                RuntimeRequest(
                    run_id="run-call-budget",
                    model=model(),
                    messages=[UserMessage(content="question")],
                    tools=[
                        ToolDefinition(
                            name="lookup",
                            description="lookup",
                            parameters={"type": "object", "properties": {}},
                        )
                    ],
                    limits=RuntimeLimits(max_steps=2, max_capability_calls=0),
                )
            )
        )

        self.assertEqual(execution_count, 0)
        self.assertEqual(result.error_code, "CAPABILITY_CALL_BUDGET_EXCEEDED")
        self.assertEqual(
            store.get("run-call-budget").error_code,
            "CAPABILITY_CALL_BUDGET_EXCEEDED",
        )

    async def test_model_error_marks_run_and_step_failed(self):
        store = InMemoryRunStore()
        runtime = AgentRuntimeV3(
            model_streamer=FakeModelStreamer(
                [
                    AssistantMessage(
                        stop_reason="error",
                        error_message="provider failed",
                    )
                ]
            ),
            run_store=store,
        )

        await consume(
            runtime.run(
                RuntimeRequest(
                    run_id="run-model-error",
                    model=model(),
                    messages=[UserMessage(content="hello")],
                )
            )
        )

        record = store.get("run-model-error")
        self.assertEqual(record.status, "failed")
        self.assertEqual(record.steps[0].status, "failed")
        self.assertEqual(record.steps[0].stop_reason, "error")

    def test_store_returns_snapshot_not_mutable_internal_record(self):
        store = InMemoryRunStore()
        tracker = RunTracker(store)
        tracker.create("run-snapshot", {"agent_id": "agent-1"})

        snapshot = store.get("run-snapshot")
        snapshot.metadata["agent_id"] = "changed"

        self.assertEqual(store.get("run-snapshot").metadata["agent_id"], "agent-1")

    def test_store_evicts_oldest_terminal_run_at_capacity(self):
        store = InMemoryRunStore(max_records=1)
        tracker = RunTracker(store)
        tracker.create("run-old", {})
        tracker.start("run-old")
        tracker.complete("run-old")

        tracker.create("run-new", {})

        self.assertIsNone(store.get("run-old"))
        self.assertIsNotNone(store.get("run-new"))

    def test_store_does_not_evict_running_run(self):
        store = InMemoryRunStore(max_records=1)
        tracker = RunTracker(store)
        tracker.create("run-running", {})
        tracker.start("run-running")

        with self.assertRaisesRegex(RuntimeError, "capacity reached"):
            tracker.create("run-new", {})

        self.assertEqual(store.get("run-running").status, "running")

    async def test_runtime_stream_cancel_marks_run_cancelled(self):
        store = InMemoryRunStore()

        class BlockingModelStreamer:
            def __call__(self, model, context, options=None):
                return EventStream()

        runtime = AgentRuntimeV3(
            model_streamer=BlockingModelStreamer(),
            run_store=store,
        )
        runtime_stream = runtime.run(
            RuntimeRequest(
                run_id="run-cancel",
                model=model(),
                messages=[UserMessage(content="hello")],
            )
        )
        while store.get("run-cancel") is None:
            await asyncio.sleep(0)

        runtime_stream.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await runtime_stream.result()

        self.assertEqual(store.get("run-cancel").status, "cancelled")

    async def test_duplicate_run_id_fails_new_stream_without_overwriting_record(self):
        store = InMemoryRunStore()
        runtime = AgentRuntimeV3(
            model_streamer=FakeModelStreamer(
                [AssistantMessage(content=[TextContent(text="ok")], stop_reason="stop")]
            ),
            run_store=store,
        )
        request = RuntimeRequest(
            run_id="run-duplicate",
            model=model(),
            messages=[UserMessage(content="hello")],
        )
        await consume(runtime.run(request))

        duplicate_stream = runtime.run(request)
        with self.assertRaisesRegex(ValueError, "already exists"):
            await duplicate_stream.result()

        self.assertEqual(store.get("run-duplicate").status, "completed")


if __name__ == "__main__":
    unittest.main()
