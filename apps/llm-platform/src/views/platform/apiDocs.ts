export interface ApiDoc {
    title: string;
    summary: string;
    request: string;
    response: string;
    notes: string[];
}

export const API_DOC_GROUP_ORDER = ["模型", "对话", "检索", "音频", "Claude", "其他"] as const;

export const getApiDocGroupLabel = (title: string) => {
    if (title.startsWith("GET /v1/models")) {
        return "模型";
    }
    if (title.includes("/v1/chat/completions")) {
        return "对话";
    }
    if (title.includes("/v1/embeddings") || title.includes("/v1/rerank")) {
        return "检索";
    }
    if (title.includes("/v1/audio/")) {
        return "音频";
    }
    if (title.includes("/v1/messages")) {
        return "Claude";
    }
    return "其他";
};

export const apiDocs: ApiDoc[] = [
    {
        title: "GET /v1/models",
        summary: "获取可用模型列表（OpenAI 兼容）。",
        request: `curl -X GET \\
  -H "Authorization: Bearer $API_KEY" \\
  https://{HOST}/v1/models`,
        response: `{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 0,
      "owned_by": "gateway"
    }
  ]
}`,
        notes: [
            "需要 Authorization Bearer Token。",
            "返回字段遵循 OpenAI 模型列表结构，网关会基于 token 权限过滤。",
        ],
    },
    {
        title: "POST /v1/chat/completions",
        summary: "聊天对话（OpenAI 兼容，支持 stream、tools）。",
        request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/chat/completions \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Say hi"}
    ],
    "chat_template_kwargs": {
      "enable_thinking": true
    },
    "temperature": 0.7,
    "stream": false
  }'`,
        response: `{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "Hi!"},
      "finish_reason": "stop"
    }
  ],
  "model": "gpt-4o-mini"
}`,
        notes: [
            "Header 可选：`x-tool-mode` 支持 `native`/`prompt`/`auto`。",
            "stream=true 时返回 SSE（text/event-stream）。",
        ],
    },
    {
        title: "POST /v1/chat/completions（多模态）",
        summary: "多模态对话（OpenAI 兼容，支持图片输入）。",
        request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/chat/completions \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "这张图里有什么？"},
          {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA..."}}
        ]
      }
    ]
  }'`,
        response: `{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "图中是..."},
      "finish_reason": "stop"
    }
  ],
  "model": "gpt-4o-mini"
}`,
        notes: [
            "图片可使用 data URL（Base64）。",
            "仅支持视觉/多模态的模型可用传图片参数调用该接口。",
        ],
    },
    {
        title: "POST /v1/embeddings",
        summary: "文本向量（OpenAI 兼容请求体）。",
        request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/embeddings \\
  -d '{
    "model": "text-embedding-3-large",
    "input": "hello world"
  }'`,
        response: `{
  "object": "list",
  "data": [
    {"object": "embedding", "index": 0, "embedding": [0.01, 0.02]}
  ],
  "model": "text-embedding-3-large"
}`,
        notes: [
            "input 支持字符串或数组。",
            "网关会将 model 名称映射到后端实际模型。",
        ],
    },
    {
        title: "POST /v1/audio/transcriptions",
        summary: "音频转写（multipart/form-data 文件上传）。",
        request: `curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  https://{HOST}/v1/audio/transcriptions \
  -F 'file=@/path/to/audio.wav' \
  -F 'model=whisper-1'`,
        response: `{
  "text": "hello world"
}`,
        notes: [
            "file 必须作为真实文件上传，不要写成带额外引号的 @ 路径。",
            "model 传网关暴露的模型名，网关会映射到后端实际模型。",
        ],
    },
    {
        title: "POST /v1/audio/speech",
        summary: "文本转语音（返回音频二进制）。",
        request: `curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  https://{HOST}/v1/audio/speech \
  -d '{
    "model": "tts-1",
    "input": "你好，欢迎使用网关服务。",
    "voice": "alloy",
    "response_format": "mp3"
  }' \
  --output speech.mp3`,
        response: `Binary audio stream (for example: audio/mpeg)`,
        notes: [
            "该接口返回音频二进制，不是 JSON。",
            "可用字段与后端 TTS 模型能力保持一致，常见字段包括 input、voice、response_format。",
        ],
    },
    {
        title: "POST /v1/rerank",
        summary: "相关性重排（Rerank 请求体）。",
        request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/rerank \\
  -d '{
    "model": "rerank-multilingual-v3.0",
    "query": "how to reset password",
    "documents": [
      "Reset your password in settings",
      "Pricing and billing guide"
    ],
    "top_n": 2
  }'`,
        response: `{
  "results": [
    {"index": 0, "relevance_score": 0.92},
    {"index": 1, "relevance_score": 0.12}
  ],
  "model": "rerank-multilingual-v3.0"
}`,
        notes: [
            "documents 通常为字符串数组（部分后端也接受对象数组）。",
            "返回 results 按相关性排序。",
        ],
    },
    {
        title: "POST /v1/messages",
        summary: "Claude Messages 兼容接口（自动转 OpenAI 再返回 Claude 结构）。",
        request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/messages \\
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 256,
    "thinking": {
      "type": "enabled"
    },
    "messages": [
      {"role": "user", "content": "Hello from Claude format"}
    ]
  }'`,
        response: `{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello!"}],
  "model": "claude-3-5-sonnet"
}`,
        notes: [
            "支持 stream，返回 SSE（text/event-stream）。",
            "metadata 字段会被忽略。",
        ],
    },
];

export const groupedApiDocs = API_DOC_GROUP_ORDER.map((label) => ({
    label,
    docs: apiDocs.filter((doc) => getApiDocGroupLabel(doc.title) === label),
})).filter((group) => group.docs.length > 0);
