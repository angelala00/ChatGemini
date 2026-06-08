from __future__ import annotations

import asyncio
import importlib
import json
import unittest
from unittest.mock import patch

from app.gptassistant_error_mapping import map_chat_v2_error
from app.llm_kernel import TextContent, UserMessage


class GPTAssistantHardeningTests(unittest.TestCase):
    def test_context_budget_error_maps_to_context_too_long(self):
        mapped = map_chat_v2_error(
            "context budget exceeded: stage=continuation_turn_2 total_chars=150000 budget=120000"
        )

        self.assertEqual(mapped.code, "CONTEXT_TOO_LONG")

    def test_attachment_tool_capability_error_has_specific_message(self):
        mapped = map_chat_v2_error("attachment tools unsupported by selected model")

        self.assertEqual(mapped.code, "ATTACHMENT_TOOLS_UNSUPPORTED")
        self.assertIn("不支持读取附件", mapped.user_message)

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

    def test_kernel_rejects_attachments_before_model_request_when_tools_unsupported(self):
        chat_kernel_service = importlib.import_module("app.chat_kernel_service")

        async def collect_chunks():
            return [
                chunk
                async for chunk in chat_kernel_service.chat_with_kernel_gptassistant(
                    "summarize the attachment",
                    "cid-1",
                    "system",
                    {
                        "id": "no-tools-model",
                        "model_name": "no-tools-model",
                        "supports_tool_calling": False,
                    },
                    file_ids="file-1",
                )
            ]

        with (
            patch.object(chat_kernel_service, "_ensure_openai_compat_provider"),
            patch.object(chat_kernel_service, "_load_history", return_value=[]),
            patch.object(chat_kernel_service, "stream") as stream_mock,
            patch.object(
                chat_kernel_service,
                "_build_user_message_with_preprocess_events",
            ) as preprocess_mock,
        ):
            chunks = asyncio.run(collect_chunks())

        events = [json.loads(chunk.removeprefix("data: ").strip()) for chunk in chunks]
        self.assertEqual([event["event"] for event in events], ["response_start", "error"])
        self.assertEqual(events[-1]["error_code"], "ATTACHMENT_TOOLS_UNSUPPORTED")
        stream_mock.assert_not_called()
        preprocess_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
