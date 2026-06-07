from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.responses import JSONResponse


class UploadBodyTooLarge(Exception):
    pass


class UploadBodyLimitMiddleware:
    def __init__(
        self,
        app: Any,
        *,
        max_bytes_provider: Callable[[], int],
        upload_path: str = "/api/upload",
    ) -> None:
        self.app = app
        self.max_bytes_provider = max_bytes_provider
        self.upload_path = upload_path

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if (
            scope.get("type") != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != self.upload_path
        ):
            await self.app(scope, receive, send)
            return

        max_bytes = self.max_bytes_provider()
        content_length = _content_length(scope)
        if content_length is not None and content_length > max_bytes:
            await _send_too_large(scope, receive, send, max_bytes)
            return

        received_bytes = 0

        async def limited_receive() -> dict[str, Any]:
            nonlocal received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                received_bytes += len(message.get("body") or b"")
                if received_bytes > max_bytes:
                    raise UploadBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except UploadBodyTooLarge:
            await _send_too_large(scope, receive, send, max_bytes)


def _content_length(scope: dict[str, Any]) -> int | None:
    for name, value in scope.get("headers") or []:
        if name.lower() != b"content-length":
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    return None


async def _send_too_large(
    scope: dict[str, Any],
    receive: Callable[[], Awaitable[dict[str, Any]]],
    send: Callable[[dict[str, Any]], Awaitable[None]],
    max_bytes: int,
) -> None:
    response = JSONResponse(
        status_code=413,
        content={"detail": f"Upload request too large. Limit: {max_bytes} bytes"},
    )
    await response(scope, receive, send)
