from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from app.routes import chat_routes, gpts_routes


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

    def test_filter_models_for_user_hides_restricted_model(self):
        visible_models = gpts_routes.sanitize_models_for_detail(
            self.assistant_config["models"],
            "blocked@example.com",
            "blocked-user",
        )

        self.assertEqual([item["id"] for item in visible_models], ["glm-4.7"])
        self.assertNotIn("auth", visible_models[0])

    async def test_model_selection_rejects_unauthorized_requested_model(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with patch(
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
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with patch(
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

    async def test_model_selection_allows_whitelisted_user(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with patch(
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
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with patch(
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


class GPTSPinnedAccessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "pins.db")
        self.get_db_patcher = patch.object(gpts_routes, "get_db", self.get_db)
        self.get_db_patcher.start()
        gpts_routes.init_db()
        self.user = {
            "email": "blocked@example.com",
            "sub": "blocked-user",
        }
        self.regulation_config = {
            "name": "制度问答助手",
            "auth": {"type": "all"},
        }

    def tearDown(self) -> None:
        self.get_db_patcher.stop()
        self.temp_dir.cleanup()

    def get_db(self, *, check_same_thread=True, isolation_level=None):
        conn = sqlite3.connect(
            self.db_path,
            check_same_thread=check_same_thread,
            isolation_level=isolation_level,
        )
        conn.row_factory = sqlite3.Row
        return conn

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
        conn = self.get_db()
        try:
            conn.execute(
                """INSERT INTO user_gpts_state(user_id, gpts_id, pinned_at)
                   VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
                (self.user["sub"], "custom-gpt"),
            )
        finally:
            conn.close()

        with patch.object(gpts_routes, "GPTS_WHITE_LIST", {"allowed@example.com"}):
            self.assertTrue(gpts_routes.can_access_gpt(self.user, "custom-gpt"))
            self.assertFalse(gpts_routes.can_access_gpt(self.user, "not-pinned"))


if __name__ == "__main__":
    unittest.main()
