"""Aggregate usage metrics into the dashboard payload structure."""

from __future__ import annotations

import logging
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Dict, Iterable, List, Sequence, Tuple

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


@dataclass(frozen=True)
class TimeRangeWindow:
    """Represents a normalised time range selection."""

    key: str
    label: str
    current_start: datetime | None
    current_end: datetime
    previous_start: datetime | None
    previous_end: datetime | None
    days: int | None
    compare: bool


def build_dashboard_snapshot(time_range: str | None = None) -> Dict[str, object]:
    now = datetime.now(timezone.utc)
    window = _resolve_time_range(now, time_range)

    try:
        init_metrics_storage()
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to initialise metrics storage; returning fallback data")
        return _build_fallback_snapshot(now, window)

    try:
        conn = get_db()
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to open metrics database; returning fallback data")
        return _build_fallback_snapshot(now, window)
    try:
        metrics = _collect_metric_cards(conn, now, window)
        requests_trend, peak, low = _collect_trend(conn, now, window)
        user_leaderboard = _collect_leaderboard(
            conn, window, key="user", limit=15
        )
        gpts_leaderboard = _collect_leaderboard(
            conn, window, key="gid", limit=5
        )
        model_leaderboard = _collect_leaderboard(
            conn, window, key="model", limit=5
        )
        requested_model_leaderboard = _collect_leaderboard(
            conn, window, key="requested_model", limit=5
        )
        alerts = _collect_alerts(
            metrics, peak_latency=_fetch_average_latency(conn, now, window)
        )
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to build dashboard snapshot; returning fallback data")
        return _build_fallback_snapshot(now, window)
    finally:
        conn.close()

    last_updated = now.astimezone(_resolve_shanghai_timezone()).isoformat()

    return {
        "lastUpdated": last_updated,
        "metrics": metrics,
        "requestsTrend": requests_trend,
        "timeWindow": {
            "range": window.label,
            "peak": f"{peak:,} 请求/日" if peak is not None else "暂无数据",
            "low": f"{low:,} 请求/日" if low is not None else "暂无数据",
        },
        "userLeaderboard": user_leaderboard,
        "gptsLeaderboard": gpts_leaderboard,
        "modelLeaderboard": model_leaderboard,
        "requestedModelLeaderboard": requested_model_leaderboard,
        "alerts": alerts,
    }


def _collect_metric_cards(
    conn, now: datetime, window: TimeRangeWindow
) -> List[Dict[str, str]]:
    current_filters, current_params = _build_time_filters(
        window.current_start, window.current_end
    )
    previous_filters: List[str]
    previous_params: Sequence[str]
    if window.compare and window.previous_start is not None:
        previous_filters, previous_params = _build_time_filters(
            window.previous_start, window.previous_end
        )
    else:
        previous_filters, previous_params = [], ()

    total_requests = _scalar(
        conn,
        """
        SELECT COUNT(*)
          FROM usage_events
         {where}
        """.format(where=_build_where_clause([
            "status IN ('success', 'error')",
            *current_filters,
        ])),
        tuple(current_params),
    )
    upload_requests = _scalar(
        conn,
        """
        SELECT COUNT(*)
          FROM usage_events
         {where}
        """.format(where=_build_where_clause([
            "status IN ('success', 'error')",
            "upload_count > 0",
            *current_filters,
        ])),
        tuple(current_params),
    )
    success_requests = _scalar(
        conn,
        """
        SELECT COUNT(*)
          FROM usage_events
         {where}
        """.format(where=_build_where_clause([
            "status = 'success'",
            *current_filters,
        ])),
        tuple(current_params),
    )

    requests_previous = 0
    if previous_filters:
        requests_previous = _scalar(
            conn,
            """
            SELECT COUNT(*)
              FROM usage_events
             {where}
            """.format(where=_build_where_clause([
                "status IN ('success', 'error')",
                *previous_filters,
            ])),
            tuple(previous_params),
        )

    total_users = _scalar(
        conn,
        """
        SELECT COUNT(DISTINCT user_id)
          FROM usage_events
         {where}
        """.format(where=_build_where_clause(current_filters)),
        tuple(current_params),
    )
    total_conversations = _scalar(
        conn,
        """
        SELECT COUNT(DISTINCT conversation_id)
          FROM usage_events
         {where}
        """.format(where=_build_where_clause([
            "conversation_id IS NOT NULL",
            "conversation_id <> ''",
            *current_filters,
        ])),
        tuple(current_params),
    )

    users_previous = 0
    conversations_previous = 0
    if previous_filters:
        users_previous = _scalar(
            conn,
            """
            SELECT COUNT(DISTINCT user_id)
              FROM usage_events
             {where}
            """.format(where=_build_where_clause(previous_filters)),
            tuple(previous_params),
        )
        conversations_previous = _scalar(
            conn,
            """
            SELECT COUNT(DISTINCT conversation_id)
              FROM usage_events
             {where}
            """.format(where=_build_where_clause([
                "conversation_id IS NOT NULL",
                "conversation_id <> ''",
                *previous_filters,
            ])),
            tuple(previous_params),
        )

    success_rate = (success_requests / total_requests) if total_requests else 0.0
    error_rate = 1 - success_rate

    def _change(current: int, previous: int) -> str:
        if not previous_filters:
            return "持平 0%"
        return _format_period_change(current, previous)

    users_change = _change(total_users, users_previous)
    conversations_change = _change(total_conversations, conversations_previous)
    requests_change = _change(total_requests, requests_previous)

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


def _collect_trend(
    conn, now: datetime, window: TimeRangeWindow
) -> Tuple[List[Dict[str, object]], int | None, int | None]:
    time_filters, time_params = _build_time_filters(
        window.current_start, window.current_end
    )
    filters = ["status IN ('success', 'error')", *time_filters]
    rows = conn.execute(
        """
        SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS total
          FROM usage_events
         {where}
         GROUP BY day
         ORDER BY day
        """.format(where=_build_where_clause(filters)),
        tuple(time_params),
    ).fetchall()

    totals = Counter({row["day"]: row["total"] for row in rows})

    if window.days is None:
        if not totals:
            return [], None, None
        first_day_str = min(totals)
        first_day = datetime.fromisoformat(first_day_str).date()
        total_days = max((now.date() - first_day).days + 1, 1)
    else:
        total_days = max(window.days, 1)
        first_day = (now - timedelta(days=total_days - 1)).date()

    trend: List[Dict[str, object]] = []
    peak = None
    low = None
    for offset in range(total_days):
        day = first_day + timedelta(days=offset)
        iso_day = day.isoformat()
        total = totals.get(iso_day, 0)
        trend.append({"date": day.strftime("%m-%d"), "total": total})
        peak = total if peak is None or total > peak else peak
        low = total if low is None or total < low else low

    return trend, peak, low


def _collect_leaderboard(
    conn, window: TimeRangeWindow, *, key: str, limit: int
) -> List[Dict[str, object]]:
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
    time_filters, time_params = _build_time_filters(
        window.current_start, window.current_end
    )
    filters = ["status = 'success'", *time_filters]
    where_clause = _build_where_clause(filters)

    rows = conn.execute(
        f"""
        SELECT {column['select']} AS label, COUNT(*) AS total
          FROM usage_events{where_clause}
         GROUP BY {column['group']}
         ORDER BY total DESC
         LIMIT ?
        """,
        (*time_params, limit),
    ).fetchall()

    total_in_scope = _scalar(
        conn,
        f"SELECT COUNT(*) FROM usage_events{where_clause}",
        tuple(time_params),
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


def _fetch_average_latency(
    conn, now: datetime, window: TimeRangeWindow
) -> float | None:
    time_filters, time_params = _build_time_filters(
        window.current_start, window.current_end
    )
    filters = ["completed_at IS NOT NULL", *time_filters]
    row = conn.execute(
        """
        SELECT AVG(latency_ms) AS avg_latency
          FROM usage_events{where}
        """.format(where=_build_where_clause(filters)),
        tuple(time_params),
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


def _build_time_filters(
    start: datetime | None, end: datetime | None, *, column: str = "started_at"
) -> Tuple[List[str], List[str]]:
    filters: List[str] = []
    params: List[str] = []
    if start is not None:
        filters.append(f"{column} >= ?")
        params.append(start.isoformat())
    if end is not None:
        filters.append(f"{column} < ?")
        params.append(end.isoformat())
    return filters, params


def _build_where_clause(filters: Iterable[str]) -> str:
    parts = [f for f in filters if f]
    if not parts:
        return ""
    return " WHERE " + " AND ".join(parts)


def _resolve_time_range(now: datetime, key: str | None) -> TimeRangeWindow:
    default_key = "14d"
    normalized = (key or default_key).strip().lower()
    duration_labels = {
        "7d": ("过去 7 天", 7),
        default_key: ("过去 14 天", 14),
        "30d": ("过去 30 天", 30),
    }

    if normalized == "all":
        return TimeRangeWindow(
            key="all",
            label="所有时间",
            current_start=None,
            current_end=now,
            previous_start=None,
            previous_end=None,
            days=None,
            compare=False,
        )

    if normalized == "today":
        start_of_day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        previous_start = start_of_day - timedelta(days=1)
        return TimeRangeWindow(
            key="today",
            label="今天",
            current_start=start_of_day,
            current_end=now,
            previous_start=previous_start,
            previous_end=start_of_day,
            days=1,
            compare=True,
        )

    if normalized in duration_labels:
        label, days = duration_labels[normalized]
        start = now - timedelta(days=days)
        previous_start = start - timedelta(days=days)
        return TimeRangeWindow(
            key=normalized,
            label=label,
            current_start=start,
            current_end=now,
            previous_start=previous_start,
            previous_end=start,
            days=days,
            compare=True,
        )

    if normalized != default_key:
        return _resolve_time_range(now, default_key)

    # Fallback: treat unknown keys as the default 14-day window.
    label, days = duration_labels[default_key]
    start = now - timedelta(days=days)
    previous_start = start - timedelta(days=days)
    return TimeRangeWindow(
        key=default_key,
        label=label,
        current_start=start,
        current_end=now,
        previous_start=previous_start,
        previous_end=start,
        days=days,
        compare=True,
    )


def _resolve_shanghai_timezone() -> tzinfo:
    try:
        return ZoneInfo("Asia/Shanghai")
    except ZoneInfoNotFoundError:  # pragma: no cover - defensive fallback
        return timezone(timedelta(hours=8))


def _build_fallback_snapshot(now: datetime, window: TimeRangeWindow) -> Dict[str, object]:
    payload = deepcopy(_BASE_FALLBACK)
    payload["lastUpdated"] = now.astimezone(_resolve_shanghai_timezone()).isoformat()
    payload.setdefault("timeWindow", {})["range"] = window.label
    return payload


__all__ = ["build_dashboard_snapshot"]
