from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from app.agent_runtime_v3 import (
    CapabilityDescriptor,
    CapabilityExecutionRequest,
    CapabilityRegistry,
    ToolExecutionOutput,
    ToolExecutor,
    confirmation_fingerprint,
)
from app.agent_runtime_v3.builtin_tools.attachments import register_attachment_tools
from app.agent_runtime_v3.builtin_tools.regulation import register_regulation_tools
from app.attachments.tools import AttachmentToolExecutionResult
from app.llm_kernel import (
    AssistantMessage,
    TextContent,
    ToolCallContent,
    ToolDefinition,
)


def definition(name: str = "lookup") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description="Look up a value",
        parameters={
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
            "additionalProperties": False,
        },
    )


def descriptor(
    capability_id: str = "search.lookup",
    *,
    enabled: bool = True,
    risk: str = "read",
    requires_confirmation: bool = False,
    authorization_policy: str | None = None,
    required_permissions: tuple[str, ...] = (),
    timeout_seconds: float = 30.0,
):
    return CapabilityDescriptor(
        id=capability_id,
        type="tool",
        name="lookup",
        description="Look up a value",
        enabled=enabled,
        risk=risk,
        requires_confirmation=requires_confirmation,
        authorization_policy=authorization_policy,
        required_permissions=required_permissions,
        timeout_seconds=timeout_seconds,
    )


def execution_request(tool_definition, *, arguments=None, metadata=None):
    return CapabilityExecutionRequest(
        run_id="run-1",
        step_index=1,
        assistant_message=AssistantMessage(
            content=[
                ToolCallContent(
                    id="call-1",
                    name=tool_definition.name,
                    arguments=arguments if arguments is not None else {"query": "value"},
                )
            ],
            stop_reason="tool_use",
        ),
        tools=[tool_definition],
        metadata=metadata or {},
    )


class CapabilityRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def test_registry_resolves_enabled_tool_definitions_by_capability_id(self):
        registry = CapabilityRegistry()

        async def handler(context, arguments):
            return ToolExecutionOutput(content=[TextContent(text="ok")])

        registry.register_tool(descriptor(), definition(), handler)

        tools = registry.tool_definitions(["search.lookup"])

        self.assertEqual([tool.name for tool in tools], ["lookup"])

    async def test_registry_rejects_duplicate_tool_name(self):
        registry = CapabilityRegistry()

        async def handler(context, arguments):
            return ToolExecutionOutput()

        registry.register_tool(descriptor("search.first"), definition(), handler)

        with self.assertRaisesRegex(ValueError, "already registered"):
            registry.register_tool(descriptor("search.second"), definition(), handler)

    async def test_disabled_tool_is_not_exposed_or_executable(self):
        registry = CapabilityRegistry()

        async def handler(context, arguments):
            return ToolExecutionOutput()

        registry.register_tool(descriptor(enabled=False), definition(), handler)

        self.assertEqual(registry.tool_definitions(), [])
        with self.assertRaisesRegex(ValueError, "not available"):
            registry.get_tool("lookup")


class ToolExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_executor_validates_and_dispatches_registered_tool(self):
        registry = CapabilityRegistry()
        captured = []

        async def handler(context, arguments):
            captured.append((context, arguments))
            return ToolExecutionOutput(
                content=[TextContent(text="found")],
                details={"count": 1},
            )

        tool_definition = definition()
        registry.register_tool(descriptor(), tool_definition, handler)
        results = await ToolExecutor(registry)(execution_request(tool_definition))

        self.assertEqual(len(results), 1)
        self.assertFalse(results[0].is_error)
        self.assertEqual(results[0].content[0].text, "found")
        self.assertEqual(captured[0][0].capability_id, "search.lookup")
        self.assertEqual(captured[0][1], {"query": "value"})

    async def test_executor_returns_structured_error_for_invalid_arguments(self):
        registry = CapabilityRegistry()
        handler = AsyncMock(return_value=ToolExecutionOutput())
        tool_definition = definition()
        registry.register_tool(descriptor(), tool_definition, handler)

        results = await ToolExecutor(registry)(
            execution_request(tool_definition, arguments={})
        )

        self.assertTrue(results[0].is_error)
        self.assertEqual(
            results[0].details["error"]["code"],
            "INVALID_CAPABILITY_ARGUMENTS",
        )
        self.assertIn(
            "required",
            results[0].details["error"]["details"]["validation_error"],
        )
        handler.assert_not_awaited()

    async def test_executor_rechecks_permission_and_policy_at_execution_time(self):
        registry = CapabilityRegistry()
        handler = AsyncMock(return_value=ToolExecutionOutput())
        tool_definition = definition()
        registry.register_tool(
            descriptor(
                authorization_policy="business_data",
                required_permissions=("business.read",),
            ),
            tool_definition,
            handler,
        )

        denied = await ToolExecutor(registry)(execution_request(tool_definition))
        allowed = await ToolExecutor(registry)(
            execution_request(
                tool_definition,
                metadata={
                    "capability_permissions": ["business.read"],
                    "capability_policy_grants": ["business_data"],
                },
            )
        )

        self.assertEqual(
            denied[0].details["error"]["code"],
            "CAPABILITY_ACCESS_DENIED",
        )
        self.assertFalse(allowed[0].is_error)
        handler.assert_awaited_once()

    async def test_executor_times_out_tool_with_structured_retryable_error(self):
        registry = CapabilityRegistry()

        async def slow_handler(context, arguments):
            await asyncio.sleep(1)
            return ToolExecutionOutput()

        tool_definition = definition()
        registry.register_tool(
            descriptor(timeout_seconds=0.01),
            tool_definition,
            slow_handler,
        )

        results = await ToolExecutor(registry)(execution_request(tool_definition))

        error = results[0].details["error"]
        self.assertEqual(error["code"], "CAPABILITY_TIMEOUT")
        self.assertTrue(error["retryable"])

    async def test_write_tool_requires_confirmation_bound_to_arguments(self):
        registry = CapabilityRegistry()
        handler = AsyncMock(return_value=ToolExecutionOutput())
        tool_definition = definition()
        registry.register_tool(
            descriptor(risk="write"),
            tool_definition,
            handler,
        )
        arguments = {"query": "value"}

        denied = await ToolExecutor(registry)(
            execution_request(tool_definition, arguments=arguments)
        )
        fingerprint = denied[0].details["error"]["details"][
            "confirmation_fingerprint"
        ]
        confirmation_token = denied[0].details["error"]["details"][
            "confirmation_token"
        ]
        allowed = await ToolExecutor(registry)(
            execution_request(
                tool_definition,
                arguments=arguments,
                metadata={"confirmed_action_tokens": [confirmation_token]},
            )
        )

        self.assertEqual(
            denied[0].details["error"]["code"],
            "CONFIRMATION_REQUIRED",
        )
        self.assertEqual(
            fingerprint,
            confirmation_fingerprint("search.lookup", arguments),
        )
        self.assertFalse(allowed[0].is_error)
        handler.assert_awaited_once()

        changed_arguments = await ToolExecutor(registry)(
            execution_request(
                tool_definition,
                arguments={"query": "changed"},
                metadata={"confirmed_action_tokens": [confirmation_token]},
            )
        )
        self.assertEqual(
            changed_arguments[0].details["error"]["code"],
            "CONFIRMATION_REQUIRED",
        )

    async def test_attachment_tools_use_file_scope_from_execution_metadata(self):
        registry = CapabilityRegistry()
        capability_ids = register_attachment_tools(
            registry,
            model_supports_native_images=False,
        )
        tool_definition = registry.tool_definitions(capability_ids)[0]
        execution = AttachmentToolExecutionResult(
            content=[TextContent(text="files")],
            details={"items": []},
        )

        with patch(
            "app.agent_runtime_v3.builtin_tools.attachments.execute_attachment_tool",
            new=AsyncMock(return_value=execution),
        ) as execute:
            results = await ToolExecutor(registry)(
                execution_request(
                    tool_definition,
                    arguments={},
                    metadata={
                        "available_file_ids": ["file-1"],
                        "capability_policy_grants": ["current_request_files"],
                    },
                )
            )

        self.assertFalse(results[0].is_error)
        execute.assert_awaited_once_with(
            tool_definition.name,
            {},
            available_file_ids=["file-1"],
        )

    async def test_regulation_tools_are_registered_through_same_executor(self):
        registry = CapabilityRegistry()
        capability_ids = register_regulation_tools(registry)
        tool_definition = registry.tool_definitions(capability_ids)[0]

        with patch(
            "app.agent_runtime_v3.builtin_tools.regulation.execute_regulation_tool",
            new=AsyncMock(return_value=("catalog", {"source": "test"})),
        ) as execute:
            results = await ToolExecutor(registry)(
                execution_request(
                    tool_definition,
                    arguments={},
                    metadata={
                        "capability_policy_grants": ["regulation_knowledge"]
                    },
                )
            )

        self.assertFalse(results[0].is_error)
        self.assertEqual(results[0].content[0].text, "catalog")
        execute.assert_awaited_once_with(tool_definition.name, {})


if __name__ == "__main__":
    unittest.main()
