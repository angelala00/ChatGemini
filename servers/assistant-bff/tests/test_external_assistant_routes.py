from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import external_assistant_routes
from app.storage import business_store


class ExternalAssistantRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "business-dev.db")
        self.business_backend_patcher = patch.object(
            business_store.model_config,
            "BUSINESS_STORAGE_BACKEND",
            "sqlite",
        )
        self.data_dir_patcher = patch.object(
            business_store,
            "DATA_DIR",
            self.temp_dir.name,
        )
        self.db_path_patcher = patch.object(
            business_store,
            "DEV_DB_PATH",
            self.db_path,
        )
        self.external_feature_patcher = patch.object(
            business_store.model_config,
            "EXTERNAL_ASSISTANT_FEATURE_ENABLED",
            False,
        )
        self.external_users_patcher = patch.object(
            business_store.model_config,
            "EXTERNAL_ASSISTANT_WHITE_LIST",
            set(),
        )
        for patcher in (
            self.business_backend_patcher,
            self.data_dir_patcher,
            self.db_path_patcher,
            self.external_feature_patcher,
            self.external_users_patcher,
        ):
            patcher.start()
        business_store._INITIALIZED = False
        business_store.init_business_storage()

    def tearDown(self) -> None:
        for patcher in (
            self.external_users_patcher,
            self.external_feature_patcher,
            self.db_path_patcher,
            self.data_dir_patcher,
            self.business_backend_patcher,
        ):
            patcher.stop()
        business_store.close_business_storage()
        business_store._INITIALIZED = False
        self.temp_dir.cleanup()

    def _set_visibility(
        self,
        *,
        enabled: bool,
        users: list[str],
        scope: str = "restricted",
    ) -> None:
        business_store.upsert_admin_feature_flag(
            config_key="external_assistant_feature_enabled",
            config_value=enabled,
            value_type="boolean",
            description="Enable external assistant",
            updated_by="test",
        )
        business_store.upsert_admin_feature_flag(
            config_key="external_assistant_visible_scope",
            config_value=scope,
            value_type="string",
            description="External assistant visibility scope",
            updated_by="test",
        )
        business_store.upsert_admin_feature_flag(
            config_key="external_assistant_visible_users",
            config_value=users,
            value_type="json",
            description="External assistant users",
            updated_by="test",
        )

    def _set_workspace_config(
        self,
        *,
        base_url: str,
        menus: list[dict[str, str]],
    ) -> None:
        business_store.upsert_admin_feature_flag(
            config_key="external_assistant_base_url",
            config_value=base_url,
            value_type="string",
            description="Smart Office base URL",
            updated_by="test",
        )
        business_store.upsert_admin_feature_flag(
            config_key="external_assistant_menus",
            config_value=menus,
            value_type="json",
            description="Smart Office menus",
            updated_by="test",
        )

    async def test_permission_is_disabled_by_default(self):
        result = await external_assistant_routes.external_assistant_permission(
            {"email": "pilot@example.com", "sub": "pilot-sub"}
        )
        self.assertEqual(result, {"allowed": False})

    async def test_permission_matches_email_or_sub(self):
        self._set_visibility(
            enabled=True,
            users=["pilot@example.com", "allowed-sub"],
        )

        email_result = await external_assistant_routes.external_assistant_permission(
            {"email": "pilot@example.com", "sub": "pilot-sub"}
        )
        sub_result = await external_assistant_routes.external_assistant_permission(
            {"email": "other@example.com", "sub": "allowed-sub"}
        )
        denied_result = await external_assistant_routes.external_assistant_permission(
            {"email": "other@example.com", "sub": "other-sub"}
        )

        self.assertTrue(email_result["allowed"])
        self.assertTrue(sub_result["allowed"])
        self.assertFalse(denied_result["allowed"])

    async def test_global_switch_overrides_allowlist(self):
        self._set_visibility(enabled=False, users=["pilot@example.com"])
        result = await external_assistant_routes.external_assistant_permission(
            {"email": "pilot@example.com", "sub": "pilot-sub"}
        )
        self.assertFalse(result["allowed"])

    async def test_bootstrap_rejects_non_allowlisted_user(self):
        self._set_visibility(enabled=True, users=["pilot@example.com"])
        with self.assertRaises(HTTPException) as ctx:
            await external_assistant_routes.external_assistant_bootstrap(
                {"email": "other@example.com", "sub": "other-sub"}
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_bootstrap_returns_configured_iframe_for_allowed_user(self):
        self._set_visibility(enabled=True, users=["pilot@example.com"])
        self._set_workspace_config(
            base_url="/b/",
            menus=[
                {"id": "new-chat", "label": "新建会话", "path": "/chat/new"},
                {"id": "history", "label": "历史会话", "path": "chat/history"},
            ],
        )
        user = {"email": "pilot@example.com", "sub": "pilot-sub"}
        with patch.object(
            external_assistant_routes.model_config,
            "EXTERNAL_ASSISTANT_TITLE",
            "智能办公",
        ):
            result = await external_assistant_routes.external_assistant_bootstrap(user)

        self.assertTrue(result["allowed"])
        self.assertEqual(result["title"], "智能办公")
        self.assertEqual(
            result["iframe_url"],
            "/b/chat/new",
        )
        self.assertEqual(
            result["menus"],
            [
                {
                    "id": "new-chat",
                    "label": "新建会话",
                    "path": "chat/new",
                    "url": "/b/chat/new",
                },
                {
                    "id": "history",
                    "label": "历史会话",
                    "path": "chat/history",
                    "url": "/b/chat/history",
                },
            ],
        )

    async def test_bootstrap_drops_unsafe_base_url(self):
        self._set_visibility(enabled=True, users=["pilot@example.com"])
        self._set_workspace_config(
            base_url="javascript:alert(1)",
            menus=[{"id": "home", "label": "首页", "path": ""}],
        )
        result = await external_assistant_routes.external_assistant_bootstrap(
            {"email": "pilot@example.com", "sub": "pilot-sub"}
        )

        self.assertEqual(result["iframe_url"], "")
        self.assertEqual(result["menus"], [])

    async def test_bootstrap_rejects_unsafe_paths_and_preserves_base_path(self):
        self._set_visibility(enabled=True, users=["pilot@example.com"])
        self._set_workspace_config(
            base_url="https://llm.nu.com/b/",
            menus=[
                {"id": "home", "label": "首页", "path": ""},
                {"id": "history", "label": "历史会话", "path": "/chat/history"},
                {"id": "escape", "label": "越界", "path": "../admin"},
                {"id": "external", "label": "跨域", "path": "https://example.com"},
                {"id": "network", "label": "协议相对", "path": "//example.com"},
            ],
        )
        result = await external_assistant_routes.external_assistant_bootstrap(
            {"email": "pilot@example.com", "sub": "pilot-sub"}
        )

        self.assertEqual(
            result["menus"],
            [
                {
                    "id": "home",
                    "label": "首页",
                    "path": "",
                    "url": "https://llm.nu.com/b/",
                },
                {
                    "id": "history",
                    "label": "历史会话",
                    "path": "chat/history",
                    "url": "https://llm.nu.com/b/chat/history",
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
