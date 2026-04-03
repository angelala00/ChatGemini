import asyncio
import json
from . import utils  # noqa: F401
from app.utils.tool_register import dispatch_tool, get_tools
from .chat_base import client, match_history, save_match_history
import uuid
from typing import AsyncGenerator, Dict, Any, List, Optional
import traceback
from app.routes.file_routes import extract_text_from_file_ids
from app.routes.file_routes import get_file_paths
from app.routes.file_routes import split_file_ids_by_type
from app.utils.model_tool import convert_image_message, is_image_only
from app.utils.model_tool import (
    MODEL_NAME_VL,
    MODEL_NAME_INSTRUCT,
    MODEL_NAME_THINKING,
    MODEL_NAME_DS,
    MODEL_NAME_QWQ,
)
from app.metrics.events import UsageEventTracker
from app.tracing import ChatTraceRecorder


LEGACY_REASONING_MODELS = {
    MODEL_NAME_DS,
    MODEL_NAME_QWQ,
    MODEL_NAME_THINKING,
}
LEGACY_MULTIMODAL_MODELS = {MODEL_NAME_VL}


def _is_reasoning_model(model_name: str | None):
    return bool(model_name and model_name in LEGACY_REASONING_MODELS)


def _is_multimodal_model(model_name: str | None):
    return bool(model_name and model_name in LEGACY_MULTIMODAL_MODELS)


class StreamHandledError(Exception):
    """Raised when a streaming error has already been sent to the client."""


async def chat_with_react_as_function_call(
    query,
    conversation_id,
    system_prompt,
    model_name,
    gid,
    file_ids: str = None,
    show_reasoning: bool = True,
    usage_tracker: Optional[UsageEventTracker] = None,
    trace_recorder: Optional[ChatTraceRecorder] = None,
):
    if usage_tracker:
        usage_tracker.set_model(model_name)
    if trace_recorder:
        trace_recorder.update(selected_model=model_name)
    # 获取当前对话历史（如果不存在则创建）
    messages = match_history.setdefault(conversation_id, [])

    # 确保 system prompt 只添加一次
    if not messages or messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})
    if file_ids:
        file_paths = get_file_paths(file_ids)
        messages.append({"role": "user", "content": convert_image_message(file_paths, query)})
    else:
        messages.append({"role": "user", "content": query})
    trace_finished = False

    def finalize_trace(status: str, *, error: Optional[str] = None, response_preview: Optional[str] = None) -> None:
        nonlocal trace_finished
        if not trace_recorder or trace_finished:
            return
        trace_recorder.finalize(
            status=status,
            error=error,
            duration_ms=None,
            response_preview=response_preview,
        )
        trace_finished = True

    try:
        # 3. 调用大模型
        # 使用异步方式调用模型
        if trace_recorder:
            trace_recorder.log(
                "model.request",
                {
                    "conversation_id": conversation_id,
                    "model": model_name,
                    "temperature": 0.7,
                    "messages": messages,
                },
            )
        response = await client.chat.completions.create(model=model_name, messages=messages, temperature=0.7,
                                                        stream=True)
        think_begin = False
        think_end = False
        max_retry = 3
        for attempt_index in range(1, max_retry + 1):
            think_tag_detected = False  # 标记是否已遇到 </think>
            post_think_tokens = []  # 缓冲 </think> 后的 token
            function_check_done = False  # 是否已经完成前三 token 的检查
            function_mode = False  # 标记是否进入函数调用处理模式
            sum_content = ""
            start_token = True
            filter_think_tag = model_name == "deepseek-r1-distill-qwen-32b"
            async for chunk in response:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta
                if hasattr(delta, "content"):
                    content = delta.content
                    if filter_think_tag and "<think>" in content:
                        content = content.replace("<think>", "", 1)
                        if not content:
                            continue
                    if trace_recorder:
                        trace_recorder.log(
                            "model.delta",
                            {
                                "conversation_id": conversation_id,
                                "attempt": attempt_index,
                                "content": content,
                            },
                        )
                    sum_content = sum_content + content
                    if start_token:
                        start_token = False
                        if show_reasoning and not think_begin:
                            think_begin = True
                            temp = {"event": "message", "conversation_id": conversation_id, "answer": "<think>"}
                            yield f"data: {json.dumps(temp)}\n\n"
                        if show_reasoning:
                            temp = {"event": "message", "conversation_id": conversation_id,
                                    "answer": "<step><summary>思考中</summary>"}
                            yield f"data: {json.dumps(temp)}\n\n"
                    if not think_tag_detected:
                        # 还未遇到 </think>，直接转发内容
                        if "</think>" in content:
                            think_tag_detected = True
                            # 分割出 </think> 前后的内容
                            parts = content.split("</think>", 1)
                            if show_reasoning:
                                temp = {"event": "message", "conversation_id": conversation_id,
                                        "answer": parts[0] + "</step>"}
                                if trace_recorder:
                                    trace_recorder.log(
                                        "model.reasoning_end",
                                        {
                                            "conversation_id": conversation_id,
                                            "attempt": attempt_index,
                                            "content": content,
                                        },
                                    )
                                yield f"data: {json.dumps(temp)}\n\n"
                            elif parts[1]:
                                temp = {"event": "message", "conversation_id": conversation_id, "answer": parts[1]}
                                yield f"data: {json.dumps(temp)}\n\n"
                            # 将标签后的部分先加入缓冲区，后续用于判断
                            if parts[1]:
                                post_think_tokens.append(parts[1])
                        else:
                            temp = {"event": "message", "conversation_id": conversation_id, "answer": content}
                            # print(f"yield:data: {json.dumps(temp)}\n\n")
                            yield f"data: {json.dumps(temp)}\n\n"
                    else:
                        # 已经遇到 </think> 后的逻辑
                        if not function_check_done:
                            # 还在前三 token 检查阶段
                            post_think_tokens.append(content)
                            if len(post_think_tokens) >= 10:
                                combined = "".join(post_think_tokens[:10])
                                if combined.lstrip().startswith("```") and "tool" in combined:
                                    # 检测到函数调用描述，进入函数调用处理模式
                                    function_mode = True
                                    function_check_done = True
                                    # yield"\n\n[系统] 正在处理函数调用，请稍候..."
                                else:
                                    function_check_done = True  # 后续直接流式输出
                        else:
                            # 检查阶段已完成
                            if function_mode:
                                # 处于函数调用处理模式，需要累积完整代码块
                                post_think_tokens.append(content)
                                code_block = "".join(post_think_tokens)
                                # 简单判断：代码块完整标志为出现两次 ``` 分隔符
                                if code_block.count("```") >= 2:
                                    try:
                                        # 提取第一个 ``` 和第二个 ``` 中间的内容
                                        function_json_str = code_block.split("```", 2)[1]
                                        function_json_str = function_json_str.split("json")[1]
                                    except IndexError as e:
                                        function_json_str = ""
                                        if trace_recorder:
                                            trace_recorder.log(
                                                "tool.call_parse_error",
                                                {
                                                    "conversation_id": conversation_id,
                                                    "attempt": attempt_index,
                                                    "error": str(e),
                                                    "content": code_block,
                                                },
                                            )
                                    if isinstance(function_json_str, str):
                                        try:
                                            tool_info = json.loads(function_json_str)
                                            if trace_recorder:
                                                trace_recorder.log(
                                                    "model.response",
                                                    {
                                                        "conversation_id": conversation_id,
                                                        "attempt": attempt_index,
                                                        "content": function_json_str,
                                                        "finish_reason": "tool_call",
                                                    },
                                                )
                                            if trace_recorder:
                                                trace_recorder.log(
                                                    "tool.call",
                                                    {
                                                        "conversation_id": conversation_id,
                                                        "attempt": attempt_index,
                                                        "tool_name": tool_info["tool_call"]["name"],
                                                        "arguments": tool_info["tool_call"]["arguments"],
                                                    },
                                                )
                                            chunk_data = {"event": "message", "conversation_id": conversation_id,
                                                          "answer": f"<step><summary>工具调用中</summary>"}
                                            yield f"data: {json.dumps(chunk_data)}\n\n"
                                            chunk_data = {"event": "message", "conversation_id": conversation_id,
                                                          "answer": f"正在调用工具{tool_info['tool_call']['name']}，{tool_info['tool_call']['arguments']}</step>"}
                                            yield f"data: {json.dumps(chunk_data)}\n\n"
                                            messages.append({"role": "assistant", "content": function_json_str})
                                            tool_name = tool_info['tool_call']['name']
                                            if usage_tracker:
                                                usage_tracker.mark_tool(tool_name)
                                            tool_response = await dispatch_tool(tool_name,
                                                                                tool_info['tool_call']['arguments'])
                                            if trace_recorder:
                                                trace_recorder.log(
                                                    "tool.result",
                                                    {
                                                        "conversation_id": conversation_id,
                                                        "attempt": attempt_index,
                                                        "tool_name": tool_name,
                                                        "arguments": tool_info['tool_call']['arguments'],
                                                        "result": tool_response,
                                                    },
                                                )
                                            messages.append({"role": "assistant",
                                                             "content": f"我调用了工具{tool_info['tool_call']['name']}，返回信息如下：{tool_response}，请继续回答用户的问题"})
                                        except json.JSONDecodeError as e:
                                            if trace_recorder:
                                                trace_recorder.log(
                                                    "tool.call_parse_error",
                                                    {
                                                        "conversation_id": conversation_id,
                                                        "attempt": attempt_index,
                                                        "error": str(e),
                                                        "content": function_json_str,
                                                    },
                                                )
                                    break
                            else:
                                if not think_end:
                                    temp = {"event": "message", "conversation_id": conversation_id,
                                            "answer": "<step><summary>完成</summary>完成</step></think>"}
                                    yield f"data: {json.dumps(temp)}\n\n"
                                    think_end = True
                                # temp = {"event": "message", "conversation_id": conversation_id, "answer": "</think>"}
                                # yield f"data: {json.dumps(temp)}\n\n"

                                for token in post_think_tokens:
                                    temp = {"event": "message", "conversation_id": conversation_id, "answer": token}
                                    # print(f"yield:data: {json.dumps(temp)}\n\n")
                                    yield f"data: {json.dumps(temp)}\n\n"
                                post_think_tokens = []  # 清空缓冲区
                                # 非函数模式，直接传输每个 token
                                temp = {"event": "message", "conversation_id": conversation_id, "answer": content}
                                yield f"data: {json.dumps(temp)}\n\n"
                if choice.finish_reason == "stop" and not function_mode:
                    if not function_check_done:
                        temp = {"event": "message", "conversation_id": conversation_id,
                                "answer": "<step><summary>完成</summary>完成</step></think>"}
                        yield f"data: {json.dumps(temp)}\n\n"
                        think_end = True
                        for token in post_think_tokens:
                            temp = {"event": "message", "conversation_id": conversation_id, "answer": token}
                            # print(f"yield:data: {json.dumps(temp)}\n\n")
                            yield f"data: {json.dumps(temp)}\n\n"
                        post_think_tokens = []  # 清空缓冲区
                    if trace_recorder:
                        trace_recorder.log(
                            "model.response",
                            {
                                "conversation_id": conversation_id,
                                "attempt": attempt_index,
                                "content": sum_content,
                                "finish_reason": "stop",
                            },
                        )
                    temp = {"event": "message_end", "conversation_id": conversation_id, "answer": ""}
                    # print(f"yield:data:{json.dumps(temp)}\n\n")
                    yield f"data: {json.dumps(temp)}\n\n"
                    messages.append({"role": "assistant", "content": sum_content})
                    save_match_history(conversation_id)
                    finalize_trace("success", response_preview=sum_content)
                    return  # 退出循环，避免重复处理
            response = await client.chat.completions.create(model=model_name, messages=messages, temperature=0.7,
                                                            stream=True)
    except Exception as e:
        if trace_recorder:
            trace_recorder.log(
                "model.error",
                {
                    "conversation_id": conversation_id,
                    "error": str(e),
                    "model": model_name,
                },
            )
        finalize_trace("error", error=str(e))
        raise
    finally:
        if trace_recorder:
            trace_recorder.log(
                "request.finished",
                {
                    "conversation_id": conversation_id,
                    "model": model_name,
                },
            )


async def _ask_once_stream(messages: List[Dict[str, Any]],
                           tools: List[Dict[str, Any]],
                           model_name: str,
                           trace_recorder: Optional[ChatTraceRecorder] = None) -> AsyncGenerator[Dict[str, Any], None]:
    if trace_recorder:
        trace_recorder.log(
            "model.request",
            {
                "model": model_name,
                "messages": messages,
                "tools": tools,
            },
        )
    if tools:
        stream = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools,
            stream=True,
        )
    else:
        stream = await client.chat.completions.create(
            model=model_name,
            messages=messages,
            stream=True,
        )

    text_buf: List[str] = []
    tc_acc: Dict[int, Dict[str, Any]] = {}
    async for chunk in stream:
        # print(f"chunk:{chunk}")
        for choice in chunk.choices:
            delta = choice.delta
            idx = choice.index
            if getattr(delta, "content", None):
                piece = delta.content
                text_buf.append(piece)
                if trace_recorder:
                    trace_recorder.log(
                        "model.delta",
                        {
                            "model": model_name,
                            "type": "text.delta",
                            "text": piece,
                        },
                    )
                yield {"type": "text.delta", "data": {"text": piece}}

            if getattr(delta, "tool_calls", None):
                for tc in delta.tool_calls:
                    idx = tc.index
                    acc = tc_acc.setdefault(idx, {"id": None, "name": None, "arguments": ""})
                    if getattr(tc, "id", None):
                        acc["id"] = tc.id
                    name_delta = None
                    args_delta = None
                    if tc.function:
                        if getattr(tc.function, "name", None):
                            acc["name"] = tc.function.name
                            name_delta = tc.function.name
                        if getattr(tc.function, "arguments", None):
                            acc["arguments"] += tc.function.arguments
                            args_delta = tc.function.arguments
                    if trace_recorder:
                        trace_recorder.log(
                            "tool.delta",
                            {
                                "model": model_name,
                                "index": idx,
                                "id": acc["id"],
                                "name": name_delta,
                                "arguments_delta": args_delta,
                            },
                        )
                    yield {
                        "type": "tool.delta",
                        "data": {
                            "index": idx,
                            "id": acc["id"],
                            "name": name_delta,
                            "arguments_delta": args_delta
                        }
                    }
    if tc_acc:
        calls = []
        for i in sorted(tc_acc.keys()):
            item = tc_acc[i]
            if not item["id"]:
                item["id"] = f"call_{uuid.uuid4().hex[:8]}"
            calls.append({"index": i, "id": item["id"], "name": item["name"], "arguments": item["arguments"]})
        if trace_recorder:
            trace_recorder.log(
                "tool.calls",
                {
                    "model": model_name,
                    "calls": calls,
                },
            )
        yield {"type": "tool.calls", "data": {"calls": calls}}
        return
    else:
        if trace_recorder:
            trace_recorder.log(
                "model.response",
                {
                    "model": model_name,
                    "text": "".join(text_buf).strip(),
                },
            )
        yield {"type": "text.content", "data": "".join(text_buf).strip()}
        return


async def _chat_with_agent(
        query: str,
        conversation_id: str,
        system_prompt: str,
        tools: List[Dict[str, Any]],
        model_name: str,
        file_ids: str = None,
        trace_recorder: Optional[ChatTraceRecorder] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    max_turns = 3
    # 获取当前对话历史（如果不存在则创建）
    messages = match_history.setdefault(conversation_id, [])

    # 确保 system prompt 只添加一次
    if not messages or messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})
    # 添加当前用户的提问
    if file_ids:
        # 通常只有图片问答会走到这里
        file_paths = get_file_paths(file_ids)
        messages.append({"role": "user", "content": convert_image_message(file_paths, query)})
    else:
        messages.append({"role": "user", "content": query})
    if trace_recorder:
        trace_recorder.update(selected_model=model_name)
        trace_recorder.log(
            "model.request",
            {
                "model": model_name,
                "messages": messages,
                "tools": tools,
            },
        )
    turn = 0
    while turn < max_turns:
        turn += 1
        try:
            summary = None
            async for event in _ask_once_stream(messages, tools, model_name, trace_recorder=trace_recorder):
                # print(f"event:{event}")
                if event.get("type") == "tool.calls":
                    summary = event
                    yield event
                    break
                else:
                    yield event
        except Exception as e:
            traceback.print_exc()
            if trace_recorder:
                trace_recorder.finalize(
                    status="error",
                    error=str(e),
                    response_preview=None,
                )
            yield {"type": "error", "data": {"message": f"stream error: {e}"}}
            raise StreamHandledError(str(e)) from e
        if summary is None:
            if trace_recorder:
                trace_recorder.finalize(
                    status="success",
                    response_preview="",
                )
            yield {"type": "assistant.final", "data": {"text": ""}}
            return
        calls = summary["data"]["calls"]
        assistant_tool_calls_msg = {
            "role": "assistant",
            "tool_calls": [
                {"id": c["id"], "type": "function",
                 "function": {"name": c["name"] or "", "arguments": c["arguments"] or "{}"}} for c in calls
            ]
        }
        messages.append(assistant_tool_calls_msg)
        tool_result_msgs = []
        for call in calls:
            fn_name = call["name"]
            args_str = call["arguments"] or "{}"
            try:
                args = json.loads(args_str)
            except Exception:
                args = {}
            result = await dispatch_tool(fn_name, args)
            if trace_recorder:
                trace_recorder.log(
                    "tool.result",
                    {
                        "tool_name": fn_name,
                        "tool_call_id": call["id"],
                        "arguments": args,
                        "result": result,
                    },
                )
            tool_result_msgs.append({
                "tool_call_id": call["id"],
                "role": "tool",
                "name": fn_name,
                "content": json.dumps(result, ensure_ascii=False),
            })
        messages.extend(tool_result_msgs)
    if trace_recorder:
        trace_recorder.finalize(
            status="success",
            response_preview="",
        )
    yield {"type": "assistant.final", "data": {"text": ""}}


async def chat_with_agent(
    query,
    conversation_id,
    system_prompt,
    model_name,
    gid,
    file_ids=None,
    show_reasoning: bool = True,
    trace_recorder: Optional[ChatTraceRecorder] = None,
):
    first = True
    think_end = False
    async for ev in _chat_with_agent(query, conversation_id, system_prompt, get_tools(gid), model_name, file_ids, trace_recorder=trace_recorder):
        # print(f"ev:{ev}")
        if first and show_reasoning:
            first = False
            temp = {"event": "message", "conversation_id": conversation_id, "answer": "<think>"}
            yield f"data: {json.dumps(temp)}\n\n"
        if first:
            first = False
        # if ev["type"] == "tool.delta":
        #     delta = ev["data"]["name"] if ev["data"]["name"] else ev["data"]["arguments_delta"]
        #     temp = {"event": "message", "conversation_id": conversation_id, "answer": delta}
        #     yield f"data: {json.dumps(temp)}\n\n"
        if ev["type"] == "tool.calls":
            if show_reasoning:
                temp = {"event": "message", "conversation_id": conversation_id, "answer": f"<step><summary>工具调用中</summary>"}
                yield f"data: {json.dumps(temp)}\n\n"
                temp = {"event": "message", "conversation_id": conversation_id, "answer": f"正在调用工具{ev['data']['calls'][0]['name']}，{ev['data']['calls'][0]['arguments']}"}
                yield f"data: {json.dumps(temp)}\n\n"
                temp = {"event": "message", "conversation_id": conversation_id, "answer": f"工具调用结果："}
                # yield f"data: {json.dumps(temp)}\n\n"
                temp = {"event": "message", "conversation_id": conversation_id, "answer": f"</step>"}
                yield f"data: {json.dumps(temp)}\n\n"
        if ev["type"] == "text.delta":
            if show_reasoning and not think_end:
                think_end = True
                temp = {"event": "message", "conversation_id": conversation_id, "answer": "<step><summary>完成</summary>完成</step></think>"}
                yield f"data: {json.dumps(temp)}\n\n"
            temp = {"event": "message", "conversation_id": conversation_id, "answer": ev["data"]["text"]}
            yield f"data: {json.dumps(temp)}\n\n"
        if ev["type"] == "assistant.final":
            temp = {"event": "message_end", "conversation_id": conversation_id, "answer": ""}
            yield f"data: {json.dumps(temp)}\n\n"


def is_complex(query) -> bool:
    complex_keywords = ["why", "how", "分析", "复杂", "reason", "认真", "仔细"]
    return len(query) > 60 or any(k in query for k in complex_keywords)


async def chat_with_gpt(
    query,
    conversation_id,
    system_prompt,
    model_name,
    gid,
    file_ids,
    reasoning_enabled,
    model_config,
    usage_tracker: Optional[UsageEventTracker] = None,
    trace_recorder: Optional[ChatTraceRecorder] = None,
):
    file_paths = get_file_paths(file_ids)
    has_file_ids = bool(file_ids)
    image_only = is_image_only(file_paths)
    image_file_ids, document_file_ids = split_file_ids_by_type(file_ids)
    native_image_input = bool(model_config.get("supports_native_image_input"))
    forwarded_image_file_ids = image_file_ids if native_image_input else None
    use_reasoning = bool(reasoning_enabled)

    if model_name == "auto":
        if image_only:
            model_name = MODEL_NAME_VL
        elif has_file_ids:
            model_name = MODEL_NAME_THINKING
            query += await extract_text_from_file_ids(file_ids)
        elif is_complex(query):
            model_name = MODEL_NAME_THINKING
        else:
            model_name = MODEL_NAME_INSTRUCT
        use_reasoning = model_name == MODEL_NAME_THINKING
    else:
        if document_file_ids:
            query += await extract_text_from_file_ids(document_file_ids)
        if image_file_ids and not native_image_input:
            query += await extract_text_from_file_ids(image_file_ids)

    if usage_tracker:
        usage_tracker.set_model(model_name)
    if trace_recorder:
        trace_recorder.update(selected_model=model_name)
        trace_recorder.log(
            "model.resolved",
            {
                "model": model_name,
                "has_file_ids": has_file_ids,
                "image_only": image_only,
                "forwarded_image_file_ids": forwarded_image_file_ids,
            },
        )

    if use_reasoning or _is_reasoning_model(model_name):
        async for ev in chat_with_react_as_function_call(
            query,
            conversation_id,
            system_prompt,
            model_name,
            gid,
            file_ids=forwarded_image_file_ids,
            show_reasoning=use_reasoning,
            usage_tracker=usage_tracker,
            trace_recorder=trace_recorder,
        ):
            yield ev
        return
    if model_name == MODEL_NAME_INSTRUCT or (
        not _is_reasoning_model(model_name) and not _is_multimodal_model(model_name)
    ):
        async for ev in chat_with_agent(
            query,
            conversation_id,
            system_prompt,
            model_name,
            gid,
            forwarded_image_file_ids,
            show_reasoning=False,
            trace_recorder=trace_recorder,
        ):
            yield ev
        return
    if _is_multimodal_model(model_name):
        async for ev in chat_with_agent(
            query,
            conversation_id,
            system_prompt,
            model_name,
            gid,
            forwarded_image_file_ids or file_ids,
            show_reasoning=False,
            trace_recorder=trace_recorder,
        ):
            yield ev


async def main():
    conversation_id = "123"
    system_prompt = "你是一个智能助手"
    query = "帮我查一下北京天气"
    await chat_with_agent(query, conversation_id, system_prompt, MODEL_NAME_INSTRUCT, "default")


if __name__ == '__main__':
    asyncio.run(main())
