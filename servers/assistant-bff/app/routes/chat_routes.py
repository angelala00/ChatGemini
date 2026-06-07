import inspect
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool
from app.auth.auth_routes import get_current_auth_provider, get_current_user
from app.storage.business_store import (
    delete_session_history,
    get_session_history_meta,
    list_session_history_meta,
    load_session_client_history,
    load_session_history,
    save_session_client_history,
    save_session_history,
    update_session_history_title,
    upsert_session_history_meta,
)
from .gpts_routes import (
    apply_admin_model_config_overrides,
    apply_runtime_gpt_defaults,
    apply_runtime_model_visibility,
    auth_ok,
    ensure_gpt_access_allowed,
    filter_models_for_user,
    gpts,
)
from app.gpts.model_metadata import resolve_model_configs
from .file_routes import extract_text_from_file_ids
from app.logger import gpt_logger
from app.chat_service import (
    StreamHandledError,
    chat_with_react_as_function_call,
    chat_with_gpt,
)
from app.chat_kernel_service import chat_with_kernel_gptassistant
from app.chat_kernel_service import KERNEL_HISTORY_PREFIX
from app.chat_kernel_regulation_service import KERNEL_HISTORY_PREFIX as REGULATION_KERNEL_HISTORY_PREFIX
from app.utils.model_tool import MODEL_NAME_THINKING
from app.metrics.events import create_usage_event
from app.tracing import create_chat_trace


def _invoke_chat_function(func, args, *, usage_tracker, trace_recorder):
    kwargs = {}
    parameters = inspect.signature(func).parameters
    if "usage_tracker" in parameters:
        kwargs["usage_tracker"] = usage_tracker
    if "trace_recorder" in parameters:
        kwargs["trace_recorder"] = trace_recorder
    return func(*args, **kwargs)


def _count_file_ids(file_ids: Optional[str]) -> int:
    if not file_ids:
        return 0
    return sum(1 for file_id in file_ids.split(",") if file_id.strip())


async def _stream_with_metrics(generator, tracker):
    start_time = time.perf_counter()
    try:
        async for chunk in generator:
            yield chunk
    except Exception as exc:  # pragma: no cover - streaming errors are propagated
        tracker.finalize(status="error", latency_ms=(time.perf_counter() - start_time) * 1000, error=str(exc))
        if isinstance(exc, StreamHandledError):
            return
        raise
    else:
        tracker.finalize(status="success", latency_ms=(time.perf_counter() - start_time) * 1000)


def _persist_session_client_history_from_runtime(conversation_id: str, gid: str) -> None:
    runtime_history = _load_runtime_history(conversation_id, gid)
    client_history = _runtime_history_to_client_history(runtime_history, gid)
    if not client_history:
        gpt_logger.warning(
            "session_client_history_persist_skipped conversation_id=%s gid=%s reason=empty_runtime_history",
            conversation_id,
            gid,
        )
        return
    save_session_client_history(conversation_id, client_history)
    gpt_logger.info(
        "session_client_history_persisted conversation_id=%s gid=%s message_count=%s",
        conversation_id,
        gid,
        len(client_history),
    )


async def _stream_with_session_client_history(generator, conversation_id: str, gid: str):
    async for chunk in generator:
        yield chunk
    try:
        _persist_session_client_history_from_runtime(conversation_id, gid)
    except Exception as exc:  # pragma: no cover - response streaming must not fail after completion
        gpt_logger.exception(
            "session_client_history_persist_failed conversation_id=%s gid=%s error=%s",
            conversation_id,
            gid,
            exc,
        )


def _dump_model(model):
    if hasattr(model, "model_dump"):
        return model.model_dump()
    if hasattr(model, "dict"):
        return model.dict()
    return model


router = APIRouter(prefix="/api", tags=["chat"])


async def generate_conversation_id():
    """基于时间戳和随机数生成唯一的 conversation_id"""
    timestamp = int(time.time() * 1000)  # 毫秒级时间戳
    random_uuid = uuid.uuid4().hex  # 生成随机 UUID
    return f"{timestamp}_{random_uuid}"


def _derive_session_title(query: str) -> str:
    normalized = " ".join((query or "").strip().split())
    if len(normalized) <= 48:
        return normalized
    return f"{normalized[:48].rstrip()}..."


class QueryRequest(BaseModel):
    query: str
    conversation_id: str = None
    file_ids: str = None
    model: str = None
    base_model: str = None
    reasoning_enabled: Optional[bool] = None


class SessionTitleUpdateRequest(BaseModel):
    title: str


class LegacyAttachmentPayload(BaseModel):
    data: str = ""
    mimeType: str = ""


class LegacySessionMessagePayload(BaseModel):
    role: str
    parts: str | None = None
    timestamp: int | None = None
    title: str | None = None
    attachment: LegacyAttachmentPayload | None = None


class LocalSessionImportItem(BaseModel):
    session_id: str
    conversation_id: str | None = None
    gid: str | None = None
    history: list[LegacySessionMessagePayload]


class LocalSessionImportRequest(BaseModel):
    items: list[LocalSessionImportItem]


class SessionCoverageItem(BaseModel):
    conversation_id: str
    gid: str | None = None
    source: str
    reason: str | None = None


class SessionCoverageReportRequest(BaseModel):
    phase: str
    grace_expires_at: str | None = None
    local_total_count: int = 0
    server_count: int = 0
    local_only_count: int = 0
    items: list[SessionCoverageItem] = []


def _runtime_history_key(conversation_id: str, gid: str) -> str:
    if gid == "gptassistant":
        return f"{KERNEL_HISTORY_PREFIX}{conversation_id}"
    if gid == "regulationassistant":
        return f"{REGULATION_KERNEL_HISTORY_PREFIX}{conversation_id}"
    return conversation_id


def _load_runtime_history(conversation_id: str, gid: str) -> list:
    preferred_key = _runtime_history_key(conversation_id, gid)
    preferred_history = load_session_history(preferred_key)
    if preferred_history:
        return preferred_history
    if preferred_key != conversation_id:
        return load_session_history(conversation_id)
    return preferred_history


def _runtime_history_to_client_history(history: list, gid: str) -> list[dict]:
    client_history: list[dict] = []
    for item in history:
        role = str(_message_field(item, "role") or "")
        if role == "system":
            continue
        if role == "user":
            content = _message_field(item, "content", "")
            if isinstance(content, list):
                text_parts: list[str] = []
                for block in content:
                    if _message_field(block, "type") == "text":
                        text = str(_message_field(block, "text") or "").strip()
                        if text:
                            text_parts.append(text)
                content = "\n".join(text_parts)
            elif not isinstance(content, str):
                content = str(content or "")
            client_history.append(
                {
                    "role": "user",
                    "parts": content,
                    "timestamp": int(_message_field(item, "timestamp") or 0),
                }
            )
            continue
        if role == "assistant":
            content = _message_field(item, "content", "")
            if isinstance(content, str):
                rendered = content
            elif isinstance(content, list):
                parts: list[str] = []
                for block in content:
                    block_type = _message_field(block, "type")
                    if block_type == "thinking":
                        thinking = str(_message_field(block, "thinking") or "").strip()
                        if thinking:
                            parts.append(f"<think>{thinking}</think>")
                    elif block_type == "text":
                        text = str(_message_field(block, "text") or "")
                        if text:
                            parts.append(text)
                rendered = "\n\n".join(part for part in parts if part)
            else:
                rendered = str(content or "")
            client_history.append(
                {
                    "role": "model",
                    "parts": rendered,
                    "timestamp": int(_message_field(item, "timestamp") or 0),
                }
            )
    return client_history


def _message_field(item: Any, field: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(field, default)
    return getattr(item, field, default)


def _legacy_client_history_to_runtime_history(history: list[LegacySessionMessagePayload], gid: str) -> list[dict]:
    runtime_history: list[dict] = []
    for item in history:
        parts = (item.parts or "").strip()
        timestamp = int(item.timestamp or 0)
        if item.role == "user":
            if gid == "gptassistant":
                runtime_history.append(
                    {
                        "role": "user",
                        "content": parts,
                        "timestamp": timestamp,
                    }
                )
            else:
                runtime_history.append(
                    {
                        "role": "user",
                        "content": parts,
                    }
                )
        elif item.role == "model":
            if gid == "gptassistant":
                runtime_history.append(
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": parts}],
                        "api": "",
                        "provider": "",
                        "model": "",
                        "response_id": None,
                        "usage": None,
                        "stop_reason": "stop",
                        "error_message": None,
                        "timestamp": timestamp,
                    }
                )
            else:
                runtime_history.append(
                    {
                        "role": "assistant",
                        "content": parts,
                    }
                )
    return runtime_history


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    items = list_session_history_meta(
        user_id=user.get("sub", "unknown"),
        auth_provider=get_current_auth_provider(user),
        limit=limit,
    )
    return {"items": items}


@router.get("/sessions/{conversation_id}")
async def get_session(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    auth_provider = get_current_auth_provider(user)
    meta = get_session_history_meta(conversation_id)
    if (
        not meta
        or meta.get("user_id") != user.get("sub", "unknown")
        or meta.get("auth_provider") != auth_provider
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    client_history = load_session_client_history(conversation_id)
    if not client_history:
        client_history = _runtime_history_to_client_history(
            _load_runtime_history(conversation_id, meta.get("gid") or "gptassistant"),
            meta.get("gid") or "gptassistant",
        )
        if client_history:
            save_session_client_history(conversation_id, client_history)
    return {
        "item": {
            **meta,
            "history": client_history,
        }
    }


@router.patch("/sessions/{conversation_id}/title")
async def update_session_title(
    conversation_id: str,
    request: SessionTitleUpdateRequest,
    user: dict = Depends(get_current_user),
):
    auth_provider = get_current_auth_provider(user)
    meta = get_session_history_meta(conversation_id)
    if (
        not meta
        or meta.get("user_id") != user.get("sub", "unknown")
        or meta.get("auth_provider") != auth_provider
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    update_session_history_title(conversation_id, request.title)
    updated = get_session_history_meta(conversation_id)
    return {"item": updated}


@router.delete("/sessions/{conversation_id}")
async def delete_session(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    auth_provider = get_current_auth_provider(user)
    meta = get_session_history_meta(conversation_id)
    if (
        not meta
        or meta.get("user_id") != user.get("sub", "unknown")
        or meta.get("auth_provider") != auth_provider
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    runtime_key = _runtime_history_key(conversation_id, meta.get("gid") or "gptassistant")
    if runtime_key != conversation_id:
        delete_session_history(runtime_key)
    delete_session_history(conversation_id)
    return {"ok": True}


def _import_local_sessions_batch(
    items: list[LocalSessionImportItem],
    user_email: str,
    user_id: str,
    auth_provider: str,
) -> dict[str, int]:
    imported = 0
    skipped = 0
    try:
        for item in items:
            conversation_id = (item.conversation_id or item.session_id or "").strip()
            if not conversation_id or not item.history:
                skipped += 1
                continue
            gid = (item.gid or "gptassistant").strip() or "gptassistant"
            client_history = [history_item.model_dump() for history_item in item.history]
            runtime_history = _legacy_client_history_to_runtime_history(item.history, gid)
            title = ""
            for history_item in item.history:
                if history_item.title and history_item.title.strip():
                    title = history_item.title.strip()
                    break
            if not title:
                title = _derive_session_title(item.history[0].parts or conversation_id)
            save_session_client_history(conversation_id, client_history)
            if runtime_history and not _load_runtime_history(conversation_id, gid):
                save_session_history(_runtime_history_key(conversation_id, gid), runtime_history)
            upsert_session_history_meta(
                conversation_id=conversation_id,
                user_id=user_id,
                user_email=user_email,
                auth_provider=auth_provider,
                gid=gid,
                title=title,
            )
            imported += 1
    except Exception as exc:  # pragma: no cover - logged for production diagnosis
        gpt_logger.exception(
            "path=import_local_sessions_failed user=%s user_id=%s imported=%s skipped=%s error=%s at=%s",
            user_email,
            user_id,
            imported,
            skipped,
            exc,
            time.strftime("%Y-%m-%d %H:%M:%S"),
        )
        raise
    gpt_logger.info(
        "path=import_local_sessions_done user=%s user_id=%s imported=%s skipped=%s at=%s",
        user_email,
        user_id,
        imported,
        skipped,
        time.strftime("%Y-%m-%d %H:%M:%S"),
    )
    return {"imported": imported, "skipped": skipped}


@router.post("/sessions/import-local")
async def import_local_sessions(
    request: LocalSessionImportRequest,
    user: dict = Depends(get_current_user),
):
    user_email = user.get("email", "")
    user_id = user.get("sub", "unknown")
    auth_provider = get_current_auth_provider(user)
    gpt_logger.info(
        "path=import_local_sessions_accepted user=%s user_id=%s auth_provider=%s items=%s at=%s",
        user_email,
        user_id,
        auth_provider,
        len(request.items),
        time.strftime("%Y-%m-%d %H:%M:%S"),
    )
    result = await run_in_threadpool(
        _import_local_sessions_batch,
        request.items,
        user_email,
        user_id,
        auth_provider,
    )
    return {"ok": True, "accepted": len(request.items), **result}


@router.post("/sessions/coverage-report")
async def report_session_coverage(
    request: SessionCoverageReportRequest,
    user: dict = Depends(get_current_user),
):
    user_email = user.get("email", "")
    user_id = user.get("sub", "unknown")
    detail = [
        {
            "conversation_id": item.conversation_id,
            "gid": item.gid or "gptassistant",
            "source": item.source,
            "reason": item.reason or "",
        }
        for item in request.items[:50]
    ]
    gpt_logger.info(
        "path=session_coverage_report user=%s user_id=%s phase=%s server_count=%s local_total_count=%s local_only_count=%s grace_expires_at=%s items=%s at=%s",
        user_email,
        user_id,
        request.phase,
        request.server_count,
        request.local_total_count,
        request.local_only_count,
        request.grace_expires_at or "",
        detail,
        time.strftime("%Y-%m-%d %H:%M:%S"),
    )
    return {"ok": True}


async def _get_gid_model_config(
    gid: str,
    requested_model: Optional[str],
    *,
    user_email: str,
    user_id: Optional[str] = None,
):
    assistant_config = apply_runtime_gpt_defaults(gid, gpts.get(gid, {}))
    all_models = assistant_config.get("models", [])
    runtime_models = apply_admin_model_config_overrides(gid, all_models)
    runtime_visible_models = apply_runtime_model_visibility(gid, runtime_models)
    visible_models = filter_models_for_user(runtime_visible_models, user_email, user_id)
    visible_model_ids = {
        item.get("id")
        for item in visible_models
        if isinstance(item, dict)
    }
    models = await resolve_model_configs(visible_models)
    models = apply_admin_model_config_overrides(gid, models, include_missing=False)
    default_model = assistant_config.get("default_model", "")
    selected_model = requested_model or default_model

    if requested_model and requested_model not in visible_model_ids:
        for item in runtime_visible_models:
            if item.get("id") == requested_model:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "No Authorized")

    for item in models:
        if item.get("id") == selected_model:
            return item

    for item in models:
        if item.get("id") == default_model:
            return item

    return models[0] if models else None


def _resolve_default_reasoning(assistant_config: dict, gid: str) -> bool:
    runtime_config = apply_runtime_gpt_defaults(gid, assistant_config)
    return bool(runtime_config.get("default_reasoning", True))


@router.post("/chat")
async def chat_with_gpt_assistant(request: QueryRequest, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpt user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    upsert_session_history_meta(
        conversation_id=cid,
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email", ""),
        auth_provider=get_current_auth_provider(user),
        gid="gptassistant",
        title=_derive_session_title(request.query),
    )
    assistant_config = apply_runtime_gpt_defaults("gptassistant", gpts["gptassistant"])
    system_prompt = assistant_config["system_prompt"]
    user_prompt = request.query
    selected_model_config = await _get_gid_model_config(
        "gptassistant",
        request.base_model or request.model,
        user_email=user["email"],
        user_id=user.get("sub"),
    )
    if not selected_model_config:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no available models")
    model_name = selected_model_config.get("model_name") or selected_model_config.get("id")
    reasoning_enabled = (
        bool(request.reasoning_enabled)
        if request.reasoning_enabled is not None
        else _resolve_default_reasoning(assistant_config, "gptassistant")
    )
    if not selected_model_config.get("supports_reasoning", False):
        reasoning_enabled = False
    upload_count = _count_file_ids(request.file_ids)
    tracker = create_usage_event(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid="gptassistant",
        requested_model=model_name,
        upload_count=upload_count,
    )
    trace_recorder = create_chat_trace(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid="gptassistant",
        route="/api/chat",
        requested_model=request.base_model or request.model or model_name,
        selected_model=model_name,
        reasoning_enabled=reasoning_enabled,
        query=request.query,
        system_prompt=system_prompt,
        file_ids=request.file_ids,
        request_payload=_dump_model(request),
    )
    if trace_recorder:
        trace_recorder.log(
            "request.received",
            {
                "conversation_id": cid,
                "query": request.query,
                "file_ids": request.file_ids,
                "model": request.model,
                "base_model": request.base_model,
                "reasoning_enabled": reasoning_enabled,
            },
        )
        trace_recorder.log(
            "request.normalized",
            {
                "conversation_id": cid,
                "user_prompt": user_prompt,
                "file_ids": request.file_ids,
                "model_name": model_name,
            },
        )
    chat_function = chat_with_gpt
    try:
        generator = _invoke_chat_function(
            chat_function,
            (
                user_prompt,
                cid,
                system_prompt,
                model_name,
                "gptassistant",
                request.file_ids,
                reasoning_enabled,
                selected_model_config,
            ),
            usage_tracker=tracker,
            trace_recorder=trace_recorder,
        )
    except Exception as exc:
        tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
        if trace_recorder:
            trace_recorder.finalize(status="error", error=str(exc), duration_ms=0.0)
        raise
    return StreamingResponse(
        _stream_with_session_client_history(
            _stream_with_metrics(generator, tracker),
            cid,
            "gptassistant",
        ),
        media_type="text/event-stream",
    )


@router.post("/chat-v2")
async def chat_with_gpt_assistant_v2(request: QueryRequest, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpt_assistant_v2 user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    upsert_session_history_meta(
        conversation_id=cid,
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email", ""),
        auth_provider=get_current_auth_provider(user),
        gid="gptassistant",
        title=_derive_session_title(request.query),
    )
    assistant_config = apply_runtime_gpt_defaults("gptassistant", gpts["gptassistant"])
    system_prompt = assistant_config["system_prompt"]
    selected_model_config = await _get_gid_model_config(
        "gptassistant",
        request.base_model or request.model,
        user_email=user["email"],
        user_id=user.get("sub"),
    )
    if not selected_model_config:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no available models")

    reasoning_enabled = (
        bool(request.reasoning_enabled)
        if request.reasoning_enabled is not None
        else _resolve_default_reasoning(assistant_config, "gptassistant")
    )
    if not selected_model_config.get("supports_reasoning", False):
        reasoning_enabled = False

    model_name = selected_model_config.get("model_name") or selected_model_config.get("id")
    upload_count = _count_file_ids(request.file_ids)
    tracker = create_usage_event(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid="gptassistant-v2",
        requested_model=model_name,
        upload_count=upload_count,
    )
    trace_recorder = create_chat_trace(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid="gptassistant",
        route="/api/chat-v2",
        requested_model=request.base_model or request.model or model_name,
        selected_model=model_name,
        reasoning_enabled=reasoning_enabled,
        query=request.query,
        system_prompt=system_prompt,
        file_ids=request.file_ids,
        request_payload=_dump_model(request),
    )
    if trace_recorder:
        trace_recorder.log(
            "request.received",
            {
                "conversation_id": cid,
                "query": request.query,
                "file_ids": request.file_ids,
                "model": request.model,
                "base_model": request.base_model,
                "reasoning_enabled": reasoning_enabled,
            },
        )
    try:
        generator = chat_with_kernel_gptassistant(
            request.query,
            cid,
            system_prompt,
            selected_model_config,
            file_ids=request.file_ids,
            reasoning_enabled=reasoning_enabled,
            usage_tracker=tracker,
            trace_recorder=trace_recorder,
        )
    except Exception as exc:
        tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
        if trace_recorder:
            trace_recorder.finalize(status="error", error=str(exc), duration_ms=0.0)
        raise
    return StreamingResponse(
        _stream_with_session_client_history(generator, cid, "gptassistant"),
        media_type="text/event-stream",
    )


@router.post("/{gid}/chat-messages")
async def chat_with_gpts(request: QueryRequest, gid: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    upsert_session_history_meta(
        conversation_id=cid,
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email", ""),
        auth_provider=get_current_auth_provider(user),
        gid=gid,
        title=_derive_session_title(request.query),
    )
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    ensure_gpt_access_allowed(user, gid)
    assistant_config = gpts[gid]
    if not auth_ok(assistant_config, user["email"], user.get("sub")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No Authorized")
    if gid == "regulationassistant":
        selected_model_config = await _get_gid_model_config(
            gid,
            request.base_model or request.model,
            user_email=user["email"],
            user_id=user.get("sub"),
        )
        if not selected_model_config:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "no available models")

        reasoning_enabled = (
            bool(request.reasoning_enabled)
            if request.reasoning_enabled is not None
            else bool(assistant_config.get("default_reasoning", False))
        )
        if not selected_model_config.get("supports_reasoning", False):
            reasoning_enabled = False

        tracker = create_usage_event(
            user_id=user.get("sub", "unknown"),
            user_email=user.get("email"),
            conversation_id=cid,
            gid=gid,
            requested_model=selected_model_config.get("model_name") or selected_model_config.get("id"),
            upload_count=0,
        )
        trace_recorder = create_chat_trace(
            user_id=user.get("sub", "unknown"),
            user_email=user.get("email"),
            conversation_id=cid,
            gid=gid,
            route=f"/api/{gid}/chat-messages",
            requested_model=request.base_model or request.model or selected_model_config.get("model_name") or selected_model_config.get("id"),
            selected_model=selected_model_config.get("model_name") or selected_model_config.get("id"),
            reasoning_enabled=reasoning_enabled,
            query=request.query,
            system_prompt=assistant_config["system_prompt"],
            file_ids=request.file_ids,
            request_payload=_dump_model(request),
        )
        if trace_recorder:
            trace_recorder.log(
                "request.received",
                {
                    "conversation_id": cid,
                    "query": request.query,
                    "file_ids": request.file_ids,
                    "gid": gid,
                    "reasoning_enabled": reasoning_enabled,
                },
            )
        try:
            generator = assistant_config["chat_function"](
                request.query,
                cid,
                assistant_config["system_prompt"],
                selected_model_config,
                gid,
                reasoning_enabled=reasoning_enabled,
                usage_tracker=tracker,
                show_reasoning=True,
                trace_recorder=trace_recorder,
            )
        except Exception as exc:
            tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
            if trace_recorder:
                trace_recorder.finalize(status="error", error=str(exc), duration_ms=0.0)
            raise
        return StreamingResponse(
            _stream_with_session_client_history(generator, cid, gid),
            media_type="text/event-stream",
        )
    system_prompt = assistant_config["system_prompt"]
    model_name = MODEL_NAME_THINKING
    if "model_name" in gpts[gid]:
        model_name = gpts[gid]["model_name"]
    user_prompt = request.query
    upload_count = _count_file_ids(request.file_ids)
    if request.file_ids:
        user_prompt += await extract_text_from_file_ids(request.file_ids)
    # print(f"user_prompt:{user_prompt}")
    tracker = create_usage_event(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid=gid,
        requested_model=model_name,
        upload_count=upload_count,
    )
    tracker.set_model(model_name)
    trace_recorder = create_chat_trace(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid=gid,
        route=f"/api/{gid}/chat-messages",
        requested_model=request.base_model or request.model or model_name,
        selected_model=model_name,
        reasoning_enabled=False,
        query=user_prompt,
        system_prompt=system_prompt,
        file_ids=request.file_ids,
        request_payload=_dump_model(request),
    )
    if trace_recorder:
        trace_recorder.log(
            "request.received",
            {
                "conversation_id": cid,
                "query": request.query,
                "file_ids": request.file_ids,
                "gid": gid,
                "resolved_model": model_name,
            },
        )
    chat_function = chat_with_react_as_function_call
    if "chat_function" in gpts[gid]:
        chat_function = gpts[gid]["chat_function"]
    try:
        generator = _invoke_chat_function(
            chat_function,
            (user_prompt, cid, system_prompt, model_name, gid),
            usage_tracker=tracker,
            trace_recorder=trace_recorder,
        )
    except Exception as exc:
        tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
        if trace_recorder:
            trace_recorder.finalize(status="error", error=str(exc), duration_ms=0.0)
        raise
    return StreamingResponse(
        _stream_with_session_client_history(
            _stream_with_metrics(generator, tracker),
            cid,
            gid,
        ),
        media_type="text/event-stream",
    )
