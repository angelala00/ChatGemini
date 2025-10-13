"""Static dashboard dataset used by the Assistant metrics API."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo

# Base payload mirrors the original mock JSON that lived in the
# assistant-dashboard frontend. ``lastUpdated`` is populated dynamically
# so it is omitted from the base structure.
_BASE_DASHBOARD_PAYLOAD = {
    "metrics": [
        {
            "id": "activeUsers",
            "title": "活跃用户数",
            "value": "2,430",
            "hint": "较昨日",
            "emphasis": "+12%",
        },
        {
            "id": "totalUsers",
            "title": "累计用户数",
            "value": "8,972",
            "hint": "较上周",
            "emphasis": "+5%",
        },
        {
            "id": "totalRequests",
            "title": "当前总请求数",
            "value": "54,302",
            "hint": "今日新增",
            "emphasis": "8,120",
        },
        {
            "id": "successRate",
            "title": "请求成功率",
            "value": "98.4%",
            "hint": "错误率",
            "emphasis": "1.6%",
        },
    ],
    "requestsTrend": [
        {"date": "06-01", "total": 2100},
        {"date": "06-02", "total": 2480},
        {"date": "06-03", "total": 3120},
        {"date": "06-04", "total": 2860},
        {"date": "06-05", "total": 3980},
        {"date": "06-06", "total": 4210},
        {"date": "06-07", "total": 4600},
        {"date": "06-08", "total": 5120},
        {"date": "06-09", "total": 4860},
        {"date": "06-10", "total": 4520},
        {"date": "06-11", "total": 3890},
        {"date": "06-12", "total": 3720},
        {"date": "06-13", "total": 3180},
        {"date": "06-14", "total": 2980},
    ],
    "timeWindow": {
        "range": "过去 14 天",
        "peak": "5,120 请求/日",
        "low": "1,860 请求/日",
    },
    "userLeaderboard": [
        {"name": "Alice Chen", "value": "8,920 请求"},
        {"name": "Jason Li", "value": "7,835 请求"},
        {"name": "陈晓", "value": "6,410 请求"},
        {"name": "王宁", "value": "5,980 请求"},
        {"name": "李蕾", "value": "5,640 请求"},
    ],
    "gptsLeaderboard": [
        {"name": "代码调试助手", "value": "28%"},
        {"name": "产品需求分析", "value": "21%"},
        {"name": "市场洞察", "value": "18%"},
        {"name": "数据报表生成", "value": "16%"},
        {"name": "多语言翻译", "value": "12%"},
    ],
    "modelLeaderboard": [
        {"name": "gpt-4o", "value": "42%"},
        {"name": "gpt-4o-mini", "value": "25%"},
        {"name": "gpt-4-turbo", "value": "18%"},
        {"name": "claude-3-opus", "value": "10%"},
        {"name": "local-embedding", "value": "5%"},
    ],
    "alerts": [
        {"name": "延迟预警", "value": "暂无"},
        {"name": "SLA 风险", "value": "低"},
        {"name": "模型分布", "value": "稳定"},
    ],
}


def build_dashboard_payload() -> dict[str, object]:
    """Return a dashboard payload with an up-to-date timestamp."""

    payload = deepcopy(_BASE_DASHBOARD_PAYLOAD)

    # Align the timestamp with the expected +08:00 timezone that was used in
    # the original mock data.
    shanghai_tz = ZoneInfo("Asia/Shanghai")
    payload["lastUpdated"] = datetime.now(tz=shanghai_tz)
    return payload


__all__ = ["build_dashboard_payload"]
