# GPT Assistant Hardening Checklist

目标：先把 `gptassistant` 从“全文直接拼上下文、错误直接透传”的状态，提升到“有预算控制、有错误兜底、有基础历史压缩”的稳定版本。

范围：本清单先不做文件 `chunk + retrieval`。先完成以下 3 类能力：
- 预算控制
- 错误兜底
- 历史压缩

## Phase 1: 错误兜底

- [x] 定义统一业务错误码。
  - 建议至少包含：
  - `CONTEXT_TOO_LONG`
  - `FILE_TOO_LARGE`
  - `FILE_CONTENT_TOO_LONG`
  - `IMAGE_TOO_LARGE`
  - `TOO_MANY_FILES`
  - `FILE_PARSE_FAILED`
  - `MODEL_REQUEST_FAILED`
- [x] 明确错误码到用户提示文案的映射。
- [x] 后端流式错误不要直接透传 provider 原始报错。
- [x] 识别并拦截“上下文超长 / token 超限 / context length exceeded”类异常，统一映射到 `CONTEXT_TOO_LONG`。
- [x] 识别文件解析失败并统一映射到 `FILE_PARSE_FAILED`。
- [x] 确保错误发生后会话状态不损坏，用户仍可继续提问。
- [x] 前端只显示业务提示，不显示底层模型服务原始错误。

涉及位置：
- `servers/assistant-bff/app/chat_with_model.py`
- `servers/assistant-bff/app/routes/chat_routes.py`
- `apps/assistant-web/src/helpers/chatWithAI.tsx`
- 可能需要新增统一错误映射模块

## Phase 2: 文件预算控制

- [x] 为上传阶段增加文件大小上限校验。
- [x] 为图片增加尺寸/数量/体积上限校验。
- [x] 为文档抽取结果增加最大字符数限制。
- [x] 给 `extract_text_from_file_ids(...)` 接入实际生效的 `max_chars`，不要再默认全文注入。
- [x] 单文件超限时返回 `FILE_CONTENT_TOO_LONG`，而不是继续请求模型。
- [x] 多文件累计文本超限时返回 `TOO_MANY_FILES` 或 `FILE_CONTENT_TOO_LONG`。
- [x] 抽取结果被截断时记录日志，便于后续调优。
- [x] 明确各模型预算配置，至少支持按模型区分字符预算。

建议第一版先用字符预算，不强依赖 token 预算。

建议配置项：
- [x] 单文件上传最大字节数
- [x] 单文件抽取最大字符数
- [x] 单次请求文件累计最大字符数
- [x] 单次上传最大文件数
- [x] 单图最大字节数
- [x] 单图最大分辨率

涉及位置：
- `servers/assistant-bff/app/routes/file_routes.py`
- `servers/assistant-bff/app/utils/extract_text.py`
- `servers/assistant-bff/app/chat_service.py`
- `servers/assistant-bff/app/gpts/model_registry.py` 或独立预算配置模块

## Phase 3: 总请求预算控制

- [x] 在真正调用模型前，统一计算本轮请求体积。
- [x] 预算至少覆盖：
  - 当前用户问题
  - 文件抽取文本
  - 历史对话
  - system prompt
- [x] 超出预算时优先拒绝，不要等 provider 返回超长错误。
- [x] 日志中记录超限来源：
  - 文件过长
  - 历史过长
  - 两者叠加
- [x] 为后续演进预留“字符预算升级为 token 预算”的接口。

涉及位置：
- `servers/assistant-bff/app/chat_service.py`
- `servers/assistant-bff/app/chat_with_model.py`

## Phase 4: 历史压缩 v1

- [x] 在会话发送前引入历史裁剪逻辑。
- [x] 第一版先保留最近 N 轮对话，不做摘要。
- [x] 确定 N 的策略：
  - 固定轮数
  - 或固定最大字符数
- [x] 被裁掉的历史要有日志记录。
- [x] 避免 system prompt 被裁掉。
- [x] 避免当前轮用户消息被裁掉。
- [x] 与文件注入预算叠加时，优先保留最近轮次。

建议第一版：
- 保留最近 6 到 10 轮
- 或保留最近一段固定字符窗口

涉及位置：
- `servers/assistant-bff/app/chat_with_model.py`
- `servers/assistant-bff/app/chat_service.py`
- `servers/assistant-bff/app/chat_base.py`

## Phase 5: 历史压缩 v2

- [x] 为旧历史生成摘要，而不是直接丢弃。
- [x] 形成“历史摘要 + 最近几轮原文”的结构。
- [x] 摘要更新时保留关键信息：
  - 用户目标
  - 已完成事项
  - 未完成事项
  - 关键结论
  - 文件相关结论
- [x] 评估摘要存储位置：
  - 内存态
  - 会话历史内单独消息
  - 持久化字段

注意：这一阶段比 v1 明显更重，不作为第一批必须项。

## 建议实施顺序

- [x] 1. 统一错误码和前端提示
- [x] 2. 单文件/图片上传预算控制
- [x] 3. 文件抽取字符预算控制
- [x] 4. 总请求预算检查
- [x] 5. 历史压缩 v1
- [x] 6. 历史压缩 v2

## 完成标准

- [x] 上传超大文件时，前端不再看到 provider 原始报错
- [x] 文件内容超长时，请求在后端提前被拦截
- [x] 多轮对话很长时，不再轻易因历史膨胀导致请求失败
- [x] 错误发生后，用户仍可继续当前会话
- [x] 核心预算和错误分支有基础日志，便于排查

## 暂不纳入本轮

- [ ] 文件 `chunk + retrieval`
- [ ] 文件结构摘要卡片
- [ ] 多阶段文档 agent
- [ ] 向量库或 embedding 检索

这些属于下一阶段，把当前系统先做稳之后再进入。
