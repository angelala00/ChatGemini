from __future__ import annotations

import os
from pathlib import Path

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


def _normalize_base_url(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return ""
    return trimmed[:-1] if trimmed.endswith("/") else trimmed


def _parse_bool(value: str | None, default: bool = True) -> bool:
    if not isinstance(value, str):
        return default
    normalized = value.strip().lower()
    if not normalized:
        return default
    return normalized not in {"0", "false", "no", "off"}


PORTAL_BASE_URL = _normalize_base_url(
    os.getenv("PLATFORM_PORTAL_BASE_URL", "http://localhost:5015/portal")
)
PORTAL_TOKEN = os.getenv("PLATFORM_PORTAL_TOKEN", "").strip()
PORTAL_TIMEOUT_SECONDS = float(os.getenv("PLATFORM_PORTAL_TIMEOUT_SECONDS", "20"))
PORTAL_TRUST_ENV = _parse_bool(os.getenv("PLATFORM_TRUST_ENV", "true"), True)
