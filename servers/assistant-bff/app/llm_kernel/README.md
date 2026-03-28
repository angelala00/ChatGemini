# Python LLM Kernel Design

## Goal

This document defines a Python-native LLM kernel for `servers/assistant-bff`.

The kernel is intentionally inspired by `@mariozechner/pi-ai`, but it is not a
line-by-line port. The goal is to preserve the same architectural boundaries:

- unified model and provider abstraction
- structured conversation context and content blocks
- structured streaming event protocol
- provider adapters that normalize vendor-specific streams
- message transformation for replay and cross-model handoff

This kernel is designed as an internal module for the current server project.
It is not yet wired into the existing assistant routes.

## Current Status

`llm_kernel` phase 1 is complete.

This means the module is now considered a valid isolated kernel foundation, but not a completed assistant integration.

What is already in place:

- structured `Model`, `Context`, `Message`, `ContentBlock`, and `Usage` types
- structured kernel event protocol with `AssistantMessageEventStream`
- model registry and model lookup helpers
- provider registry and `stream()` / `complete()` entrypoints
- replay / handoff message transformation
- tool validation utilities
- multi-round tool continuation semantics
- one OpenAI-compatible provider with:
  - text / thinking / tool-call streaming
  - payload replay rules
  - model compatibility overrides via `model.compat`
  - streaming usage parsing
  - provider error / aborted termination semantics
- formal unit tests plus a smoke test

What phase 1 does not mean:

- it is not connected to the current assistant routes
- it is not a full `pi-ai` feature-complete port
- it does not include legacy SSE adapters
- it does not include automatic agent loops or tool execution orchestration

Phase 2 should begin only when one of these is chosen deliberately:

1. deepen kernel parity with `pi-ai` in a clearly scoped area
2. build an adapter layer from the existing assistant stack into `llm_kernel`
3. migrate one real assistant path onto the kernel

## Pi-AI Gap Assessment

This section exists to answer a practical question: how far is `llm_kernel` still from the current `pi-ai` direction?

### Areas That Are Already Largely Aligned

- structured message/content/event model
- model/provider abstraction and registry helpers
- multi-round tool continuation semantics
- replay / handoff transformation as a distinct kernel responsibility
- provider-specific compatibility behavior isolated in the provider layer
- usage / cost handling as kernel-level concerns
- provider error / aborted stream termination semantics

### Areas That Still Lag Behind `pi-ai`

- provider coverage
  `pi-ai` supports many provider families; `llm_kernel` currently has one OpenAI-compatible provider.
- validation depth
  `pi-ai` uses a much stronger schema validation stack; `llm_kernel` now combines a stricter normalization layer with a formal `jsonschema` validator backend, but it is still not yet as broad as the upstream validation setup.
- compatibility breadth
  `pi-ai` has a much richer OpenAI-compatible compatibility matrix than the current local implementation.
- model inventory
  `pi-ai` ships with a generated model catalog; `llm_kernel` only has the registry abstraction, not a populated catalog.
- typed compatibility contracts
  `llm_kernel` has started to move OpenAI-compatible behavior into a typed compatibility contract, but broader provider families still lag behind `pi-ai`.
- transport breadth
  `pi-ai` explicitly spans multiple APIs/transports/providers; `llm_kernel` is still single-family.

### High-Value Remaining Work If Kernel Parity Continues

These are the remaining items that still have strong signal:

1. strengthen tool validation toward a real schema engine
2. deepen the OpenAI-compatible compatibility matrix in clearly scoped slices
3. tighten typed compatibility contracts instead of leaving more logic in loose dictionaries
4. add one more provider family only if there is a concrete migration target for it

### Low-Value Remaining Work

These are the areas where more kernel work would likely have weak returns right now:

- endlessly expanding local helper APIs without a concrete migration need
- adding legacy compatibility behavior inside the kernel
- recreating all of `pi-ai` provider coverage before any real assistant path uses the kernel
- polishing documentation without either new parity gains or an actual migration step

### Practical Conclusion

`llm_kernel` is no longer far from a reasonable phase-1 parity target.

If work continues purely inside the kernel, the remaining high-value distance is now short.
The largest remaining gap is no longer the absence of a kernel foundation; it is the absence of a real upper-layer migration onto that foundation.

## Non-Goals For V1

The first version does not aim to provide:

- all `pi-ai` providers
- OAuth flows
- browser-facing SSE adapters
- automatic model discovery
- cost metadata for every provider
- compatibility with existing `message` / `message_end` frontend events

## Design Principles

1. Business assistant logic must stay outside the kernel.
2. The kernel must not encode presentation markers like `<think>` or `<step>`.
3. Tool calls and tool results must remain structured, not flattened into text.
4. Provider output must first be normalized into kernel events.
5. The final result of one stream must be a structured assistant message.

## Design Constraints

These constraints are mandatory for all future `llm_kernel` work:

1. `llm_kernel` must align with `pi-ai` architecture and semantics first.
2. The existing assistant application must not dictate kernel design.
3. Legacy frontend or business-layer compatibility belongs in adapters outside the kernel.
4. If a later assistant integration does not fit the kernel cleanly, the upper business layer should be refactored instead of weakening kernel abstractions.
5. The kernel must not add legacy-specific concepts such as:
   - `message`
   - `message_end`
   - `<think>`
   - UI-oriented step markers
6. The kernel should evolve as a stable internal foundation, with adapters translating between kernel semantics and any legacy application protocol.
7. Before making non-trivial kernel changes, review the current `pi-ai` module design and implementation again.
8. Kernel evolution should track meaningful upstream `pi-ai` ideas when they improve architecture, protocol clarity, or provider behavior.
9. If `pi-ai` has changed in a relevant area, prefer adapting the upper layer to the improved kernel direction instead of preserving older local behavior.

## Upstream Review Rule

For any substantial change to `llm_kernel`, review the corresponding area in the `pi-ai` upstream first.

This review should answer:

1. Has `pi-ai` changed its abstraction boundary in this area?
2. Has `pi-ai` changed its event protocol or message semantics?
3. Has `pi-ai` introduced a cleaner provider or replay strategy worth adopting here?
4. Would copying the newer `pi-ai` direction improve the kernel more than preserving local behavior?

The default assumption should be:

- `pi-ai` may have evolved
- its newer design may be better than the current local draft
- `llm_kernel` should stay closer to the best current `pi-ai` direction over time

## Module Layout

Module root:

- `servers/assistant-bff/app/llm_kernel/__init__.py`
- `servers/assistant-bff/app/llm_kernel/types.py`
- `servers/assistant-bff/app/llm_kernel/event_stream.py`
- `servers/assistant-bff/app/llm_kernel/models.py`
- `servers/assistant-bff/app/llm_kernel/stream.py`
- `servers/assistant-bff/app/llm_kernel/transform_messages.py`
- `servers/assistant-bff/app/llm_kernel/providers/base.py`
- `servers/assistant-bff/app/llm_kernel/providers/openai_compat.py`

## Core Types

The kernel should define structured content blocks similar to `pi-ai`:

- `TextContent`
- `ThinkingContent`
- `ImageContent`
- `ToolCallContent`

It should define message types:

- `UserMessage`
- `AssistantMessage`
- `ToolResultMessage`

It should define:

- `Context`
- `ToolDefinition`
- `Model`
- `Usage`

The `Model` shape should stay close to `pi-ai`:

- `reasoning`
- `input`
- `context_window`
- `max_output_tokens`
- `headers`
- `compat`

Compatibility shim fields may exist temporarily, but they should normalize toward the canonical model fields above instead of becoming the long-term API.

For provider families that need request/response compatibility overrides, the canonical place is `model.compat`, not ad-hoc provider conditionals scattered through upper layers. Examples include:

- max token field selection
- developer vs system role behavior
- reasoning parameter format selection
- tool result name requirements
- tool-result-to-user bridge requirements
- thinking replay as dedicated fields vs downgraded text

## Event Protocol

The kernel event protocol should be semantically aligned with `pi-ai`:

- `start`
- `text_start`
- `text_delta`
- `text_end`
- `thinking_start`
- `thinking_delta`
- `thinking_end`
- `toolcall_start`
- `toolcall_delta`
- `toolcall_end`
- `done`
- `error`

Important:

- these are kernel events, not frontend SSE events
- provider adapters emit these events
- upper layers may translate them into any transport-specific protocol later

## Provider Contract

Each provider adapter should expose one streaming entrypoint:

```python
provider.stream(model, context, options) -> AssistantMessageEventStream
```

Contract:

- provider-specific exceptions should be normalized into `error` events
- provider-level failure finish reasons should terminate as `error`, not as successful `done`
- the returned stream should terminate with `done` or `error`
- the final stream result should be an `AssistantMessage`

## Public API Surface

The kernel should expose a small stable public API:

- provider registration and lookup
- model registration and lookup
- `stream()` / `complete()`
- `stream_simple()` / `complete_simple()`
- core types
- message transformation
- tool validation

Provider-specific options should become explicit typed option objects when a provider stabilizes, instead of staying forever as opaque `dict` payload extensions.

Provider registration should be queryable, so higher layers can inspect which APIs are available without reaching into module internals.

Model lookup should also be queryable through stable helpers rather than requiring higher layers to reach into `ModelRegistry` internals. This mirrors the `pi-ai` direction where model access is a first-class kernel concern.

## Phase-1 Stable Surface

For phase 1, the intended stable surface is the set of exports from `llm_kernel.__init__` that upper layers should rely on directly:

- core types:
  - `Model`
  - `Context`
  - `UserMessage`
  - `AssistantMessage`
  - `ToolResultMessage`
  - `TextContent`
  - `ThinkingContent`
  - `ImageContent`
  - `ToolCallContent`
  - `ToolDefinition`
  - `Usage`
- stream entrypoints:
  - `stream()`
  - `complete()`
  - `stream_simple()`
  - `complete_simple()`
- provider registration:
  - `register_provider()`
  - `register_api_provider()`
  - `get_api_provider()`
  - `list_registered_apis()`
- model registration/query:
  - `register_model()`
  - `register_models()`
  - `get_model()`
  - `get_models()`
  - `get_providers()`
  - `has_model()`
  - `models_are_equal()`
  - `supports_xhigh()`
- kernel utilities:
  - `transform_messages()`
  - `validate_tool_call()`
  - `validate_tool_arguments()`

The following are not part of the intended phase-1 stable surface for upper layers:

- provider-private helpers inside `providers/openai_compat.py`
- direct calls to `_build_payload()` or other underscored functions
- assumptions about internal event-stream queue implementation
- direct dependence on fallback validation internals

## Multi-Round Tool Continuation

`llm_kernel` should follow the same semantic direction as `pi-ai` here:

1. one model invocation may end with `stop_reason = "tool_use"`
2. the caller executes the requested tools outside the kernel
3. the caller appends:
   - the returned `AssistantMessage`
   - one or more `ToolResultMessage` items
4. the caller invokes `stream()` or `complete()` again with the updated `Context`

Important:

- the kernel should preserve this structured loop
- the kernel should not flatten tool execution into assistant text
- the kernel should not hide continuation semantics behind legacy application behavior
- automatic full agent loops, if needed later, belong in a higher layer above the kernel

## OpenAI-Compatible Provider In V1

The first provider adapter targets OpenAI-compatible chat completions.

Scope:

- text deltas from `delta.content`
- reasoning deltas from provider-specific reasoning fields when available
- tool call deltas from `delta.tool_calls`
- tool argument assembly
- tool definition compatibility behavior
- streaming usage parsing when available
- finish reason normalization
- response ID propagation when available

## Message Transformation Layer

The kernel should include a transformation layer for replay and handoff.

V1 responsibilities:

- keep user messages unchanged
- preserve assistant text and tool calls
- downgrade thinking blocks to text when the next model cannot consume thinking
- ensure orphaned tool calls can be followed by synthetic error tool results

Thinking replay rule:

- for the same model, preserve thinking blocks and their signatures when possible
- for a different model, downgrade usable thinking text into normal text
- do not force legacy display markers into replayed messages

## Tool Validation

Like `pi-ai`, the kernel should expose tool argument validation as a kernel utility, not bury it inside business logic.

Current direction:

- provider adapters produce structured `ToolCallContent`
- callers may validate tool arguments before execution
- validation errors should be representable as structured tool results in upper layers

The kernel should keep validation separate from execution:

- validation belongs in the kernel
- tool execution belongs above the kernel
- full agent loops belong above the kernel

If validation fails:

- the kernel validation utility should raise a clear error
- the upper layer should convert that failure into a structured `ToolResultMessage`
- the model should be allowed to retry in a later continuation turn

Recommended upper-layer recovery flow:

1. validate the `ToolCallContent`
2. catch the validation error
3. append `ToolResultMessage(is_error=True)` with the validation error text
4. call `stream()` or `complete()` again with the updated `Context`

## Migration Intent

This kernel is intentionally isolated from the current assistant code.

The intended later migration path is:

1. kernel implemented and stabilized in isolation
2. legacy assistant service wraps kernel with compatibility adapters
3. legacy SSE protocol replaced or bridged
4. business assistants stop calling provider SDKs directly

## V1 Acceptance Criteria

The first kernel version is considered valid when:

1. it defines structured model, message, tool, and event types
2. it provides an event stream object with `result()`
3. it provides a model registry
4. it provides one OpenAI-compatible streaming provider
5. it returns structured assistant messages rather than plain text
6. it does not depend on existing `chat_service.py` internals
