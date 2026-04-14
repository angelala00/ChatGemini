from typing import TypedDict

from app.base_config import model_config


class RegisteredModel(TypedDict):
    model_name: str


GLM47_MODEL: RegisteredModel = {
    "model_name": model_config.ASSISTANT_MODEL_GLM47,
}

QWEN35_MODEL: RegisteredModel = {
    "model_name": model_config.ASSISTANT_MODEL_QWEN35,
}

GLM5_MODEL: RegisteredModel = {
    "model_name": model_config.ASSISTANT_MODEL_GLM5,
}
