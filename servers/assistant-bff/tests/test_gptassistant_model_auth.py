from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.admin import access_control
from app.routes import chat_routes, gpts_routes
from app.storage import business_store


class GPTAssistantModelAuthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.assistant_config = {
            "default_model": "glm-4.7",
            "models": [
                {
                    "id": "glm-4.7",
                    "model_name": "glm-4.7",
                    "name": "GLM 4.7",
                },
                {
                    "id": "glm-5",
                    "model_name": "glm-5",
                    "name": "GLM 5",
                    "auth": {
                        "type": "white",
                        "user": ["allowed@example.com"],
                    },
                },
            ],
        }

    def test_tool_resources_are_scoped_to_current_gpt_conversation_and_user(self):
        mappings = {
            "knowledge-1": {"purpose": "assistant_knowledge", "authProvider": "c"},
            "session-current": {
                "purpose": "session_attachment",
                "conversationId": "cid-1",
                "ownerUserId": "user-1",
                "authProvider": "c",
            },
            "session-other-user": {
                "purpose": "session_attachment",
                "conversationId": "cid-1",
                "ownerUserId": "user-2",
                "authProvider": "c",
            },
            "session-other-conversation": {
                "purpose": "session_attachment",
                "conversationId": "cid-2",
                "ownerUserId": "user-1",
                "authProvider": "c",
            },
        }
        with patch.object(chat_routes, "list_file_mappings", return_value=mappings):
            merged = chat_routes._merge_tool_file_ids(
                "request-1",
                "custom-gpt",
                "cid-1",
                {"sub": "user-1", "email": "user@example.com"},
            )

        self.assertEqual(merged, "request-1,knowledge-1,session-current")

    def test_request_session_attachments_are_bound_to_generated_conversation(self):
        with patch.object(chat_routes, "bind_file_mappings_to_conversation", return_value=2) as bind_mock:
            updated = chat_routes._bind_request_session_attachments(
                " file-1,file-2 ",
                "custom-gpt",
                "cid-generated",
                {"sub": "user-1", "email": "user@example.com"},
            )

        self.assertEqual(updated, 2)
        bind_mock.assert_called_once_with(
            [" file-1", "file-2 "],
            gid="custom-gpt",
            conversation_id="cid-generated",
            owner_user_id="user-1",
            owner_user_email="user@example.com",
            auth_provider="c",
        )

    def test_delete_session_attachments_only_removes_owned_session_files(self):
        mappings = {
            "session-current": {
                "purpose": "session_attachment",
                "conversationId": "cid-1",
                "ownerUserId": "user-1",
                "authProvider": "c",
            },
            "knowledge-current": {
                "purpose": "assistant_knowledge",
                "conversationId": "cid-1",
                "ownerUserId": "user-1",
                "authProvider": "c",
            },
            "session-other-user": {
                "purpose": "session_attachment",
                "conversationId": "cid-1",
                "ownerUserId": "user-2",
                "authProvider": "c",
            },
            "session-other-conversation": {
                "purpose": "session_attachment",
                "conversationId": "cid-2",
                "ownerUserId": "user-1",
                "authProvider": "c",
            },
        }
        with (
            patch.object(chat_routes, "list_file_mappings", return_value=mappings),
            patch.object(chat_routes, "delete_file_reference") as delete_reference_mock,
        ):
            deleted = chat_routes._delete_session_attachments(
                "cid-1",
                "custom-gpt",
                {"sub": "user-1", "email": "user@example.com"},
            )

        self.assertEqual(deleted, 1)
        delete_reference_mock.assert_called_once_with(
            "session-current",
            mappings["session-current"],
        )

    async def test_delete_session_cleans_attachments_before_history(self):
        meta = {
            "user_id": "user-1",
            "auth_provider": "local",
            "gid": "custom-gpt",
        }
        with (
            patch.object(chat_routes, "get_current_auth_provider", return_value="local"),
            patch.object(chat_routes, "get_session_history_meta", return_value=meta),
            patch.object(chat_routes, "_delete_session_attachments") as delete_attachments_mock,
            patch.object(chat_routes, "_runtime_history_key", return_value="runtime-cid-1"),
            patch.object(chat_routes, "delete_session_history") as delete_history_mock,
        ):
            result = await chat_routes.delete_session(
                "cid-1",
                {"sub": "user-1", "email": "user@example.com"},
            )

        self.assertEqual(result, {"ok": True})
        delete_attachments_mock.assert_called_once_with(
            "cid-1",
            "custom-gpt",
            {"sub": "user-1", "email": "user@example.com"},
        )
        self.assertEqual(
            [call.args[0] for call in delete_history_mock.call_args_list],
            ["runtime-cid-1", "cid-1"],
        )

    def test_provider_scoped_gpt_is_hidden_on_other_login_end(self):
        with patch.dict(
            gpts_routes.gpts,
            {
                "provider-gpt": {
                    "gid": "provider-gpt",
                    "name": "Provider GPT",
                    "owner": "user-1",
                    "provider_scope": "provider",
                    "auth_provider": "a",
                    "auth": {"type": "all"},
                }
            },
            clear=False,
        ):
            self.assertFalse(
                gpts_routes.is_gpt_visible_to_provider(
                    gpts_routes.gpts["provider-gpt"],
                    "b",
                )
            )
            self.assertTrue(
                gpts_routes.is_gpt_visible_to_provider(
                    gpts_routes.gpts["provider-gpt"],
                    "a",
                )
            )

    def test_global_gpt_stays_visible_across_provider_ends(self):
        with patch.dict(
            gpts_routes.gpts,
            {
                "global-gpt": {
                    "gid": "global-gpt",
                    "name": "Global GPT",
                    "owner": "user-1",
                    "provider_scope": "global",
                    "auth_provider": "global",
                    "auth": {"type": "all"},
                }
            },
            clear=False,
        ):
            self.assertTrue(
                gpts_routes.is_gpt_visible_to_provider(
                    gpts_routes.gpts["global-gpt"],
                    "a",
                )
            )
            self.assertTrue(
                gpts_routes.is_gpt_visible_to_provider(
                    gpts_routes.gpts["global-gpt"],
                    "b",
                )
            )

    def test_filter_models_for_user_hides_restricted_model(self):
        visible_models = gpts_routes.sanitize_models_for_detail(
            self.assistant_config["models"],
            "blocked@example.com",
            "blocked-user",
        )

        self.assertEqual([item["id"] for item in visible_models], ["glm-4.7"])
        self.assertNotIn("auth", visible_models[0])

    async def test_available_gpt_models_returns_only_models_visible_to_creator(self):
        with patch.dict(gpts_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch.object(
            gpts_routes,
            "refresh_gpts",
            lambda: None,
        ), patch(
            "app.routes.gpts_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.gpts_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.gpts_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ):
            payload = await gpts_routes.resolve_available_gpt_models(
                {"email": "blocked@example.com", "sub": "blocked-user"},
            )

        self.assertEqual(payload["default_model"], "glm-4.7")
        self.assertEqual([item["id"] for item in payload["models"]], ["glm-4.7"])

    async def test_model_selection_rejects_unauthorized_requested_model(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ):
                with self.assertRaises(HTTPException) as ctx:
                    await chat_routes._get_gid_model_config(
                        "gptassistant",
                        "glm-5",
                        user_email="blocked@example.com",
                        user_id="blocked-user",
                    )

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_model_selection_falls_back_to_visible_default(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ):
                selected = await chat_routes._get_gid_model_config(
                    "gptassistant",
                    None,
                    user_email="blocked@example.com",
                    user_id="blocked-user",
                )

        self.assertEqual(selected["id"], "glm-4.7")

    async def test_model_selection_uses_available_assistant_preferred_model(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ):
            selected = await chat_routes._get_gid_model_config(
                "gptassistant",
                None,
                user_email="allowed@example.com",
                user_id="allowed-user",
                fallback_model="glm-5",
            )

        self.assertEqual(selected["id"], "glm-5")

    async def test_model_selection_falls_back_when_assistant_preferred_model_is_retired(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ):
            selected = await chat_routes._get_gid_model_config(
                "gptassistant",
                None,
                user_email="blocked@example.com",
                user_id="blocked-user",
                fallback_model="retired-model",
            )

        self.assertEqual(selected["id"], "glm-4.7")

    async def test_model_selection_allows_whitelisted_user(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ):
                selected = await chat_routes._get_gid_model_config(
                    "gptassistant",
                    "glm-5",
                    user_email="allowed@example.com",
                    user_id="allowed-user",
                )

        self.assertEqual(selected["id"], "glm-5")

    async def test_model_selection_applies_remote_metadata_overlay(self):
        remote_models = [
            {
                "id": "glm-4.7",
                "model_name": "glm-4.7",
                "name": "GLM 4.7",
                "supports_reasoning": False,
                "supports_native_image_input": True,
                "compat": {"reasoning_parameter_format": "qwen"},
            }
        ]
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.apply_runtime_model_visibility",
            side_effect=lambda gid, models: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(return_value=remote_models),
        ):
                selected = await chat_routes._get_gid_model_config(
                    "gptassistant",
                    "glm-4.7",
                    user_email="blocked@example.com",
                    user_id="blocked-user",
                )

        self.assertFalse(selected["supports_reasoning"])
        self.assertTrue(selected["supports_native_image_input"])
        self.assertEqual(selected["compat"]["reasoning_parameter_format"], "qwen")

    async def test_admin_model_config_overrides_reasoning_capability(self):
        temp_dir = tempfile.TemporaryDirectory()
        db_path = os.path.join(temp_dir.name, "business-dev.db")
        backend_patcher = patch.object(business_store.model_config, "BUSINESS_STORAGE_BACKEND", "sqlite")
        data_dir_patcher = patch.object(business_store, "DATA_DIR", temp_dir.name)
        db_path_patcher = patch.object(business_store, "DEV_DB_PATH", db_path)
        backend_patcher.start()
        data_dir_patcher.start()
        db_path_patcher.start()
        try:
            business_store._INITIALIZED = False
            business_store.init_business_storage()
            business_store.upsert_admin_model_config(
                model_id="glm-4.7",
                display_name="GLM 4.7",
                provider_model_name="glm-4.7",
                supports_reasoning=False,
                supports_tool_calling=False,
                supports_native_image_input=False,
            )
            with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False), patch(
                "app.routes.chat_routes.apply_runtime_model_visibility",
                side_effect=lambda gid, models: models,
            ), patch(
                "app.routes.chat_routes.resolve_model_configs",
                new=AsyncMock(
                    return_value=[
                        {
                            "id": "glm-4.7",
                            "model_name": "glm-4.7",
                            "name": "GLM 4.7",
                            "supports_reasoning": True,
                        }
                    ]
                ),
            ):
                selected = await chat_routes._get_gid_model_config(
                    "gptassistant",
                    "glm-4.7",
                    user_email="blocked@example.com",
                    user_id="blocked-user",
                )
            self.assertFalse(selected["supports_reasoning"])
        finally:
            backend_patcher.stop()
            data_dir_patcher.stop()
            db_path_patcher.stop()
            business_store._INITIALIZED = False
            temp_dir.cleanup()


class GPTSPinnedAccessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "business-dev.db")
        self.backend_patcher = patch.object(gpts_routes.model_config, "BUSINESS_STORAGE_BACKEND", "sqlite")
        self.access_gpts_patcher = patch.object(access_control.model_config, "GPTS_WHITE_LIST", set())
        self.access_voice_patcher = patch.object(access_control.model_config, "VOICE_LAB_WHITE_LIST", set())
        self.data_dir_patcher = patch.object(business_store, "DATA_DIR", self.temp_dir.name)
        self.db_path_patcher = patch.object(business_store, "DEV_DB_PATH", self.db_path)
        self.backend_patcher.start()
        self.access_gpts_patcher.start()
        self.access_voice_patcher.start()
        self.data_dir_patcher.start()
        self.db_path_patcher.start()
        business_store._INITIALIZED = False
        business_store.init_business_storage()
        self.user = {
            "email": "blocked@example.com",
            "sub": "blocked-user",
        }
        self.regulation_config = {
            "name": "制度问答助手",
            "auth": {"type": "all"},
            "required_pinned": True,
        }

    def tearDown(self) -> None:
        self.backend_patcher.stop()
        self.access_voice_patcher.stop()
        self.access_gpts_patcher.stop()
        self.data_dir_patcher.stop()
        self.db_path_patcher.stop()
        business_store._INITIALIZED = False
        self.temp_dir.cleanup()

    async def test_pinned_endpoint_forces_regulation_for_non_whitelisted_user(self):
        with patch.object(gpts_routes, "GPTS_WHITE_LIST", {"allowed@example.com"}), \
             patch.object(gpts_routes, "refresh_gpts", lambda: None), \
             patch.dict(
                 gpts_routes.gpts,
                 {"regulationassistant": self.regulation_config},
                 clear=True,
             ):
            pinned = await gpts_routes.gpts_pined(self.user)

        self.assertEqual(pinned[0]["gid"], "regulationassistant")
        self.assertTrue(pinned[0]["is_required_pinned"])

    async def test_required_regulation_assistant_cannot_be_unpinned(self):
        class Request:
            async def json(self):
                return {"is_pinned": False}

        with patch.object(gpts_routes, "GPTS_WHITE_LIST", set()):
            with self.assertRaises(HTTPException) as ctx:
                await gpts_routes.toggle_pin("regulationassistant", Request(), self.user)

        self.assertEqual(ctx.exception.status_code, 400)

    def test_non_whitelisted_user_can_access_previously_pinned_gpt(self):
        business_store.set_user_gpt_pin(self.user["sub"], "custom-gpt", is_pinned=True)

        with patch.object(gpts_routes, "GPTS_WHITE_LIST", {"allowed@example.com"}):
            self.assertTrue(gpts_routes.can_access_gpt(self.user, "custom-gpt"))
            self.assertFalse(gpts_routes.can_access_gpt(self.user, "not-pinned"))

    def test_feature_flag_does_not_bypass_provider_scope(self):
        with patch.object(gpts_routes, "refresh_gpts", lambda: None), patch.object(
            gpts_routes,
            "is_gpts_feature_allowed",
            return_value=True,
        ), patch.object(
            gpts_routes,
            "get_current_auth_provider",
            return_value="b",
        ), patch.dict(
            gpts_routes.gpts,
            {
                "provider-gpt": {
                    "name": "Provider GPT",
                    "owner": "blocked-user",
                    "provider_scope": "provider",
                    "auth_provider": "a",
                    "auth": {"type": "all"},
                }
            },
            clear=False,
        ):
            self.assertFalse(gpts_routes.can_access_gpt(self.user, "provider-gpt"))

    async def test_pinned_endpoint_accepts_user_without_sub(self):
        user = {"email": "email-only@example.com"}
        with patch.object(gpts_routes, "GPTS_WHITE_LIST", {"allowed@example.com"}), \
             patch.object(gpts_routes, "refresh_gpts", lambda: None), \
             patch.dict(
                 gpts_routes.gpts,
                 {"ssglf": self.regulation_config},
                 clear=True,
             ):
            pinned = await gpts_routes.gpts_pined(user)

        self.assertEqual(pinned[0]["gid"], "ssglf")

    def test_gpts_manage_allowed_uses_runtime_permissions(self):
        business_store.upsert_admin_user_permission(
            user_key=self.user["email"],
            permission_code="gpts.manage",
            enabled=True,
            remark="runtime",
        )
        self.assertTrue(gpts_routes.is_gpts_manage_allowed(self.user))

    async def test_gpts_created_requires_manage_permission(self):
        with self.assertRaises(HTTPException) as ctx:
            await gpts_routes.gpts_created(self.user)
        self.assertEqual(ctx.exception.status_code, 403)

        business_store.upsert_admin_user_permission(
            user_key=self.user["email"],
            permission_code="gpts.manage",
            enabled=True,
            remark="runtime",
        )
        business_store.upsert_admin_feature_flag(
            config_key="gpts_feature_enabled",
            config_value=True,
            value_type="boolean",
            description="Enable GPTS",
            updated_by="admin@example.com",
        )
        with patch.object(gpts_routes, "GPTS_WHITE_LIST", set()), patch.object(
            gpts_routes, "refresh_gpts", lambda: None
        ), patch.dict(
            gpts_routes.gpts,
            {"custom-gpt": {"name": "Custom GPT", "owner": self.user["sub"]}},
            clear=True,
        ):
            items = await gpts_routes.gpts_created(self.user)
        self.assertEqual(items[0]["gid"], "custom-gpt")

    async def test_default_visible_models_feature_flag_filters_gptassistant_models(self):
        business_store.upsert_admin_feature_flag(
            config_key="default_visible_models",
            config_value=["glm-4.7"],
            value_type="json",
            description="Visible models",
            updated_by="admin@example.com",
        )
        assistant_config = {
            "default_model": "glm-5",
            "models": [
                {
                    "id": "glm-4.7",
                    "model_name": "glm-4.7",
                    "name": "GLM 4.7",
                },
                {
                    "id": "glm-5",
                    "model_name": "glm-5",
                    "name": "GLM 5",
                },
            ],
        }
        with patch.dict(chat_routes.gpts, {"gptassistant": assistant_config}, clear=False), patch.dict(
            gpts_routes.gpts, {"gptassistant": assistant_config}, clear=False
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ), patch.object(gpts_routes, "refresh_gpts", lambda: None):
            selected = await chat_routes._get_gid_model_config(
                "gptassistant",
                None,
                user_email=self.user["email"],
                user_id=self.user["sub"],
            )
            detail = await gpts_routes.get_gpts_detail("gptassistant", self.user)

        self.assertEqual(selected["id"], "glm-4.7")
        self.assertEqual([item["id"] for item in detail["models"]], ["glm-4.7"])

    async def test_admin_created_model_is_available_to_gptassistant(self):
        business_store.upsert_admin_model_config(
            model_id="new-production-model",
            display_name="New Production Model",
            provider_model_name="provider/new-production-model",
            sort_order=50,
            enabled=True,
            visibility_scope="all",
        )
        business_store.upsert_admin_feature_flag(
            config_key="default_visible_models",
            config_value=["new-production-model"],
            value_type="json",
            description="Visible models",
            updated_by="admin@example.com",
        )
        assistant_config = {
            "default_model": "glm-4.7",
            "models": [
                {
                    "id": "glm-4.7",
                    "model_name": "glm-4.7",
                    "name": "GLM 4.7",
                }
            ],
        }

        with patch.dict(chat_routes.gpts, {"gptassistant": assistant_config}, clear=False), patch.dict(
            gpts_routes.gpts, {"gptassistant": assistant_config}, clear=False
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ), patch(
            "app.routes.gpts_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ), patch.object(gpts_routes, "refresh_gpts", lambda: None):
            selected = await chat_routes._get_gid_model_config(
                "gptassistant",
                "new-production-model",
                user_email=self.user["email"],
                user_id=self.user["sub"],
            )
            detail = await gpts_routes.get_gpts_detail("gptassistant", self.user)

        self.assertEqual(selected["model_name"], "provider/new-production-model")
        self.assertEqual(
            [item["id"] for item in detail["models"]],
            ["new-production-model"],
        )

    async def test_disabled_admin_model_is_removed_from_gptassistant(self):
        business_store.upsert_admin_model_config(
            model_id="glm-4.7",
            display_name="GLM 4.7",
            provider_model_name="glm-4.7",
            enabled=False,
        )

        models = gpts_routes.apply_admin_model_config_overrides(
            "gptassistant",
            [{"id": "glm-4.7", "model_name": "glm-4.7", "name": "GLM 4.7"}],
        )

        self.assertNotIn("glm-4.7", [item["id"] for item in models])

    async def test_default_reasoning_enabled_feature_flag_overrides_gptassistant_default(self):
        business_store.upsert_admin_feature_flag(
            config_key="default_reasoning_enabled",
            config_value=False,
            value_type="boolean",
            description="Disable default reasoning",
            updated_by="admin@example.com",
        )
        assistant_config = {
            "system_prompt": "You are helpful.",
            "default_reasoning": True,
            "models": [
                {
                    "id": "glm-4.7",
                    "model_name": "glm-4.7",
                    "name": "GLM 4.7",
                    "supports_reasoning": True,
                }
            ],
        }

        with patch.dict(chat_routes.gpts, {"gptassistant": assistant_config}, clear=False), patch.dict(
            gpts_routes.gpts, {"gptassistant": assistant_config}, clear=False
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(
                return_value=[
                    {
                        "id": "glm-4.7",
                        "model_name": "glm-4.7",
                        "name": "GLM 4.7",
                        "supports_reasoning": True,
                    }
                ]
            ),
        ):
            detail = await gpts_routes.get_gpts_detail("gptassistant", self.user)
            reasoning_enabled = chat_routes._resolve_default_reasoning(
                assistant_config,
                "gptassistant",
            )

        self.assertFalse(detail["default_reasoning"])
        self.assertFalse(reasoning_enabled)

    async def test_default_model_feature_flag_overrides_gptassistant_default_model(self):
        business_store.upsert_admin_feature_flag(
            config_key="default_model",
            config_value="glm-5",
            value_type="string",
            description="Override default model",
            updated_by="admin@example.com",
        )
        assistant_config = {
            "default_model": "glm-4.7",
            "models": [
                {
                    "id": "glm-4.7",
                    "model_name": "glm-4.7",
                    "name": "GLM 4.7",
                },
                {
                    "id": "glm-5",
                    "model_name": "glm-5",
                    "name": "GLM 5",
                },
            ],
        }

        with patch.dict(chat_routes.gpts, {"gptassistant": assistant_config}, clear=False), patch.dict(
            gpts_routes.gpts, {"gptassistant": assistant_config}, clear=False
        ), patch(
            "app.routes.chat_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.gpts_routes.apply_admin_model_config_overrides",
            side_effect=lambda gid, models, **kwargs: models,
        ), patch(
            "app.routes.chat_routes.resolve_model_configs",
            new=AsyncMock(side_effect=lambda models: models),
        ), patch.object(gpts_routes, "refresh_gpts", lambda: None):
            selected = await chat_routes._get_gid_model_config(
                "gptassistant",
                None,
                user_email=self.user["email"],
                user_id=self.user["sub"],
            )
            detail = await gpts_routes.get_gpts_detail("gptassistant", self.user)

        self.assertEqual(selected["id"], "glm-5")
        self.assertEqual(detail["default_model"], "glm-5")


if __name__ == "__main__":
    unittest.main()
