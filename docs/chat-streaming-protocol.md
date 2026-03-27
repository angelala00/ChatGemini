# Chat Streaming Protocol

## Goal

This document defines a unified streaming event protocol for chat responses.

The protocol is designed for these cases:

- plain text streaming
- reasoning content and final answer content mixed in the same model stream
- tool calls appearing before, after, or between content chunks
- multiple tool-call rounds in a single assistant response
- future compatibility with vendors that provide structured reasoning blocks

This protocol is transport-agnostic, but the current implementation target is SSE.

## Design Principles

1. The backend should preserve protocol-level structure.
2. The backend should not infer reasoning from raw text unless the upstream protocol explicitly provides it.
3. `content` and `tool_calls` are different event classes and must not be merged into one text stream.
4. The frontend may reclassify or restyle content after receiving more tokens.
5. One assistant response may contain multiple tool-call rounds.

## Transport

Current transport: Server-Sent Events.

Each SSE frame contains JSON in this shape:

```json
{
  "event": "content_delta",
  "conversation_id": "conv_xxx",
  "response_id": "resp_xxx",
  "sequence": 12,
  "...": "event specific fields"
}
```

## Shared Fields

All events should include these common fields when available:

- `event`: event type
- `conversation_id`: conversation identifier
- `response_id`: unique id for the current assistant response
- `sequence`: monotonically increasing integer within the current response
- `turn_index`: optional assistant turn index inside the conversation
- `timestamp`: optional server timestamp in ISO-8601

## Event Types

### `response_start`

Marks the start of one assistant response.

Fields:

- `model`
- `reasoning_enabled`
- `tooling_enabled`

Example:

```json
{
  "event": "response_start",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 1,
  "model": "qwen3.5",
  "reasoning_enabled": true,
  "tooling_enabled": true
}
```

### `content_delta`

Carries raw streamed text from the model.

Fields:

- `content`: raw text delta
- `channel`: optional string, default `unknown`

`channel` values:

- `unknown`: default for OpenAI-compatible `delta.content`
- `reasoning`: only when the upstream vendor explicitly marks reasoning
- `answer`: only when the upstream vendor explicitly marks final answer text

Important:

- If the upstream model returns reasoning and answer both in `content`, backend should send `channel: "unknown"`.
- Frontend may later restyle or reclassify these chunks.

Example:

```json
{
  "event": "content_delta",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 2,
  "content": "让我先分析一下这个问题",
  "channel": "unknown"
}
```

### `tool_call_start`

Signals that the model has started one tool call.

Fields:

- `tool_call_id`
- `tool_name`

Example:

```json
{
  "event": "tool_call_start",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 10,
  "tool_call_id": "call_001",
  "tool_name": "search_web"
}
```

### `tool_call_delta`

Streams tool arguments as they are generated.

Fields:

- `tool_call_id`
- `tool_name`: optional
- `arguments_delta`

Example:

```json
{
  "event": "tool_call_delta",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 11,
  "tool_call_id": "call_001",
  "arguments_delta": "{\"query\":\"杭州天气"
}
```

### `tool_call_end`

Signals that one tool call is complete and argument assembly has finished.

Fields:

- `tool_call_id`
- `tool_name`
- `arguments`

Example:

```json
{
  "event": "tool_call_end",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 12,
  "tool_call_id": "call_001",
  "tool_name": "search_web",
  "arguments": "{\"query\":\"杭州天气\"}"
}
```

### `tool_result`

Carries the backend tool execution result.

Fields:

- `tool_call_id`
- `tool_name`
- `result`

Example:

```json
{
  "event": "tool_result",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 13,
  "tool_call_id": "call_001",
  "tool_name": "search_web",
  "result": "杭州今天多云，18-25摄氏度"
}
```

### `response_complete`

Marks the end of the assistant response.

Fields:

- `finish_reason`

Example:

```json
{
  "event": "response_complete",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 20,
  "finish_reason": "stop"
}
```

### `error`

Signals a response-level error.

Fields:

- `message`
- `code`: optional
- `retryable`: optional

Example:

```json
{
  "event": "error",
  "conversation_id": "conv_123",
  "response_id": "resp_001",
  "sequence": 99,
  "message": "tool execution failed",
  "retryable": false
}
```

## Ordering Rules

### Basic text-only response

```text
response_start
content_delta*
response_complete
```

### Text, then tool call, then more text

```text
response_start
content_delta*
tool_call_start
tool_call_delta*
tool_call_end
tool_result
content_delta*
response_complete
```

### Multiple tool rounds

```text
response_start
content_delta*
tool_call_start
tool_call_delta*
tool_call_end
tool_result
content_delta*
tool_call_start
tool_call_delta*
tool_call_end
tool_result
content_delta*
response_complete
```

Important:

- `content_delta` may appear before any tool call.
- `content_delta` may appear after a tool result.
- Multiple tool calls may exist in one response.
- The protocol must not assume all tool calls happen before final answer text.

## Reasoning Semantics

For the current OpenAI-compatible chat-completions flow:

- reasoning text and answer text both arrive through `delta.content`
- tool calls arrive through `delta.tool_calls`

Therefore:

- backend should emit `content_delta` for all raw text chunks
- backend should usually set `channel: "unknown"`
- frontend may detect `<think>` / `</think>` or other vendor-specific markers and restyle content

For vendors with structured reasoning, such as Anthropic-style thinking blocks:

- backend may emit `channel: "reasoning"` and `channel: "answer"` directly

## Frontend Responsibilities

Frontend should:

- append incoming `content_delta` to the current assistant response
- render tool call progress from `tool_call_start`, `tool_call_delta`, `tool_call_end`
- render tool results from `tool_result`
- be able to reclassify already-rendered `content_delta` chunks if later tokens reveal reasoning markers

Frontend should not assume:

- reasoning always starts with `<think>`
- tool calls only happen before answer text
- one assistant response only has one tool call

## Backend Responsibilities

Backend should:

- preserve raw content ordering
- preserve tool-call structure
- execute tool-call rounds and continue the same response loop
- avoid converting tool calls into plain text status messages

Backend should not:

- collapse `tool_calls` into `content`
- require `</think>` before streaming text
- assume a single ordering like `reasoning -> tool -> answer`

## Compatibility Notes

Current project legacy SSE events include names like:

- `message`
- `message_end`

Recommended migration path:

1. introduce the new event protocol in a dedicated handler
2. keep legacy handler for old frontend consumers
3. migrate frontend to consume:
   - `response_start`
   - `content_delta`
   - `tool_call_start`
   - `tool_call_delta`
   - `tool_call_end`
   - `tool_result`
   - `response_complete`
   - `error`

## Open Questions

These are intentionally left open for the next design pass:

1. Whether `response_start` should be mandatory.
2. Whether `tool_call_start` can be omitted when only `tool_call_delta` is available.
3. Whether `tool_result` should carry structured JSON or always stringified content.
4. Whether frontend should persist raw chunks or only normalized message state.
