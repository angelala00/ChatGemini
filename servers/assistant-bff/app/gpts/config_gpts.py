"""GPT configuration management.

This module previously exposed a static ``gpts`` dictionary with a handful
of built-in assistants. To support user created GPTs we persist custom
definitions in the business storage backend and expose helpers to load/refresh
the combined configuration.
"""

from __future__ import annotations

from typing import Any, Dict

from app.storage.business_store import load_custom_gpts

builtin_gpts: Dict[str, Dict[str, Any]] = {}

BUILTIN_GIDS = set(builtin_gpts.keys())


def fetch_gpts() -> Dict[str, Dict[str, Any]]:
    """Return combined GPT configuration including user created ones."""

    combined = builtin_gpts.copy()
    combined.update(load_custom_gpts())
    return dict(sorted(combined.items(), key=lambda kv: kv[1].get("sort", float("inf"))))


gpts: Dict[str, Dict[str, Any]] = {}


def refresh_gpts() -> None:
    gpts.clear()
    gpts.update(fetch_gpts())


refresh_gpts()


__all__ = ["gpts", "fetch_gpts", "refresh_gpts", "BUILTIN_GIDS"]


def register_gpt(config):
    """Register built-in GPT definitions and refresh cached state."""

    builtin_gpts.update(config)
    refresh_gpts()
