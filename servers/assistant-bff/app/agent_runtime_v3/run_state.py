from __future__ import annotations

import copy
import json
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Callable, Optional, Protocol

from app.logger import gpt_logger

from .types import RunStatus


StepStatus = str
ActionStatus = str


def _now_ms() -> int:
    return int(time.time() * 1000)


@dataclass(slots=True)
class ActionCallRecord:
    call_id: str
    tool_name: str
    arguments: dict[str, Any]
    status: ActionStatus = "running"
    started_at: int = field(default_factory=_now_ms)
    completed_at: Optional[int] = None
    duration_ms: Optional[int] = None
    is_error: bool = False
    result_details: Any = None
    error: Optional[str] = None


@dataclass(slots=True)
class RunStepRecord:
    index: int
    status: StepStatus = "running"
    started_at: int = field(default_factory=_now_ms)
    completed_at: Optional[int] = None
    duration_ms: Optional[int] = None
    stop_reason: Optional[str] = None
    tool_call_count: int = 0
    error: Optional[str] = None
    action_calls: list[ActionCallRecord] = field(default_factory=list)


@dataclass(slots=True)
class RunRecord:
    run_id: str
    status: RunStatus = "created"
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: int = field(default_factory=_now_ms)
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    duration_ms: Optional[int] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    retryable: bool = False
    steps: list[RunStepRecord] = field(default_factory=list)


class RunStore(Protocol):
    def create(self, record: RunRecord) -> None: ...

    def update(self, run_id: str, updater: Callable[[RunRecord], None]) -> None: ...

    def get(self, run_id: str) -> Optional[RunRecord]: ...


class InMemoryRunStore:
    def __init__(self, *, max_records: int = 1000) -> None:
        if max_records < 1:
            raise ValueError("max_records must be at least 1")
        self._max_records = max_records
        self._records: OrderedDict[str, RunRecord] = OrderedDict()
        self._lock = threading.RLock()

    def create(self, record: RunRecord) -> None:
        with self._lock:
            if record.run_id in self._records:
                raise ValueError(f'run "{record.run_id}" already exists')
            self._evict_terminal_record_if_needed()
            self._records[record.run_id] = copy.deepcopy(record)

    def update(self, run_id: str, updater: Callable[[RunRecord], None]) -> None:
        with self._lock:
            record = self._records.get(run_id)
            if record is None:
                raise ValueError(f'run "{run_id}" not found')
            updater(record)

    def get(self, run_id: str) -> Optional[RunRecord]:
        with self._lock:
            record = self._records.get(run_id)
            return copy.deepcopy(record) if record is not None else None

    def _evict_terminal_record_if_needed(self) -> None:
        if len(self._records) < self._max_records:
            return
        terminal_run_id = next(
            (
                run_id
                for run_id, record in self._records.items()
                if record.status in {"completed", "failed", "cancelled"}
            ),
            None,
        )
        if terminal_run_id is not None:
            del self._records[terminal_run_id]
            return
        raise RuntimeError("run store capacity reached with no terminal run to evict")


class RunObserver(Protocol):
    def record(self, event: str, payload: dict[str, Any]) -> None: ...


class LoggingRunObserver:
    def record(self, event: str, payload: dict[str, Any]) -> None:
        gpt_logger.info(
            "agent_runtime_v3 event=%s payload=%s",
            event,
            json.dumps(payload, ensure_ascii=False, default=str),
        )


class TraceRunObserver:
    def __init__(self, trace_recorder: Any) -> None:
        self._trace_recorder = trace_recorder

    def record(self, event: str, payload: dict[str, Any]) -> None:
        self._trace_recorder.log(f"agent_runtime_v3.{event}", payload)


class CompositeRunObserver:
    def __init__(self, observers: list[RunObserver]) -> None:
        self._observers = list(observers)

    def record(self, event: str, payload: dict[str, Any]) -> None:
        for observer in self._observers:
            observer.record(event, payload)


class RunTracker:
    def __init__(
        self,
        store: RunStore,
        *,
        observer: Optional[RunObserver] = None,
    ) -> None:
        self._store = store
        self._observer = observer

    @property
    def store(self) -> RunStore:
        return self._store

    def create(self, run_id: str, metadata: dict[str, Any]) -> None:
        self._store.create(RunRecord(run_id=run_id, metadata=copy.deepcopy(metadata)))
        self._emit("run.created", run_id=run_id, status="created")

    def start(self, run_id: str) -> None:
        now = _now_ms()

        def update(record: RunRecord) -> None:
            record.status = "running"
            record.started_at = now

        self._store.update(run_id, update)
        self._emit("run.started", run_id=run_id, status="running")

    def start_step(self, run_id: str, step_index: int) -> None:
        def update(record: RunRecord) -> None:
            record.steps.append(RunStepRecord(index=step_index))

        self._store.update(run_id, update)
        self._emit("step.started", run_id=run_id, step_index=step_index)

    def complete_step(
        self,
        run_id: str,
        step_index: int,
        *,
        stop_reason: str,
        tool_call_count: int,
    ) -> None:
        now = _now_ms()

        def update(record: RunRecord) -> None:
            step = _require_step(record, step_index)
            step.status = (
                "failed" if stop_reason in {"error", "aborted"} else "completed"
            )
            step.completed_at = now
            step.duration_ms = max(0, now - step.started_at)
            step.stop_reason = stop_reason
            step.tool_call_count = tool_call_count

        self._store.update(run_id, update)
        self._emit(
            "step.completed",
            run_id=run_id,
            step_index=step_index,
            stop_reason=stop_reason,
            tool_call_count=tool_call_count,
        )

    def start_action(
        self,
        run_id: str,
        step_index: int,
        *,
        call_id: str,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> None:
        def update(record: RunRecord) -> None:
            step = _require_step(record, step_index)
            step.action_calls.append(
                ActionCallRecord(
                    call_id=call_id,
                    tool_name=tool_name,
                    arguments=copy.deepcopy(arguments),
                )
            )

        self._store.update(run_id, update)
        # Arguments intentionally stay in the in-memory record and are not logged.
        self._emit(
            "action.started",
            run_id=run_id,
            step_index=step_index,
            call_id=call_id,
            tool_name=tool_name,
        )

    def complete_action(
        self,
        run_id: str,
        step_index: int,
        *,
        call_id: str,
        is_error: bool,
        result_details: Any,
        error: Optional[str] = None,
    ) -> None:
        now = _now_ms()

        def update(record: RunRecord) -> None:
            action = _require_action(record, step_index, call_id)
            action.status = "failed" if is_error else "completed"
            action.completed_at = now
            action.duration_ms = max(0, now - action.started_at)
            action.is_error = is_error
            action.result_details = copy.deepcopy(result_details)
            action.error = error

        self._store.update(run_id, update)
        self._emit(
            "action.completed",
            run_id=run_id,
            step_index=step_index,
            call_id=call_id,
            status="failed" if is_error else "completed",
        )

    def complete(self, run_id: str) -> None:
        self._finish(run_id, status="completed", error=None)

    def fail(
        self,
        run_id: str,
        error: str,
        *,
        error_code: str = "RUNTIME_ERROR",
        retryable: bool = False,
    ) -> None:
        self._finish(
            run_id,
            status="failed",
            error=error,
            error_code=error_code,
            retryable=retryable,
        )

    def cancel(self, run_id: str) -> None:
        self._finish(
            run_id,
            status="cancelled",
            error="run cancelled",
            error_code="RUN_CANCELLED",
            retryable=False,
        )

    def _finish(
        self,
        run_id: str,
        *,
        status: RunStatus,
        error: Optional[str],
        error_code: Optional[str] = None,
        retryable: bool = False,
    ) -> None:
        now = _now_ms()

        def update(record: RunRecord) -> None:
            record.status = status
            record.completed_at = now
            record.duration_ms = max(0, now - (record.started_at or record.created_at))
            record.error = error
            record.error_code = error_code
            record.retryable = retryable
            for step in record.steps:
                has_running_action = any(
                    action.status == "running" for action in step.action_calls
                )
                if step.status == "running" or (status == "failed" and has_running_action):
                    step.status = "failed" if status == "failed" else status
                    step.completed_at = now
                    step.duration_ms = max(0, now - step.started_at)
                    step.error = error
                for action in step.action_calls:
                    if action.status == "running":
                        action.status = "failed" if status == "failed" else status
                        action.completed_at = now
                        action.duration_ms = max(0, now - action.started_at)
                        action.is_error = status == "failed"
                        action.error = error

        self._store.update(run_id, update)
        self._emit("run.finished", run_id=run_id, status=status, error=error)

    def _emit(self, event: str, **payload: Any) -> None:
        if self._observer is not None:
            try:
                self._observer.record(event, payload)
            except Exception as exc:
                gpt_logger.warning(
                    "agent_runtime_v3 observer_failed event=%s error=%s",
                    event,
                    str(exc),
                )


def _require_step(record: RunRecord, step_index: int) -> RunStepRecord:
    for step in record.steps:
        if step.index == step_index:
            return step
    raise ValueError(f'step "{step_index}" not found in run "{record.run_id}"')


def _require_action(
    record: RunRecord,
    step_index: int,
    call_id: str,
) -> ActionCallRecord:
    step = _require_step(record, step_index)
    for action in step.action_calls:
        if action.call_id == call_id:
            return action
    raise ValueError(
        f'action "{call_id}" not found in step "{step_index}" of run "{record.run_id}"'
    )
