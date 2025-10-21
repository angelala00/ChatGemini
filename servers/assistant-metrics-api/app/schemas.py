"""Pydantic schemas for the Assistant metrics API."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class Metric(BaseModel):
    id: str
    title: str
    value: str
    hint: Optional[str] = None
    emphasis: Optional[str] = None
    detailLabel: Optional[str] = None
    detailValue: Optional[str] = None
    detailEmphasis: Optional[str] = None


class TrendPoint(BaseModel):
    date: str
    total: int = Field(ge=0)


class LeaderboardEntry(BaseModel):
    name: str
    value: str


class TimeWindow(BaseModel):
    range: str
    peak: str
    low: str


class DashboardPayload(BaseModel):
    lastUpdated: datetime
    metrics: List[Metric]
    requestsTrend: List[TrendPoint]
    timeWindow: TimeWindow
    userLeaderboard: List[LeaderboardEntry]
    gptsLeaderboard: List[LeaderboardEntry]
    modelLeaderboard: List[LeaderboardEntry]
    requestedModelLeaderboard: List[LeaderboardEntry]
    alerts: List[LeaderboardEntry]

    class Config:
        json_encoders = {
            datetime: lambda value: value.isoformat(),
        }
