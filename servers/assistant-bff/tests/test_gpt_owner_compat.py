from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.routes import gpts_routes


class GPTOwnerCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_email_owner_can_transfer_when_user_sub_differs(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "Custom GPT",
                    "desc": "desc",
                    "system_prompt": "prompt",
                    "owner": "new-owner@example.com",
                    "auth": {"type": "all"},
                }
            )
        )
        captured: dict[str, object] = {}

        def fake_update_custom_gpt(gid: str, config: dict[str, object]) -> None:
            captured["gid"] = gid
            captured["config"] = config

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.object(gpts_routes, "update_custom_gpt", side_effect=fake_update_custom_gpt),
            patch.dict(
                gpts_routes.gpts,
                {
                    "custom-gpt": {
                        "gid": "custom-gpt",
                        "name": "Custom GPT",
                        "owner": "owner@example.com",
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            result = await gpts_routes.update_gpt(
                "custom-gpt",
                request,
                {"email": "owner@example.com", "sub": "owner-user-id"},
            )

        self.assertEqual(result, {"gid": "custom-gpt"})
        self.assertEqual(captured["gid"], "custom-gpt")
        self.assertEqual(captured["config"]["owner"], "new-owner@example.com")

    async def test_email_owner_can_delete_when_user_sub_differs(self):
        deleted: dict[str, object] = {}

        def fake_delete_custom_gpt(gid: str) -> None:
            deleted["gid"] = gid

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "is_gpts_manage_allowed", return_value=False),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "delete_custom_gpt", side_effect=fake_delete_custom_gpt),
            patch.object(gpts_routes, "delete_user_gpt_state_by_gid", lambda gid: None),
            patch.object(gpts_routes, "delete_assistant_knowledge_files", lambda gid: None),
            patch.dict(
                gpts_routes.gpts,
                {
                    "custom-gpt": {
                        "gid": "custom-gpt",
                        "name": "Custom GPT",
                        "owner": "owner@example.com",
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            result = await gpts_routes.delete_gpt(
                "custom-gpt",
                {"email": "owner@example.com", "sub": "owner-user-id"},
            )

        self.assertEqual(result, {"gid": "custom-gpt"})
        self.assertEqual(deleted["gid"], "custom-gpt")

    async def test_non_owner_by_email_still_cannot_transfer(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "Custom GPT",
                    "desc": "desc",
                    "system_prompt": "prompt",
                    "owner": "new-owner@example.com",
                    "auth": {"type": "all"},
                }
            )
        )

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.dict(
                gpts_routes.gpts,
                {
                    "custom-gpt": {
                        "gid": "custom-gpt",
                        "name": "Custom GPT",
                        "owner": "owner@example.com",
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await gpts_routes.update_gpt(
                    "custom-gpt",
                    request,
                    {"email": "admin@example.com", "sub": "admin-user-id"},
                )

        self.assertEqual(ctx.exception.status_code, 401)
