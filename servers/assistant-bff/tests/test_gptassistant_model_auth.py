from __future__ import annotations

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
                "app.routes.chat_routes.resolve_gptassistant_model_configs",
                new=AsyncMock(side_effect=lambda models: models),
            ):
                with self.assertRaises(HTTPException) as ctx:
                    await chat_routes._get_gptassistant_model_config(
                        "glm-5",
                        user_email="blocked@example.com",
                        user_id="blocked-user",
                    )

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_model_selection_falls_back_to_visible_default(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with patch(
                "app.routes.chat_routes.resolve_gptassistant_model_configs",
                new=AsyncMock(side_effect=lambda models: models),
            ):
                selected = await chat_routes._get_gptassistant_model_config(
                    None,
                    user_email="blocked@example.com",
                    user_id="blocked-user",
                )

        self.assertEqual(selected["id"], "glm-4.7")

    async def test_model_selection_allows_whitelisted_user(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with patch(
                "app.routes.chat_routes.resolve_gptassistant_model_configs",
                new=AsyncMock(side_effect=lambda models: models),
            ):
                selected = await chat_routes._get_gptassistant_model_config(
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
                "app.routes.chat_routes.resolve_gptassistant_model_configs",
                new=AsyncMock(return_value=remote_models),
            ):
                selected = await chat_routes._get_gptassistant_model_config(
                    "glm-4.7",
                    user_email="blocked@example.com",
                    user_id="blocked-user",
                )

        self.assertFalse(selected["supports_reasoning"])
        self.assertTrue(selected["supports_native_image_input"])
        self.assertEqual(selected["compat"]["reasoning_parameter_format"], "qwen")


if __name__ == "__main__":
    unittest.main()
