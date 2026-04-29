from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Set

from dotenv import load_dotenv


_current_file = Path(__file__).resolve()
_env_candidates = []
if len(_current_file.parents) >= 5:
    _env_candidates.append(_current_file.parents[4] / ".env")
if len(_current_file.parents) >= 3:
    _env_candidates.append(_current_file.parents[2] / ".env")

for _env_file in _env_candidates:
    if load_dotenv(_env_file, override=False):
        break

def _parse_bool_env(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _parse_list_env(value: str | None) -> Set[str]:
    if not value:
        return set()
    return {item.strip() for item in re.split(r"[,;]", value) if item.strip()}


API_KEY: str = os.getenv("OPENAI_API_KEY", "")
BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
ASSISTANT_MODEL_GLM47: str = os.getenv("ASSISTANT_MODEL_GLM47", "GLM-4.7-W8A8")
ASSISTANT_MODEL_QWEN35: str = os.getenv("ASSISTANT_MODEL_QWEN35", "qwen3.5-35b-a3b")
ASSISTANT_MODEL_GLM5: str = os.getenv("ASSISTANT_MODEL_GLM5", "glm-5")
FILE_BASE: str = os.getenv("FILE_BASE", "/tmp")
LOG_BASE: str = os.getenv("LOG_BASE", "/tmp")
_allow_origins_env = os.getenv("ALLOW_ORIGINS", "*")
ALLOW_ORIGINS: List[str] = [
    origin.strip() for origin in _allow_origins_env.split(",") if origin.strip()
] or ["*"]
GPTS_FEATURE_ENABLED: bool = _parse_bool_env(os.getenv("GPTS_FEATURE_ENABLED"), True)
GPTS_WHITE_LIST: Set[str] = _parse_list_env(os.getenv("GPTS_WHITE_LIST", ""))
VOICE_LAB_WHITE_LIST: Set[str] = _parse_list_env(os.getenv("VOICE_LAB_WHITE_LIST", ""))
TRACE_ENABLED: bool = os.getenv("GPT_TRACE_ENABLED", "false").lower() == "true"
