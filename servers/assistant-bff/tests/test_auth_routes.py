from __future__ import annotations

import unittest

from fastapi.responses import RedirectResponse
from starlette.requests import Request

from app.auth.auth_routes import _safe_return_to, login, oauth_login


def _build_request(headers: dict[str, str] | None = None) -> Request:
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    return Request({"type": "http", "headers": raw_headers})


class SafeReturnToTests(unittest.TestCase):
    def test_accepts_relative_path_with_query_and_fragment(self):
        self.assertEqual(_safe_return_to("/library?x=1#section"), "/library?x=1#section")

    def test_accepts_root_path(self):
        self.assertEqual(_safe_return_to("/"), "/")

    def test_rejects_empty_value(self):
        self.assertEqual(_safe_return_to(""), "")
        self.assertEqual(_safe_return_to(None), "")

    def test_rejects_absolute_url(self):
        self.assertEqual(_safe_return_to("https://evil.com/path"), "")

    def test_rejects_protocol_relative_url(self):
        self.assertEqual(_safe_return_to("//evil.com/path"), "")

    def test_rejects_backslash_paths(self):
        self.assertEqual(_safe_return_to("/\\evil.com"), "")
        self.assertEqual(_safe_return_to("/foo\\bar"), "")

    def test_rejects_value_without_leading_slash(self):
        self.assertEqual(_safe_return_to("library"), "")


class OauthLoginReturnToTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_return_to_redirects_with_status_302(self):
        response = await oauth_login(
            "mock",
            request=_build_request(),
            returnTo="/library?x=1",
        )
        self.assertIsInstance(response, RedirectResponse)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["location"], "/library?x=1")

    async def test_return_to_fragment_is_preserved(self):
        response = await oauth_login(
            "mock",
            request=_build_request(),
            returnTo="/docs/gateway-api#quickstart",
        )
        self.assertEqual(response.headers["location"], "/docs/gateway-api#quickstart")

    async def test_referer_origin_is_prepended_for_dev_ports(self):
        response = await oauth_login(
            "mock",
            request=_build_request({"referer": "http://localhost:3000/console/apikey"}),
            returnTo="/console/usage?tab=2",
        )
        self.assertEqual(
            response.headers["location"],
            "http://localhost:3000/console/usage?tab=2",
        )

    async def test_missing_return_to_keeps_json_mock_response(self):
        response = await oauth_login("mock", request=_build_request(), returnTo="")
        self.assertEqual(response, {"message": "mock redirect to mock"})

    async def test_absolute_return_to_does_not_redirect(self):
        response = await oauth_login(
            "mock",
            request=_build_request(),
            returnTo="https://evil.com/path",
        )
        self.assertEqual(response, {"message": "mock redirect to mock"})

    async def test_protocol_relative_return_to_does_not_redirect(self):
        response = await oauth_login(
            "mock",
            request=_build_request(),
            returnTo="//evil.com/path",
        )
        self.assertEqual(response, {"message": "mock redirect to mock"})

    async def test_backslash_return_to_does_not_redirect(self):
        response = await oauth_login(
            "mock",
            request=_build_request(),
            returnTo="/foo\\bar",
        )
        self.assertEqual(response, {"message": "mock redirect to mock"})


class LoginEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_return_to_redirects_with_status_302(self):
        response = await login(request=_build_request(), returnTo="/library?x=1")
        self.assertIsInstance(response, RedirectResponse)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.headers["location"], "/library?x=1")

    async def test_referer_origin_is_prepended_for_dev_ports(self):
        response = await login(
            request=_build_request({"referer": "http://localhost:3000/console/apikey"}),
            returnTo="/console/usage?tab=2",
        )
        self.assertEqual(
            response.headers["location"],
            "http://localhost:3000/console/usage?tab=2",
        )

    async def test_missing_return_to_keeps_json_mock_response(self):
        response = await login(request=_build_request(), returnTo="")
        self.assertIn("message", response)

    async def test_absolute_return_to_does_not_redirect(self):
        response = await login(
            request=_build_request(),
            returnTo="https://evil.com/path",
        )
        self.assertIn("message", response)


if __name__ == "__main__":
    unittest.main()
