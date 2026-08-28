# Backend Architectural Notes (BFF)

## 1. 核心对话流 (Core Chat Flow)
项目采用了 `chat_with_kernel_gptassistant` 作为主导的编排逻辑，其核心流程如下：

### Agent Runtime v3（新建智能体默认执行器）
- `app/agent_runtime_v3` 已提供独立的通用同步运行循环，负责模型流调用、能力执行结果回填、最大步骤限制及完成/失败状态收敛。
- Runtime 只产生与传输无关的 `RuntimeEvent`；SSE、WebSocket 或其他输出格式应通过 `RuntimeEventAdapter` 转换，不得写入核心循环。
- 模型流与能力执行器通过 `ModelStreamer`、`CapabilityExecutor` 注入；`CapabilityRegistry` 负责 Tool 的注册、启停和按 Agent 能力 ID 选择，`ToolExecutor` 负责本轮 schema 校验、Registry 查找、执行及 `ToolResultMessage` 归一化。
- Capability 使用稳定的 `capability_id` 供 Agent 配置引用，模型仍使用 `ToolDefinition.name` 发起调用；Registry 同时保证两种标识唯一，避免配置标识与模型协议耦合。
- `agent_runtime_v3/builtin_tools` 已将附件工具和制度工具注册到同一 Registry。附件适配器从 `ExecutionContext.metadata.available_file_ids` 获取本轮文件授权边界；制度工具的定义和领域执行逻辑已从聊天服务抽到 `app/regulation_tools.py`，旧制度引擎与 v3 共用该实现。
- `ContextAssembler` 统一按“平台规则、Agent 指令、历史摘要、附件说明、知识说明”的顺序构建系统上下文，并组合历史、当前用户消息和按 capability ID 选择的 Tool 定义；装配结果可直接转换为 `RuntimeRequest`。
- Context Assembler 不读取数据库、不加载文件也不做身份授权；调用方必须传入已经授权的数据。`ResourceContext` 分别保存会话附件与 Agent 知识作用域，兼容字段 `available_file_ids` 只映射会话附件，禁止通过普通 metadata 覆盖资源授权边界。
- `AgentDefinition` 直接解析现有 `agents.config` JSON 中的 `enabled_capabilities`、`runtime_limits` 和 `context_policy`，缺失字段使用兼容默认值，不需要新增数据库列；创建和更新 Agent 时仅在提交这些 v3 字段后执行格式校验，非法配置返回 HTTP 400。
- `AgentDefinitionResolver` 对“Agent 已启用能力”与当前 `CapabilityAccessContext` 的权限和策略授权取交集，并记录被拒绝能力及原因。解析后的 Context Policy 会实际控制历史、摘要、附件和知识是否进入 Context，Runtime Limits 会直接进入 `RuntimeRequest`。
- v3 同步执行通过 `RunRecord -> RunStepRecord -> ActionCallRecord` 保存状态、输入参数、结果摘要、错误和耗时；默认使用有界 `InMemoryRunStore`，容量满时只淘汰最早的终态 Run，不删除运行中记录。Store 返回深拷贝快照，调用方不能修改内部状态。
- `RuntimeEventStream.cancel()` 会取消后台驱动任务并把 Run 标记为 `cancelled`；重复 `run_id` 会拒绝新执行且不覆盖原记录。`RunTracker` 可挂载日志、组合 Observer 或 `TraceRunObserver`，观测事件不记录 Action 参数，且观测失败不能中断 Runtime。
- v3 能力治理采用解析与执行双重授权：Agent Resolver 先按配置、权限和策略筛选，ToolExecutor 再使用受控 metadata 复核；Tool schema 校验、每能力超时、Run 最大调用次数和硬上限均在后端执行，不能由模型绕过。
- `CapabilityDescriptor.risk` 为 `write` 或 `high`（或显式 `requires_confirmation`）时，ToolExecutor 要求与 capability ID 及规范化参数绑定的 SHA-256 确认指纹；未确认时返回结构化 `CONFIRMATION_REQUIRED`，不会执行处理器。确认结果的前端展示和安全重试仍属于待完成产品链路。
- Tool 和 Run 失败统一携带稳定错误码、用户安全消息和 `retryable`；原始处理器异常不会返回模型或前端。Action 参数仅保留在有界内存 Run Store，不进入日志 Observer。
- `GET /api/gpts/capabilities` 提供允许页面配置的能力目录；新建 Agent 强制写入 `handler_key=agent_runtime_v3` 及安全默认配置，已有 Agent 和系统助手不自动迁移。聊天路由按 handler 分派到 `agent_runtime_v3_service.py`，继续使用现有结构化流式协议。
- v3 为会话附件提供 `document_list/document_read_text`，为智能体知识提供独立 `knowledge_list/knowledge_read_text`；两类文件 ID 和授权策略分离。v3 历史键为 `agent_runtime_v3:{gid}:{conversation_id}`，不同 Agent 不共享历史。
- 高风险确认令牌使用 `AGENT_CONFIRMATION_SECRET`；多节点部署必须配置相同值。未配置时回退到 `SESSION_HISTORY_ENCRYPTION_KEY`，本地两者均为空时仅使用进程级临时密钥。

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
- **附件与文件路由依赖约束**：`app.attachments.*` 允许复用 `app.routes.file_routes` 的文件能力，但应通过运行时/惰性导入访问，避免在模块初始化阶段与 `chat_routes`、`chat_kernel_service`、`file_routes` 形成循环导入。
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

### 2.3 共享登录 returnTo 回跳契约 (SSO returnTo)
多个同域部署的前端子应用（assistant-web、developer-portal 及后续接入者）共用本服务的 SSO 登录态（同域 HttpOnly Cookie + `/api/auth/*`），“登录后回到登录前页面”统一按以下契约实现，新子应用接入只做两件事，不得各自发明机制：
- **前端跳转**：登录失效时跳 `/api/auth/oauth-login/{provider}?returnTo=<encodeURIComponent(pathname+search+hash)>`，`returnTo` 只允许站内相对路径，禁止拼完整 URL。各子应用统一使用同款 helper `src/helpers/loginRedirect.ts`（`buildReturnTo`/`markLoginRetry`/`consumeLoginRetry`/`redirectToLoginIfPossible`）。**401 拦截禁止再写 `window.location.href = '/'` 之类丢路径的跳转**，必须走 `redirectToLoginIfPossible()`。
- **后端回跳**：登录服务用 `_safe_return_to`（`app/auth/auth_routes.py`）校验 returnTo（以 `/` 开头、非 `//`、无反斜杠、无 scheme/netloc，允许 query/fragment），校验通过后在登录流程结束后 302 回该相对路径；非法或缺失不重定向。仓库内 `oauth-login` 为 mock 实现（会用 Referer origin 拼绝对地址以兼容前后端不同端口的本地开发），内网真实 OAuth 实现须在 callback 末尾做同样校验与回跳，且不要使用 Referer 构造跳转目标。
- **前端无需恢复逻辑**：浏览器被 302 回原 URL 后 SPA 原地重新引导即可。
- **死循环保护**：跳转前写一次性 sessionStorage 标记 `sso.loginRetry`（读即删）；重新挂载仍未登录且标记存在 → 展示“无权限”不再跳转；登录成功（`/api/auth/status` ok）即清除标记。

## 3. 存储语义
- **存储模块分层**：`app/storage/business_store.py` 继续作为兼容聚合入口与底层初始化/连接层；GPT/Pin 状态逻辑已拆到 `app/storage/gpts_store.py`，文件映射与上传预留逻辑拆到 `app/storage/file_store.py`，管理员模型/权限/开关/审计逻辑拆到 `app/storage/admin_store.py`。新增同类能力时优先写入对应分层模块，而不是继续回填到 `business_store.py`。
- **普通附件 (Session Attachment)**：属于特定会话，随会话生命周期管理（默认 7 天过期）。
- **知识文件 (Assistant Knowledge)**：属于智能体资产，仅随智能体手动删除时清理。
- **资料库文件 (Library File)**：属于当前用户的个人资料库，独立于会话附件与智能体知识文件；MVP 阶段直接复用 `file_mapping` 与对象存储，以 `purpose=library_file` 区分。
- **个人文件保留策略**：当前产品语义下，个人上传文件（含历史会话上传附件）不做自动过期清理；文件保留框架仍在代码中，但默认停用，只允许用户手动删除。
- **内容去重**：上传时基于 SHA-256 进行内容寻址，同一用户重复上传相同内容仅增加引用，不重复占用存储空间。
- **MinIO endpoint 故障切换**：`MINIO_ENDPOINT` 支持配置单个地址，或用英文逗号/分号分隔多个 `host:port`；对象存储层会优先复用当前活跃 endpoint，失败时按配置顺序切换到下一个可用 endpoint。
- **统一智能体主表**：新版本已切换到 `agents` 作为统一智能体主表，承载系统智能体与普通自定义智能体；旧 `custom_gpts` 仅保留给未升级节点兼容读取，新代码不再向其中写入。
- **制度助手执行器**：数据库仅保存可序列化的 `handler_key=kernel_regulation`；后端聊天路由通过执行器 registry 将其解析为 `chat_with_kernel_regulation`，不从数据库保存或读取 Python 函数。
- **制度目录一致性**：`document_catalog.json` 可保留人工维护的目录描述，但制度助手读取目录时会用当前 `file_mapping` 中的 `assistant_knowledge` 文件校准条目，移除已删除文件并补入新增文件，确保后续正文读取使用真实文件名。
- **统一模型配置语义**：`admin_model_configs` 是全局模型目录的权威来源，未登记或已禁用的模型不会进入任何智能体的模型清单；各智能体再通过自身配置中的 `visible_model_ids` 与 `default_model` 控制实际可见范围和默认模型，`gptassistant` 不再依赖后台 feature flag 保存这些默认值。
- **上传策略归属**：聊天附件允许上传的类型由智能体配置 `upload_file_types` 决定，属于智能体交互策略；后台模型配置不再作为上传类型策略源。
- **图片能力归属**：模型是否支持原生图片输入继续由 `supports_native_image_input` 表达；支持时直接把图片作为 `ImageContent` 送入模型，不支持时通过附件读取工具或 OCR/VL 提取结果回退到文本链路。
- **智能体入口可见性**：`gpts_feature_enabled` 只控制 GPTs 总开关；“更多智能体”入口对谁可见由管理员配置中的 `gpts_visible_scope` 与 `gpts_visible_users` 决定。运行时优先读取 DB 配置，未配置时才兼容回退到 `GPTS_WHITE_LIST`。
- **智能体菜单语义**：智能体是否对某个用户可访问统一由当前 GPT 配置（`auth` + ACL + provider scope）决定。左侧菜单 `/api/gpts/pined` 在有 GPTS 入口权限时展示“当前可见且未被该用户显式取消 pin 的智能体”，在无 GPTS 入口权限时展示“当前全部可见智能体”；历史 pin 状态不会在入口权限被收回后继续隐藏智能体。
- **Pin 状态模型**：`user_gpts_state` 保存用户对智能体菜单的显式 pin 覆盖，新增 `is_pinned` 字段后语义为“无记录 = 默认 pin；有记录且 `is_pinned=false` = 用户显式取消；有记录且 `is_pinned=true` = 用户显式恢复/调整顺序”。不要再通过 `required_pinned` 或启动时强制补 pin 来实现制度助手之类的固定入口。
- **版本提醒状态**：`user_release_notice_state` 按 `(user_id, release_id)` 保存版本公告最高已读阶段 `seen_stage`（1=账号菜单、2=版本入口、3=具体条目）。`PATCH /api/release-notices/{release_id}` 只允许阶段单调前进；该表与智能体 pin 一样支持 SQLite/Postgres 和本地 SQLite 到 Postgres 迁移，但两类业务状态不得混表。
- **资料库入口可见性**：个人资料库入口使用独立的 `library_feature_enabled`、`library_visible_scope`、`library_visible_users` 配置；不要复用 GPTs 白名单语义。
- **可见性策略抽象**：GPTs 与资料库入口这类“开关 + scope + users (+ fallback)”规则，统一收敛到 `app/admin/visibility_policy.py`，新增同类型入口时优先复用，不要在路由里重复手写。
- **智能办公接入门控**：智能办公工作区内部沿用 `external_assistant_*` 命名，使用独立的 `external_assistant_feature_enabled`、`external_assistant_visible_scope`、`external_assistant_visible_users`，不得复用 GPTs 或资料库名单。`GET /api/external-assistant/permission` 只返回当前用户是否可见；`GET /api/external-assistant/bootstrap` 再对获准用户返回标题、菜单和安全规范化后的 iframe 地址。默认关闭且空名单，非法 URL scheme 会被丢弃。
- **智能办公菜单配置**：复用 `admin_feature_flags`，无需新增表。`external_assistant_base_url` 保存同源基础路径（推荐 `/b/`）或 https 地址；`external_assistant_menus` 保存 `{id,label,path}` JSON 数组。`path` 必须相对基础路径，后端拒绝协议、跨域、反斜杠和路径回退，并在 bootstrap 时拼成 iframe URL；管理后台保存后，用户刷新智能办公页面即可生效。每项还可选填 `icon`，取 heroicons（24/outline）官方 kebab-case 图标名（参考 heroicons.com/icons，如 `squares-2x2`）；非法或缺失时后端丢弃该字段、前端回退默认 BeakerIcon，不影响菜单本身。
- **系统助手同步**：启动初始化从纯内置注册表识别系统助手并补种到 `agents`；已有记录仅同步 `assistant_kind` 与 `handler_key` 执行身份，不覆盖数据库中的名称、提示词、默认模型、可见模型或 ACL 等可编辑配置。
- **智能体编辑语义**：`PUT /api/gpts/{gid}` 按合并更新处理，保留编辑页未提交的现有字段；系统助手的 `gid`、`assistant_kind` 与 `handler_key` 属于受保护字段，编辑名称、提示词或默认模型时不能被覆盖或清空。
- **制度知识入库**：启动初始化会把 `FILE_BASE/regulationassistant` 下的知识文件幂等迁移到当前对象存储后端，并写入 `file_mapping`，以 `purpose=assistant_knowledge` 标识；制度工具优先从这类 DB 映射读取目录和正文，目录缺失时会从映射集合合成一个兼容目录。该迁移通过 `startup_task_state` 按 `(SQLITE_MIGRATION_NODE_ID, regulation_knowledge_seed_sync:v1)` 记录节点级完成状态，已完成节点后续升级启动会直接跳过本地目录扫描；需要人工重跑时设置 `FORCE_REGULATION_KNOWLEDGE_SEED_SYNC=true`。
- **智能体 ACL**：`agents.config` 承载 `owner`、`admins`、`viewers`，其中 `owner` 是唯一可转让所有者，`admins` 可编辑并管理知识文件，`viewers` 仅可见。系统内置 `regulationassistant` 与 `gptassistant` 在启动时会从 `GPTS_WHITE_LIST` 派生默认所有者和管理员列表；编辑页允许当前所有者转让 owner，并维护管理员/可见用户名单。
- **新建智能体默认可见性**：`POST /api/gpts` 与 `PUT /api/gpts/{gid}` 在请求未显式提供 `auth` 时默认回落到 `auth.type=self`，避免新建智能体因前端漏传而变成全员可见。
- **LLM Platform API Key 边界**：`app/routes/platform_routes.py` 是登录用户到
  model-api portal-backend 的自助访问边界。API Key 创建必须携带个人/项目归属和
  Space 上下文；页面未提交 `spaceId` 时只能回落到 portal 有效服务接口明确标记的
  默认 Space。BFF 校验本人或项目 Owner 权限，并只允许选择有效可用 Space；Key
  数量上限按“归属主体 + Space”独立计算，缺少 `space_id` 的历史 Key 计入默认
  Space；禁用 Key 仍占额度，只有吊销后才释放名额。Key
  汇总不得返回主体已失去 Space 资格的 Key。Key 的启停、备注和吊销也必须在代理前重新校验所有权，不能
  因为 BFF 使用平台级 `PLATFORM_PORTAL_TOKEN` 就直接透传任意 token 修改。
- **旧表迁移策略**：启动时会将旧 `custom_gpts` 中尚未存在于 `agents` 的记录补迁到 `agents`，但不会反向覆盖 `agents` 中已存在的新配置，保证滚动升级期间旧节点继续读旧表、新节点只读新表。
- **主助手迁移**：`gptassistant` 现在和制度助手、普通自定义智能体共用“我的智能体”编辑入口；管理员在该页维护主助手的提示词、默认模型、可见模型和知识文件，后台“主助手默认配置”仅保留迁移提示，不再作为实际配置源。
- **智能体聊天引擎收敛**：用户创建的普通自定义智能体统一走 `chat_with_kernel_gptassistant`；仅少数历史内置且未声明 owner 的助手继续保留旧 `chat_service` 分支兼容。
