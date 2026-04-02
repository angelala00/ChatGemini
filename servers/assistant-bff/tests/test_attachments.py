from __future__ import annotations

import unittest
from unittest.mock import patch

from app.attachments.service import (
    AttachmentSelection,
    build_attachment_tool_guidance,
    build_user_message_from_attachments,
)
from app.attachments.tools import (
    DEFAULT_ATTACHMENT_TOOL_MAX_CHARS,
    execute_attachment_tool,
    get_attachment_tool_definitions,
)


class AttachmentToolTests(unittest.TestCase):
    def test_non_native_image_models_do_not_expose_load_images_tool(self):
        tools = get_attachment_tool_definitions(model_supports_native_images=False)
        self.assertEqual(
            [tool.name for tool in tools],
            [
                "document_list",
                "document_read_text",
                "resource_list",
                "resource_read_text",
                "attachment_list",
                "attachment_extract_text",
            ],
        )

    def test_native_image_models_keep_load_images_tool(self):
        tools = get_attachment_tool_definitions(model_supports_native_images=True)
        self.assertEqual(
            [tool.name for tool in tools],
            [
                "document_list",
                "document_read_text",
                "document_load_images",
                "resource_list",
                "resource_read_text",
                "resource_load_images",
                "attachment_list",
                "attachment_extract_text",
                "attachment_load_images",
            ],
        )

    @patch("app.attachments.service.resolve_attachment_selection")
    def test_non_native_image_guidance_prefers_extract_text(self, resolve_attachment_selection_mock):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids="file-1",
            document_file_ids=None,
            image_paths=["/tmp/file-1"],
            document_paths=[],
        )

        guidance = build_attachment_tool_guidance(
            file_ids="file-1",
            model_supports_native_images=False,
        )

        self.assertIn("prefer document_read_text", guidance)
        self.assertIn("attachment_extract_text", guidance)
        self.assertNotIn("document_load_images", guidance)

    @patch("app.attachments.service.resolve_attachment_selection")
    def test_native_image_guidance_mentions_load_images(self, resolve_attachment_selection_mock):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids="file-1",
            document_file_ids=None,
            image_paths=["/tmp/file-1"],
            document_paths=[],
        )

        guidance = build_attachment_tool_guidance(
            file_ids="file-1",
            model_supports_native_images=True,
        )

        self.assertIn("document_load_images", guidance)
        self.assertIn("resource_load_images", guidance)
        self.assertIn("attachment_load_images", guidance)

    @patch("app.attachments.tools._execute_attachment_list")
    def test_legacy_attachment_alias_executes_same_handler(self, execute_attachment_list_mock):
        execute_attachment_list_mock.return_value = object()

        self.assertIsNotNone(
            self._run_async(
                execute_attachment_tool(
                    "attachment_list",
                    {},
                    available_file_ids=["file-1"],
                )
            )
        )
        execute_attachment_list_mock.assert_called_once_with(["file-1"])

    @patch("app.attachments.tools.describe_file_mapping_entry")
    @patch("app.attachments.tools.load_file_mapping")
    def test_document_list_uses_richer_file_metadata(self, load_file_mapping_mock, describe_file_mapping_entry_mock):
        load_file_mapping_mock.return_value = {"file-1": {"filename": "demo.pdf"}}
        describe_file_mapping_entry_mock.return_value = {
            "file_id": "file-1",
            "found": True,
            "filename": "demo.pdf",
            "kind": "document",
            "size_bytes": 1234,
        }

        result = self._run_async(
            execute_attachment_tool(
                "document_list",
                {},
                available_file_ids=["file-1"],
            )
        )

        self.assertEqual(result.details["items"][0]["kind"], "document")
        self.assertEqual(result.details["items"][0]["size_bytes"], 1234)

    @patch("app.attachments.tools.extract_text_from_file_ids")
    @patch("app.attachments.tools.resolve_attachment_selection")
    def test_document_read_text_forwards_max_chars(
        self,
        resolve_attachment_selection_mock,
        extract_text_from_file_ids_mock,
    ):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids=None,
            document_file_ids="file-1",
            image_paths=[],
            document_paths=["/tmp/demo.pdf"],
        )
        extract_text_from_file_ids_mock.return_value = "hello\n\n[已截断]"

        result = self._run_async(
            execute_attachment_tool(
                "document_read_text",
                {"max_chars": 500},
                available_file_ids=["file-1"],
            )
        )

        extract_text_from_file_ids_mock.assert_called_once_with(
            "file-1",
            max_chars=500,
            page=None,
            page_from=None,
            page_to=None,
            sheet_name=None,
            sheet_index=None,
        )
        self.assertEqual(result.details["max_chars"], 500)
        self.assertEqual(result.details["truncated"], True)

    @patch("app.attachments.tools.extract_text_from_file_ids")
    @patch("app.attachments.tools.resolve_attachment_selection")
    def test_document_read_text_forwards_page_and_sheet_options(
        self,
        resolve_attachment_selection_mock,
        extract_text_from_file_ids_mock,
    ):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids=None,
            document_file_ids="file-1",
            image_paths=[],
            document_paths=["/tmp/demo.xlsx"],
        )
        extract_text_from_file_ids_mock.return_value = "sheet/page selection"

        result = self._run_async(
            execute_attachment_tool(
                "document_read_text",
                {
                    "page_from": 2,
                    "page_to": 4,
                    "sheet_name": "Summary",
                },
                available_file_ids=["file-1"],
            )
        )

        extract_text_from_file_ids_mock.assert_called_once_with(
            "file-1",
            max_chars=DEFAULT_ATTACHMENT_TOOL_MAX_CHARS,
            page=None,
            page_from=2,
            page_to=4,
            sheet_name="Summary",
            sheet_index=None,
        )
        self.assertEqual(result.details["page_from"], 2)
        self.assertEqual(result.details["page_to"], 4)
        self.assertEqual(result.details["sheet_name"], "Summary")

    @patch("app.attachments.tools.extract_text_from_file_ids")
    @patch("app.attachments.tools.resolve_attachment_selection")
    def test_document_read_text_uses_default_max_chars_when_omitted(
        self,
        resolve_attachment_selection_mock,
        extract_text_from_file_ids_mock,
    ):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids=None,
            document_file_ids="file-1",
            image_paths=[],
            document_paths=["/tmp/demo.txt"],
        )
        extract_text_from_file_ids_mock.return_value = "hello"

        result = self._run_async(
            execute_attachment_tool(
                "document_read_text",
                {},
                available_file_ids=["file-1"],
            )
        )

        extract_text_from_file_ids_mock.assert_called_once_with(
            "file-1",
            max_chars=DEFAULT_ATTACHMENT_TOOL_MAX_CHARS,
            page=None,
            page_from=None,
            page_to=None,
            sheet_name=None,
            sheet_index=None,
        )
        self.assertEqual(result.details["max_chars"], DEFAULT_ATTACHMENT_TOOL_MAX_CHARS)

    @patch("app.attachments.tools.resolve_attachment_selection")
    def test_document_read_text_rejects_conflicting_page_options(self, resolve_attachment_selection_mock):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids=None,
            document_file_ids="file-1",
            image_paths=[],
            document_paths=["/tmp/demo.pdf"],
        )
        with self.assertRaisesRegex(ValueError, "either page or page_from/page_to"):
            self._run_async(
                execute_attachment_tool(
                    "document_read_text",
                    {"page": 1, "page_from": 2},
                    available_file_ids=["file-1"],
                )
            )

    @patch("app.attachments.tools.resolve_attachment_selection")
    def test_document_read_text_rejects_conflicting_sheet_options(self, resolve_attachment_selection_mock):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids=None,
            document_file_ids="file-1",
            image_paths=[],
            document_paths=["/tmp/demo.xlsx"],
        )
        with self.assertRaisesRegex(ValueError, "either sheet_name or sheet_index"):
            self._run_async(
                execute_attachment_tool(
                    "document_read_text",
                    {"sheet_name": "A", "sheet_index": 0},
                    available_file_ids=["file-1"],
                )
            )

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


class AttachmentPreprocessTests(unittest.TestCase):
    @patch("app.attachments.service.load_file_mapping")
    @patch("app.attachments.service.resolve_attachment_selection")
    def test_tool_first_injects_manifest_for_document_requests(
        self,
        resolve_attachment_selection_mock,
        load_file_mapping_mock,
    ):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids=None,
            document_file_ids="file-1",
            image_paths=[],
            document_paths=["/tmp/demo.pdf"],
        )
        load_file_mapping_mock.return_value = {
            "file-1": {"filename": "demo.pdf"},
        }

        message = self._run_async(
            build_user_message_from_attachments(
                query="附件内容是啥",
                file_ids="file-1",
                model_id="glm-4.7",
                model_supports_native_images=False,
            )
        )

        self.assertIsInstance(message.content, str)
        self.assertIn("[附件清单]", message.content)
        self.assertIn("document_read_text", message.content)
        self.assertIn("demo.pdf", message.content)

    @patch("app.attachments.service._encode_image_content")
    @patch("app.attachments.service.load_file_mapping")
    @patch("app.attachments.service.resolve_attachment_selection")
    def test_tool_first_attaches_native_images_without_preprocess(
        self,
        resolve_attachment_selection_mock,
        load_file_mapping_mock,
        encode_image_content_mock,
    ):
        resolve_attachment_selection_mock.return_value = AttachmentSelection(
            image_file_ids="file-1",
            document_file_ids=None,
            image_paths=["/tmp/demo.png"],
            document_paths=[],
        )
        load_file_mapping_mock.return_value = {
            "file-1": {"filename": "demo.png"},
        }
        encode_image_content_mock.return_value = object()

        message = self._run_async(
            build_user_message_from_attachments(
                query="图片内容是啥",
                file_ids="file-1",
                model_id="glm-4.7",
                model_supports_native_images=True,
            )
        )

        self.assertIsInstance(message.content, list)
        self.assertEqual(len(message.content), 2)
        self.assertIn("[附件清单]", message.content[0].text)
        self.assertIn("document_load_images", message.content[0].text)
        encode_image_content_mock.assert_called_once_with("/tmp/demo.png")

    def _run_async(self, coroutine):
        import asyncio

        return asyncio.run(coroutine)


if __name__ == "__main__":
    unittest.main()
