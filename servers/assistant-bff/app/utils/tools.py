from .tool_register import register_tool, dispatch_tool
from app.utils.case_rag import case_rag_engine
toolsss = [
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


@register_tool(group="default")
async def get_current_weather(
    location: (str, "The city and state, e.g. San Francisco, CA", True),
    unit: (str, "", False)
) -> str:
    """
    Get the current weather in a given location
    """
    return "天气大好，25度"

# @register_tool(group="default")
# async def search_legal_cases(
#     query: (str, "用户的案情描述或法律疑问，例如'贪污受贿判几年'", True)
# ) -> str:

#     print(f" [Tool Call] 正在检索相似案例: {query}")
#     return case_rag_engine.search_similar_cases(query)



import asyncio



if __name__ == "__main__":
    async def main():
        print("----- 测试 1: 查天气 -----")

        print(await dispatch_tool("get_current_weather", {"location": "Beijing"}))

        print("\n----- 测试 2: 查案例  -----")

        print(await dispatch_tool("search_legal_cases", {"query":
       "“某市安监局验收员赵某在负责辖区化工厂复工验收时，严重不负责任，未按规定进行实地安全检查，仅在办公室审核纸面材料后即签署‘验收合格’意见。"
       "该违规行为导致不具备安全生产条件的化工厂复工，一个月后发生爆炸事故，造成 3 人死亡。”"}))


    asyncio.run(main())