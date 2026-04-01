from __future__ import annotations

import importlib
import unittest

from app.gptassistant_error_mapping import map_chat_v2_error
from app.llm_kernel import TextContent, UserMessage


class GPTAssistantHardeningTests(unittest.TestCase):
    def test_context_budget_error_maps_to_context_too_long(self):
        mapped = map_chat_v2_error(
            "context budget exceeded: stage=continuation_turn_2 total_chars=150000 budget=120000"
        )

        self.assertEqual(mapped.code, "CONTEXT_TOO_LONG")

    def test_chat_kernel_service_imports_and_enforces_context_budget(self):
        chat_kernel_service = importlib.import_module("app.chat_kernel_service")

        with self.assertRaises(chat_kernel_service.ChatContextTooLongError):
            chat_kernel_service._raise_if_context_too_long(
                model_id="fake-model",
                model_config={"context_char_budget": 10},
                system_prompt="system",
                messages=[UserMessage(content=[TextContent(text="0123456789")], timestamp=1)],
                stage="continuation_turn_1",
            )


if __name__ == "__main__":
    unittest.main()
