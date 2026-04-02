# chat_with_kernel_gptassistant Core Flow

## Mermaid

```mermaid
flowchart TD
    A["load history"] --> B["trim history and build summary"]
    B --> C["build_user_message_from_attachments"]
    C --> D["emit response_start"]

    D --> E

    subgraph LOOP["for each turn"]
        E["build Context for current turn"]
        E --> F["llm_kernel.stream"]
        F --> G["stream text thinking toolcall events"]
        G --> H{"stop_reason == tool_use?"}
        H -->|是| K["execute attachment tools"]
        K --> L["append tool_result to current_messages"]
        L --> E
    end

    H -->|否| I["response_complete"]
    I --> J["save history and finalize usage"]
```

## Plain Text

```text
chat_with_kernel_gptassistant
  -> load history
  -> trim history
  -> older history -> summary -> system prompt
  -> build_user_message_from_attachments
     -> inject attachment manifest and tool guidance
     -> attach native images when supported
  -> emit response_start
  -> for each turn
     -> build Context(system_prompt + current_messages + tools)
     -> call llm_kernel.stream
     -> stream text / thinking / toolcall events
  -> if stop_reason != tool_use
     -> response_complete
  -> if stop_reason == tool_use
     -> execute attachment tools
     -> append tool_result into context
     -> continue next stream round
  -> response_complete
  -> save history and finalize usage
```

## Key Files

- Main orchestration: `servers/assistant-bff/app/chat_kernel_service.py`
- Attachment preprocessing: `servers/assistant-bff/app/attachments/service.py`
- Attachment tools: `servers/assistant-bff/app/attachments/tools.py`
- Provider stream bridge: `servers/assistant-bff/app/llm_kernel/providers/openai_compat.py`
