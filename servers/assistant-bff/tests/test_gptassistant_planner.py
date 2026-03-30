from __future__ import annotations

import unittest

from app.gptassistant_planner import (
    PlannerRuntimeCapabilities,
    build_execution_plan,
    classify_user_intent,
)


class GPTAssistantPlannerTests(unittest.TestCase):
    def test_classifies_metadata_queries(self):
        self.assertEqual(classify_user_intent("我上传了几个文件"), "metadata")
        self.assertEqual(classify_user_intent("有哪些附件"), "metadata")

    def test_metadata_queries_use_manifest_only(self):
        plan = build_execution_plan(
            query="我上传了几个文件",
            has_attachments=True,
            runtime_capabilities=PlannerRuntimeCapabilities(supports_tool_result_continuation=True),
        )

        self.assertEqual(plan.intent, "metadata")
        self.assertFalse(plan.expose_attachment_tools)
        self.assertEqual(plan.document_strategy, "manifest_only")
        self.assertEqual(plan.non_native_image_strategy, "manifest_only")
        self.assertFalse(plan.attach_native_images)

    def test_content_queries_use_tools_when_model_supports_them(self):
        plan = build_execution_plan(
            query="附件内容是啥",
            has_attachments=True,
            runtime_capabilities=PlannerRuntimeCapabilities(supports_tool_result_continuation=True),
        )

        self.assertTrue(plan.expose_attachment_tools)
        self.assertEqual(plan.document_strategy, "tool_only")
        self.assertEqual(plan.non_native_image_strategy, "tool_only")

    def test_content_queries_fallback_to_preload_when_runtime_disables_tool_continuation(self):
        plan = build_execution_plan(
            query="附件内容是啥",
            has_attachments=True,
            runtime_capabilities=PlannerRuntimeCapabilities(supports_tool_result_continuation=False),
        )

        self.assertFalse(plan.expose_attachment_tools)
        self.assertEqual(plan.document_strategy, "preload_text")
        self.assertEqual(plan.non_native_image_strategy, "preprocess_text")


if __name__ == "__main__":
    unittest.main()
