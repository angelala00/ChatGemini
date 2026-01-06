import inspect
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.auth.auth_routes import get_current_user
from .gpts_routes import gpts
from .file_routes import extract_text_from_file_ids
from app.logger import gpt_logger
from app.chat_service import (
    StreamHandledError,
    chat_with_react_as_function_call,
    chat_with_gpt,
)
from app.utils.model_tool import MODEL_NAME_THINKING
from app.metrics.events import create_usage_event
from app.utils.model_tool import MODEL_NAME_THINKING, MODEL_NAME_INSTRUCT

def _invoke_chat_function(func, args, *, usage_tracker):
    if "usage_tracker" in inspect.signature(func).parameters:
        return func(*args, usage_tracker=usage_tracker)
    return func(*args)


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


@router.post("/chat")
async def chat_with_gpt_assistant(request: QueryRequest, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpt user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    system_prompt = gpts["gptassistant"]["system_prompt"]
    user_prompt = request.query
    model_name = request.model
    print(f"request.file_ids:{request.file_ids}")
    # if request.file_ids:
    #     user_prompt += extract_text_from_file_ids(request.file_ids)
    print(f"user_prompt:{user_prompt}")
    upload_count = _count_file_ids(request.file_ids)
    tracker = create_usage_event(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid="gptassistant",
        requested_model=model_name,
        upload_count=upload_count,
    )
    chat_function = chat_with_gpt
    try:
        generator = _invoke_chat_function(
            chat_function,
            (user_prompt, cid, system_prompt, model_name, "gptassistant", request.file_ids),
            usage_tracker=tracker,
        )
    except Exception as exc:
        tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
        raise
    return StreamingResponse(
        _stream_with_metrics(generator, tracker),
        media_type="text/event-stream",
    )

#
# @router.post("/{gid}/chat-messages")
# async def chat_with_gpts(request: QueryRequest, gid: str, user: dict = Depends(get_current_user)):
#     gpt_logger.info(f"path=chat_with_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
#     if not request.conversation_id:
#         request.conversation_id = await generate_conversation_id()
#     cid = request.conversation_id
#     if gid not in gpts:
#         raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
#     system_prompt = gpts[gid]["system_prompt"]
#     model_name = MODEL_NAME_THINKING
#     if "model_name" in gpts[gid]:
#         model_name = gpts[gid]["model_name"]
#     user_prompt = request.query
#     upload_count = _count_file_ids(request.file_ids)
#     if request.file_ids:
#         user_prompt += await extract_text_from_file_ids(request.file_ids)
#     # print(f"user_prompt:{user_prompt}")
#     tracker = create_usage_event(
#         user_id=user.get("sub", "unknown"),
#         user_email=user.get("email"),
#         conversation_id=cid,
#         gid=gid,
#         requested_model=model_name,
#         upload_count=upload_count,
#     )
#     tracker.set_model(model_name)
#     chat_function = chat_with_react_as_function_call
#     if "chat_function" in gpts[gid]:
#         chat_function = gpts[gid]["chat_function"]
#     try:
#         generator = _invoke_chat_function(
#             chat_function,
#             (user_prompt, cid, system_prompt, model_name, gid),
#             usage_tracker=tracker,
#         )
#     except Exception as exc:
#         tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
#         raise
#     return StreamingResponse(
#         _stream_with_metrics(generator, tracker),
#         media_type="text/event-stream",
#     )
@router.post("/{gid}/chat-messages")
async def chat_with_gpts(request: QueryRequest, gid: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")

    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id

    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")

    system_prompt = gpts[gid]["system_prompt"]

    # 获取配置的模型名称
    model_name = MODEL_NAME_THINKING  # 默认为思考模型
    if "model_name" in gpts[gid]:
        model_name = gpts[gid]["model_name"]

    user_prompt = request.query
    upload_count = _count_file_ids(request.file_ids)

    # 如果是思考模型，且有文件，可能需要提取文本拼接到 prompt
    if request.file_ids:
        user_prompt += await extract_text_from_file_ids(request.file_ids)

    tracker = create_usage_event(
        user_id=user.get("sub", "unknown"),
        user_email=user.get("email"),
        conversation_id=cid,
        gid=gid,
        requested_model=model_name,
        upload_count=upload_count,
    )
    tracker.set_model(model_name)
    chat_function = chat_with_react_as_function_call
    call_args = (user_prompt, cid, system_prompt, model_name, gid)
    # 如果配置的是指令模型，强制切换到通用 Agent 模式
    if model_name == MODEL_NAME_INSTRUCT:
        chat_function = chat_with_gpt
        call_args = (user_prompt, cid, system_prompt, model_name, gid, request.file_ids)
    if "chat_function" in gpts[gid]:
        chat_function = gpts[gid]["chat_function"]

    try:
        generator = _invoke_chat_function(
            chat_function,
            call_args,  # 使用动态构建的参数元组
            usage_tracker=tracker,
        )
    except Exception as exc:
        tracker.finalize(status="error", latency_ms=0.0, error=str(exc))
        raise

    return StreamingResponse(
        _stream_with_metrics(generator, tracker),
        media_type="text/event-stream",
    )