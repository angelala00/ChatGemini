import inspect
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.auth.auth_routes import get_current_user
from .gpts_routes import auth_ok, ensure_gpt_access_allowed, filter_models_for_user, gpts
from app.gpts.model_metadata import resolve_model_configs
from .file_routes import extract_text_from_file_ids
from app.logger import gpt_logger
from app.chat_service import (
    StreamHandledError,
    chat_with_react_as_function_call,
    chat_with_gpt,
)
from app.chat_kernel_service import chat_with_kernel_gptassistant
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


class QueryRequest(BaseModel):
    query: str
    conversation_id: str = None
    file_ids: str = None
    model: str = None
    base_model: str = None
    reasoning_enabled: Optional[bool] = None


async def _get_gid_model_config(
    gid: str,
    requested_model: Optional[str],
    *,
    user_email: str,
    user_id: Optional[str] = None,
):
    assistant_config = gpts.get(gid, {})
    all_models = assistant_config.get("models", [])
    visible_models = filter_models_for_user(all_models, user_email, user_id)
    visible_model_ids = {
        item.get("id")
        for item in visible_models
        if isinstance(item, dict)
    }
    models = await resolve_model_configs(visible_models)
    default_model = assistant_config.get("default_model", "")
    selected_model = requested_model or default_model

    if requested_model and requested_model not in visible_model_ids:
        for item in all_models:
            if item.get("id") == requested_model:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "No Authorized")

    for item in models:
        if item.get("id") == selected_model:
            return item

    for item in models:
        if item.get("id") == default_model:
            return item

    return models[0] if models else None


@router.post("/chat")
async def chat_with_gpt_assistant(request: QueryRequest, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpt user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    assistant_config = gpts["gptassistant"]
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
        else bool(assistant_config.get("default_reasoning", True))
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
        _stream_with_metrics(generator, tracker),
        media_type="text/event-stream",
    )


@router.post("/chat-v2")
async def chat_with_gpt_assistant_v2(request: QueryRequest, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpt_assistant_v2 user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    assistant_config = gpts["gptassistant"]
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
        else bool(assistant_config.get("default_reasoning", True))
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
    return StreamingResponse(generator, media_type="text/event-stream")


@router.post("/{gid}/chat-messages")
async def chat_with_gpts(request: QueryRequest, gid: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
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
        return StreamingResponse(generator, media_type="text/event-stream")
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
        _stream_with_metrics(generator, tracker),
        media_type="text/event-stream",
    )
