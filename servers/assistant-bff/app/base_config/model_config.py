from __future__ import annotations

import os
from typing import List, Set


API_KEY: str = os.getenv("OPENAI_API_KEY", "")
BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
FILE_BASE: str = os.getenv("FILE_BASE", "/tmp")
LOG_BASE: str = os.getenv("LOG_BASE", "/tmp")
ALLOW_ORIGINS: List[str] = ["*"]
GPTS_WHITE_LIST: Set[str] = {
    email.strip() for email in os.getenv("GPTS_WHITE_LIST", "").split(",") if email.strip()
}

