import openai
import httpx
import asyncio
from app.base_config import model_config
from app.storage.business_store import (
    delete_session_history as delete_session_history_record,
    load_session_history,
    save_session_history as save_session_history_record,
)
from app.utils.model_tool import MODEL_NAME_INSTRUCT, MODEL_NAME_THINKING


client = openai.AsyncOpenAI(
    api_key=model_config.API_KEY,
    base_url=model_config.BASE_URL,
    http_client=httpx.AsyncClient(
        timeout=60.0,
        verify=False,
        trust_env=False,
    )
)


class MatchHistoryCache(dict):
    """Read-through cache so standby nodes can fetch the latest history on demand."""

    def setdefault(self, key, default=None):  # type: ignore[override]
        latest = load_session_history(key)
        if latest:
            super().__setitem__(key, latest)
            return super().__getitem__(key)
        fallback = [] if default is None else default
        super().__setitem__(key, fallback)
        return super().__getitem__(key)


match_history = MatchHistoryCache()


def save_match_history(conversation_id: str | None = None):
    if conversation_id is None:
        items = list(match_history.items())
    else:
        items = [(conversation_id, match_history.get(conversation_id))]

    for cid, history in items:
        if history is None:
            delete_session_history_record(cid)
            continue
        save_session_history_record(cid, history)


async def chat():
    messages = [{"role": "user", "content": "帮我写一首诗"}]
    response = await client.chat.completions.create(model=MODEL_NAME_THINKING, messages=messages, temperature=0.7, stream=False)
    print(f"response:{response.choices[0].message.content}")


toolss = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get the current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                },
                "required": ["location"]
            }
        }
    }
]


async def chat_with_function_call():
    stream = await client.chat.completions.create(
        model=MODEL_NAME_INSTRUCT,
        messages=[{"role": "user", "content": "帮我查一下北京天气"}],
        tools=toolss,
        stream=True
    )
    content_buf = ""
    tool_acc = {}
    async for chunk in stream:
        if not chunk.choices:
            print(f"????={chunk}")
            continue
        choice = chunk.choices[0]
        delta = choice.delta
        if getattr(delta, "content", None):
            content_buf += delta.content
        if getattr(delta, "tool_calls", None):
            print(f"tools:", delta.tool_calls)
            for tc in delta.tool_calls:
                idx = tc.index
                entry = tool_acc.setdefault(idx, {"name": None, "arguments": ""})
                if tc.function:
                    if getattr(tc.function, "name", None):
                        entry["name"] = tc.function.name
                    if getattr(tc.function, "arguments", None):
                        entry["arguments"] += tc.function.arguments
    print(f"content_buf:{content_buf}")
    print(f"tool_acc:{tool_acc}")


async def main():
    await chat_with_function_call()


if __name__ == '__main__':
    asyncio.run(main())
