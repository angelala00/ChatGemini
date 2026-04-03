from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from app.tracing import get_chat_trace, list_chat_traces, trace_enabled

router = APIRouter(prefix="/api", tags=["traces"])


@router.get("/chat-traces")
async def get_chat_traces(
    conversation_id: str | None = Query(None, alias="conversationId"),
    limit: int = Query(50, ge=1, le=200),
) -> dict[str, object]:
    return list_chat_traces(conversation_id=conversation_id, limit=limit)


@router.get("/chat-traces/{trace_id}")
async def get_chat_trace_detail(trace_id: str) -> dict[str, object]:
    trace = get_chat_trace(trace_id)
    if trace is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "trace not found")
    return trace


@router.get("/chat-traces/enabled")
async def get_chat_traces_enabled() -> dict[str, bool]:
    return {"enabled": trace_enabled()}


__all__ = ["router"]
