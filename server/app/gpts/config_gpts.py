"""GPT configuration management.

This module previously exposed a static ``gpts`` dictionary with a handful
of built-in assistants.  To support user created GPTs we now persist custom
definitions in SQLite and expose helpers to load/refresh the combined
configuration.
"""

from __future__ import annotations

import json
import os
import sqlite3
from typing import Any, Dict

from app.base_config import model_config

DATA_DIR = os.path.join("", f"{model_config.FILE_BASE}/gptassistant/")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pins.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_db()
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS custom_gpts (
            gid TEXT PRIMARY KEY,
            config TEXT NOT NULL
            )"""
        )
    finally:
        conn.close()


init_db()


builtin_gpts: Dict[str, Dict[str, Any]] = {}

BUILTIN_GIDS = set(builtin_gpts.keys())


def load_custom_gpts() -> Dict[str, Dict[str, Any]]:
    conn = get_db()
    try:
        rows = conn.execute("SELECT gid, config FROM custom_gpts").fetchall()
    finally:
        conn.close()
    return {row["gid"]: json.loads(row["config"]) for row in rows}


def fetch_gpts() -> Dict[str, Dict[str, Any]]:
    """Return combined GPT configuration including user created ones."""

    combined = builtin_gpts.copy()
    combined.update(load_custom_gpts())
    sorted_data = dict(sorted(combined.items(), key=lambda kv: kv[1].get("sort", float("inf"))))
    return sorted_data


gpts: Dict[str, Dict[str, Any]] = {}


def refresh_gpts() -> None:
    gpts.clear()
    gpts.update(fetch_gpts())


refresh_gpts()


__all__ = ["gpts", "fetch_gpts", "refresh_gpts", "BUILTIN_GIDS"]


def register_gpts(congfig):
    builtin_gpts.update(congfig)
