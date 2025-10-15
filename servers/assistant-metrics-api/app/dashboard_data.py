"""Fetch and normalise dashboard data."""

from __future__ import annotations

import logging
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Any, Dict
from urllib.parse import urljoin

import httpx
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

BFF_BASE_URL = os.getenv("ASSISTANT_BFF_BASE_URL", "http://localhost:5008")
BFF_DASHBOARD_ENDPOINT = os.getenv("ASSISTANT_BFF_DASHBOARD_ENDPOINT", "/api/metrics/dashboard")
REQUEST_TIMEOUT = float(os.getenv("ASSISTANT_METRICS_TIMEOUT", "5.0"))

_BASE_FALLBACK = {
    "metrics": [
        {
            "id": "activeUsers",
            "title": "活跃用户数",
            "value": "0",
            "hint": "较昨日",
            "emphasis": "0%",
        },
        {
            "id": "totalUsers",
            "title": "累计用户数",
            "value": "0",
            "hint": "过去 7 日新增",
            "emphasis": "0",
        },
        {
            "id": "totalRequests",
            "title": "当前总请求数",
            "value": "0",
            "hint": "今日新增",
            "emphasis": "0",
        },
        {
            "id": "successRate",
            "title": "请求成功率",
            "value": "0.0%",
            "hint": "错误率",
            "emphasis": "100.0%",
        },
    ],
    "requestsTrend": [],
    "timeWindow": {
        "range": "过去 14 天",
        "peak": "暂无数据",
        "low": "暂无数据",
    },
    "userLeaderboard": [],
    "gptsLeaderboard": [],
    "modelLeaderboard": [],
    "alerts": [],
}


async def build_dashboard_payload() -> Dict[str, Any]:
    try:
        remote = await _fetch_remote_payload()
        return _normalise_remote_payload(remote)
    except Exception:
        logger.exception("Failed to fetch dashboard payload from assistant-bff, using fallback data")
        fallback = deepcopy(_BASE_FALLBACK)
        shanghai_tz = _resolve_shanghai_timezone()
        fallback["lastUpdated"] = datetime.now(tz=shanghai_tz)
        return fallback


async def _fetch_remote_payload() -> Dict[str, Any]:
    url = urljoin(BFF_BASE_URL.rstrip("/"), BFF_DASHBOARD_ENDPOINT)
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


def _normalise_remote_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(payload)
    raw_last_updated = payload.get("lastUpdated")
    if isinstance(raw_last_updated, str):
        try:
            payload["lastUpdated"] = datetime.fromisoformat(raw_last_updated)
        except ValueError:
            payload["lastUpdated"] = datetime.now(tz=_resolve_shanghai_timezone())
    elif isinstance(raw_last_updated, datetime):
        payload["lastUpdated"] = raw_last_updated
    else:
        payload["lastUpdated"] = datetime.now(tz=_resolve_shanghai_timezone())
    return payload


def _resolve_shanghai_timezone() -> tzinfo:
    try:
        return ZoneInfo("Asia/Shanghai")
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=8))


__all__ = ["build_dashboard_payload"]
