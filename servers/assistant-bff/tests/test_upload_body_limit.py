from __future__ import annotations

import asyncio
import unittest

from app.middleware.upload_body_limit import UploadBodyLimitMiddleware


class UploadBodyLimitMiddlewareTests(unittest.TestCase):
    @staticmethod
    def _scope(*, content_length: int | None = None) -> dict:
        headers = []
        if content_length is not None:
            headers.append((b"content-length", str(content_length).encode("ascii")))
        return {
            "type": "http",
            "method": "POST",
            "path": "/api/upload",
            "headers": headers,
        }

    @staticmethod
    def _run(middleware, scope, request_messages):
        sent_messages = []
        remaining = list(request_messages)

        async def receive():
            return remaining.pop(0) if remaining else {"type": "http.disconnect"}

        async def send(message):
            sent_messages.append(message)

        asyncio.run(middleware(scope, receive, send))
        return sent_messages

    def test_rejects_oversized_content_length_before_downstream(self):
        downstream_called = False

        async def downstream(scope, receive, send):
            nonlocal downstream_called
            downstream_called = True

        middleware = UploadBodyLimitMiddleware(downstream, max_bytes_provider=lambda: 10)
        messages = self._run(middleware, self._scope(content_length=11), [])

        self.assertFalse(downstream_called)
        self.assertEqual(messages[0]["status"], 413)

    def test_rejects_chunked_upload_when_received_bytes_exceed_limit(self):
        async def downstream(scope, receive, send):
            while True:
                message = await receive()
                if not message.get("more_body"):
                    break

        middleware = UploadBodyLimitMiddleware(downstream, max_bytes_provider=lambda: 5)
        messages = self._run(
            middleware,
            self._scope(),
            [
                {"type": "http.request", "body": b"123", "more_body": True},
                {"type": "http.request", "body": b"456", "more_body": False},
            ],
        )

        self.assertEqual(messages[0]["status"], 413)

    def test_allows_upload_within_limit(self):
        async def downstream(scope, receive, send):
            message = await receive()
            self.assertEqual(message["body"], b"12345")
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        middleware = UploadBodyLimitMiddleware(downstream, max_bytes_provider=lambda: 5)
        messages = self._run(
            middleware,
            self._scope(content_length=5),
            [{"type": "http.request", "body": b"12345", "more_body": False}],
        )

        self.assertEqual(messages[0]["status"], 204)


if __name__ == "__main__":
    unittest.main()
