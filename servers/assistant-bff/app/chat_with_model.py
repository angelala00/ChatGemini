import json
import uuid
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.chat_base import client, match_history, save_match_history
from app.metrics.events import UsageEventTracker
from app.routes.file_routes import get_file_paths
from app.utils.model_tool import convert_image_message
from app.utils.tool_register import dispatch_tool, get_tools


class StreamHandledError(Exception):
    """Raised when a streaming error has already been sent to the client."""


def _sse(name: str, payload: Dict[str, Any]) -> str:
    body = {"event": name, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"


def _append_user_message(messages: List[Dict[str, Any]], query: str, file_ids: Optional[str]) -> None:
    if file_ids:
        file_paths = get_file_paths(file_ids)
        messages.append({"role": "user", "content": convert_image_message(file_paths, query)})
    else:
        messages.append({"role": "user", "content": query})


async def _ask_once_stream(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]],
    model_name: str,
) -> AsyncGenerator[Dict[str, Any], None]:
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

    async for chunk in stream:
        for choice in chunk.choices:
            delta = choice.delta
            if getattr(delta, "content", None):
                yield {"type": "content.delta", "text": delta.content}

            if getattr(delta, "tool_calls", None):
                for tc in delta.tool_calls:
                    yield {
                        "type": "tool.delta",
                        "index": tc.index,
                        "id": getattr(tc, "id", None),
                        "name": getattr(tc.function, "name", None) if tc.function else None,
                        "arguments_delta": getattr(tc.function, "arguments", None) if tc.function else None,
                    }

            if choice.finish_reason:
                yield {"type": "finish", "reason": choice.finish_reason}


async def chat_with_model(
    query: str,
    conversation_id: str,
    system_prompt: str,
    model_name: str,
    gid: str,
    *,
    file_ids: Optional[str] = None,
    usage_tracker: Optional[UsageEventTracker] = None,
    max_turns: int = 3,
) -> AsyncGenerator[str, None]:
    tools = get_tools(gid)
    messages = match_history.setdefault(conversation_id, [])
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})

    _append_user_message(messages, query, file_ids)

    for _ in range(max_turns):
        assistant_text_parts: List[str] = []
        tool_acc: Dict[int, Dict[str, Any]] = {}
        finish_reason = None

        try:
            async for event in _ask_once_stream(messages, tools, model_name):
                event_type = event["type"]

                if event_type == "content.delta":
                    text = event["text"]
                    assistant_text_parts.append(text)
                    yield _sse(
                        "message",
                        {
                            "conversation_id": conversation_id,
                            "answer": text,
                        },
                    )

                elif event_type == "tool.delta":
                    acc = tool_acc.setdefault(
                        event["index"],
                        {"id": None, "name": None, "arguments": ""},
                    )
                    if event.get("id"):
                        acc["id"] = event["id"]
                    if event.get("name"):
                        acc["name"] = event["name"]
                    if event.get("arguments_delta"):
                        acc["arguments"] += event["arguments_delta"]

                    yield _sse(
                        "tool_call_delta",
                        {
                            "conversation_id": conversation_id,
                            "index": event["index"],
                            "id": acc["id"],
                            "name": event.get("name"),
                            "arguments_delta": event.get("arguments_delta"),
                        },
                    )

                elif event_type == "finish":
                    finish_reason = event["reason"]

            assistant_text = "".join(assistant_text_parts)
            if assistant_text:
                messages.append({"role": "assistant", "content": assistant_text})

            if not tool_acc:
                save_match_history()
                yield _sse(
                    "message_end",
                    {
                        "conversation_id": conversation_id,
                        "answer": "",
                    },
                )
                return

            calls = []
            for idx in sorted(tool_acc.keys()):
                item = tool_acc[idx]
                if not item["id"]:
                    item["id"] = f"call_{uuid.uuid4().hex[:8]}"
                calls.append(item)

            messages.append(
                {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": item["id"],
                            "type": "function",
                            "function": {
                                "name": item["name"] or "",
                                "arguments": item["arguments"] or "{}",
                            },
                        }
                        for item in calls
                    ],
                }
            )

            for item in calls:
                tool_name = item["name"] or ""
                raw_arguments = item["arguments"] or "{}"
                try:
                    arguments = json.loads(raw_arguments)
                except Exception:
                    arguments = {}

                if usage_tracker:
                    usage_tracker.mark_tool(tool_name)

                yield _sse(
                    "tool_call",
                    {
                        "conversation_id": conversation_id,
                        "id": item["id"],
                        "name": tool_name,
                        "arguments": raw_arguments,
                    },
                )

                tool_result = await dispatch_tool(tool_name, arguments)
                tool_result_text = str(tool_result)
                messages.append(
                    {
                        "tool_call_id": item["id"],
                        "role": "tool",
                        "name": tool_name,
                        "content": json.dumps(tool_result_text, ensure_ascii=False),
                    }
                )
                yield _sse(
                    "tool_result",
                    {
                        "conversation_id": conversation_id,
                        "id": item["id"],
                        "name": tool_name,
                        "result": tool_result_text,
                    },
                )

            if finish_reason == "stop" and not calls:
                save_match_history()
                yield _sse(
                    "message_end",
                    {
                        "conversation_id": conversation_id,
                        "answer": "",
                    },
                )
                return
        except Exception as exc:
            yield _sse(
                "error",
                {
                    "conversation_id": conversation_id,
                    "message": str(exc),
                },
            )
            raise StreamHandledError(str(exc)) from exc

    save_match_history()
    yield _sse(
        "message_end",
        {
            "conversation_id": conversation_id,
            "answer": "",
        },
    )
