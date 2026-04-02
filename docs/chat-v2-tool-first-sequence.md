# chat-v2 Tool-First Sequence

## Mermaid

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant Route as /api/chat-v2
    participant Kernel as chat_with_kernel_gptassistant
    participant Provider as OpenAI Compat Provider
    participant Model as Upstream Model
    participant Tool as Attachment Tools

    FE->>Route: POST /api/chat-v2
    Route->>Kernel: chat_with_kernel_gptassistant(...)
    Kernel->>Kernel: load history + trim history
    Kernel->>Kernel: build user message with attachment manifest
    Kernel->>FE: SSE response_start

    Kernel->>Kernel: build Context for current turn
    Kernel->>Kernel: attach tools if file_ids exist
    Kernel->>Provider: stream(model, context, options)
    Provider->>Model: chat.completions.create(stream=true)

    Model-->>Provider: text / thinking / toolcall chunks
    Provider-->>Kernel: text_delta / thinking_delta / toolcall_end
    Kernel-->>FE: SSE text_delta / thinking_delta / toolcall_end

    alt model requests attachment tool
        Kernel->>Tool: execute_attachment_tool(...)
        Tool-->>Kernel: tool_result
        Kernel-->>FE: SSE tool_result
        Kernel->>Kernel: rebuild Context for next turn
        Kernel->>Provider: continue with tool_result in context
        Provider->>Model: next round stream
    else model finishes directly
        Model-->>Provider: finish_reason=stop
    end

    Provider-->>Kernel: DoneEvent
    Kernel-->>FE: SSE response_complete
    Kernel->>Kernel: save history + finalize usage
```

## Plain Text

```text
Frontend
  -> POST /api/chat-v2

Route
  -> 鉴权
  -> 选模型
  -> 进入 chat_with_kernel_gptassistant

Kernel
  -> 加载历史
  -> 裁剪历史
  -> 把附件清单和工具提示注入 user message
  -> 如果模型支持原生图片输入，直接把图片作为 image block 挂上
  -> 如果有附件，直接把 attachment tools 暴露给模型
  -> 发出 response_start

Provider
  -> 组装 OpenAI-compatible messages / tools
  -> 请求上游模型流式返回

Model
  -> 要么直接返回文本
  -> 要么先请求 document_list / document_read_text / document_load_images

如果模型触发 tool call
  -> BFF 执行附件工具
  -> 返回 tool_result
  -> 把 tool_result 追加回 context
  -> 再继续下一轮模型调用

最后
  -> response_complete
  -> 保存 history
  -> 前端结束当前消息渲染
```
