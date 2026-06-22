from __future__ import annotations

import asyncio
from typing import Optional

from app.llm_kernel import Context, stream
from app.llm_kernel.event_stream import EventStream
from app.logger import gpt_logger

from .types import (
    CapabilityExecutionRequest,
    CapabilityExecutor,
    ModelStreamer,
    RunResult,
    RuntimeEvent,
    RuntimeRequest,
)
from .run_state import InMemoryRunStore, LoggingRunObserver, RunStore, RunTracker


class RuntimeEventStream(EventStream[RuntimeEvent, RunResult]):
    def __init__(self) -> None:
        super().__init__()
        self._driver_task: Optional[asyncio.Task[None]] = None

    def bind_driver(self, task: asyncio.Task[None]) -> None:
        if self._driver_task is not None:
            raise RuntimeError("runtime stream driver is already bound")
        self._driver_task = task

    def cancel(self) -> None:
        if self._driver_task is not None and not self._driver_task.done():
            self._driver_task.cancel()


class AgentRuntimeV3:
    """Provider-neutral synchronous Agent loop.

    Transport adapters consume RuntimeEvent objects and decide how to expose them
    as SSE, WebSocket messages, logs, or another protocol.
    """

    def __init__(
        self,
        *,
        model_streamer: ModelStreamer = stream,
        capability_executor: Optional[CapabilityExecutor] = None,
        run_store: Optional[RunStore] = None,
        run_tracker: Optional[RunTracker] = None,
    ) -> None:
        self._model_streamer = model_streamer
        self._capability_executor = capability_executor
        if run_tracker is not None and run_store is not None:
            raise ValueError("provide run_store or run_tracker, not both")
        self._run_tracker = run_tracker or RunTracker(
            run_store or InMemoryRunStore(),
            observer=LoggingRunObserver(),
        )
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def run_store(self) -> RunStore:
        return self._run_tracker.store

    def run(self, request: RuntimeRequest) -> RuntimeEventStream:
        event_stream = RuntimeEventStream()
        task = asyncio.create_task(self._drive(request, event_stream))
        event_stream.bind_driver(task)
        self._tasks.add(task)

        # EventStream owns the observable result. Retrieving the task exception
        # prevents an unhandled-task warning if cancellation happens mid-run.
        def consume_task_exception(completed: asyncio.Task[None]) -> None:
            if completed.cancelled():
                self._tasks.discard(completed)
                return
            completed.exception()
            self._tasks.discard(completed)

        task.add_done_callback(consume_task_exception)
        return event_stream

    async def _drive(
        self,
        request: RuntimeRequest,
        event_stream: RuntimeEventStream,
    ) -> None:
        messages = list(request.messages)
        final_message = None
        completed_steps = 0
        capability_call_count = 0

        try:
            self._run_tracker.create(request.run_id, request.metadata)
            self._run_tracker.start(request.run_id)
            event_stream.push(RuntimeEvent("run_started", request.run_id))
        except Exception as exc:
            event_stream.fail(exc)
            return

        try:
            for step_index in range(1, request.limits.max_steps + 1):
                completed_steps = step_index
                self._run_tracker.start_step(request.run_id, step_index)
                event_stream.push(RuntimeEvent("step_started", request.run_id, step_index))
                context = Context(
                    system_prompt=request.system_prompt,
                    messages=list(messages),
                    tools=list(request.tools),
                )
                model_stream = self._model_streamer(
                    request.model,
                    context,
                    request.options,
                )

                async for model_event in model_stream:
                    event_stream.push(
                        RuntimeEvent(
                            "model_event",
                            request.run_id,
                            step_index,
                            model_event,
                        )
                    )

                final_message = await model_stream.result()
                messages.append(final_message)
                tool_calls = [
                    block
                    for block in final_message.content
                    if getattr(block, "type", None) == "tool_call"
                ]
                self._run_tracker.complete_step(
                    request.run_id,
                    step_index,
                    stop_reason=final_message.stop_reason,
                    tool_call_count=len(tool_calls),
                )
                event_stream.push(
                    RuntimeEvent(
                        "step_completed",
                        request.run_id,
                        step_index,
                        {
                            "stop_reason": final_message.stop_reason,
                            "tool_call_count": len(tool_calls),
                        },
                    )
                )

                if final_message.stop_reason in {"error", "aborted"}:
                    gpt_logger.warning(
                        "agent_runtime_v3 model_failed run_id=%s step=%s stop_reason=%s error=%s",
                        request.run_id,
                        step_index,
                        final_message.stop_reason,
                        final_message.error_message,
                    )
                    return self._finish_failed(
                        event_stream,
                        request=request,
                        messages=messages,
                        steps=completed_steps,
                        final_message=final_message,
                        error="Model execution failed.",
                        error_code="MODEL_EXECUTION_FAILED",
                        retryable=True,
                    )

                if final_message.stop_reason != "tool_use":
                    result = RunResult(
                        run_id=request.run_id,
                        status="completed",
                        messages=messages,
                        steps=completed_steps,
                        final_message=final_message,
                    )
                    event_stream.push(
                        RuntimeEvent("run_completed", request.run_id, step_index, result)
                    )
                    self._run_tracker.complete(request.run_id)
                    event_stream.finish(result)
                    return

                for tool_call in tool_calls:
                    self._run_tracker.start_action(
                        request.run_id,
                        step_index,
                        call_id=tool_call.id,
                        tool_name=tool_call.name,
                        arguments=(
                            dict(tool_call.arguments)
                            if isinstance(tool_call.arguments, dict)
                            else {}
                        ),
                    )

                if (
                    capability_call_count + len(tool_calls)
                    > request.limits.max_capability_calls
                ):
                    return self._finish_failed(
                        event_stream,
                        request=request,
                        messages=messages,
                        steps=completed_steps,
                        final_message=final_message,
                        error=(
                            "runtime exceeded maximum capability calls "
                            f"({request.limits.max_capability_calls})"
                        ),
                        error_code="CAPABILITY_CALL_BUDGET_EXCEEDED",
                    )
                capability_call_count += len(tool_calls)

                if not request.tools:
                    return self._finish_failed(
                        event_stream,
                        request=request,
                        messages=messages,
                        steps=completed_steps,
                        final_message=final_message,
                        error="model requested a capability but no tools are available",
                        error_code="CAPABILITY_NOT_AVAILABLE",
                    )
                if self._capability_executor is None:
                    return self._finish_failed(
                        event_stream,
                        request=request,
                        messages=messages,
                        steps=completed_steps,
                        final_message=final_message,
                        error="model requested a capability but no executor is configured",
                        error_code="CAPABILITY_EXECUTOR_NOT_CONFIGURED",
                    )

                event_stream.push(
                    RuntimeEvent(
                        "capability_execution_started",
                        request.run_id,
                        step_index,
                    )
                )
                tool_results = await self._capability_executor(
                    CapabilityExecutionRequest(
                        run_id=request.run_id,
                        step_index=step_index,
                        assistant_message=final_message,
                        tools=list(request.tools),
                        metadata=dict(request.metadata),
                    )
                )
                results_by_call_id = {
                    result.tool_call_id: result for result in tool_results
                }
                for tool_call in tool_calls:
                    tool_result = results_by_call_id.get(tool_call.id)
                    if tool_result is None:
                        self._run_tracker.complete_action(
                            request.run_id,
                            step_index,
                            call_id=tool_call.id,
                            is_error=True,
                            result_details=None,
                            error="capability executor returned no matching result",
                        )
                        continue
                    error = None
                    if tool_result.is_error:
                        if isinstance(tool_result.details, dict):
                            error_payload = tool_result.details.get("error")
                            if isinstance(error_payload, dict):
                                error = str(error_payload.get("message") or "") or None
                            else:
                                error = str(error_payload or "") or None
                        error = error or "capability execution failed"
                    self._run_tracker.complete_action(
                        request.run_id,
                        step_index,
                        call_id=tool_call.id,
                        is_error=tool_result.is_error,
                        result_details=tool_result.details,
                        error=error,
                    )
                if not tool_results:
                    return self._finish_failed(
                        event_stream,
                        request=request,
                        messages=messages,
                        steps=completed_steps,
                        final_message=final_message,
                        error="capability executor returned no results",
                        error_code="CAPABILITY_RESULT_MISSING",
                    )
                messages.extend(tool_results)
                event_stream.push(
                    RuntimeEvent(
                        "capability_execution_completed",
                        request.run_id,
                        step_index,
                        tool_results,
                    )
                )

            return self._finish_failed(
                event_stream,
                request=request,
                messages=messages,
                steps=completed_steps,
                final_message=final_message,
                error=f"runtime exceeded maximum steps ({request.limits.max_steps})",
                error_code="MAX_STEPS_EXCEEDED",
            )
        except asyncio.CancelledError as exc:
            self._run_tracker.cancel(request.run_id)
            event_stream.fail(exc)
            raise
        except Exception as exc:
            gpt_logger.exception(
                "agent_runtime_v3 runtime_failed run_id=%s step=%s error_type=%s error=%s",
                request.run_id,
                completed_steps,
                type(exc).__name__,
                str(exc),
            )
            self._finish_failed(
                event_stream,
                request=request,
                messages=messages,
                steps=completed_steps,
                final_message=final_message,
                error="Runtime execution failed.",
                error_code="RUNTIME_ERROR",
            )

    def _finish_failed(
        self,
        event_stream: RuntimeEventStream,
        *,
        request: RuntimeRequest,
        messages: list,
        steps: int,
        final_message,
        error: str,
        error_code: str,
        retryable: bool = False,
    ) -> None:
        result = RunResult(
            run_id=request.run_id,
            status="failed",
            messages=list(messages),
            steps=steps,
            final_message=final_message,
            error=error,
            error_code=error_code,
            retryable=retryable,
        )
        self._run_tracker.fail(
            request.run_id,
            error,
            error_code=error_code,
            retryable=retryable,
        )
        event_stream.push(RuntimeEvent("run_failed", request.run_id, steps, result))
        event_stream.finish(result)
