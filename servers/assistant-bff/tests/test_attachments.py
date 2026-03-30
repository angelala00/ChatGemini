from __future__ import annotations

import unittest
from unittest.mock import patch

from app.attachments.service import (
    AttachmentSelection,
    build_attachment_tool_guidance,
)
from app.attachments.tools import get_attachment_tool_definitions


class AttachmentToolTests(unittest.TestCase):
    def test_non_native_image_models_do_not_expose_load_images_tool(self):
        tools = get_attachment_tool_definitions(model_supports_native_images=False)
        self.assertEqual([tool.name for tool in tools], ["attachment_list", "attachment_extract_text"])

    def test_native_image_models_keep_load_images_tool(self):
        tools = get_attachment_tool_definitions(model_supports_native_images=True)
        self.assertEqual(
            [tool.name for tool in tools],
            ["attachment_list", "attachment_extract_text", "attachment_load_images"],
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

        self.assertIn("prefer attachment_extract_text", guidance)
        self.assertNotIn("attachment_load_images", guidance)

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

        self.assertIn("attachment_load_images", guidance)


if __name__ == "__main__":
    unittest.main()
