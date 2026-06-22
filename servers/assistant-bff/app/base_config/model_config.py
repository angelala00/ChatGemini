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


def parse_minio_endpoints(value: str | None = None) -> List[str]:
    raw_value = MINIO_ENDPOINT if value is None else value
    if not raw_value:
        return []
    return [item.strip() for item in re.split(r"[,;]", raw_value) if item.strip()]


def _parse_int_env(value: str | None, default: int) -> int:
    if value is None or not value.strip():
        return default
    try:
        return int(value.strip())
    except ValueError:
        return default


API_KEY: str = os.getenv("OPENAI_API_KEY", "")
BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
ASSISTANT_MODEL_GLM47: str = os.getenv("ASSISTANT_MODEL_GLM47", "glm-4.7")
ASSISTANT_MODEL_QWEN35: str = os.getenv("ASSISTANT_MODEL_QWEN35", "qwen3.5-35b-a3b")
ASSISTANT_MODEL_GLM5: str = os.getenv("ASSISTANT_MODEL_GLM5", "glm-5")
FILE_BASE: str = os.getenv("FILE_BASE", "/tmp")
LOG_BASE: str = os.getenv("LOG_BASE", "/tmp")
POSTGRES_DSN: str = os.getenv("POSTGRES_DSN", "").strip()
POSTGRES_POOL_MIN_SIZE: int = _parse_int_env(os.getenv("POSTGRES_POOL_MIN_SIZE"), 1)
POSTGRES_POOL_MAX_SIZE: int = _parse_int_env(os.getenv("POSTGRES_POOL_MAX_SIZE"), 5)
SQLITE_MIGRATION_NODE_ID: str = os.getenv("SQLITE_MIGRATION_NODE_ID", "").strip()
SESSION_HISTORY_ENCRYPTION_KEY: str = os.getenv("SESSION_HISTORY_ENCRYPTION_KEY", "").strip()
AGENT_CONFIRMATION_SECRET: str = os.getenv(
    "AGENT_CONFIRMATION_SECRET",
    SESSION_HISTORY_ENCRYPTION_KEY,
).strip()
BUSINESS_STORAGE_BACKEND: str = os.getenv(
    "BUSINESS_STORAGE_BACKEND",
    "postgres" if POSTGRES_DSN else "sqlite",
).strip().lower()
MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "").strip()
MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "").strip()
MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "").strip()
MINIO_BUCKET: str = os.getenv("MINIO_BUCKET", "gptassistant").strip()
MINIO_REGION: str = os.getenv("MINIO_REGION", "").strip()
MINIO_BASE_PREFIX: str = os.getenv("MINIO_BASE_PREFIX", "assistant-files").strip("/")
MINIO_SECURE: bool = _parse_bool_env(os.getenv("MINIO_SECURE"), False)
OBJECT_STORAGE_BACKEND: str = os.getenv(
    "OBJECT_STORAGE_BACKEND",
    "minio" if MINIO_ENDPOINT else "filesystem",
).strip().lower()
FILE_LIFETIME_DAYS: int = _parse_int_env(os.getenv("FILE_LIFETIME_DAYS"), 7)
USAGE_EVENT_RETENTION_DAYS: int = _parse_int_env(os.getenv("USAGE_EVENT_RETENTION_DAYS"), 14)
TRACE_RETENTION_DAYS: int = _parse_int_env(os.getenv("TRACE_RETENTION_DAYS"), 7)
OBJECT_CACHE_RETENTION_DAYS: int = _parse_int_env(os.getenv("OBJECT_CACHE_RETENTION_DAYS"), 3)
_allow_origins_env = os.getenv("ALLOW_ORIGINS", "*")
ALLOW_ORIGINS: List[str] = [
    origin.strip() for origin in _allow_origins_env.split(",") if origin.strip()
] or ["*"]
GPTS_FEATURE_ENABLED: bool = _parse_bool_env(os.getenv("GPTS_FEATURE_ENABLED"), True)
GPTS_WHITE_LIST: Set[str] = _parse_list_env(os.getenv("GPTS_WHITE_LIST", ""))
VOICE_LAB_WHITE_LIST: Set[str] = _parse_list_env(os.getenv("VOICE_LAB_WHITE_LIST", ""))
TRACE_ENABLED: bool = os.getenv("GPT_TRACE_ENABLED", "false").lower() == "true"
