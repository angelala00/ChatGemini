"""Minimal GPTS configuration used by the application routes.

The original project loads GPT definitions from a data source.  For this
repository we provide a small in-memory dictionary with a handful of
sample assistants so that the API can operate without external
dependencies.
"""

from __future__ import annotations

from typing import Any, Dict


gpts: Dict[str, Dict[str, Any]] = {
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


def fetch_gpts() -> Dict[str, Dict[str, Any]]:
    """Return the GPT configuration.

    A separate function is provided to mirror the structure of the
    original application where configurations may be refreshed from disk
    or a database.
    """

    return gpts


__all__ = ["gpts", "fetch_gpts"]

