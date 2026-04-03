from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import asdict, dataclass, is_dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from app.base_config import model_config
from app.db import get_db
from app.logger import gpt_logger

_TRACE_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS chat_traces (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  user_id TEXT NOT NULL,
  user_email TEXT,
  gid TEXT,
  route TEXT,
  requested_model TEXT,
  selected_model TEXT,
  reasoning_enabled INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms REAL,
  query TEXT,
  system_prompt TEXT,
  file_ids TEXT,
  request_json TEXT,
  response_preview TEXT,
  detail_count INTEGER NOT NULL DEFAULT 0
);
"""

_TRACE_EVENT_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS chat_trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
"""

_TRACE_INDEXES = (
    (
        "CREATE INDEX IF NOT EXISTS idx_chat_traces_started_at ON chat_traces(started_at)",
        ("started_at",),
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_chat_traces_conversation_id ON chat_traces(conversation_id)",
        ("conversation_id",),
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_chat_traces_gid ON chat_traces(gid)",
        ("gid",),
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_chat_trace_events_trace_id_seq ON chat_trace_events(trace_id, seq)",
        ("trace_id", "seq"),
    ),
)

_MAX_STRING_CHARS = 100_000


def trace_enabled() -> bool:
    return bool(model_config.TRACE_ENABLED)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _json_dumps(value: Any) -> str:
    return json.dumps(_serialize_value(value), ensure_ascii=False, default=str)


def _execute(sql: str, params: Iterable[object]) -> None:
    conn = get_db()
    try:
        conn.execute(sql, tuple(params))
        conn.commit()
    finally:
        conn.close()


def _fetchone(sql: str, params: Iterable[object]) -> Optional[sqlite3.Row]:
    conn = get_db()
    try:
        cur = conn.execute(sql, tuple(params))
        return cur.fetchone()
    finally:
        conn.close()


def _fetchall(sql: str, params: Iterable[object]) -> list[sqlite3.Row]:
    conn = get_db()
    try:
        cur = conn.execute(sql, tuple(params))
        return cur.fetchall()
    finally:
        conn.close()


def init_trace_storage() -> None:
    conn = get_db()
    try:
        conn.executescript(_TRACE_TABLE_DDL)
        conn.executescript(_TRACE_EVENT_TABLE_DDL)
        for sql, required_columns in _TRACE_INDEXES:
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(chat_traces)")}
            event_columns = {row["name"] for row in conn.execute("PRAGMA table_info(chat_trace_events)")}
            if required_columns == ("trace_id", "seq"):
                if {"trace_id", "seq"}.issubset(event_columns):
                    conn.execute(sql)
            elif set(required_columns).issubset(columns):
                conn.execute(sql)
        conn.commit()
    finally:
        conn.close()


@dataclass
class ChatTraceRecorder:
    trace_id: str
    event_seq: int = 0
    finalized: bool = False

    def log(self, event_type: str, payload: Any) -> None:
        if not trace_enabled() or self.finalized:
            return
        self.event_seq += 1
        payload_json = _json_dumps(payload)
        occurred_at = _now_iso()
        _execute(
            """
            INSERT INTO chat_trace_events(trace_id, seq, event_type, occurred_at, payload)
            VALUES (?, ?, ?, ?, ?)
            """,
            (self.trace_id, self.event_seq, event_type, occurred_at, payload_json),
        )
        _execute(
            "UPDATE chat_traces SET detail_count = detail_count + 1 WHERE id=?",
            (self.trace_id,),
        )
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
        assignments = ", ".join(f"{key}=?" for key in fields)
        values = tuple(_serialize_value(value) for value in fields.values())
        _execute(
            f"UPDATE chat_traces SET {assignments} WHERE id=?",
            (*values, self.trace_id),
        )

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
        completed_at = _now_iso()
        _execute(
            """
            UPDATE chat_traces
               SET status=?,
                   error=?,
                   completed_at=?,
                   duration_ms=COALESCE(?, duration_ms),
                   response_preview=COALESCE(?, response_preview)
             WHERE id=?
            """,
            (
                status,
                error,
                completed_at,
                duration_ms,
                response_preview,
                self.trace_id,
            ),
        )
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
    _execute(
        """
        INSERT INTO chat_traces(
            id,
            conversation_id,
            user_id,
            user_email,
            gid,
            route,
            requested_model,
            selected_model,
            reasoning_enabled,
            status,
            started_at,
            query,
            system_prompt,
            file_ids,
            request_json,
            detail_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, 0)
        """,
        (
            trace_id,
            conversation_id,
            user_id,
            user_email,
            gid,
            route,
            requested_model,
            selected_model,
            1 if reasoning_enabled else 0 if reasoning_enabled is not None else None,
            started_at,
            query,
            system_prompt,
            file_ids,
            _json_dumps(request_payload) if request_payload is not None else None,
        ),
    )
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
    limit = max(1, min(int(limit), 200))
    clauses = []
    params: list[Any] = []
    if conversation_id:
        clauses.append("conversation_id = ?")
        params.append(conversation_id)
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = _fetchall(
        f"""
        SELECT *
          FROM chat_traces
          {where_clause}
         ORDER BY started_at DESC
         LIMIT ?
        """,
        (*params, limit),
    )
    items = [_row_to_summary(row) for row in rows]
    return {"enabled": trace_enabled(), "items": items}


def get_chat_trace(trace_id: str) -> Optional[dict[str, Any]]:
    init_trace_storage()
    session = _fetchone(
        "SELECT * FROM chat_traces WHERE id=?",
        (trace_id,),
    )
    if not session:
        return None
    events = _fetchall(
        """
        SELECT seq, event_type, occurred_at, payload
          FROM chat_trace_events
         WHERE trace_id=?
         ORDER BY seq ASC
        """,
        (trace_id,),
    )
    return {
        "enabled": trace_enabled(),
        "trace": _row_to_detail(session),
        "events": [
            {
                "seq": row["seq"],
                "event_type": row["event_type"],
                "occurred_at": row["occurred_at"],
                "payload": _load_payload(row["payload"]),
            }
            for row in events
        ],
    }


def _load_payload(payload: str) -> Any:
    try:
        return json.loads(payload)
    except Exception:
        return payload


def _row_to_summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "user_id": row["user_id"],
        "user_email": row["user_email"],
        "gid": row["gid"],
        "route": row["route"],
        "requested_model": row["requested_model"],
        "selected_model": row["selected_model"],
        "reasoning_enabled": bool(row["reasoning_enabled"]) if row["reasoning_enabled"] is not None else None,
        "status": row["status"],
        "error": row["error"],
        "started_at": row["started_at"],
        "completed_at": row["completed_at"],
        "duration_ms": row["duration_ms"],
        "query": row["query"],
        "file_ids": row["file_ids"],
        "detail_count": row["detail_count"],
        "response_preview": row["response_preview"],
    }


def _row_to_detail(row: sqlite3.Row) -> dict[str, Any]:
    item = _row_to_summary(row)
    item["request_json"] = _load_payload(row["request_json"]) if row["request_json"] else None
    item["system_prompt"] = row["system_prompt"]
    return item


__all__ = [
    "ChatTraceRecorder",
    "create_chat_trace",
    "get_chat_trace",
    "init_trace_storage",
    "list_chat_traces",
    "trace_enabled",
]
