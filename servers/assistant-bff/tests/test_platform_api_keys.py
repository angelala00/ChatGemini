from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch

from starlette.requests import Request

from app.routes import platform_routes


def _request(method: str, payload: dict | None = None) -> Request:
    body = json.dumps(payload or {}).encode("utf-8")

    async def receive() -> dict:
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/api/platform/user/tokens",
            "headers": [(b"content-type", b"application/json")],
            "query_string": b"",
        },
        receive,
    )


class _FakeResponse:
    status_code = 201
    content = b'{"token":"generated-token"}'
    headers = {"content-type": "application/json"}


class _FakeAsyncClient:
    sent_json: dict | None = None

    def __init__(self, **_: object) -> None:
        pass

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, *_: object, json: dict, **__: object) -> _FakeResponse:
        type(self).sent_json = json
        return _FakeResponse()


class PlatformApiKeyTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_token_forwards_validated_space_context(self) -> None:
        access_db = {
            "users": {
                "alice@example.com": {
                    "department": "eng",
                    "space_ids": ["public"],
                }
            },
            "projects": {},
            "tokens": {},
        }
        _FakeAsyncClient.sent_json = None
        with (
            patch.object(
                platform_routes,
                "_fetch_json",
                new=AsyncMock(return_value=(200, access_db)),
            ),
            patch.object(
                platform_routes,
                "_ensure_user_registered",
                new=AsyncMock(return_value=(access_db, None)),
            ),
            patch.object(
                platform_routes,
                "_load_effective_spaces",
                new=AsyncMock(
                    return_value=(
                        [
                            {
                                "id": "public",
                                "available": True,
                                "status": "available",
                            }
                        ],
                        None,
                    )
                ),
            ),
            patch.object(
                platform_routes.httpx,
                "AsyncClient",
                _FakeAsyncClient,
            ),
            patch.object(
                platform_routes,
                "_build_headers",
                return_value={"Authorization": "Bearer internal"},
            ),
        ):
            response = await platform_routes.create_user_token(
                _request(
                    "POST",
                    {
                        "ownerType": "user",
                        "spaceId": "public",
                        "note": "CLI",
                    },
                ),
                {"email": "alice@example.com"},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(_FakeAsyncClient.sent_json["user"], "alice@example.com")
        self.assertEqual(_FakeAsyncClient.sent_json["spaceId"], "public")
        self.assertNotIn("siteIds", _FakeAsyncClient.sent_json)

    async def test_create_token_uses_implicit_default_space(self) -> None:
        access_db = {
            "users": {
                "alice@example.com": {
                    "department": "eng",
                }
            },
            "projects": {},
            "tokens": {},
        }
        _FakeAsyncClient.sent_json = None
        with (
            patch.object(
                platform_routes,
                "_fetch_json",
                new=AsyncMock(return_value=(200, access_db)),
            ),
            patch.object(
                platform_routes,
                "_ensure_user_registered",
                new=AsyncMock(return_value=(access_db, None)),
            ),
            patch.object(
                platform_routes,
                "_load_effective_spaces",
                new=AsyncMock(
                    return_value=(
                        [
                            {
                                "id": "public",
                                "available": True,
                                "status": "available",
                                "isDefault": True,
                            }
                        ],
                        None,
                    )
                ),
            ),
            patch.object(
                platform_routes.httpx,
                "AsyncClient",
                _FakeAsyncClient,
            ),
            patch.object(
                platform_routes,
                "_build_headers",
                return_value={"Authorization": "Bearer internal"},
            ),
        ):
            response = await platform_routes.create_user_token(
                _request(
                    "POST",
                    {
                        "ownerType": "user",
                        "note": "default",
                    },
                ),
                {"email": "alice@example.com"},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(_FakeAsyncClient.sent_json["spaceId"], "public")

    async def test_token_mutation_requires_personal_or_owned_project(self) -> None:
        access_db = {
            "projects": {
                "owned": {"owners": ["alice@example.com"]},
                "foreign": {"owners": ["bob@example.com"]},
            },
            "tokens": {
                "personal-key": {"user": "alice@example.com"},
                "owned-key": {"project": "owned"},
                "foreign-key": {"project": "foreign"},
            },
        }
        request = _request("PATCH")
        with patch.object(
            platform_routes,
            "_fetch_json",
            new=AsyncMock(return_value=(200, access_db)),
        ):
            personal = await platform_routes._ensure_user_token_value_access(
                request, {"email": "alice@example.com"}, "personal-key"
            )
            owned = await platform_routes._ensure_user_token_value_access(
                request, {"email": "alice@example.com"}, "owned-key"
            )
            foreign = await platform_routes._ensure_user_token_value_access(
                request, {"email": "alice@example.com"}, "foreign-key"
            )

        self.assertIsNone(personal)
        self.assertIsNone(owned)
        self.assertEqual(foreign.status_code, 404)


if __name__ == "__main__":
    unittest.main()
