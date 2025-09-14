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


builtin_gpts: Dict[str, Dict[str, Any]] = {
    "gptassistant": {
        "name": "GPT Assistant",
        "desc": "通用对话助手",
        "system_prompt": "You are a helpful assistant.",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": ["你好"],
    },
    "g3": {
        "name": "法务审查",
        "desc": "快速审查合同条款",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            "审查合同中的潜在风险",
            "检查合同中的保密条款",
        ],
    },
    "g5": {
        "logo": "/gpts/echarts.svg",
        "name": "ECharts 画图助手",
        "desc": "用 ECharts 绘制可视化图表",
        "system_prompt": "",
        "samples": [
            "使用ECharts绘制销售占比饼图",
            "使用ECharts生成月度趋势折线图",
        ],
        "model_name": "auto",
        # 知识库
        # 工具
        "auth": {"type": "all"},
    },
    "g6": {
        "name": "PPT 大纲生成助手",
        "desc": "自动生成演示文稿大纲",
        "logo": "/gpts/ppt.svg",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            "生成创业计划书PPT大纲",
            "生成项目汇报PPT大纲",
        ],
    },
    "g7": {
        "name": "制度问答助手",
        "desc": "解答制度相关问题",
        "logo": "/gpts/policy.svg",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            "公司请假制度是什么？",
            "公司报销流程如何进行？",
        ],
    },
}

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
    return combined


gpts: Dict[str, Dict[str, Any]] = {}


def refresh_gpts() -> None:
    gpts.clear()
    gpts.update(fetch_gpts())


refresh_gpts()


__all__ = ["gpts", "fetch_gpts", "refresh_gpts", "BUILTIN_GIDS"]

