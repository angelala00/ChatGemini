"""Aggregate usage metrics from local event logs into the dashboard payload structure."""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Dict, Iterable, List

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.runtime_events import build_runtime_event_summary
from .events import init_metrics_storage, iter_usage_events

logger = logging.getLogger(__name__)

_BASE_FALLBACK = {
    "metrics": [
        {"id": "totalUsers", "title": "用户数", "value": "0", "hint": "较上期", "emphasis": "持平 0%"},
        {"id": "totalConversations", "title": "会话数", "value": "0", "hint": "较上期", "emphasis": "持平 0%"},
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
        {"id": "successRate", "title": "请求成功率", "value": "0.0%", "hint": "错误率", "emphasis": "100.0%"},
    ],
    "requestsTrend": [],
    "timeWindow": {"range": "过去 14 天", "peak": "暂无数据", "low": "暂无数据"},
    "userLeaderboard": [],
    "gptsLeaderboard": [],
    "modelLeaderboard": [],
    "requestedModelLeaderboard": [],
    "alerts": [],
    "runtimeSummary": {
        "suspectedCrashCount": 0,
        "suspectedCrashRate": "0.0%",
        "jsErrorCount": 0,
        "unhandledRejectionCount": 0,
        "reactRenderErrorCount": 0,
        "wecomCrashShare": "0.0%",
        "runtimeAlerts": [],
        "topRoutes": [],
        "topBrowsers": [],
        "recentSuspectedCrashes": [],
    },
}


@dataclass(frozen=True)
class TimeRangeWindow:
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
        current_events = list(iter_usage_events(since=window.current_start, until=window.current_end))
        previous_events = (
            list(iter_usage_events(since=window.previous_start, until=window.previous_end))
            if window.compare and window.previous_start and window.previous_end
            else []
        )
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to build dashboard snapshot; returning fallback data")
        return _build_fallback_snapshot(now, window)

    metrics = _collect_metric_cards(current_events, previous_events)
    requests_trend, peak, low = _collect_trend(current_events, now, window)
    alerts = _collect_alerts(metrics, peak_latency=_fetch_average_latency(current_events))
    runtime_summary = _collect_runtime_summary(window)

    return {
        "lastUpdated": now.astimezone(_resolve_shanghai_timezone()).isoformat(),
        "metrics": metrics,
        "requestsTrend": requests_trend,
        "timeWindow": {
            "range": window.label,
            "peak": f"{peak:,} 请求/日" if peak is not None else "暂无数据",
            "low": f"{low:,} 请求/日" if low is not None else "暂无数据",
        },
        "userLeaderboard": _collect_leaderboard(current_events, key="user", limit=15),
        "gptsLeaderboard": _collect_leaderboard(current_events, key="gid", limit=5),
        "modelLeaderboard": _collect_leaderboard(current_events, key="model", limit=5),
        "requestedModelLeaderboard": _collect_leaderboard(current_events, key="requested_model", limit=5),
        "alerts": alerts,
        "runtimeSummary": runtime_summary,
    }


def _collect_metric_cards(current_events: list[dict[str, object]], previous_events: list[dict[str, object]]) -> list[dict[str, str]]:
    current_users = _unique_count(current_events, "user_id")
    previous_users = _unique_count(previous_events, "user_id")
    current_conversations = _unique_count(current_events, "conversation_id")
    previous_conversations = _unique_count(previous_events, "conversation_id")
    current_requests = len(current_events)
    previous_requests = len(previous_events)
    current_upload_requests = sum(1 for item in current_events if int(item.get("upload_count") or 0) > 0)
    previous_upload_requests = sum(1 for item in previous_events if int(item.get("upload_count") or 0) > 0)
    current_success = sum(1 for item in current_events if item.get("status") == "success")
    current_errors = sum(1 for item in current_events if item.get("status") == "error")
    success_rate = (current_success / current_requests * 100) if current_requests else 0.0
    upload_share = (current_upload_requests / current_requests * 100) if current_requests else 0.0

    return [
        {
            "id": "totalUsers",
            "title": "用户数",
            "value": _format_int(current_users),
            "hint": "较上期",
            "emphasis": _format_period_change(current_users, previous_users),
        },
        {
            "id": "totalConversations",
            "title": "会话数",
            "value": _format_int(current_conversations),
            "hint": "较上期",
            "emphasis": _format_period_change(current_conversations, previous_conversations),
        },
        {
            "id": "totalRequests",
            "title": "请求数",
            "value": _format_int(current_requests),
            "hint": "较上期",
            "emphasis": _format_period_change(current_requests, previous_requests),
            "detailLabel": "含文件",
            "detailValue": f"{_format_int(current_upload_requests)} 次",
            "detailEmphasis": f"{upload_share:.0f}%",
        },
        {
            "id": "successRate",
            "title": "请求成功率",
            "value": f"{success_rate:.1f}%",
            "hint": "错误率",
            "emphasis": f"{(current_errors / current_requests * 100) if current_requests else 0.0:.1f}%",
        },
    ]


def _collect_trend(
    events: list[dict[str, object]],
    now: datetime,
    window: TimeRangeWindow,
) -> tuple[list[dict[str, object]], int | None, int | None]:
    if window.days is None:
        days = 14
        start = now - timedelta(days=days)
    else:
        days = max(window.days, 1)
        start = window.current_start or (now - timedelta(days=days))

    counts = defaultdict(int)
    for item in events:
        started_at = _parse_datetime(item.get("started_at"))
        if started_at is None:
            continue
        counts[started_at.astimezone(timezone.utc).date().isoformat()] += 1

    series = []
    values: list[int] = []
    for offset in range(days):
        day = (start + timedelta(days=offset)).date()
        iso_day = day.isoformat()
        total = counts.get(iso_day, 0)
        values.append(total)
        series.append({"date": iso_day, "count": total})
    peak = max(values) if values else None
    low = min(values) if values else None
    return series, peak, low


def _collect_leaderboard(
    events: list[dict[str, object]],
    *,
    key: str,
    limit: int,
) -> List[Dict[str, object]]:
    assert key in {"user", "gid", "model", "requested_model"}
    success_events = [item for item in events if item.get("status") == "success"]
    counter = Counter()
    for item in success_events:
        if key == "user":
            label = str(item.get("user_email") or item.get("user_id") or "未知用户")
        elif key == "gid":
            label = str(item.get("gid") or "未标记")
        elif key == "model":
            label = str(item.get("model") or "未指定模型")
        else:
            label = str(item.get("requested_model") or "未指定模型")
        counter[label] += 1

    total_in_scope = sum(counter.values())
    leaderboard: list[dict[str, object]] = []
    for label, total_raw in counter.most_common(limit):
        total = _format_int(total_raw)
        if key == "user":
            leaderboard.append({"name": label, "value": f"{total} 请求"})
            continue
        share = (total_raw / total_in_scope * 100) if total_in_scope else 0.0
        leaderboard.append(
            {
                "name": label,
                "value": f"{total} 次 · {share:.0f}%",
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
    return [
        {"name": "延迟预警", "value": latency_label},
        {"name": "SLA 风险", "value": sla_status},
        {"name": "模型分布", "value": "稳定"},
    ]


def _fetch_average_latency(events: list[dict[str, object]]) -> float | None:
    latencies = [float(item["latency_ms"]) for item in events if item.get("latency_ms") is not None]
    if not latencies:
        return None
    return sum(latencies) / len(latencies)


def _collect_runtime_summary(window: TimeRangeWindow) -> Dict[str, object]:
    summary = build_runtime_event_summary(
        since=window.current_start,
        until=window.current_end,
        limit=5000,
    )
    event_counts = summary.get("byEvent", {}) if isinstance(summary, dict) else {}
    if not isinstance(event_counts, dict):
        event_counts = {}

    suspected_crashes = int(summary.get("suspectedCrashCount") or 0)
    page_open_count = int(event_counts.get("page_open") or 0)
    js_error_count = int(event_counts.get("js_error") or 0)
    unhandled_rejection_count = int(event_counts.get("unhandled_rejection") or 0)
    react_render_error_count = int(event_counts.get("react_render_error") or 0)
    recent_suspected_crashes_raw = summary.get("recentSuspectedCrashes", [])
    if not isinstance(recent_suspected_crashes_raw, list):
        recent_suspected_crashes_raw = []

    wecom_crash_count = sum(1 for item in recent_suspected_crashes_raw if isinstance(item, dict) and item.get("isWeCom"))
    crash_rate = f"{(suspected_crashes / page_open_count) * 100:.1f}%" if page_open_count else "0.0%"
    wecom_crash_share = f"{(wecom_crash_count / suspected_crashes) * 100:.1f}%" if suspected_crashes else "0.0%"

    return {
        "suspectedCrashCount": suspected_crashes,
        "suspectedCrashRate": crash_rate,
        "jsErrorCount": js_error_count,
        "unhandledRejectionCount": unhandled_rejection_count,
        "reactRenderErrorCount": react_render_error_count,
        "wecomCrashShare": wecom_crash_share,
        "runtimeAlerts": _build_runtime_alerts(
            suspected_crashes=suspected_crashes,
            page_open_count=page_open_count,
            js_error_count=js_error_count,
            unhandled_rejection_count=unhandled_rejection_count,
            react_render_error_count=react_render_error_count,
            wecom_crash_count=wecom_crash_count,
        ),
        "topRoutes": summary.get("topRoutes", []),
        "topBrowsers": summary.get("topBrowsers", []),
        "recentSuspectedCrashes": [
            _normalize_recent_crash(item)
            for item in recent_suspected_crashes_raw[:10]
            if isinstance(item, dict)
        ],
    }


def _build_runtime_alerts(
    *,
    suspected_crashes: int,
    page_open_count: int,
    js_error_count: int,
    unhandled_rejection_count: int,
    react_render_error_count: int,
    wecom_crash_count: int,
) -> List[Dict[str, str]]:
    alerts: List[Dict[str, str]] = []
    crash_rate = (suspected_crashes / page_open_count * 100) if page_open_count else 0.0
    if suspected_crashes >= 3 or crash_rate >= 3:
        alerts.append(
            {
                "level": "high" if crash_rate >= 5 or suspected_crashes >= 5 else "medium",
                "title": "疑似崩溃偏高",
                "value": f"{suspected_crashes} 次 · {crash_rate:.1f}%",
                "hint": "基于 page_open 与异常退出推断",
            }
        )
    if react_render_error_count > 0:
        alerts.append(
            {
                "level": "high",
                "title": "存在渲染异常",
                "value": f"{react_render_error_count} 次",
                "hint": "React 错误边界已捕获到渲染报错",
            }
        )
    if js_error_count >= 10 or unhandled_rejection_count >= 5:
        alerts.append(
            {
                "level": "medium",
                "title": "前端异常偏多",
                "value": f"JS {js_error_count} / Promise {unhandled_rejection_count}",
                "hint": "建议优先查看最近异常与版本变更",
            }
        )
    if suspected_crashes > 0 and wecom_crash_count / max(suspected_crashes, 1) >= 0.5:
        alerts.append(
            {
                "level": "medium",
                "title": "企微环境占比较高",
                "value": f"{wecom_crash_count}/{suspected_crashes}",
                "hint": "疑似崩溃样本中企微占比超过 50%",
            }
        )
    return alerts


def _normalize_recent_crash(item: dict[str, object]) -> dict[str, object]:
    return {
        "recordedAt": item.get("recordedAt"),
        "route": item.get("route"),
        "gid": item.get("gid"),
        "userEmail": item.get("userEmail"),
        "browser": item.get("browser"),
        "isWeCom": bool(item.get("isWeCom")),
        "reason": item.get("reason"),
    }


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _unique_count(events: Iterable[dict[str, object]], key: str) -> int:
    values = {str(item.get(key)).strip() for item in events if item.get(key)}
    return len(values)


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

    return _resolve_time_range(now, default_key)


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
