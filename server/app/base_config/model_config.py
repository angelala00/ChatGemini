from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List


API_KEY: str = os.getenv("OPENAI_API_KEY", "")
BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
FILE_BASE: str = os.getenv("FILE_BASE", "/tmp")
LOG_BASE: str = os.getenv("LOG_BASE", "/tmp")
ALLOW_ORIGINS: List[str] = ["*"]

