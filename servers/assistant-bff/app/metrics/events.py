"""Local file persistence for chat usage events."""

from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

from app.base_config import model_config
from app.logger import log_dir

USAGE_EVENTS_DIR = Path(log_dir) / "usage-events"
_PENDING_LOCK = threading.Lock()
_PENDING_EVENTS: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_metrics_storage() -> None:
    USAGE_EVENTS_DIR.mkdir(parents=True, exist_ok=True)


def _event_log_path(when: datetime) -> Path:
    init_metrics_storage()
    return USAGE_EVENTS_DIR / f"{when.astimezone(timezone.utc):%Y-%m-%d}.jsonl"


def _append_event(record: dict[str, Any]) -> None:
    started_at = _parse_datetime(record.get("started_at")) or datetime.now(timezone.utc)
    path = _event_log_path(started_at)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
        file.write("\n")


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _coerce_record(record: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(record)
    tools = normalized.get("tool_names")
    if isinstance(tools, set):
        normalized["tool_names"] = sorted(tools)
    return normalized


@dataclass
class UsageEventTracker:
    """Mutable handle that keeps track of a single chat usage event."""

    event_id: str

    def set_model(self, model_name: Optional[str]) -> None:
        if not model_name:
            return
        with _PENDING_LOCK:
            record = _PENDING_EVENTS.get(self.event_id)
            if record is not None:
                record["model"] = model_name

    def mark_tool(self, tool_name: str) -> None:
        if not tool_name:
            return
        with _PENDING_LOCK:
            record = _PENDING_EVENTS.get(self.event_id)
            if record is None:
                return
            tools = record.setdefault("tool_names", set())
            if isinstance(tools, set):
                tools.add(tool_name)

    def finalize(
        self,
        *,
        status: str,
        latency_ms: float,
        error: Optional[str] = None,
        request_tokens: Optional[int] = None,
        response_tokens: Optional[int] = None,
    ) -> None:
        with _PENDING_LOCK:
            record = _PENDING_EVENTS.pop(self.event_id, None)
        if record is None:
            return
        record["status"] = status
        record["completed_at"] = _now_iso()
        record["latency_ms"] = float(latency_ms)
        record["error"] = error
        if request_tokens is not None:
            record["request_tokens"] = request_tokens
        if response_tokens is not None:
            record["response_tokens"] = response_tokens
        _append_event(_coerce_record(record))


def create_usage_event(
    *,
    user_id: str,
    user_email: Optional[str],
    conversation_id: Optional[str],
    gid: Optional[str],
    requested_model: Optional[str],
    upload_count: int = 0,
) -> UsageEventTracker:
    event_id = str(uuid.uuid4())
    started_at = _now_iso()
    with _PENDING_LOCK:
        _PENDING_EVENTS[event_id] = {
            "id": event_id,
            "user_id": user_id,
            "user_email": user_email,
            "conversation_id": conversation_id,
            "gid": gid,
            "model": requested_model,
            "requested_model": requested_model,
            "status": "running",
            "error": None,
            "started_at": started_at,
            "completed_at": None,
            "latency_ms": None,
            "tool_names": set(),
            "request_tokens": None,
            "response_tokens": None,
            "upload_count": max(int(upload_count), 0),
        }
    return UsageEventTracker(event_id)


def record_tokens(
    event_id: str,
    *,
    request_tokens: Optional[int] = None,
    response_tokens: Optional[int] = None,
) -> None:
    with _PENDING_LOCK:
        record = _PENDING_EVENTS.get(event_id)
        if record is None:
            return
        if request_tokens is not None:
            record["request_tokens"] = request_tokens
        if response_tokens is not None:
            record["response_tokens"] = response_tokens


def iter_usage_events(
    *,
    since: datetime | None = None,
    until: datetime | None = None,
) -> Iterator[dict[str, Any]]:
    init_metrics_storage()
    for path in _resolve_event_files(since=since, until=until):
        try:
            with path.open("r", encoding="utf-8") as file:
                for line in file:
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(item, dict):
                        continue
                    started_at = _parse_datetime(item.get("started_at"))
                    if since is not None and started_at is not None and started_at < since:
                        continue
                    if until is not None and started_at is not None and started_at >= until:
                        continue
                    yield item
        except OSError:
            continue


def _resolve_event_files(
    *,
    since: datetime | None,
    until: datetime | None,
) -> Iterable[Path]:
    files = sorted(USAGE_EVENTS_DIR.glob("*.jsonl"))
    if since is None and until is None:
        return files

    start_date = (since or datetime.min.replace(tzinfo=timezone.utc)).date()
    end_anchor = until or (datetime.now(timezone.utc) + timedelta(days=1))
    end_date = end_anchor.date()
    selected: list[Path] = []
    for path in files:
        try:
            file_date = datetime.strptime(path.stem, "%Y-%m-%d").date()
        except ValueError:
            selected.append(path)
            continue
        if start_date <= file_date <= end_date:
            selected.append(path)
    return selected


def cleanup_usage_events(*, retention_days: int | None = None) -> int:
    init_metrics_storage()
    keep_days = retention_days or model_config.USAGE_EVENT_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    deleted = 0
    for path in USAGE_EVENTS_DIR.glob("*.jsonl"):
        try:
            file_date = datetime.strptime(path.stem, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if file_date >= cutoff:
            continue
        try:
            path.unlink()
            deleted += 1
        except OSError:
            continue
    return deleted


__all__ = [
    "UsageEventTracker",
    "cleanup_usage_events",
    "create_usage_event",
    "init_metrics_storage",
    "iter_usage_events",
    "record_tokens",
]
