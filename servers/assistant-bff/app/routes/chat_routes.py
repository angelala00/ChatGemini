import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.auth.auth_routes import get_current_user
from .gpts_routes import gpts
from .file_routes import extract_text_from_file_ids
from app.logger import gpt_logger
from app.chat_service import chat_with_react_as_function_call, chat_with_gpt
from app.utils.model_tool import MODEL_NAME_THINKING


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
    chat_function = chat_with_gpt
    return StreamingResponse(chat_function(user_prompt, cid, system_prompt, model_name, "gptassistant", request.file_ids), media_type="text/event-stream")


@router.post("/{gid}/chat-messages")
async def chat_with_gpts(request: QueryRequest, gid: str, user: dict = Depends(get_current_user)):
    gpt_logger.info(f"path=chat_with_gpts user={user['email']} at={time.strftime('%Y-%m-%d %H:%M:%S')}")
    if not request.conversation_id:
        request.conversation_id = await generate_conversation_id()
    cid = request.conversation_id
    if gid not in gpts:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "gid not found")
    system_prompt = gpts[gid]["system_prompt"]
    model_name = MODEL_NAME_THINKING
    if "model_name" in gpts[gid]:
        model_name = gpts[gid]["model_name"]
    user_prompt = request.query
    if request.file_ids:
        user_prompt += await extract_text_from_file_ids(request.file_ids)
    # print(f"user_prompt:{user_prompt}")
    chat_function = chat_with_react_as_function_call
    if "chat_function" in gpts[gid]:
        chat_function = gpts[gid]["chat_function"]
    return StreamingResponse(chat_function(user_prompt, cid, system_prompt, model_name, gid), media_type="text/event-stream")
