from typing import TypedDict


class RegisteredModelCompat(TypedDict, total=False):
    reasoning_parameter_format: str
    supports_reasoning_effort: bool
    requires_assistant_after_tool_result: bool


class RegisteredModel(TypedDict):
    model_name: str
    supports_reasoning: bool
    supports_native_image_input: bool
    compat: RegisteredModelCompat


GLM47_MODEL: RegisteredModel = {
    "model_name": "glm-4.7",
    "supports_reasoning": True,
    "supports_native_image_input": False,
    "compat": {
        "reasoning_parameter_format": "qwen-chat-template",
        "supports_reasoning_effort": False,
        "requires_assistant_after_tool_result": False,
    },
}

QWEN35_MODEL: RegisteredModel = {
    "model_name": "qwen3.5-35b-a3b",
    "supports_reasoning": False,
    "supports_native_image_input": True,
    "compat": {
        "reasoning_parameter_format": "qwen-chat-template",
        "supports_reasoning_effort": False,
        "requires_assistant_after_tool_result": False,
    },
}

GLM5_MODEL: RegisteredModel = {
    "model_name": "glm-5",
    "supports_reasoning": True,
    "supports_native_image_input": False,
    "compat": {
        "reasoning_parameter_format": "qwen-chat-template",
        "supports_reasoning_effort": False,
        "requires_assistant_after_tool_result": False,
    },
}
