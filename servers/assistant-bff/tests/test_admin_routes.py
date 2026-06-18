from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.admin import access_control
from app.gpts.model_registry import GLM47_MODEL, GLM5_MODEL, QWEN35_MODEL
from app.routes import admin_routes, gpts_routes, voice_lab_routes
from app.storage import business_store


class AdminRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "business-dev.db")
        self.business_backend_patcher = patch.object(business_store.model_config, "BUSINESS_STORAGE_BACKEND", "sqlite")
        self.data_dir_patcher = patch.object(business_store, "DATA_DIR", self.temp_dir.name)
        self.db_path_patcher = patch.object(business_store, "DEV_DB_PATH", self.db_path)
        self.access_backend_patcher = patch.object(access_control.model_config, "GPTS_WHITE_LIST", set())
        self.access_voice_patcher = patch.object(access_control.model_config, "VOICE_LAB_WHITE_LIST", set())
        self.feature_flag_patcher = patch.object(access_control.model_config, "GPTS_FEATURE_ENABLED", True)
        for patcher in (
            self.business_backend_patcher,
            self.data_dir_patcher,
            self.db_path_patcher,
            self.access_backend_patcher,
            self.access_voice_patcher,
            self.feature_flag_patcher,
        ):
            patcher.start()
        business_store._INITIALIZED = False
        business_store.init_business_storage()
        self.user = {"email": "admin@example.com", "sub": "admin-sub"}

    def tearDown(self) -> None:
        for patcher in (
            self.db_path_patcher,
            self.data_dir_patcher,
            self.business_backend_patcher,
            self.access_voice_patcher,
            self.access_backend_patcher,
            self.feature_flag_patcher,
        ):
            patcher.stop()
        business_store.close_business_storage()
        business_store._INITIALIZED = False
        self.temp_dir.cleanup()

    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _seed_permission(self, user_key: str, permission_code: str) -> None:
        conn = self._conn()
        try:
            conn.execute(
                """
                INSERT INTO admin_user_permissions(user_key, permission_code, enabled, remark, created_at, updated_at)
                VALUES (?, ?, 1, ?, ?, ?)
                """,
                (
                    user_key,
                    permission_code,
                    "seed",
                    "2026-01-01T00:00:00+00:00",
                    "2026-01-01T00:00:00+00:00",
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def test_resolve_user_permissions_uses_env_fallback(self):
        with patch.object(access_control.model_config, "GPTS_WHITE_LIST", {"admin@example.com"}):
            permissions = admin_routes.resolve_user_permissions(self.user)
        self.assertIn("admin.access", permissions)
        self.assertIn("gpts.manage", permissions)

    def test_init_business_storage_seeds_builtin_admin_models(self):
        items = business_store.list_admin_model_configs()
        model_ids = {item["model_id"] for item in items}
        self.assertIn(GLM47_MODEL["model_name"], model_ids)
        self.assertIn(GLM5_MODEL["model_name"], model_ids)
        self.assertIn(QWEN35_MODEL["model_name"], model_ids)

    def test_init_business_storage_seeds_admin_permissions_and_feature_flags(self):
        conn = self._conn()
        try:
            conn.execute("DELETE FROM admin_user_permissions")
            conn.execute("DELETE FROM admin_feature_flags")
            conn.commit()
        finally:
            conn.close()

        with patch.object(access_control.model_config, "GPTS_WHITE_LIST", {"admin@example.com"}), patch.object(
            access_control.model_config,
            "VOICE_LAB_WHITE_LIST",
            {"voice@example.com"},
        ), patch.object(access_control.model_config, "GPTS_FEATURE_ENABLED", True):
            business_store._INITIALIZED = False
            business_store.init_business_storage()

        permissions = business_store.list_admin_user_permissions()
        permission_pairs = {(item["user_key"], item["permission_code"]) for item in permissions}
        self.assertIn(("admin@example.com", "admin.access"), permission_pairs)
        self.assertIn(("admin@example.com", "gpts.manage"), permission_pairs)
        self.assertIn(("admin@example.com", "models.manage"), permission_pairs)
        self.assertIn(("admin@example.com", "permissions.manage"), permission_pairs)
        self.assertIn(("admin@example.com", "feature_flags.manage"), permission_pairs)
        self.assertIn(("voice@example.com", "voice_lab.access"), permission_pairs)

        flags = {item["config_key"]: item for item in business_store.list_admin_feature_flags()}
        self.assertTrue(flags["gpts_feature_enabled"]["config_value"])
        self.assertEqual(flags["gpts_visible_scope"]["config_value"], "restricted")
        self.assertEqual(
            flags["gpts_visible_users"]["config_value"],
            ["admin@example.com"],
        )
        self.assertNotIn("default_model", flags)
        self.assertNotIn("default_visible_models", flags)
        self.assertNotIn("default_reasoning_enabled", flags)

    def test_init_business_storage_backfills_missing_feature_flags(self):
        conn = self._conn()
        try:
            conn.execute("DELETE FROM admin_feature_flags")
            conn.execute(
                """
                INSERT INTO admin_feature_flags(config_key, config_value, value_type, description, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    "gpts_feature_enabled",
                    "true",
                    "boolean",
                    "Enable GPTS",
                    "2026-01-01T00:00:00+00:00",
                    "seed",
                ),
            )
            conn.commit()
        finally:
            conn.close()

        business_store._INITIALIZED = False
        business_store.init_business_storage()

        flags = {item["config_key"]: item for item in business_store.list_admin_feature_flags()}
        self.assertIn("gpts_feature_enabled", flags)
        self.assertIn("gpts_visible_scope", flags)
        self.assertIn("gpts_visible_users", flags)
        self.assertNotIn("default_model", flags)
        self.assertNotIn("default_visible_models", flags)
        self.assertNotIn("default_reasoning_enabled", flags)

    async def test_delete_admin_model_prunes_feature_flag_references(self):
        self._seed_permission("admin@example.com", "admin.access")
        self._seed_permission("admin@example.com", "models.manage")
        business_store.upsert_admin_model_config(
            model_id=GLM5_MODEL["model_name"],
            display_name="GLM 5",
            provider_model_name=GLM5_MODEL["model_name"],
            sort_order=300,
            enabled=True,
        )
        business_store.upsert_admin_feature_flag(
            config_key="default_model",
            config_value=GLM5_MODEL["model_name"],
            value_type="string",
            description="Default model for the main assistant",
            updated_by="admin@example.com",
        )
        business_store.upsert_admin_feature_flag(
            config_key="default_visible_models",
            config_value=[GLM47_MODEL["model_name"], GLM5_MODEL["model_name"]],
            value_type="json",
            description="Visible models for the main assistant",
            updated_by="admin@example.com",
        )

        result = await admin_routes.remove_admin_model(GLM5_MODEL["model_name"], self.user)
        flags = {item["config_key"]: item for item in business_store.list_admin_feature_flags()}

        self.assertTrue(result["deleted"])
        self.assertEqual(flags["default_model"]["config_value"], "")
        self.assertEqual(flags["default_visible_models"]["config_value"], [GLM47_MODEL["model_name"]])

    async def test_admin_models_rejects_user_without_access(self):
        with self.assertRaises(HTTPException) as ctx:
            await admin_routes.admin_models({"email": "user@example.com", "sub": "user-sub"})
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_models_returns_seeded_rows(self):
        self._seed_permission("admin@example.com", "admin.access")
        business_store.upsert_admin_model_config(
            model_id=GLM47_MODEL["model_name"],
            display_name="GLM 4.7",
            provider_model_name="glm-4.7-provider",
            sort_order=10,
            enabled=True,
            supports_reasoning=True,
            supports_tool_calling=True,
            supports_native_image_input=False,
            reasoning_default_enabled=True,
            reasoning_parser_mode="deepseek",
            reasoning_parameter_format="openai",
            allowed_upload_types=["document"],
            visibility_scope="all",
            visibility_users=[],
            metadata={"tier": "prod"},
        )
        business_store.upsert_admin_feature_flag(
            config_key="gpts_feature_enabled",
            config_value=True,
            value_type="boolean",
            description="Enable GPTS",
            updated_by="admin@example.com",
        )

        models_payload = await admin_routes.admin_models(self.user)
        seeded_model = next(
            item for item in models_payload["items"] if item["model_id"] == GLM47_MODEL["model_name"]
        )
        self.assertTrue(seeded_model["supports_reasoning"])
        self.assertEqual(seeded_model["allowed_upload_types"], ["document"])

        permissions_payload = await admin_routes.admin_permissions(self.user)
        self.assertEqual(permissions_payload["items"][0]["permission_code"], "admin.access")

        flags_payload = await admin_routes.admin_feature_flags(self.user)
        flags_by_key = {item["config_key"]: item for item in flags_payload["items"]}
        self.assertEqual(flags_by_key["gpts_feature_enabled"]["config_key"], "gpts_feature_enabled")
        self.assertEqual(flags_by_key["gpts_feature_enabled"]["config_value"], True)

    async def test_gpts_overview_summarizes_switch_scope_and_manage_users(self):
        conn = self._conn()
        try:
            conn.execute("DELETE FROM admin_user_permissions")
            conn.execute("DELETE FROM admin_feature_flags WHERE config_key IN (?, ?)", ("gpts_visible_scope", "gpts_visible_users"))
            conn.commit()
        finally:
            conn.close()
        self._seed_permission("admin@example.com", "admin.access")
        self._seed_permission("manager@example.com", "gpts.manage")

        with patch.object(access_control.model_config, "GPTS_WHITE_LIST", {"admin@example.com", "user@example.com"}):
            result = await admin_routes.admin_gpts_overview(self.user)

        self.assertTrue(result["feature_enabled"])
        self.assertEqual(result["visible_scope"], "restricted")
        self.assertEqual(result["whitelist_users"], ["admin@example.com", "user@example.com"])
        self.assertIn("manager@example.com", result["explicit_manage_users"])
        self.assertEqual(
            set(result["effective_manage_users"]),
            {"admin@example.com", "manager@example.com", "user@example.com"},
        )
        self.assertTrue(result["current_user_allowed"])
        self.assertTrue(result["current_user_manage_allowed"])
        self.assertTrue(result["using_visibility_fallback"])

    async def test_gpts_visibility_route_persists_structured_visibility_flags(self):
        self._seed_permission("admin@example.com", "admin.access")
        self._seed_permission("admin@example.com", "feature_flags.manage")

        result = await admin_routes.update_admin_gpts_visibility(
            admin_routes.AdminGptsVisibilityPayload(
                visible_scope="restricted",
                visible_users=["a@a.com", "a@a.com", "user-sub"],
            ),
            self.user,
        )

        self.assertEqual(result["item"]["visible_scope"], "restricted")
        self.assertEqual(result["item"]["visible_users"], ["a@a.com", "user-sub"])

        scope_flag = business_store.get_admin_feature_flag("gpts_visible_scope")
        users_flag = business_store.get_admin_feature_flag("gpts_visible_users")
        self.assertIsNotNone(scope_flag)
        self.assertIsNotNone(users_flag)
        assert scope_flag is not None
        assert users_flag is not None
        self.assertEqual(scope_flag["config_value"], "restricted")
        self.assertEqual(users_flag["config_value"], ["a@a.com", "user-sub"])

    async def test_runtime_routes_read_db_gpts_visibility_before_env_whitelist(self):
        self._seed_permission("admin@example.com", "admin.access")
        business_store.upsert_admin_feature_flag(
            config_key="gpts_feature_enabled",
            config_value=True,
            value_type="boolean",
            description="Enable GPTS",
            updated_by="admin@example.com",
        )
        business_store.upsert_admin_feature_flag(
            config_key="gpts_visible_scope",
            config_value="restricted",
            value_type="string",
            description="Restrict GPTS visibility",
            updated_by="admin@example.com",
        )
        business_store.upsert_admin_feature_flag(
            config_key="gpts_visible_users",
            config_value=["allowed@example.com"],
            value_type="json",
            description="Allowed GPTS users",
            updated_by="admin@example.com",
        )

        with patch.object(gpts_routes, "GPTS_WHITE_LIST", {"admin@example.com"}):
            self.assertFalse(gpts_routes.is_gpts_feature_allowed(self.user))
            self.assertTrue(
                gpts_routes.is_gpts_feature_allowed(
                    {"email": "allowed@example.com", "sub": "allowed-sub"}
                )
            )

    async def test_admin_write_endpoints_upsert_and_delete(self):
        self._seed_permission("admin@example.com", "admin.access")
        self._seed_permission("admin@example.com", "models.manage")
        self._seed_permission("admin@example.com", "permissions.manage")
        self._seed_permission("admin@example.com", "feature_flags.manage")

        model_payload = admin_routes.AdminModelConfigPayload(
            model_id="glm-5",
            display_name="GLM 5",
            provider_model_name="glm-5-provider",
            sort_order=20,
            enabled=True,
            supports_reasoning=True,
            supports_tool_calling=True,
            supports_native_image_input=False,
            reasoning_default_enabled=True,
            reasoning_parser_mode="deepseek",
            reasoning_parameter_format="openai",
            allowed_upload_types=["document", "image"],
            visibility_scope="whitelist",
            visibility_users=["ops@example.com"],
            metadata={"tier": "prod"},
        )
        model_result = await admin_routes.create_admin_model(model_payload, self.user)
        self.assertEqual(model_result["item"]["model_id"], "glm-5")
        self.assertEqual(model_result["item"]["visibility_users"], ["ops@example.com"])

        permission_payload = admin_routes.AdminUserPermissionPayload(
            user_key="ops@example.com",
            permission_code="gpts.manage",
            enabled=True,
            remark="ops",
        )
        permission_result = await admin_routes.create_admin_permission(permission_payload, self.user)
        self.assertEqual(permission_result["item"]["permission_code"], "gpts.manage")

        flag_payload = admin_routes.AdminFeatureFlagPayload(
            config_key="gpts_feature_enabled",
            config_value=True,
            value_type="boolean",
            description="Enable GPTS",
        )
        flag_result = await admin_routes.create_admin_feature_flag(flag_payload, self.user)
        self.assertEqual(flag_result["item"]["config_key"], "gpts_feature_enabled")
        self.assertEqual(flag_result["item"]["config_value"], True)

        updated_permission = await admin_routes.update_admin_permission(
            admin_routes.AdminUserPermissionPayload(
                user_key="ops@example.com",
                permission_code="gpts.manage",
                enabled=False,
                remark="disabled",
            ),
            self.user,
        )
        self.assertFalse(updated_permission["item"]["enabled"])

        delete_permission = await admin_routes.remove_admin_permission(
            "ops@example.com",
            "gpts.manage",
            self.user,
        )
        self.assertTrue(delete_permission["deleted"])

        delete_model = await admin_routes.remove_admin_model("glm-5", self.user)
        self.assertTrue(delete_model["deleted"])

        delete_flag = await admin_routes.remove_admin_feature_flag(
            "gpts_feature_enabled",
            self.user,
        )
        self.assertTrue(delete_flag["deleted"])

        audit_payload = await admin_routes.admin_audit_logs(user=self.user)
        self.assertGreaterEqual(len(audit_payload["items"]), 6)
        self.assertEqual(audit_payload["items"][0]["resource_type"], "feature_flag")

    async def test_admin_write_endpoints_require_module_permissions(self):
        self._seed_permission("admin@example.com", "admin.access")
        with self.assertRaises(HTTPException) as ctx:
            await admin_routes.create_admin_model(
                admin_routes.AdminModelConfigPayload(
                    model_id="glm-x",
                    display_name="GLM X",
                    provider_model_name="glm-x-provider",
                ),
                self.user,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_runtime_routes_respect_admin_config(self):
        self._seed_permission("voice@example.com", "voice_lab.access")
        business_store.upsert_admin_feature_flag(
            config_key="gpts_feature_enabled",
            config_value=False,
            value_type="boolean",
            description="Disable GPTS",
            updated_by="admin@example.com",
        )

        with patch.object(gpts_routes.model_config, "GPTS_FEATURE_ENABLED", True), patch.object(
            gpts_routes, "GPTS_WHITE_LIST", set()
        ):
            self.assertFalse(gpts_routes.is_gpts_feature_allowed(self.user))

        self.assertTrue(
            voice_lab_routes.is_voice_lab_allowed(
                {"email": "voice@example.com", "sub": "voice-user"}
            )
        )


if __name__ == "__main__":
    unittest.main()
