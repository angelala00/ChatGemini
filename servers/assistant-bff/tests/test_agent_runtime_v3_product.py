from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from app.agent_runtime_v3 import ToolExecutor, build_agent_capability_registry, list_agent_capabilities
from app.agent_runtime_v3.builtin_tools.knowledge import register_knowledge_tools
from app.agent_runtime_v3.capabilities import CapabilityRegistry
from app.agent_runtime_v3.types import CapabilityExecutionRequest
from app.agent_runtime_v3.confirmation import (
    issue_confirmation_token,
    verify_confirmation_token,
)
from app.attachments.tools import AttachmentToolExecutionResult
from app.llm_kernel import (
    AssistantMessage,
    TextContent,
    ToolCallContent,
    clear_api_providers,
    register_api_provider,
)
from app.llm_kernel.event_stream import EventStream
from app import agent_runtime_v3_service
from app.routes import chat_routes


class AgentRuntimeV3ProductTests(unittest.IsolatedAsyncioTestCase):
    def tearDown(self):
        clear_api_providers()

    def test_catalog_exposes_expected_configurable_read_capabilities(self):
        items = list_agent_capabilities()

        self.assertEqual(
            {item["id"] for item in items},
            {
                "attachment.document_list",
                "attachment.document_read_text",
                "knowledge.knowledge_list",
                "knowledge.knowledge_read_text",
            },
        )
        self.assertTrue(all(item["risk"] == "read" for item in items))

    async def test_knowledge_tool_uses_only_knowledge_file_scope(self):
        registry = CapabilityRegistry()
        capability_ids = register_knowledge_tools(registry)
        tool = registry.tool_definitions(capability_ids)[0]
        request = CapabilityExecutionRequest(
            run_id="run-knowledge",
            step_index=1,
            assistant_message=AssistantMessage(
                content=[ToolCallContent(id="call-1", name=tool.name, arguments={})],
                stop_reason="tool_use",
            ),
            tools=[tool],
            metadata={
                "user_id": "user-1",
                "knowledge_file_ids": ["knowledge-1"],
                "available_file_ids": ["attachment-1"],
                "capability_policy_grants": ["assistant_knowledge"],
            },
        )

        with patch(
            "app.agent_runtime_v3.builtin_tools.knowledge.execute_attachment_tool",
            new=AsyncMock(
                return_value=AttachmentToolExecutionResult(
                    content=[TextContent(text="knowledge")],
                    details={},
                )
            ),
        ) as execute:
            result = await ToolExecutor(registry)(request)

        self.assertFalse(result[0].is_error)
        execute.assert_awaited_once_with(
            "document_list",
            {},
            available_file_ids=["knowledge-1"],
        )

    def test_v3_history_key_is_isolated_by_agent(self):
        with patch.dict(
            chat_routes.gpts,
            {
                "agent-a": {"handler_key": "agent_runtime_v3", "owner": "u-1"},
                "agent-b": {"handler_key": "agent_runtime_v3", "owner": "u-1"},
            },
            clear=False,
        ):
            key_a = chat_routes._runtime_history_key("conversation-1", "agent-a")
            key_b = chat_routes._runtime_history_key("conversation-1", "agent-b")

        self.assertEqual(key_a, "agent_runtime_v3:agent-a:conversation-1")
        self.assertEqual(key_b, "agent_runtime_v3:agent-b:conversation-1")
        self.assertNotEqual(key_a, key_b)

    def test_registry_builds_all_catalog_tools(self):
        registry = build_agent_capability_registry()
        self.assertEqual(len(registry.list_tools()), 4)

    def test_confirmation_token_is_bound_to_user_and_parameters(self):
        token = issue_confirmation_token(user_id="user-1", fingerprint="fingerprint-1")

        self.assertTrue(
            verify_confirmation_token(
                token,
                user_id="user-1",
                fingerprint="fingerprint-1",
            )
        )
        self.assertFalse(
            verify_confirmation_token(
                token,
                user_id="user-2",
                fingerprint="fingerprint-1",
            )
        )
        self.assertFalse(
            verify_confirmation_token(
                f"{token}tampered",
                user_id="user-1",
                fingerprint="fingerprint-1",
            )
        )

    async def test_chat_route_dispatches_v3_agent_to_v3_service(self):
        assistant = {
            "gid": "agent-v3",
            "name": "Agent V3",
            "owner": "user-1",
            "handler_key": "agent_runtime_v3",
            "system_prompt": "Prompt",
            "default_model": "model-1",
            "auth": {"type": "all"},
        }
        selected_model = {
            "id": "model-1",
            "model_name": "model-1",
            "supports_reasoning": False,
        }
        captured = {}

        async def fake_v3_service(*args, **kwargs):
            captured["args"] = args
            captured["kwargs"] = kwargs
            yield 'data: {"event":"response_complete","conversation_id":"c-1"}\n\n'

        tracker = Mock()
        request = chat_routes.QueryRequest(
            query="hello",
            conversation_id="c-1",
            base_model="model-1",
        )
        user = {"sub": "user-1", "email": "user@example.com"}
        with (
            patch.dict(chat_routes.gpts, {"agent-v3": assistant}, clear=False),
            patch.object(chat_routes, "ensure_file_ids_owned_by_user", return_value=None),
            patch.object(chat_routes, "_bind_request_session_attachments", return_value=0),
            patch.object(chat_routes, "upsert_session_history_meta"),
            patch.object(chat_routes, "ensure_gpt_access_allowed"),
            patch.object(chat_routes, "auth_ok", return_value=True),
            patch.object(chat_routes, "get_current_auth_provider", return_value="local"),
            patch.object(chat_routes, "_get_gid_model_config", new=AsyncMock(return_value=selected_model)),
            patch.object(chat_routes, "create_usage_event", return_value=tracker),
            patch.object(chat_routes, "create_chat_trace", return_value=None),
            patch.object(chat_routes, "_assistant_knowledge_file_ids", return_value="knowledge-1"),
            patch.object(chat_routes, "chat_with_agent_runtime_v3", side_effect=fake_v3_service),
            patch.object(chat_routes, "_persist_session_client_history_from_runtime"),
        ):
            response = await chat_routes.chat_with_gpts(request, "agent-v3", user)
            chunks = [chunk async for chunk in response.body_iterator]

        self.assertEqual(len(chunks), 1)
        self.assertEqual(captured["args"][4], "agent-v3")
        self.assertEqual(captured["kwargs"]["knowledge_file_ids"], "knowledge-1")
        self.assertEqual(captured["kwargs"]["confirmed_action_tokens"], [])

    async def test_v3_service_streams_and_saves_independent_history(self):
        class FakeProvider:
            api = "openai-compat-chat-completions"

            def stream(self, model, context, options=None):
                stream = EventStream()
                stream.push(SimpleNamespace(type="text_delta", content_index=0, delta="hello"))
                stream.finish(
                    AssistantMessage(
                        content=[TextContent(text="hello")],
                        stop_reason="stop",
                    )
                )
                return stream

        register_api_provider(FakeProvider())
        gid = "agent-service-v3"
        conversation_id = "conversation-service-v3"
        key = agent_runtime_v3_service.history_key(gid, conversation_id)
        agent_runtime_v3_service.match_history.pop(key, None)
        with (
            patch.object(agent_runtime_v3_service, "resolve_user_permissions", return_value=set()),
            patch.object(agent_runtime_v3_service, "save_match_history"),
        ):
            chunks = [
                chunk
                async for chunk in agent_runtime_v3_service.chat_with_agent_runtime_v3(
                    "hello",
                    conversation_id,
                    {
                        "system_prompt": "Prompt",
                        "enabled_capabilities": [],
                        "runtime_limits": {"max_steps": 2, "max_capability_calls": 2},
                    },
                    {
                        "id": "fake-model",
                        "model_name": "fake-model",
                        "supports_tool_calling": True,
                    },
                    gid,
                    {"sub": "user-1", "email": "user@example.com"},
                )
            ]

        self.assertTrue(any('"event": "text_delta"' in chunk for chunk in chunks))
        self.assertTrue(any('"event": "response_complete"' in chunk for chunk in chunks))
        self.assertEqual(len(agent_runtime_v3_service.match_history[key]), 2)
        agent_runtime_v3_service.match_history.pop(key, None)


if __name__ == "__main__":
    unittest.main()
