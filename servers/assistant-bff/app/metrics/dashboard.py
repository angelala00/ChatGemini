"""Aggregate usage metrics into the dashboard payload structure."""

from __future__ import annotations

import logging
from collections import Counter
from copy import deepcopy
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Dict, List, Tuple

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.db import get_db
from .events import init_metrics_storage

logger = logging.getLogger(__name__)

_BASE_FALLBACK = {
    "metrics": [
        {
            "id": "totalUsers",
            "title": "用户数",
            "value": "0",
            "hint": "过去 7 日新增",
            "emphasis": "0",
        },
        {
            "id": "totalRequests",
            "title": "请示数",
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


def build_dashboard_snapshot() -> Dict[str, object]:
    now = datetime.now(timezone.utc)

    try:
        init_metrics_storage()
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to initialise metrics storage; returning fallback data")
        return _build_fallback_snapshot(now)

    try:
        conn = get_db()
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to open metrics database; returning fallback data")
        return _build_fallback_snapshot(now)
    try:
        metrics = _collect_metric_cards(conn, now)
        requests_trend, peak, low = _collect_trend(conn, now)
        user_leaderboard = _collect_leaderboard(conn, now, key="user", limit=5)
        gpts_leaderboard = _collect_leaderboard(conn, now, key="gid", limit=5)
        model_leaderboard = _collect_leaderboard(conn, now, key="model", limit=5)
        alerts = _collect_alerts(metrics, peak_latency=_fetch_average_latency(conn, now))
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to build dashboard snapshot; returning fallback data")
        return _build_fallback_snapshot(now)
    finally:
        conn.close()

    last_updated = now.astimezone(_resolve_shanghai_timezone()).isoformat()

    return {
        "lastUpdated": last_updated,
        "metrics": metrics,
        "requestsTrend": requests_trend,
        "timeWindow": {
            "range": "过去 14 天",
            "peak": f"{peak:,} 请求/日" if peak is not None else "暂无数据",
            "low": f"{low:,} 请求/日" if low is not None else "暂无数据",
        },
        "userLeaderboard": user_leaderboard,
        "gptsLeaderboard": gpts_leaderboard,
        "modelLeaderboard": model_leaderboard,
        "alerts": alerts,
    }


def _collect_metric_cards(conn, now: datetime) -> List[Dict[str, str]]:
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    total_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE status IN ('success', 'error')",
    )
    success_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE status='success'",
    )
    today_anchor = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()
    todays_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE started_at >= ?",
        (today_anchor,),
    )
    total_users = _scalar(
        conn,
        "SELECT COUNT(DISTINCT user_id) FROM usage_events",
    )
    users_last_week = _scalar(
        conn,
        "SELECT COUNT(DISTINCT user_id) FROM usage_events WHERE started_at >= ?",
        (seven_days_ago,),
    )
    success_rate = (success_requests / total_requests) if total_requests else 0.0
    error_rate = 1 - success_rate

    return [
        {
            "id": "totalUsers",
            "title": "用户数",
            "value": _format_int(total_users),
            "hint": "过去 7 日新增",
            "emphasis": _format_int(users_last_week),
        },
        {
            "id": "totalRequests",
            "title": "请示数",
            "value": _format_int(total_requests),
            "hint": "今日新增",
            "emphasis": _format_int(todays_requests),
        },
        {
            "id": "successRate",
            "title": "请求成功率",
            "value": f"{success_rate * 100:.1f}%",
            "hint": "错误率",
            "emphasis": f"{error_rate * 100:.1f}%",
        },
    ]


def _collect_trend(conn, now: datetime) -> Tuple[List[Dict[str, object]], int | None, int | None]:
    start_date = (now - timedelta(days=13)).date()
    start_anchor = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc).isoformat()
    totals = Counter()
    for row in conn.execute(
        """
        SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS total
          FROM usage_events
         WHERE started_at >= ?
         GROUP BY day
        """,
        (start_anchor,),
    ):
        totals[row["day"]] = row["total"]

    trend: List[Dict[str, object]] = []
    peak = None
    low = None
    for i in range(14):
        day = start_date + timedelta(days=i)
        total = totals.get(day.isoformat(), 0)
        trend.append({"date": day.strftime("%m-%d"), "total": total})
        peak = total if peak is None or total > peak else peak
        low = total if low is None or total < low else low
    return trend, peak, low


def _collect_leaderboard(conn, now: datetime, *, key: str, limit: int) -> List[Dict[str, str]]:
    assert key in {"user", "gid", "model"}
    column = {
        "user": ("COALESCE(user_email, user_id)", "user_id"),
        "gid": ("COALESCE(gid, '未标记')", "gid"),
        "model": ("COALESCE(model, '未指定模型')", "model"),
    }[key]
    start = (now - timedelta(days=14)).isoformat()
    rows = conn.execute(
        f"""
        SELECT {column[0]} AS label, COUNT(*) AS total
          FROM usage_events
         WHERE started_at >= ? AND status = 'success'
         GROUP BY {column[1]}
         ORDER BY total DESC
         LIMIT ?
        """,
        (start, limit),
    ).fetchall()

    total_success = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE started_at >= ? AND status = 'success'",
        (start,),
    )
    leaderboard: List[Dict[str, str]] = []
    for row in rows:
        if key == "user":
            value = f"{_format_int(row['total'])} 请求"
        else:
            share = (row["total"] / total_success * 100) if total_success else 0.0
            value = f"{share:.0f}%"
        leaderboard.append({"name": row["label"], "value": value})
    return leaderboard


def _collect_alerts(metrics: List[Dict[str, str]], *, peak_latency: float | None) -> List[Dict[str, str]]:
    success_rate_card = next((m for m in metrics if m["id"] == "successRate"), None)
    success_rate = 100.0
    if success_rate_card:
        success_rate = float(success_rate_card["value"].rstrip("%"))
    sla_status = "低" if success_rate >= 95 else ("中" if success_rate >= 90 else "高")
    if peak_latency is None:
        latency_label = "暂无数据"
    elif peak_latency > 3000:
        latency_label = f"高 ({int(peak_latency)} ms)"
    else:
        latency_label = f"正常 ({int(peak_latency)} ms)"
    distribution_status = "稳定"
    return [
        {"name": "延迟预警", "value": latency_label},
        {"name": "SLA 风险", "value": sla_status},
        {"name": "模型分布", "value": distribution_status},
    ]


def _fetch_average_latency(conn, now: datetime) -> float | None:
    start = (now - timedelta(days=1)).isoformat()
    row = conn.execute(
        """
        SELECT AVG(latency_ms) AS avg_latency
          FROM usage_events
         WHERE completed_at IS NOT NULL AND started_at >= ?
        """,
        (start,),
    ).fetchone()
    return float(row["avg_latency"]) if row and row["avg_latency"] is not None else None


def _scalar(conn, sql: str, params: Tuple[object, ...] = tuple()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _format_int(value: int) -> str:
    return f"{value:,}"


def _resolve_shanghai_timezone() -> tzinfo:
    try:
        return ZoneInfo("Asia/Shanghai")
    except ZoneInfoNotFoundError:  # pragma: no cover - defensive fallback
        return timezone(timedelta(hours=8))


def _build_fallback_snapshot(now: datetime) -> Dict[str, object]:
    payload = deepcopy(_BASE_FALLBACK)
    payload["lastUpdated"] = now.astimezone(_resolve_shanghai_timezone()).isoformat()
    return payload


__all__ = ["build_dashboard_snapshot"]
