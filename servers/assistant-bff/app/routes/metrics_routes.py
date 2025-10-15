"""Routes exposing aggregated metrics data for the dashboard."""

from __future__ import annotations

from fastapi import APIRouter

from app.metrics import build_dashboard_snapshot

router = APIRouter(prefix="/api", tags=["metrics"])


@router.get("/metrics/dashboard")
async def get_dashboard_metrics() -> dict[str, object]:
    return build_dashboard_snapshot()


__all__ = ["router"]
