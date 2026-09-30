from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.routes import gpts_routes


class GPTOwnerCompatibilityTests(unittest.IsolatedAsyncioTestCase):
    def test_sidebar_path_redirect_entries_keep_existing_visibility_rules(self):
        path_agent = {
            "name": "Policy Agent",
            "assistant_kind": "path_redirect",
            "redirect_path": "apps/policy-agent",
            "auth": {"type": "white", "user": ["viewer@example.com"]},
        }
        hidden_agent = {
            **path_agent,
            "name": "Hidden Agent",
            "redirect_path": "apps/hidden",
            "auth": {"type": "white", "user": ["other@example.com"]},
        }

        with (
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "is_gpts_feature_allowed", return_value=True),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.object(gpts_routes, "list_user_gpt_pin_states", return_value={}),
            patch.object(gpts_routes, "list_user_pinned_rows", return_value=[]),
            patch.object(
                gpts_routes,
                "fetch_gpts",
                return_value={
                    "path-agent": path_agent,
                    "hidden-agent": hidden_agent,
                },
            ),
        ):
            items = gpts_routes.get_sidebar_gpts(
                {"email": "viewer@example.com", "sub": "viewer-user-id"}
            )

        self.assertEqual(
            items,
            [
                {
                    "gid": "path-agent",
                    "name": "Policy Agent",
                    "is_pinned": True,
                    "assistant_kind": "path_redirect",
                    "redirect_path": "apps/policy-agent",
                }
            ],
        )

    async def test_create_path_redirect_gpt_saves_only_navigation_contract(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "Policy Agent",
                    "desc": "制度管理平台",
                    "assistant_kind": "path_redirect",
                    "redirect_path": "/apps/policy-agent/",
                    "system_prompt": "must not be stored",
                    "enabled_capabilities": ["attachment.document_list"],
                    "auth": {"type": "white", "user": ["viewer@example.com"]},
                    "admins": ["admin@example.com"],
                    "viewers": ["viewer@example.com"],
                }
            )
        )
        captured: dict[str, object] = {}

        def fake_insert_custom_gpt(gid: str, config: dict[str, object]) -> None:
            captured["gid"] = gid
            captured["config"] = config

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.object(gpts_routes, "insert_custom_gpt", side_effect=fake_insert_custom_gpt),
            patch.dict(gpts_routes.gpts, {}, clear=True),
        ):
            result = await gpts_routes.create_gpt(
                request,
                {"email": "owner@example.com", "sub": "owner-user-id"},
            )

        self.assertEqual(result, {"gid": captured["gid"]})
        config = captured["config"]
        assert isinstance(config, dict)
        self.assertEqual(config["assistant_kind"], "path_redirect")
        self.assertEqual(config["redirect_path"], "apps/policy-agent")
        self.assertNotIn("handler_key", config)
        self.assertNotIn("models", config)
        self.assertNotIn("enabled_capabilities", config)
        self.assertNotIn("system_prompt", config)

    async def test_create_path_redirect_gpt_rejects_external_url(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "Policy Agent",
                    "desc": "制度管理平台",
                    "assistant_kind": "path_redirect",
                    "redirect_path": "https://example.com/apps/policy-agent",
                }
            )
        )

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.dict(gpts_routes.gpts, {}, clear=True),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await gpts_routes.create_gpt(
                    request,
                    {"email": "owner@example.com", "sub": "owner-user-id"},
                )

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "redirect_path must be a safe relative path")

    async def test_update_path_redirect_gpt_keeps_kind_and_normalizes_path(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "Policy Agent",
                    "desc": "制度管理平台",
                    "assistant_kind": "custom",
                    "redirect_path": "/apps/policy-agent/overview/",
                    "auth": {"type": "all"},
                }
            )
        )
        captured: dict[str, object] = {}

        def fake_update_custom_gpt(gid: str, config: dict[str, object]) -> None:
            captured["config"] = config

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.object(gpts_routes, "update_custom_gpt", side_effect=fake_update_custom_gpt),
            patch.dict(
                gpts_routes.gpts,
                {
                    "path-agent": {
                        "gid": "path-agent",
                        "name": "Policy Agent",
                        "desc": "制度管理平台",
                        "assistant_kind": "path_redirect",
                        "redirect_path": "apps/policy-agent",
                        "owner": "owner-user-id",
                        "auth": {"type": "all"},
                    }
                },
                clear=True,
            ),
        ):
            result = await gpts_routes.update_gpt(
                "path-agent",
                request,
                {"email": "owner@example.com", "sub": "owner-user-id"},
            )

        self.assertEqual(result, {"gid": "path-agent"})
        config = captured["config"]
        assert isinstance(config, dict)
        self.assertEqual(config["assistant_kind"], "path_redirect")
        self.assertEqual(config["redirect_path"], "apps/policy-agent/overview")

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
