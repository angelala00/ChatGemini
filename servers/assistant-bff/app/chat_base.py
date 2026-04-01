import json
import openai
import httpx
import asyncio
from app.base_config import model_config
from app.db import get_db
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


match_history = {}

conn = get_db(check_same_thread=False)
conn.execute(
    "CREATE TABLE IF NOT EXISTS session_history (conversation_id TEXT PRIMARY KEY, history TEXT)"
)


def load_match_history():
    cur = conn.execute("SELECT conversation_id, history FROM session_history")
    for cid, history in cur:
        try:
            match_history[cid] = json.loads(history)
        except Exception:
            match_history[cid] = []


load_match_history()


def save_match_history(conversation_id: str | None = None):
    if conversation_id is None:
        items = list(match_history.items())
    else:
        items = [(conversation_id, match_history.get(conversation_id))]

    with conn:
        for cid, history in items:
            if history is None:
                conn.execute(
                    "DELETE FROM session_history WHERE conversation_id = ?",
                    (cid,),
                )
                continue
            conn.execute(
                "REPLACE INTO session_history (conversation_id, history) VALUES (?, ?)",
                (cid, json.dumps(history, ensure_ascii=False)),
            )


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

# async def chat_with_function_call3():
#     stream = await client.responses.create(
#         model=MODEL_NAME_INSTRUCT,
#         input=[{"role": "user", "content": "帮我查一下北京天气"}],
#         tools=toolss,
#         stream=True
#     )
#     async for chunk in stream:
#         if not chunk.choices:
#             print(f"????={chunk}")
#             continue
#         print(f"chunk.choices{len(chunk.choices)}")
#         choice = chunk.choices[0]
#         delta = choice.delta


async def main():
    await chat_with_function_call()


if __name__ == '__main__':
    asyncio.run(main())
