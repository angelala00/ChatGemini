from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status

from app.auth.auth_routes import get_current_user
from app.runtime_events import (
    build_runtime_event_summary,
    query_runtime_events,
    record_runtime_event,
    resolve_since_hours,
)

router = APIRouter(prefix="/api/client-runtime", tags=["runtime"])


@router.post("/event")
async def ingest_runtime_event(
    request: Request,
    payload: Any = Body(...),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    events = _normalize_events_payload(payload)
    recorded: list[dict[str, Any]] = []
    for item in events[:50]:
        recorded.append(record_runtime_event(item, user=user, request=request))
    return {"accepted": len(recorded)}


@router.get("/events")
async def get_runtime_events(
    event: str | None = Query(None),
    runtime_session_id: str | None = Query(None, alias="runtimeSessionId"),
    chat_session_id: str | None = Query(None, alias="chatSessionId"),
    gid: str | None = Query(None),
    route: str | None = Query(None),
    user_email: str | None = Query(None, alias="userEmail"),
    since: str | None = Query(None),
    until: str | None = Query(None),
    hours: int | None = Query(24, ge=1, le=24 * 30),
    limit: int = Query(100, ge=1, le=500),
    _: dict = Depends(get_current_user),
) -> dict[str, Any]:
    since_dt = _parse_timestamp(since, "since") if since else resolve_since_hours(hours)
    until_dt = _parse_timestamp(until, "until") if until else None
    items = query_runtime_events(
        event=event,
        runtime_session_id=runtime_session_id,
        chat_session_id=chat_session_id,
        gid=gid,
        route=route,
        user_email=user_email,
        since=since_dt,
        until=until_dt,
        limit=limit,
    )
    return {
        "items": items,
        "count": len(items),
        "timeWindow": {
            "since": since_dt.isoformat() if since_dt is not None else None,
            "until": until_dt.isoformat() if until_dt is not None else None,
        },
    }


@router.get("/summary")
async def get_runtime_summary(
    since: str | None = Query(None),
    until: str | None = Query(None),
    hours: int | None = Query(24, ge=1, le=24 * 30),
    limit: int = Query(1000, ge=1, le=5000),
    _: dict = Depends(get_current_user),
) -> dict[str, Any]:
    since_dt = _parse_timestamp(since, "since") if since else resolve_since_hours(hours)
    until_dt = _parse_timestamp(until, "until") if until else None
    return build_runtime_event_summary(
        since=since_dt,
        until=until_dt,
        limit=limit,
    )


def _normalize_events_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        events = payload
    elif isinstance(payload, dict) and isinstance(payload.get("events"), list):
        events = payload["events"]
    elif isinstance(payload, dict):
        events = [payload]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid runtime events payload",
        )

    normalized: list[dict[str, Any]] = []
    for item in events:
        if not isinstance(item, dict):
            continue
        normalized.append(item)
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="no valid runtime events found",
        )
    return normalized


def _parse_timestamp(value: str, field_name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid {field_name} timestamp",
        ) from error
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


__all__ = ["router"]
