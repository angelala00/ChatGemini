from __future__ import annotations

import unittest

from app.agent_runtime_v3 import (
    CapabilityDescriptor,
    CapabilityRegistry,
    ContextAssembler,
    ContextAssemblyRequest,
    ResourceContext,
    ToolExecutionOutput,
)
from app.llm_kernel import Model, ToolDefinition, UserMessage


def build_registry() -> CapabilityRegistry:
    registry = CapabilityRegistry()

    async def handler(context, arguments):
        return ToolExecutionOutput()

    for capability_id, tool_name in (
        ("attachment.document_list", "document_list"),
        ("attachment.document_read_text", "document_read_text"),
    ):
        registry.register_tool(
            CapabilityDescriptor(
                id=capability_id,
                type="tool",
                name=tool_name,
                description=tool_name,
            ),
            ToolDefinition(
                name=tool_name,
                description=tool_name,
                parameters={"type": "object", "properties": {}},
            ),
            handler,
        )
    return registry


def build_request(**overrides) -> ContextAssemblyRequest:
    values = {
        "platform_instructions": "Follow platform policy.",
        "agent_instructions": "You are a document assistant.",
        "history": [UserMessage(content="earlier")],
        "user_message": UserMessage(content="current"),
        "capability_ids": ["attachment.document_read_text"],
    }
    values.update(overrides)
    return ContextAssemblyRequest(**values)


class ContextAssemblerTests(unittest.TestCase):
    def setUp(self):
        self.assembler = ContextAssembler(build_registry())

    def test_assembles_prompt_sections_in_instruction_priority_order(self):
        assembled = self.assembler.assemble(
            build_request(
                history_summary="Previous goal.",
                resources=ResourceContext(
                    attachment_guidance="Attachments are available.",
                    knowledge_guidance="Knowledge is available.",
                ),
            )
        )

        headings = [
            "## Platform Rules",
            "## Agent Instructions",
            "## Conversation Summary",
            "## Attachment Resources",
            "## Knowledge Resources",
        ]
        positions = [assembled.system_prompt.index(heading) for heading in headings]
        self.assertEqual(positions, sorted(positions))

    def test_combines_history_and_current_user_message_without_mutating_history(self):
        history = [UserMessage(content="earlier")]
        assembled = self.assembler.assemble(build_request(history=history))

        self.assertEqual([message.content for message in assembled.messages], ["earlier", "current"])
        self.assertEqual([message.content for message in history], ["earlier"])

    def test_exposes_only_selected_capabilities(self):
        assembled = self.assembler.assemble(build_request())

        self.assertEqual(assembled.capability_ids, ["attachment.document_read_text"])
        self.assertEqual([tool.name for tool in assembled.tools], ["document_read_text"])

    def test_rejects_unknown_capability_configuration(self):
        with self.assertRaisesRegex(ValueError, "not registered"):
            self.assembler.assemble(build_request(capability_ids=["unknown.tool"]))

    def test_resource_scopes_are_normalized_and_kept_separate(self):
        assembled = self.assembler.assemble(
            build_request(
                resources=ResourceContext(
                    attachment_file_ids=[" file-1 ", "file-1", "file-2"],
                    knowledge_file_ids=["knowledge-1"],
                )
            )
        )

        self.assertEqual(assembled.metadata["available_file_ids"], ["file-1", "file-2"])
        self.assertEqual(assembled.metadata["attachment_file_ids"], ["file-1", "file-2"])
        self.assertEqual(assembled.metadata["knowledge_file_ids"], ["knowledge-1"])

    def test_callers_cannot_override_reserved_resource_metadata(self):
        with self.assertRaisesRegex(ValueError, "ResourceContext"):
            self.assembler.assemble(
                build_request(metadata={"available_file_ids": ["unauthorized-file"]})
            )

    def test_assembled_context_builds_runtime_request(self):
        assembled = self.assembler.assemble(build_request())
        model = Model(
            id="fake-model",
            name="Fake Model",
            api="fake-api",
            provider="fake-provider",
        )

        runtime_request = assembled.to_runtime_request(
            model=model,
            run_id="run-context",
        )

        self.assertEqual(runtime_request.run_id, "run-context")
        self.assertEqual(runtime_request.system_prompt, assembled.system_prompt)
        self.assertEqual(runtime_request.tools, assembled.tools)
        self.assertEqual(runtime_request.metadata, assembled.metadata)


if __name__ == "__main__":
    unittest.main()
