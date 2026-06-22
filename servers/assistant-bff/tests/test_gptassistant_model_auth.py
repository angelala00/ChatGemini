from __future__ import annotations

import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.admin import access_control
from app import chat_kernel_regulation_service
from app.routes import chat_routes, gpts_routes
from app.storage import business_store
from app.storage import object_store


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

    def test_regulation_assistant_detection_uses_handler_key(self):
        self.assertTrue(
            chat_routes._is_regulation_assistant(
                "custom-gpt",
                {"handler_key": "kernel_regulation"},
            )
        )
        self.assertFalse(
            chat_routes._is_regulation_assistant(
                "regulationassistant",
                {},
            )
        )

    def test_chat_function_resolves_from_handler_key(self):
        self.assertIs(
            chat_routes._resolve_chat_function({"handler_key": "kernel_regulation"}),
            chat_kernel_regulation_service.chat_with_kernel_regulation,
        )

    def test_explicit_chat_function_takes_priority_over_handler_key(self):
        def custom_chat_function():
            return None

        self.assertIs(
            chat_routes._resolve_chat_function(
                {
                    "handler_key": "kernel_regulation",
                    "chat_function": custom_chat_function,
                }
            ),
            custom_chat_function,
        )

    def test_regulation_gpt_manage_is_limited_to_white_list(self):
        with patch.object(gpts_routes.model_config, "GPTS_WHITE_LIST", {"allowed@example.com"}):
            self.assertTrue(
                gpts_routes.can_manage_regulation_gpt(
                    {"email": "allowed@example.com", "sub": "allowed-user"},
                )
            )
            self.assertFalse(
                gpts_routes.can_manage_regulation_gpt(
                    {"email": "blocked@example.com", "sub": "blocked-user"},
                )
            )

    def test_whitelisted_user_can_own_regulation_gpt(self):
        with (
            patch.object(gpts_routes.model_config, "GPTS_WHITE_LIST", {"allowed@example.com"}),
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.dict(
                gpts_routes.gpts,
                {
                    "regulationassistant": {
                        "gid": "regulationassistant",
                        "name": "制度问答助手",
                        "handler_key": "kernel_regulation",
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            gpt = gpts_routes.ensure_owned_custom_gpt(
                "regulationassistant",
                {"email": "allowed@example.com", "sub": "allowed-user"},
            )

        self.assertEqual(gpt["gid"], "regulationassistant")

    async def test_whitelisted_user_sees_regulation_gpt_in_created_list(self):
        with (
            patch.object(gpts_routes.model_config, "GPTS_WHITE_LIST", {"allowed@example.com"}),
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.dict(
                gpts_routes.gpts,
                {
                    "regulationassistant": {
                        "gid": "regulationassistant",
                        "name": "制度问答助手",
                        "handler_key": "kernel_regulation",
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            items = await gpts_routes.gpts_created(
                {"email": "allowed@example.com", "sub": "allowed-user"}
            )

        gids = [item["gid"] for item in items]
        self.assertIn("regulationassistant", gids)
        regulation_item = next(item for item in items if item["gid"] == "regulationassistant")
        self.assertTrue(regulation_item["can_edit"])
        self.assertFalse(regulation_item["can_delete"])
        self.assertEqual(regulation_item["owner"], "allowed@example.com")

    async def test_owner_can_transfer_custom_gpt_ownership(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "Custom GPT",
                    "desc": "desc",
                    "system_prompt": "prompt",
                    "owner": "new-owner@example.com",
                    "admins": ["new-admin@example.com", "new-owner@example.com"],
                    "viewers": ["viewer@example.com", "new-owner@example.com"],
                    "samples": ["sample"],
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
                        "admins": ["admin@example.com"],
                        "viewers": ["viewer@example.com"],
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            result = await gpts_routes.update_gpt(
                "custom-gpt",
                request,
                {"email": "owner@example.com", "sub": "owner@example.com"},
            )

        self.assertEqual(result, {"gid": "custom-gpt"})
        self.assertEqual(captured["gid"], "custom-gpt")
        config = captured["config"]
        self.assertIsInstance(config, dict)
        self.assertEqual(config["owner"], "new-owner@example.com")
        self.assertEqual(config["admins"], ["new-admin@example.com"])
        self.assertEqual(config["viewers"], ["viewer@example.com"])
        self.assertEqual(config["samples"], ["sample"])

    async def test_updating_regulation_model_preserves_system_execution_config(self):
        request = SimpleNamespace(
            json=AsyncMock(
                return_value={
                    "name": "制度问答助手",
                    "desc": "updated",
                    "system_prompt": "updated prompt",
                    "default_model": "glm-4.7",
                    "auth": {"type": "all"},
                    "admins": ["admin@example.com"],
                    "viewers": [],
                }
            )
        )
        captured: dict[str, object] = {}

        def fake_update_custom_gpt(gid: str, config: dict[str, object]) -> None:
            captured["gid"] = gid
            captured["config"] = config

        existing = {
            "gid": "regulationassistant",
            "assistant_kind": "system",
            "handler_key": "kernel_regulation",
            "required_pinned": True,
            "name": "制度问答助手",
            "system_prompt": "old prompt",
            "default_model": "glm-4.7",
            "models": [{"id": "glm-4.7", "name": "GLM 4.7"}],
            "visible_model_ids": ["glm-4.7"],
            "owner": "owner@example.com",
            "admins": ["admin@example.com"],
            "viewers": [],
            "auth": {"type": "all"},
        }

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.object(gpts_routes, "update_custom_gpt", side_effect=fake_update_custom_gpt),
            patch.dict(gpts_routes.gpts, {"regulationassistant": existing}, clear=False),
        ):
            result = await gpts_routes.update_gpt(
                "regulationassistant",
                request,
                {"email": "admin@example.com", "sub": "admin@example.com"},
            )

        self.assertEqual(result, {"gid": "regulationassistant"})
        config = captured["config"]
        self.assertIsInstance(config, dict)
        self.assertEqual(config["default_model"], "glm-4.7")
        self.assertEqual(config["assistant_kind"], "system")
        self.assertEqual(config["handler_key"], "kernel_regulation")
        self.assertTrue(config["required_pinned"])
        self.assertIn("glm-4.7", [item["id"] for item in config["models"]])

    async def test_non_owner_cannot_transfer_custom_gpt_ownership(self):
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
                    {"email": "admin@example.com", "sub": "admin@example.com"},
                )

        self.assertEqual(ctx.exception.status_code, 401)

    async def test_system_admin_can_delete_custom_gpt(self):
        deleted: dict[str, object] = {}

        def fake_delete_custom_gpt(gid: str) -> None:
            deleted["gid"] = gid

        with (
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "is_gpts_manage_allowed", return_value=True),
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
                        "admins": ["admin@example.com"],
                        "viewers": ["viewer@example.com"],
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            result = await gpts_routes.delete_gpt(
                "custom-gpt",
                {"email": "admin@example.com", "sub": "admin@example.com"},
            )

        self.assertEqual(result, {"gid": "custom-gpt"})
        self.assertEqual(deleted["gid"], "custom-gpt")

    async def test_collaborator_admin_cannot_delete_custom_gpt(self):
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
                        "admins": ["admin@example.com"],
                        "viewers": ["viewer@example.com"],
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await gpts_routes.delete_gpt(
                    "custom-gpt",
                    {"email": "admin@example.com", "sub": "admin@example.com"},
                )

        self.assertEqual(ctx.exception.status_code, 401)

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

    async def test_regulation_knowledge_files_seed_and_read_from_db_mapping(self):
        temp_dir = tempfile.TemporaryDirectory()
        db_path = os.path.join(temp_dir.name, "business-dev.db")
        source_dir = os.path.join(temp_dir.name, "regulationassistant")
        os.makedirs(source_dir, exist_ok=True)
        source_file = os.path.join(source_dir, "policy.txt")
        with open(source_file, "w", encoding="utf-8") as handle:
            handle.write("制度正文内容")
        catalog_file = os.path.join(source_dir, "document_catalog.json")
        with open(catalog_file, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "source": "manual_seed",
                    "files": [
                        {
                            "file_name": "stale-policy.pdf",
                            "description": "已经不存在的旧制度文件",
                        }
                    ],
                },
                handle,
                ensure_ascii=False,
            )

        backend_patcher = patch.object(business_store.model_config, "BUSINESS_STORAGE_BACKEND", "sqlite")
        file_base_patcher = patch.object(business_store.model_config, "FILE_BASE", temp_dir.name)
        business_data_dir_patcher = patch.object(business_store, "DATA_DIR", temp_dir.name)
        business_db_path_patcher = patch.object(business_store, "DEV_DB_PATH", db_path)
        object_backend_patcher = patch.object(object_store, "OBJECT_BACKEND", "filesystem")
        object_upload_root_patcher = patch.object(object_store, "LOCAL_UPLOAD_ROOT", object_store.Path(temp_dir.name) / "gptassistant" / "uploads")
        object_cache_root_patcher = patch.object(object_store, "LOCAL_CACHE_ROOT", object_store.Path(temp_dir.name) / "gptassistant" / "cache")

        for patcher in (
            backend_patcher,
            file_base_patcher,
            business_data_dir_patcher,
            business_db_path_patcher,
            object_backend_patcher,
            object_upload_root_patcher,
            object_cache_root_patcher,
        ):
            patcher.start()
        try:
            business_store._INITIALIZED = False
            business_store.init_business_storage()

            mappings = business_store.list_file_mappings("regulationassistant")
            file_mapping = mappings["regulationassistant:policy.txt"]
            self.assertEqual(file_mapping["purpose"], "assistant_knowledge")
            self.assertEqual(file_mapping["storageBackend"], "filesystem")
            self.assertIn("/gptassistant/uploads/", file_mapping["objectKey"])
            self.assertNotIn("/regulationassistant/", file_mapping["objectKey"])

            catalog = chat_kernel_regulation_service._read_document_catalog()
            self.assertIn("policy.txt", catalog)
            self.assertNotIn("stale-policy.pdf", catalog)

            text, details = await chat_kernel_regulation_service._execute_regulation_tool(
                chat_kernel_regulation_service.FETCH_DOCUMENT_CONTENT_TOOL,
                {"file_names": ["policy.txt"], "max_chars": 1000},
            )

            self.assertIn("制度正文内容", text)
            self.assertEqual(details["resolved_files"], ["policy.txt"])
        finally:
            for patcher in (
                object_cache_root_patcher,
                object_upload_root_patcher,
                object_backend_patcher,
                business_db_path_patcher,
                business_data_dir_patcher,
                file_base_patcher,
                backend_patcher,
            ):
                patcher.stop()
            temp_dir.cleanup()

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
            side_effect=lambda gid, models, assistant_config=None: models,
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
            side_effect=lambda gid, models, assistant_config=None: models,
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
            side_effect=lambda gid, models, assistant_config=None: models,
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
            side_effect=lambda gid, models, assistant_config=None: models,
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
            side_effect=lambda gid, models, assistant_config=None: models,
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
            side_effect=lambda gid, models, assistant_config=None: models,
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
            side_effect=lambda gid, models, assistant_config=None: models,
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
                side_effect=lambda gid, models, assistant_config=None: models,
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

        self.assertIsInstance(pinned, list)

    def test_runtime_history_key_uses_handler_key_for_regulation_assistant(self):
        with patch.dict(
            chat_routes.gpts,
            {
                "demo-regulation": {
                    "name": "制度问答助手",
                    "handler_key": "kernel_regulation",
                }
            },
            clear=False,
        ):
            key = chat_routes._runtime_history_key("cid-1", "demo-regulation")

        self.assertEqual(
            key,
            f"{chat_routes.REGULATION_KERNEL_HISTORY_PREFIX}cid-1",
        )

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

    async def test_visible_model_ids_filter_gptassistant_models(self):
        assistant_config = {
            "default_model": "glm-5",
            "visible_model_ids": ["glm-4.7"],
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
        assistant_config = {
            "default_model": "glm-4.7",
            "visible_model_ids": ["new-production-model"],
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

    def test_admin_model_configs_are_authoritative_for_gptassistant(self):
        with patch.object(
            gpts_routes,
            "list_admin_model_configs",
            return_value=[
                {
                    "model_id": "admin-model",
                    "display_name": "Admin Model",
                    "provider_model_name": "provider/admin-model",
                    "sort_order": 10,
                    "enabled": True,
                    "visibility_scope": "all",
                }
            ],
        ):
            models = gpts_routes.apply_admin_model_config_overrides(
                "gptassistant",
                [{"id": "builtin-model", "model_name": "builtin-model", "name": "Builtin Model"}],
            )

        self.assertEqual([item["id"] for item in models], ["admin-model"])

    def test_configured_visible_models_do_not_fall_back_to_full_model_list(self):
        models = gpts_routes.apply_runtime_model_visibility(
            "gptassistant",
            [{"id": "admin-model", "name": "Admin Model"}],
            {"visible_model_ids": ["missing-model"]},
        )

        self.assertEqual(models, [])

    def test_reasoning_resolution_falls_back_to_model_default(self):
        reasoning_enabled = chat_routes._resolve_reasoning_enabled(
            None,
            {"system_prompt": "You are helpful."},
            {
                "id": "qwen-3.6",
                "model_name": "qwen-3.6",
                "supports_reasoning": True,
                "reasoning_default_enabled": False,
            },
            "custom-gpt",
        )

        self.assertFalse(reasoning_enabled)

    def test_reasoning_resolution_prefers_assistant_default_over_model_default(self):
        reasoning_enabled = chat_routes._resolve_reasoning_enabled(
            None,
            {
                "system_prompt": "You are helpful.",
                "default_reasoning": False,
            },
            {
                "id": "qwen-3.6",
                "model_name": "qwen-3.6",
                "supports_reasoning": True,
                "reasoning_default_enabled": True,
            },
            "custom-gpt",
        )

        self.assertFalse(reasoning_enabled)

    def test_reasoning_resolution_is_blocked_by_model_or_assistant_support(self):
        blocked_by_model = chat_routes._resolve_reasoning_enabled(
            True,
            {"system_prompt": "You are helpful."},
            {
                "id": "plain-model",
                "model_name": "plain-model",
                "supports_reasoning": False,
                "reasoning_default_enabled": True,
            },
            "custom-gpt",
        )
        blocked_by_assistant = chat_routes._resolve_reasoning_enabled(
            True,
            {
                "system_prompt": "You are helpful.",
                "supports_reasoning": False,
            },
            {
                "id": "qwen-3.6",
                "model_name": "qwen-3.6",
                "supports_reasoning": True,
                "reasoning_default_enabled": True,
            },
            "custom-gpt",
        )

        self.assertFalse(blocked_by_model)
        self.assertFalse(blocked_by_assistant)

    async def test_gptassistant_default_reasoning_comes_from_gpt_config(self):
        assistant_config = {
            "system_prompt": "You are helpful.",
            "default_reasoning": False,
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
        ), patch.object(gpts_routes, "refresh_gpts", lambda: None):
            detail = await gpts_routes.get_gpts_detail("gptassistant", self.user)
            reasoning_enabled = chat_routes._resolve_default_reasoning(
                assistant_config,
                "gptassistant",
            )

        self.assertFalse(detail["default_reasoning"])
        self.assertFalse(reasoning_enabled)

    async def test_gptassistant_default_model_comes_from_gpt_config(self):
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

    async def test_gptassistant_appears_in_created_list_for_whitelist_manager(self):
        with (
            patch.object(gpts_routes.model_config, "GPTS_WHITE_LIST", {"allowed@example.com"}),
            patch.object(gpts_routes, "ensure_gpts_manage_allowed", lambda user: None),
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="local"),
            patch.dict(
                gpts_routes.gpts,
                {
                    "gptassistant": {
                        "gid": "gptassistant",
                        "name": "AI助手",
                        "assistant_kind": "system",
                        "handler_key": "kernel_gptassistant",
                        "auth": {"type": "all"},
                    }
                },
                clear=False,
            ),
        ):
            items = await gpts_routes.gpts_created(
                {"email": "allowed@example.com", "sub": "allowed-user"}
            )

        gids = [item["gid"] for item in items]
        self.assertIn("gptassistant", gids)
        gpt_item = next(item for item in items if item["gid"] == "gptassistant")
        self.assertTrue(gpt_item["can_edit"])
        self.assertFalse(gpt_item["can_delete"])
        self.assertEqual(gpt_item["owner"], "allowed@example.com")


if __name__ == "__main__":
    unittest.main()
