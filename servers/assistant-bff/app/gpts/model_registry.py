from typing import TypedDict


class RegisteredModel(TypedDict):
    model_name: str


GLM47_MODEL: RegisteredModel = {
    "model_name": "GLM-4.7-W8A8",
}

QWEN35_MODEL: RegisteredModel = {
    "model_name": "qwen3.5-35b-a3b",
}

GLM5_MODEL: RegisteredModel = {
    "model_name": "glm-5",
}
