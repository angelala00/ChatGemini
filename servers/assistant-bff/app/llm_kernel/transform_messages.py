from __future__ import annotations

from dataclasses import replace
from time import time
from typing import Callable, Optional

from .types import (
    AssistantMessage,
    Message,
    Model,
    TextContent,
    ThinkingContent,
    ToolCallContent,
    ToolResultMessage,
)


def transform_messages(
    messages: list[Message],
    model: Model,
    normalize_tool_call_id: Optional[Callable[[str, Model, AssistantMessage], str]] = None,
) -> list[Message]:
    tool_call_id_map: dict[str, str] = {}
    transformed: list[Message] = []

    for message in messages:
        if message.role == "user":
            transformed.append(message)
            continue

        if message.role == "tool_result":
            normalized_id = tool_call_id_map.get(message.tool_call_id)
            if normalized_id and normalized_id != message.tool_call_id:
                transformed.append(replace(message, tool_call_id=normalized_id))
            else:
                transformed.append(message)
            continue

        assistant_message = message
        is_same_model = (
            assistant_message.provider == model.provider
            and assistant_message.api == model.api
            and assistant_message.model == model.id
        )
        if assistant_message.stop_reason in {"error", "aborted"}:
            continue

        next_content = []
        for block in assistant_message.content:
            if isinstance(block, ThinkingContent):
                if block.redacted:
                    if is_same_model:
                        next_content.append(block)
                    continue
                if is_same_model:
                    next_content.append(block)
                elif block.thinking.strip():
                    next_content.append(TextContent(text=block.thinking))
                continue

            if isinstance(block, ToolCallContent):
                next_block = block
                if not is_same_model and normalize_tool_call_id:
                    normalized_id = normalize_tool_call_id(block.id, model, assistant_message)
                    if normalized_id != block.id:
                        tool_call_id_map[block.id] = normalized_id
                        next_block = replace(block, id=normalized_id, thought_signature=None)
                elif not is_same_model and block.thought_signature:
                    next_block = replace(block, thought_signature=None)
                next_content.append(next_block)
                continue

            next_content.append(block)

        transformed.append(replace(assistant_message, content=next_content))

    result: list[Message] = []
    pending_tool_calls: list[ToolCallContent] = []
    existing_result_ids: set[str] = set()

    for message in transformed:
        if message.role == "assistant":
            if pending_tool_calls:
                for tool_call in pending_tool_calls:
                    if tool_call.id not in existing_result_ids:
                        result.append(
                            ToolResultMessage(
                                tool_call_id=tool_call.id,
                                tool_name=tool_call.name,
                                content=[TextContent(text="No result provided")],
                                is_error=True,
                                timestamp=int(time() * 1000),
                            )
                        )
                pending_tool_calls = []
                existing_result_ids = set()

            tool_calls = [block for block in message.content if isinstance(block, ToolCallContent)]
            if tool_calls:
                pending_tool_calls = tool_calls
                existing_result_ids = set()
            result.append(message)
            continue

        if message.role == "tool_result":
            existing_result_ids.add(message.tool_call_id)
            result.append(message)
            continue

        if pending_tool_calls:
            for tool_call in pending_tool_calls:
                if tool_call.id not in existing_result_ids:
                    result.append(
                        ToolResultMessage(
                            tool_call_id=tool_call.id,
                            tool_name=tool_call.name,
                            content=[TextContent(text="No result provided")],
                            is_error=True,
                            timestamp=int(time() * 1000),
                        )
                    )
            pending_tool_calls = []
            existing_result_ids = set()
        result.append(message)

    return result
