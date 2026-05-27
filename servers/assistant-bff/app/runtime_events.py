"""Structured runtime event logging and querying helpers."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

from fastapi import Request

from app.logger import log_dir, runtime_events_log_file, runtime_events_logger

MAX_STRING_LENGTH = 4000
MAX_COLLECTION_ITEMS = 50
MAX_DEPTH = 5


def record_runtime_event(
    payload: dict[str, Any],
    *,
    user: dict[str, Any] | None = None,
    request: Request | None = None,
) -> dict[str, Any]:
    event_name = str(payload.get("event") or "").strip()
    if not event_name:
        raise ValueError("runtime event missing event name")

    sanitized_payload = _sanitize_value(payload)
    if not isinstance(sanitized_payload, dict):
        sanitized_payload = {"payload": sanitized_payload}

    now_iso = datetime.now(timezone.utc).isoformat()
    user_email = _coerce_string((user or {}).get("email"))
    user_id = _coerce_string((user or {}).get("sub"))
    client_ip = None
    if request is not None and request.client is not None:
        client_ip = _coerce_string(request.client.host)

    record = {
        "recordedAt": now_iso,
        "event": event_name,
        "userEmail": user_email,
        "userId": user_id,
        "clientIp": client_ip,
        "requestPath": request.url.path if request is not None else None,
        **sanitized_payload,
    }
    runtime_events_logger.info(
        json.dumps(record, ensure_ascii=False, separators=(",", ":"))
    )
    return record


def query_runtime_events(
    *,
    event: str | None = None,
    runtime_session_id: str | None = None,
    chat_session_id: str | None = None,
    gid: str | None = None,
    route: str | None = None,
    user_email: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    normalized_limit = max(1, min(int(limit), 5000))
    matched: list[dict[str, Any]] = []

    for line in _iter_log_lines():
        parsed = _parse_event_line(line)
        if parsed is None:
            continue
        if not _matches_filters(
            parsed,
            event=event,
            runtime_session_id=runtime_session_id,
            chat_session_id=chat_session_id,
            gid=gid,
            route=route,
            user_email=user_email,
            since=since,
            until=until,
        ):
            continue
        matched.append(parsed)
        if len(matched) >= normalized_limit:
            break

    return matched


def build_runtime_event_summary(
    *,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 1000,
) -> dict[str, Any]:
    events = query_runtime_events(
        since=since,
        until=until,
        limit=limit,
    )
    event_counter = Counter()
    route_counter = Counter()
    gid_counter = Counter()
    browser_counter = Counter()
    suspected_crashes: list[dict[str, Any]] = []

    for item in events:
        event_name = _coerce_string(item.get("event")) or "unknown"
        event_counter[event_name] += 1
        route_value = _coerce_string(item.get("route"))
        if route_value:
            route_counter[route_value] += 1
        gid_value = _coerce_string(item.get("gid"))
        if gid_value:
            gid_counter[gid_value] += 1
        browser_label = _extract_browser_label(_coerce_string(item.get("userAgent")))
        if browser_label:
            browser_counter[browser_label] += 1
        if event_name == "suspected_crash":
            suspected_crashes.append(item)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "timeWindow": {
            "since": since.isoformat() if since is not None else None,
            "until": until.isoformat() if until is not None else None,
        },
        "totalEvents": len(events),
        "byEvent": dict(event_counter),
        "suspectedCrashCount": len(suspected_crashes),
        "topRoutes": [
            {"route": route_name, "count": count}
            for route_name, count in route_counter.most_common(10)
        ],
        "topGids": [
            {"gid": gid_name, "count": count}
            for gid_name, count in gid_counter.most_common(10)
        ],
        "topBrowsers": [
            {"browser": browser_name, "count": count}
            for browser_name, count in browser_counter.most_common(10)
        ],
        "recentSuspectedCrashes": suspected_crashes[:20],
    }


def _iter_log_lines() -> Iterable[str]:
    for path in _resolve_runtime_log_files():
        try:
            with path.open("r", encoding="utf-8") as file:
                lines = file.readlines()
        except OSError:
            continue
        for line in reversed(lines):
            stripped = line.strip()
            if stripped:
                yield stripped


def _resolve_runtime_log_files() -> list[Path]:
    base_path = Path(runtime_events_log_file)
    pattern = f"{base_path.name}*"
    files = sorted(
        Path(log_dir).glob(pattern),
        key=lambda item: item.stat().st_mtime if item.exists() else 0.0,
        reverse=True,
    )
    if base_path.exists() and base_path not in files:
        files.insert(0, base_path)
    return files


def _parse_event_line(line: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _matches_filters(
    item: dict[str, Any],
    *,
    event: str | None,
    runtime_session_id: str | None,
    chat_session_id: str | None,
    gid: str | None,
    route: str | None,
    user_email: str | None,
    since: datetime | None,
    until: datetime | None,
) -> bool:
    if event and _coerce_string(item.get("event")) != event:
        return False
    if runtime_session_id and _coerce_string(item.get("runtimeSessionId")) != runtime_session_id:
        return False
    if chat_session_id and _coerce_string(item.get("chatSessionId")) != chat_session_id:
        return False
    if gid and _coerce_string(item.get("gid")) != gid:
        return False
    if route and _coerce_string(item.get("route")) != route:
        return False
    if user_email and _coerce_string(item.get("userEmail")) != user_email:
        return False

    event_time = _resolve_event_timestamp(item)
    if since is not None and event_time is not None and event_time < since:
        return False
    if until is not None and event_time is not None and event_time > until:
        return False
    return True


def _resolve_event_timestamp(item: dict[str, Any]) -> datetime | None:
    for key in ("recordedAt", "occurredAt", "lastSeenAt", "startedAt"):
        value = _coerce_string(item.get(key))
        timestamp = _parse_datetime(value)
        if timestamp is not None:
            return timestamp
    return None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _sanitize_value(value: Any, *, depth: int = 0) -> Any:
    if depth >= MAX_DEPTH:
        return _truncate_string(str(value))
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _truncate_string(value)
    if isinstance(value, dict):
        items = list(value.items())[:MAX_COLLECTION_ITEMS]
        return {
            str(key): _sanitize_value(item, depth=depth + 1)
            for key, item in items
        }
    if isinstance(value, (list, tuple, set)):
        return [
            _sanitize_value(item, depth=depth + 1)
            for item in list(value)[:MAX_COLLECTION_ITEMS]
        ]
    return _truncate_string(str(value))


def _truncate_string(value: str) -> str:
    if len(value) <= MAX_STRING_LENGTH:
        return value
    return f"{value[:MAX_STRING_LENGTH]}...<truncated>"


def _coerce_string(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _extract_browser_label(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    ua = user_agent.lower()
    if "wxwork" in ua or "wecom" in ua:
        return "wecom"
    if "edg/" in ua:
        return "edge"
    if "chrome/" in ua:
        return "chrome"
    if "safari/" in ua and "chrome/" not in ua:
        return "safari"
    if "firefox/" in ua:
        return "firefox"
    return "other"


def resolve_since_hours(hours: int | None, *, default_hours: int = 24) -> datetime:
    normalized = default_hours if hours is None else max(1, min(int(hours), 24 * 30))
    return datetime.now(timezone.utc) - timedelta(hours=normalized)


__all__ = [
    "build_runtime_event_summary",
    "query_runtime_events",
    "record_runtime_event",
    "resolve_since_hours",
]
