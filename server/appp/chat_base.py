import json
import openai
import httpx
import asyncio
from app.base_config import model_config


client = openai.AsyncOpenAI(
    api_key=model_config.API_KEY,
    base_url=model_config.BASE_URL,
    http_client=httpx.AsyncClient(
        timeout=60.0,
        verify=False
    )
)


SAVE_FILE = f"{model_config.FILE_BASE}/gptassistant/match_history.json"
match_history = {}


def save_match_history():
    with open(SAVE_FILE, "w", encoding="utf-8") as f:
        json.dump(match_history, f, ensure_ascii=False)


async def chat():
    messages = [{"role": "user", "content": "帮我写一首诗"}]
    response = await client.chat.completions.create(model="deepseek-r1-distill-qwen-32b", messages=messages, temperature=0.7, stream=False)
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
        model="Qwen3-30B-A3B-Instruct-2507",
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
#         model="Qwen3-30B-A3B-Instruct-2507",
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
