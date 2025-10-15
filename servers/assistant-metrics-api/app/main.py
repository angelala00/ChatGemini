"""FastAPI application exposing metrics for the Assistant dashboard."""

from __future__ import annotations

import asyncio
import contextlib
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware

from .dashboard_data import build_dashboard_payload
from .schemas import DashboardPayload

DEFAULT_PUSH_INTERVAL = 30  # seconds

app = FastAPI(
    title="Assistant Metrics API",
    version="0.1.0",
    description="Backend service that powers the Assistant dashboard metrics.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthcheck() -> dict[str, str]:
    """Simple health-check endpoint used by deployment probes."""

    return {"status": "ok"}


@app.get("/api/dashboard", response_model=DashboardPayload)
async def read_dashboard() -> DashboardPayload:
    """Return the latest dashboard dataset."""

    payload = await build_dashboard_payload()
    return DashboardPayload(**payload)


async def _websocket_sender(websocket: WebSocket, interval: int) -> None:
    """Continuously push dashboard updates to the websocket."""

    try:
        while True:
            payload = DashboardPayload(**(await build_dashboard_payload()))
            await websocket.send_json(
                {"type": "dashboard:update", "data": jsonable_encoder(payload)}
            )
            await asyncio.sleep(interval)
    except asyncio.CancelledError:  # pragma: no cover - defensive programming
        raise


@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket) -> None:
    """Provide live dashboard updates over WebSocket."""

    await websocket.accept()
    interval = int(os.getenv("DASHBOARD_PUSH_INTERVAL", DEFAULT_PUSH_INTERVAL))

    sender = asyncio.create_task(_websocket_sender(websocket, interval))
    try:
        while True:
            # We do not expect to receive messages, but the receive call keeps
            # the connection alive and allows FastAPI to detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        sender.cancel()
    finally:
        sender.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await sender


__all__ = ["app"]
