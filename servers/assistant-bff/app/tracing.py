from __future__ import annotations

import json
import threading
import uuid
from dataclasses import asdict, dataclass, is_dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from app.base_config import model_config
from app.logger import gpt_logger, log_dir

TRACE_DIR = Path(log_dir) / "chat-traces"
_TRACE_LOCK = threading.Lock()
_MAX_STRING_CHARS = 100_000


def trace_enabled() -> bool:
    return bool(model_config.TRACE_ENABLED)


def init_trace_storage() -> None:
    TRACE_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _trace_path(trace_id: str) -> Path:
    init_trace_storage()
    return TRACE_DIR / f"{trace_id}.json"


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    temp_path = path.with_suffix(".tmp")
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str),
        encoding="utf-8",
    )
    temp_path.replace(path)


def _load_trace_file(path: Path) -> dict[str, Any] | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _log_preview(value: Any, *, limit: int = 1200) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = repr(value)
    if len(text) > limit:
        return f"{text[:limit]}...(truncated)"
    return text


def _serialize_value(value: Any, *, _depth: int = 0) -> Any:
    if _depth > 8:
        return repr(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) <= _MAX_STRING_CHARS:
            return value
        return {
            "type": "string",
            "truncated": True,
            "length": len(value),
            "value": value[:_MAX_STRING_CHARS],
        }
    if isinstance(value, (bytes, bytearray)):
        return {
            "type": type(value).__name__,
            "length": len(value),
        }
    if is_dataclass(value):
        return _serialize_value(asdict(value), _depth=_depth + 1)
    if hasattr(value, "model_dump"):
        try:
            return _serialize_value(value.model_dump(), _depth=_depth + 1)
        except Exception:
            return repr(value)
    if isinstance(value, dict):
        return {
            str(key): _serialize_value(item, _depth=_depth + 1)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [_serialize_value(item, _depth=_depth + 1) for item in value]
    return repr(value)


def _load_trace_doc(trace_id: str) -> dict[str, Any] | None:
    return _load_trace_file(_trace_path(trace_id))


def _save_trace_doc(trace_id: str, payload: dict[str, Any]) -> None:
    _atomic_write_json(_trace_path(trace_id), payload)


@dataclass
class ChatTraceRecorder:
    trace_id: str
    event_seq: int = 0
    finalized: bool = False

    def log(self, event_type: str, payload: Any) -> None:
        if not trace_enabled() or self.finalized:
            return
        with _TRACE_LOCK:
            document = _load_trace_doc(self.trace_id)
            if not document:
                return
            trace = document.setdefault("trace", {})
            events = document.setdefault("events", [])
            self.event_seq += 1
            events.append(
                {
                    "seq": self.event_seq,
                    "event_type": event_type,
                    "occurred_at": _now_iso(),
                    "payload": _serialize_value(payload),
                }
            )
            trace["detail_count"] = len(events)
            _save_trace_doc(self.trace_id, document)
        gpt_logger.info(
            "chat_trace trace_id=%s seq=%s event=%s payload=%s",
            self.trace_id,
            self.event_seq,
            event_type,
            _log_preview(_serialize_value(payload)),
        )

    def update(self, **fields: Any) -> None:
        if not trace_enabled() or not fields or self.finalized:
            return
        with _TRACE_LOCK:
            document = _load_trace_doc(self.trace_id)
            if not document:
                return
            trace = document.setdefault("trace", {})
            for key, value in fields.items():
                trace[key] = _serialize_value(value)
            _save_trace_doc(self.trace_id, document)

    def finalize(
        self,
        *,
        status: str,
        error: Optional[str] = None,
        response_preview: Optional[str] = None,
        duration_ms: Optional[float] = None,
    ) -> None:
        if not trace_enabled() or self.finalized:
            return
        with _TRACE_LOCK:
            document = _load_trace_doc(self.trace_id)
            if not document:
                return
            trace = document.setdefault("trace", {})
            trace["status"] = status
            trace["error"] = error
            trace["completed_at"] = _now_iso()
            if duration_ms is not None:
                trace["duration_ms"] = duration_ms
            if response_preview is not None:
                trace["response_preview"] = response_preview
            _save_trace_doc(self.trace_id, document)
        gpt_logger.info(
            "chat_trace_finalize trace_id=%s status=%s error=%s response_preview=%s",
            self.trace_id,
            status,
            error,
            _log_preview(response_preview),
        )
        self.finalized = True


def create_chat_trace(
    *,
    user_id: str,
    user_email: Optional[str],
    conversation_id: Optional[str],
    gid: Optional[str],
    route: str,
    requested_model: Optional[str],
    selected_model: Optional[str],
    reasoning_enabled: Optional[bool],
    query: Optional[str] = None,
    system_prompt: Optional[str] = None,
    file_ids: Optional[str] = None,
    request_payload: Optional[dict[str, Any]] = None,
) -> Optional[ChatTraceRecorder]:
    if not trace_enabled():
        return None

    trace_id = str(uuid.uuid4())
    started_at = _now_iso()
    payload = {
        "enabled": True,
        "trace": {
            "id": trace_id,
            "conversation_id": conversation_id,
            "user_id": user_id,
            "user_email": user_email,
            "gid": gid,
            "route": route,
            "requested_model": requested_model,
            "selected_model": selected_model,
            "reasoning_enabled": reasoning_enabled,
            "status": "running",
            "error": None,
            "started_at": started_at,
            "completed_at": None,
            "duration_ms": None,
            "query": query,
            "system_prompt": system_prompt,
            "file_ids": file_ids,
            "request_json": _serialize_value(request_payload) if request_payload is not None else None,
            "response_preview": None,
            "detail_count": 0,
        },
        "events": [],
    }
    with _TRACE_LOCK:
        _save_trace_doc(trace_id, payload)
    gpt_logger.info(
        "chat_trace_start trace_id=%s conversation_id=%s gid=%s route=%s requested_model=%s selected_model=%s reasoning_enabled=%s",
        trace_id,
        conversation_id,
        gid,
        route,
        requested_model,
        selected_model,
        reasoning_enabled,
    )
    return ChatTraceRecorder(trace_id=trace_id)


def list_chat_traces(
    *,
    conversation_id: Optional[str] = None,
    limit: int = 50,
) -> dict[str, Any]:
    init_trace_storage()
    normalized_limit = max(1, min(int(limit), 200))
    items: list[dict[str, Any]] = []
    for path in sorted(TRACE_DIR.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True):
        payload = _load_trace_file(path)
        if not payload:
            continue
        trace = payload.get("trace")
        if not isinstance(trace, dict):
            continue
        if conversation_id and trace.get("conversation_id") != conversation_id:
            continue
        items.append(_row_to_summary(trace))
        if len(items) >= normalized_limit:
            break
    items.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    return {"enabled": trace_enabled(), "items": items}


def get_chat_trace(trace_id: str) -> Optional[dict[str, Any]]:
    init_trace_storage()
    payload = _load_trace_doc(trace_id)
    if not payload:
        return None
    trace = payload.get("trace")
    events = payload.get("events")
    if not isinstance(trace, dict) or not isinstance(events, list):
        return None
    return {
        "enabled": trace_enabled(),
        "trace": _row_to_detail(trace),
        "events": events,
    }


def cleanup_trace_storage(*, retention_days: int | None = None) -> int:
    init_trace_storage()
    keep_days = retention_days or model_config.TRACE_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    deleted = 0
    for path in TRACE_DIR.glob("*.json"):
        try:
            payload = _load_trace_file(path)
            started_at = None
            if payload and isinstance(payload.get("trace"), dict):
                started_at = payload["trace"].get("started_at")
            started_at_dt = _now_from_any(started_at)
            if started_at_dt is None:
                started_at_dt = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
        except OSError:
            continue
        if started_at_dt >= cutoff:
            continue
        try:
            path.unlink()
            deleted += 1
        except OSError:
            continue
    return deleted


def _now_from_any(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _row_to_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "conversation_id": row.get("conversation_id"),
        "user_id": row.get("user_id"),
        "user_email": row.get("user_email"),
        "gid": row.get("gid"),
        "route": row.get("route"),
        "requested_model": row.get("requested_model"),
        "selected_model": row.get("selected_model"),
        "reasoning_enabled": row.get("reasoning_enabled"),
        "status": row.get("status"),
        "error": row.get("error"),
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
        "duration_ms": row.get("duration_ms"),
        "query": row.get("query"),
        "file_ids": row.get("file_ids"),
        "detail_count": row.get("detail_count", 0),
        "response_preview": row.get("response_preview"),
    }


def _row_to_detail(row: dict[str, Any]) -> dict[str, Any]:
    item = _row_to_summary(row)
    item["request_json"] = row.get("request_json")
    item["system_prompt"] = row.get("system_prompt")
    return item


__all__ = [
    "ChatTraceRecorder",
    "cleanup_trace_storage",
    "create_chat_trace",
    "get_chat_trace",
    "init_trace_storage",
    "list_chat_traces",
    "trace_enabled",
]
