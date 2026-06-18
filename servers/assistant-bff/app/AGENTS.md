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
- **MinIO endpoint 故障切换**：`MINIO_ENDPOINT` 支持配置单个地址，或用英文逗号/分号分隔多个 `host:port`；对象存储层会优先复用当前活跃 endpoint，失败时按配置顺序切换到下一个可用 endpoint。
- **统一智能体主表**：新版本已切换到 `agents` 作为统一智能体主表，承载系统智能体与普通自定义智能体；旧 `custom_gpts` 仅保留给未升级节点兼容读取，新代码不再向其中写入。
- **制度助手执行器**：数据库仅保存可序列化的 `handler_key=kernel_regulation`；后端聊天路由通过执行器 registry 将其解析为 `chat_with_kernel_regulation`，不从数据库保存或读取 Python 函数。
- **制度目录一致性**：`document_catalog.json` 可保留人工维护的目录描述，但制度助手读取目录时会用当前 `file_mapping` 中的 `assistant_knowledge` 文件校准条目，移除已删除文件并补入新增文件，确保后续正文读取使用真实文件名。
- **统一模型配置语义**：`admin_model_configs` 是全局模型目录的权威来源，未登记或已禁用的模型不会进入任何智能体的模型清单；各智能体再通过自身配置中的 `visible_model_ids` 与 `default_model` 控制实际可见范围和默认模型，`gptassistant` 不再依赖后台 feature flag 保存这些默认值。
- **智能体入口可见性**：`gpts_feature_enabled` 只控制 GPTs 总开关；“更多智能体”入口对谁可见由管理员配置中的 `gpts_visible_scope` 与 `gpts_visible_users` 决定。运行时优先读取 DB 配置，未配置时才兼容回退到 `GPTS_WHITE_LIST`。
- **系统助手同步**：启动初始化从纯内置注册表识别系统助手并补种到 `agents`；已有记录仅同步 `assistant_kind` 与 `handler_key` 执行身份，不覆盖数据库中的名称、提示词、默认模型、可见模型或 ACL 等可编辑配置。
- **智能体编辑语义**：`PUT /api/gpts/{gid}` 按合并更新处理，保留编辑页未提交的现有字段；系统助手的 `gid`、`assistant_kind`、`handler_key` 与 `required_pinned` 属于受保护字段，编辑名称、提示词或默认模型时不能被覆盖或清空。
- **制度知识入库**：启动初始化会把 `FILE_BASE/regulationassistant` 下的知识文件幂等迁移到当前对象存储后端，并写入 `file_mapping`，以 `purpose=assistant_knowledge` 标识；制度工具优先从这类 DB 映射读取目录和正文，目录缺失时会从映射集合合成一个兼容目录。
- **智能体 ACL**：`agents.config` 承载 `owner`、`admins`、`viewers`，其中 `owner` 是唯一可转让所有者，`admins` 可编辑并管理知识文件，`viewers` 仅可见。系统内置 `regulationassistant` 与 `gptassistant` 在启动时会从 `GPTS_WHITE_LIST` 派生默认所有者和管理员列表；编辑页允许当前所有者转让 owner，并维护管理员/可见用户名单。
- **旧表迁移策略**：启动时会将旧 `custom_gpts` 中尚未存在于 `agents` 的记录补迁到 `agents`，但不会反向覆盖 `agents` 中已存在的新配置，保证滚动升级期间旧节点继续读旧表、新节点只读新表。
- **主助手迁移**：`gptassistant` 现在和制度助手、普通自定义智能体共用“我的智能体”编辑入口；管理员在该页维护主助手的提示词、默认模型、可见模型和知识文件，后台“主助手默认配置”仅保留迁移提示，不再作为实际配置源。
