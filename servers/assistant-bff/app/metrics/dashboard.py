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
            "hint": "较上期",
            "emphasis": "持平 0%",
        },
        {
            "id": "totalConversations",
            "title": "会话数",
            "value": "0",
            "hint": "较上期",
            "emphasis": "持平 0%",
        },
        {
            "id": "totalRequests",
            "title": "请求数",
            "value": "0",
            "hint": "较上期",
            "emphasis": "持平 0%",
            "detailLabel": "含文件",
            "detailValue": "0 次",
            "detailEmphasis": "0%",
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
    "requestedModelLeaderboard": [],
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
        user_leaderboard = _collect_leaderboard(conn, now, key="user", limit=15)
        gpts_leaderboard = _collect_leaderboard(conn, now, key="gid", limit=5)
        model_leaderboard = _collect_leaderboard(conn, now, key="model", limit=5)
        requested_model_leaderboard = _collect_leaderboard(
            conn, now, key="requested_model", limit=5
        )
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
        "requestedModelLeaderboard": requested_model_leaderboard,
        "alerts": alerts,
    }


def _collect_metric_cards(conn, now: datetime) -> List[Dict[str, str]]:
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    fourteen_days_ago = (now - timedelta(days=14)).isoformat()
    total_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE status IN ('success', 'error')",
    )
    upload_requests = _scalar(
        conn,
        """
        SELECT COUNT(*)
          FROM usage_events
         WHERE status IN ('success', 'error')
           AND upload_count > 0
        """,
    )
    success_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE status='success'",
    )
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    today_anchor = today_start.isoformat()
    yesterday_start = (today_start - timedelta(days=1)).isoformat()
    todays_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE started_at >= ?",
        (today_anchor,),
    )
    yesterdays_requests = _scalar(
        conn,
        "SELECT COUNT(*) FROM usage_events WHERE started_at >= ? AND started_at < ?",
        (yesterday_start, today_anchor),
    )
    total_users = _scalar(
        conn,
        "SELECT COUNT(DISTINCT user_id) FROM usage_events",
    )
    total_conversations = _scalar(
        conn,
        """
        SELECT COUNT(DISTINCT conversation_id)
          FROM usage_events
         WHERE conversation_id IS NOT NULL AND conversation_id <> ''
        """,
    )
    users_last_week = _scalar(
        conn,
        "SELECT COUNT(DISTINCT user_id) FROM usage_events WHERE started_at >= ?",
        (seven_days_ago,),
    )
    users_previous_week = _scalar(
        conn,
        "SELECT COUNT(DISTINCT user_id) FROM usage_events WHERE started_at >= ? AND started_at < ?",
        (fourteen_days_ago, seven_days_ago),
    )
    conversations_last_week = _scalar(
        conn,
        """
        SELECT COUNT(DISTINCT conversation_id)
          FROM usage_events
         WHERE started_at >= ?
           AND conversation_id IS NOT NULL
           AND conversation_id <> ''
        """,
        (seven_days_ago,),
    )
    conversations_previous_week = _scalar(
        conn,
        """
        SELECT COUNT(DISTINCT conversation_id)
          FROM usage_events
         WHERE started_at >= ?
           AND started_at < ?
           AND conversation_id IS NOT NULL
           AND conversation_id <> ''
        """,
        (fourteen_days_ago, seven_days_ago),
    )
    success_rate = (success_requests / total_requests) if total_requests else 0.0
    error_rate = 1 - success_rate
    users_change = _format_period_change(users_last_week, users_previous_week)
    conversations_change = _format_period_change(
        conversations_last_week, conversations_previous_week
    )
    requests_change = _format_period_change(todays_requests, yesterdays_requests)

    upload_share = (upload_requests / total_requests * 100) if total_requests else 0.0

    return [
        {
            "id": "totalUsers",
            "title": "用户数",
            "value": _format_int(total_users),
            "hint": "较上期",
            "emphasis": users_change,
        },
        {
            "id": "totalConversations",
            "title": "会话数",
            "value": _format_int(total_conversations),
            "hint": "较上期",
            "emphasis": conversations_change,
        },
        {
            "id": "totalRequests",
            "title": "请求数",
            "value": _format_int(total_requests),
            "hint": "较上期",
            "emphasis": requests_change,
            "detailLabel": "含文件",
            "detailValue": f"{_format_int(upload_requests)} 次",
            "detailEmphasis": f"{upload_share:.0f}%",
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


def _collect_leaderboard(conn, now: datetime, *, key: str, limit: int) -> List[Dict[str, object]]:
    assert key in {"user", "gid", "model", "requested_model"}
    column = {
        "user": {
            "select": "COALESCE(user_email, user_id)",
            "group": "user_id",
        },
        "gid": {
            "select": "COALESCE(gid, '未标记')",
            "group": "gid",
        },
        "model": {
            "select": "COALESCE(model, '未指定模型')",
            "group": "model",
        },
        "requested_model": {
            "select": "COALESCE(NULLIF(requested_model, ''), '未指定模型')",
            "group": "COALESCE(NULLIF(requested_model, ''), '未指定模型')",
        },
    }[key]
    start = (now - timedelta(days=14)).isoformat()
    filters = ["started_at >= ?", "status = 'success'"]
    params = [start]
    where_clause = " AND ".join(filters)

    rows = conn.execute(
        f"""
        SELECT {column['select']} AS label, COUNT(*) AS total
          FROM usage_events
         WHERE {where_clause}
         GROUP BY {column['group']}
         ORDER BY total DESC
         LIMIT ?
        """,
        (*params, limit),
    ).fetchall()

    total_in_scope = _scalar(
        conn,
        f"SELECT COUNT(*) FROM usage_events WHERE {where_clause}",
        tuple(params),
    )
    leaderboard: List[Dict[str, object]] = []
    for row in rows:
        total_raw = int(row["total"])
        total = _format_int(total_raw)
        if key == "user":
            value = f"{total} 请求"
            leaderboard.append({"name": row["label"], "value": value})
            continue

        share = (total_raw / total_in_scope * 100) if total_in_scope else 0.0
        value = f"{total} 次 · {share:.0f}%"
        leaderboard.append(
            {
                "name": row["label"],
                "value": value,
                "count": total_raw,
                "percentage": round(share, 2),
            }
        )
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


def _format_period_change(current: int, previous: int) -> str:
    if previous <= 0:
        if current <= 0:
            return "持平 0%"
        return "↑ 100%+"

    change = (current - previous) / previous * 100
    if change > 0:
        return f"↑ {change:.1f}%"
    if change < 0:
        return f"↓ {abs(change):.1f}%"
    return "持平 0%"


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
