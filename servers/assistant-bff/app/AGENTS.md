# Backend Architectural Notes (BFF)

## 1. 核心对话流 (Core Chat Flow)
项目采用了 `chat_with_kernel_gptassistant` 作为主导的编排逻辑，其核心流程如下：

### 1.1 执行序列
1. **加载与裁剪历史**：从数据库读取会话历史，执行裁剪逻辑以适配模型窗口。
2. **构建用户消息**：
   - 注入附件清单（Manifest）和工具引导。
   - 对于支持原生视觉的模型，直接附加图片；否则通过 VL 提取路径处理。
3. **流式循环 (Turn Loop)**：
   - 构建 `Context`（包含 System Prompt、当前消息、工具定义）。
   - 调用 `llm_kernel.stream` 获取流式响应。
   - 处理文本、思考过程（Thinking）和工具调用（Tool Call）事件。
4. **工具执行与回退**：
   - 若模型调用了附件工具（如 `document_read_text`），执行工具并将其结果追加到 `current_messages`。
   - 重新进入流式循环，直到模型给出最终答复。
5. **保存与结算**：持久化会话并更新用量统计。

### 1.2 关键模块
- **编排层**：`servers/assistant-bff/app/chat_kernel_service.py`
- **附件预处理**：`servers/assistant-bff/app/attachments/service.py`
- **附件工具集**：`servers/assistant-bff/app/attachments/tools.py`
- **内核网关**：`servers/assistant-bff/app/llm_kernel/providers/openai_compat.py`

## 2. 安全与隔离策略 (Security & Isolation)

### 2.1 登录端隔离 (Provider Isolation)
系统引入了“登录端（Auth Provider）”语义，以确保数据安全和合规：
- **默认隔离**：用户在 A 端上传的文件、创建的助手和产生的会话，在 B 端默认不可见。
- **作用域字段**：
  - `provider_scope = provider`：仅当前端可见（默认）。
  - `provider_scope = global`：审核通过的全局资源，跨端可见。
- **校验边界**：权限校验覆盖了上传、下载、列表、文本提取、工具读取等所有文件访问路径。

### 2.2 系统加固与预算控制 (Hardening & Budgets)
为了保证大模型请求的稳定性，系统实施了多层预算限制：
- **错误映射**：建立了一套标准的业务错误码（如 `CONTEXT_TOO_LONG`, `FILE_PARSE_FAILED`），不再向终端用户透传 Provider 原始报错。
- **文件预算**：
  - 限制单文件上传字节数及单次请求累计文件数。
  - **文档提取限制**：默认注入最大字符数为 100,000。
  - **图片限制**：限制分辨率与体积。
- **历史压缩**：
  - **V1 (裁剪)**：保留最近 N 轮对话。
  - **V2 (摘要)**：为超出窗口的旧历史生成摘要，保留核心目标与结论。
- **并发保护**：在上传和解析入口增加了并发数和超时（60s）限制。

## 3. 存储语义
- **普通附件 (Session Attachment)**：属于特定会话，随会话生命周期管理（默认 7 天过期）。
- **知识文件 (Assistant Knowledge)**：属于智能体资产，仅随智能体手动删除时清理。
- **内容去重**：上传时基于 SHA-256 进行内容寻址，同一用户重复上传相同内容仅增加引用，不重复占用存储空间。
