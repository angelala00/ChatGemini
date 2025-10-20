"""Persistence helpers for chat usage events."""

from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

from app.db import get_db

_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  conversation_id TEXT,
  gid TEXT,
  model TEXT,
  requested_model TEXT,
  status TEXT NOT NULL,
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  latency_ms REAL,
  tool_names TEXT,
  request_tokens INTEGER,
  response_tokens INTEGER
);
"""

_INDEX_DEFINITIONS: dict[str, tuple[str, set[str]]] = {
    "idx_usage_events_started_at": (
        "CREATE INDEX IF NOT EXISTS idx_usage_events_started_at ON usage_events(started_at)",
        {"started_at"},
    ),
    "idx_usage_events_user_id": (
        "CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id)",
        {"user_id"},
    ),
    "idx_usage_events_gid": (
        "CREATE INDEX IF NOT EXISTS idx_usage_events_gid ON usage_events(gid)",
        {"gid"},
    ),
    "idx_usage_events_model": (
        "CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model)",
        {"model"},
    ),
    "idx_usage_events_requested_model": (
        "CREATE INDEX IF NOT EXISTS idx_usage_events_requested_model ON usage_events(requested_model)",
        {"requested_model"},
    ),
}

_REQUIRED_COLUMNS = {
    "user_email": "TEXT",
    "conversation_id": "TEXT",
    "gid": "TEXT",
    "model": "TEXT",
    "requested_model": "TEXT",
    "status": "TEXT NOT NULL DEFAULT 'running'",
    "error": "TEXT",
    "completed_at": "TEXT",
    "latency_ms": "REAL",
    "tool_names": "TEXT",
    "request_tokens": "INTEGER",
    "response_tokens": "INTEGER",
}

# NOTE: ``_ensure_required_columns`` runs during service start (see ``init_metrics_storage``)
# and issues ``ALTER TABLE`` statements for any columns missing from an existing
# ``usage_events`` table.  This keeps rolling upgrades safe: the new code adds
# ``requested_model`` automatically, while older binaries continue to work
# because the column remains optional and defaults to ``NULL`` when writes do not
# mention it explicitly.


@dataclass
class UsageEventTracker:
    """Mutable handle that keeps track of a single chat usage event."""

    event_id: str

    def set_model(self, model_name: Optional[str]) -> None:
        if not model_name:
            return
        _execute(
            "UPDATE usage_events SET model=? WHERE id=?",
            (model_name, self.event_id),
        )

    def mark_tool(self, tool_name: str) -> None:
        if not tool_name:
            return
        row = _fetchone(
            "SELECT tool_names FROM usage_events WHERE id=?",
            (self.event_id,),
        )
        tools: set[str] = set()
        if row and row["tool_names"]:
            try:
                tools = set(json.loads(row["tool_names"]))
            except json.JSONDecodeError:
                tools = set(row["tool_names"].split(","))
        tools.add(tool_name)
        _execute(
            "UPDATE usage_events SET tool_names=? WHERE id=?",
            (json.dumps(sorted(tools)), self.event_id),
        )

    def finalize(
        self,
        *,
        status: str,
        latency_ms: float,
        error: Optional[str] = None,
        request_tokens: Optional[int] = None,
        response_tokens: Optional[int] = None,
    ) -> None:
        completed_at = datetime.now(timezone.utc).isoformat()
        _execute(
            """
            UPDATE usage_events
               SET status=?,
                   completed_at=?,
                   latency_ms=?,
                   error=?,
                   request_tokens=COALESCE(?, request_tokens),
                   response_tokens=COALESCE(?, response_tokens)
             WHERE id=?
            """,
            (
                status,
                completed_at,
                float(latency_ms),
                error,
                request_tokens,
                response_tokens,
                self.event_id,
            ),
        )


def init_metrics_storage() -> None:
    conn = get_db()
    try:
        conn.executescript(_TABLE_DDL)
        _ensure_required_columns(conn)
        _ensure_indexes(conn)
        conn.commit()
    finally:
        conn.close()


def _ensure_required_columns(conn: sqlite3.Connection) -> None:
    """Best-effort schema migration to add missing columns."""

    existing = {row["name"] for row in conn.execute("PRAGMA table_info(usage_events)")}
    missing = _REQUIRED_COLUMNS.keys() - existing
    for column in missing:
        conn.execute(
            f"ALTER TABLE usage_events ADD COLUMN {column} {_REQUIRED_COLUMNS[column]}"
        )


def _ensure_indexes(conn: sqlite3.Connection) -> None:
    """Create indexes after columns are guaranteed to exist."""

    existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(usage_events)")}
    for sql, required_columns in _INDEX_DEFINITIONS.values():
        if required_columns.issubset(existing_columns):
            conn.execute(sql)


def create_usage_event(
    *,
    user_id: str,
    user_email: Optional[str],
    conversation_id: Optional[str],
    gid: Optional[str],
    requested_model: Optional[str],
) -> UsageEventTracker:
    event_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()
    _execute(
        """
        INSERT INTO usage_events(
            id,
            user_id,
            user_email,
            conversation_id,
            gid,
            model,
            requested_model,
            status,
            started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
        """,
        (
            event_id,
            user_id,
            user_email,
            conversation_id,
            gid,
            requested_model,
            requested_model,
            started_at,
        ),
    )
    return UsageEventTracker(event_id)


def record_tokens(
    event_id: str,
    *,
    request_tokens: Optional[int] = None,
    response_tokens: Optional[int] = None,
) -> None:
    _execute(
        """
        UPDATE usage_events
           SET request_tokens=COALESCE(?, request_tokens),
               response_tokens=COALESCE(?, response_tokens)
         WHERE id=?
        """,
        (request_tokens, response_tokens, event_id),
    )


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
        row = cur.fetchone()
        return row
    finally:
        conn.close()


__all__ = [
    "UsageEventTracker",
    "init_metrics_storage",
    "create_usage_event",
    "record_tokens",
]
