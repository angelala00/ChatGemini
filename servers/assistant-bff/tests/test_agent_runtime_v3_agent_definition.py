from __future__ import annotations

import unittest

from fastapi import HTTPException

from app.agent_runtime_v3 import (
    AgentDefinition,
    AgentDefinitionResolver,
    CapabilityAccessContext,
    CapabilityDescriptor,
    CapabilityRegistry,
    ContextAssembler,
    ResourceContext,
    ToolExecutionOutput,
)
from app.llm_kernel import Model, ToolDefinition, UserMessage
from app.routes.gpts_routes import (
    _apply_new_agent_runtime_defaults,
    _validate_agent_runtime_v3_config,
)


def build_registry() -> CapabilityRegistry:
    registry = CapabilityRegistry()

    async def handler(context, arguments):
        return ToolExecutionOutput()

    capabilities = (
        (
            "attachment.document_list",
            "document_list",
            "current_request_files",
            (),
        ),
        (
            "regulation.fetch_document_catalog",
            "fetch_document_catalog",
            "regulation_knowledge",
            ("regulation.read",),
        ),
    )
    for capability_id, tool_name, policy, permissions in capabilities:
        registry.register_tool(
            CapabilityDescriptor(
                id=capability_id,
                type="tool",
                name=tool_name,
                description=tool_name,
                authorization_policy=policy,
                required_permissions=permissions,
            ),
            ToolDefinition(
                name=tool_name,
                description=tool_name,
                parameters={"type": "object", "properties": {}},
            ),
            handler,
        )
    return registry


class AgentDefinitionTests(unittest.TestCase):
    def test_parses_existing_agent_json_config_without_database_changes(self):
        definition = AgentDefinition.from_config(
            "agent-1",
            {
                "system_prompt": "You are an assistant.",
                "enabled_capabilities": [
                    "attachment.document_list",
                    "attachment.document_list",
                ],
                "runtime_limits": {"max_steps": 6},
                "context_policy": {
                    "include_history": True,
                    "include_history_summary": False,
                    "allow_attachments": True,
                    "allow_knowledge": False,
                    "max_history_messages": 2,
                },
            },
        )

        self.assertEqual(definition.instructions, "You are an assistant.")
        self.assertEqual(
            definition.enabled_capability_ids,
            ("attachment.document_list",),
        )
        self.assertEqual(definition.runtime_limits.max_steps, 6)
        self.assertEqual(definition.runtime_limits.max_capability_calls, 8)
        self.assertFalse(definition.context_policy.allow_knowledge)

    def test_missing_v3_fields_have_safe_compatible_defaults(self):
        definition = AgentDefinition.from_config(
            "legacy-agent",
            {"system_prompt": "Legacy prompt"},
        )

        self.assertEqual(definition.enabled_capability_ids, ())
        self.assertEqual(definition.runtime_limits.max_steps, 4)
        self.assertTrue(definition.context_policy.include_history)

    def test_invalid_runtime_and_context_configuration_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "between 1 and 20"):
            AgentDefinition.from_config(
                "agent-1",
                {"runtime_limits": {"max_steps": 100}},
            )
        with self.assertRaisesRegex(ValueError, "must be a boolean"):
            AgentDefinition.from_config(
                "agent-1",
                {"context_policy": {"allow_attachments": "yes"}},
            )
        with self.assertRaisesRegex(ValueError, "between 0 and 50"):
            AgentDefinition.from_config(
                "agent-1",
                {"runtime_limits": {"max_capability_calls": 100}},
            )

    def test_management_validation_rejects_invalid_optional_v3_fields(self):
        with self.assertRaises(HTTPException) as raised:
            _validate_agent_runtime_v3_config(
                "agent-1",
                {"runtime_limits": {"max_steps": 100}},
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_management_validation_ignores_legacy_config_without_v3_fields(self):
        _validate_agent_runtime_v3_config(
            "legacy-agent",
            {"system_prompt": "Legacy prompt"},
        )

    def test_new_agent_defaults_to_v3_without_allowing_handler_override(self):
        config = {"handler_key": "legacy", "enabled_capabilities": []}

        _apply_new_agent_runtime_defaults(config)

        self.assertEqual(config["handler_key"], "agent_runtime_v3")
        self.assertEqual(config["assistant_kind"], "custom")
        self.assertEqual(config["enabled_capabilities"], [])
        self.assertEqual(config["context_policy"]["max_history_messages"], 20)


class AgentDefinitionResolverTests(unittest.TestCase):
    def setUp(self):
        self.registry = build_registry()
        self.resolver = AgentDefinitionResolver(self.registry)

    def test_selects_only_configured_and_authorized_capabilities(self):
        definition = AgentDefinition.from_config(
            "agent-1",
            {
                "enabled_capabilities": [
                    "attachment.document_list",
                    "regulation.fetch_document_catalog",
                ]
            },
        )
        resolved = self.resolver.resolve(
            definition,
            CapabilityAccessContext(
                user_id="user-1",
                policy_grants=frozenset({"current_request_files"}),
            ),
        )

        self.assertEqual(
            resolved.capability_ids,
            ("attachment.document_list",),
        )
        self.assertIn(
            "regulation.fetch_document_catalog",
            resolved.denied_capabilities,
        )

    def test_requires_both_permission_and_policy_grant(self):
        definition = AgentDefinition.from_config(
            "agent-1",
            {
                "enabled_capabilities": [
                    "regulation.fetch_document_catalog",
                ]
            },
        )

        denied = self.resolver.resolve(
            definition,
            CapabilityAccessContext(
                user_id="user-1",
                policy_grants=frozenset({"regulation_knowledge"}),
            ),
        )
        allowed = self.resolver.resolve(
            definition,
            CapabilityAccessContext(
                user_id="user-1",
                permissions=frozenset({"regulation.read"}),
                policy_grants=frozenset({"regulation_knowledge"}),
            ),
        )

        self.assertEqual(denied.capability_ids, ())
        self.assertEqual(
            allowed.capability_ids,
            ("regulation.fetch_document_catalog",),
        )

    def test_unknown_configured_capability_is_rejected(self):
        definition = AgentDefinition.from_config(
            "agent-1",
            {"enabled_capabilities": ["unknown.tool"]},
        )

        with self.assertRaisesRegex(ValueError, "not registered"):
            self.resolver.resolve(
                definition,
                CapabilityAccessContext(user_id="user-1"),
            )

    def test_context_policy_is_applied_before_context_assembly(self):
        definition = AgentDefinition.from_config(
            "agent-1",
            {
                "system_prompt": "Agent prompt",
                "enabled_capabilities": ["attachment.document_list"],
                "context_policy": {
                    "include_history": True,
                    "include_history_summary": False,
                    "allow_attachments": True,
                    "allow_knowledge": False,
                    "max_history_messages": 1,
                },
            },
        )
        resolved = self.resolver.resolve(
            definition,
            CapabilityAccessContext(
                user_id="user-1",
                policy_grants=frozenset({"current_request_files"}),
            ),
        )
        context_request = resolved.build_context_request(
            platform_instructions="Platform prompt",
            history=[UserMessage(content="old-1"), UserMessage(content="old-2")],
            user_message=UserMessage(content="current"),
            history_summary="summary",
            resources=ResourceContext(
                attachment_file_ids=["attachment-1"],
                knowledge_file_ids=["knowledge-1"],
                attachment_guidance="attachment guidance",
                knowledge_guidance="knowledge guidance",
            ),
        )
        assembled = ContextAssembler(self.registry).assemble(context_request)

        self.assertEqual(
            [message.content for message in assembled.messages],
            ["old-2", "current"],
        )
        self.assertNotIn("Conversation Summary", assembled.system_prompt)
        self.assertNotIn("Knowledge Resources", assembled.system_prompt)
        self.assertEqual(assembled.metadata["attachment_file_ids"], ["attachment-1"])
        self.assertEqual(assembled.metadata["knowledge_file_ids"], [])
        self.assertEqual([tool.name for tool in assembled.tools], ["document_list"])

    def test_runtime_request_uses_agent_runtime_limits(self):
        definition = AgentDefinition.from_config(
            "agent-1",
            {"runtime_limits": {"max_steps": 7}},
        )
        resolved = self.resolver.resolve(
            definition,
            CapabilityAccessContext(user_id="user-1"),
        )
        assembled = ContextAssembler(self.registry).assemble(
            resolved.build_context_request(
                platform_instructions=None,
                history=[],
                user_message=UserMessage(content="hello"),
            )
        )

        runtime_request = resolved.build_runtime_request(
            assembled,
            model=Model(
                id="fake-model",
                name="Fake Model",
                api="fake-api",
                provider="fake-provider",
            ),
            run_id="run-agent-limit",
        )

        self.assertEqual(runtime_request.limits.max_steps, 7)

    def test_resolved_access_is_written_to_controlled_runtime_metadata(self):
        definition = AgentDefinition.from_config("agent-1", {})
        resolved = self.resolver.resolve(
            definition,
            CapabilityAccessContext(
                user_id="user-1",
                permissions=frozenset({"business.read"}),
                policy_grants=frozenset({"business_data"}),
            ),
        )
        context_request = resolved.build_context_request(
            platform_instructions=None,
            history=[],
            user_message=UserMessage(content="hello"),
            metadata={
                "user_id": "forged-user",
                "capability_permissions": ["admin"],
            },
        )

        self.assertEqual(context_request.metadata["user_id"], "user-1")
        self.assertEqual(
            context_request.metadata["capability_permissions"],
            ["business.read"],
        )
        self.assertEqual(
            context_request.metadata["capability_policy_grants"],
            ["business_data"],
        )


if __name__ == "__main__":
    unittest.main()
