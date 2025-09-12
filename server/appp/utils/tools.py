from .tool_register import register_tool, dispatch_tool

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


if __name__ == "__main__":
    print(dispatch_tool("fetch_document_catalog", {}))
    print(dispatch_tool("fetch_document_content", {"file_names": ["name1", "name2"]}))
