from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import chat_routes, gpts_routes


class GPTAssistantModelAuthTests(unittest.TestCase):
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

    def test_model_selection_rejects_unauthorized_requested_model(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            with self.assertRaises(HTTPException) as ctx:
                chat_routes._get_gptassistant_model_config(
                    "glm-5",
                    user_email="blocked@example.com",
                    user_id="blocked-user",
                )

        self.assertEqual(ctx.exception.status_code, 403)

    def test_model_selection_falls_back_to_visible_default(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            selected = chat_routes._get_gptassistant_model_config(
                None,
                user_email="blocked@example.com",
                user_id="blocked-user",
            )

        self.assertEqual(selected["id"], "glm-4.7")

    def test_model_selection_allows_whitelisted_user(self):
        with patch.dict(chat_routes.gpts, {"gptassistant": self.assistant_config}, clear=False):
            selected = chat_routes._get_gptassistant_model_config(
                "glm-5",
                user_email="allowed@example.com",
                user_id="allowed-user",
            )

        self.assertEqual(selected["id"], "glm-5")


if __name__ == "__main__":
    unittest.main()
