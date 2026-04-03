from __future__ import annotations

import os
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

API_KEY: str = os.getenv("OPENAI_API_KEY", "")
BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
FILE_BASE: str = os.getenv("FILE_BASE", "/tmp")
LOG_BASE: str = os.getenv("LOG_BASE", "/tmp")
_allow_origins_env = os.getenv("ALLOW_ORIGINS", "*")
ALLOW_ORIGINS: List[str] = [
    origin.strip() for origin in _allow_origins_env.split(",") if origin.strip()
] or ["*"]
GPTS_WHITE_LIST: Set[str] = {
    email.strip() for email in os.getenv("GPTS_WHITE_LIST", "").split(",") if email.strip()
}
TRACE_ENABLED: bool = os.getenv("GPT_TRACE_ENABLED", "false").lower() == "true"
