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
        "samples": [
            {
                "title": "基本对话",
                "description": "询问通用问题",
                "prompt": "你好",
            }
        ],
    },
    "g3": {
        "name": "法务审查",
        "desc": "快速审查合同条款",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            {
                "title": "审查合同风险",
                "description": "发现潜在风险",
                "prompt": "审查合同中的潜在风险",
            },
            {
                "title": "检查保密条款",
                "description": "关注关键条款",
                "prompt": "检查合同中的保密条款",
            },
        ],
    },
    "g5": {
        "name": "ECharts 画图助手",
        "desc": "用 ECharts 绘制可视化图表",
        "logo": "/gpts/echarts.svg",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            {
                "title": "绘制饼图",
                "description": "展示分类占比",
                "prompt": "使用ECharts绘制销售占比饼图",
            },
            {
                "title": "生成折线图",
                "description": "展示趋势",
                "prompt": "使用ECharts生成月度趋势折线图",
            },
        ],
    },
    "g6": {
        "name": "PPT 大纲生成助手",
        "desc": "自动生成演示文稿大纲",
        "logo": "/gpts/ppt.svg",
        "system_prompt": "",
        "model_name": "auto",
        "auth": {"type": "all"},
        "samples": [
            {
                "title": "创业计划书大纲",
                "description": "自动生成",
                "prompt": "生成创业计划书PPT大纲",
            },
            {
                "title": "项目汇报大纲",
                "description": "自动生成",
                "prompt": "生成项目汇报PPT大纲",
            },
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
            {
                "title": "请假制度",
                "description": "了解公司制度",
                "prompt": "公司请假制度是什么？",
            },
            {
                "title": "报销流程",
                "description": "了解公司制度",
                "prompt": "公司报销流程如何进行？",
            },
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

