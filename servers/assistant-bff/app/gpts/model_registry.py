from typing import Optional, TypedDict


class RegisteredModel(TypedDict):
    model_name: str
    supports_reasoning: bool
    supports_native_image_input: bool


GLM47_MODEL: RegisteredModel = {
    "model_name": "glm-4.7",
    "supports_reasoning": True,
    "supports_native_image_input": False,
}

QWEN35_MODEL: RegisteredModel = {
    "model_name": "qwen3.5-35b-a3b",
    "supports_reasoning": True,
    "supports_native_image_input": True,
}

GLM5_MODEL: RegisteredModel = {
    "model_name": "glm-5",
    "supports_reasoning": True,
    "supports_native_image_input": False,
}
