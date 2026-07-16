# Frontend Architectural Notes

## 流式会话内存治理 (Streaming Memory Management)

为了防止 AI 长回复时由于高频状态更新导致页面卡顿或内存溢出，本项目在 `apps/assistant-web` 中实现了以下优化：

### 1. 状态更新节流 (Throttling)
- **实现位置**：`apps/assistant-web/src/App.tsx` 中的 `scheduleSessionDispatch` 和 `flushSessionDispatch` 函数。
- **逻辑**：
    - 流式输出期间，新的内容先累积在局部变量 `_sessions` 中。
    - 使用 `STREAM_SESSION_DISPATCH_INTERVAL_MS` (80ms) 作为最小更新间隔。
    - 只有当距离上次分发超过 80ms 时，才会通过 `dispatch(updateSessions(...))` 触发 Redux 更新和 React 重渲染。
    - 对话结束时，强制调用 `flushSessionDispatch` 确保最终内容完整落库。

### 2. 附件状态轻量化
- **存储策略**：会话历史和附件状态仅保留 `fileId`、文件名、`mimeType` 等元信息。
- **内容分离**：不再在 Redux 状态或本地存储中长期持有文件正文或 Base64 编码，以降低长会话时的内存占用。

### 3. 会话详情按需加载
- **逻辑**：会话列表只持有 `SessionSummary`（元数据），具体的聊天详情在用户点击特定会话时才从服务端或本地缓存加载，避免初始化时加载全量历史。

## 文档静态镜像 (Static Documentation Mirror)

- **目录位置**：`docs/assistant-web-static/`
- **用途**：提供 `assistant-web` 当前主要页面的静态 HTML 镜像，用于文档展示、视觉对照和离线评审。
- **覆盖范围**：包含首页、主聊天页、智能体首页/聊天页、智能体广场、我的智能体、创建/编辑智能体、Voice Lab、Trace Inspector，以及管理后台各主要标签页。
- **实现约束**：该镜像不依赖运行中的接口或前端构建产物，使用共享的 `styles.css` 和 `app.js` 在 `docs` 目录下独立浏览。

## AssistAI 原型模板 (assistai-ui) 与 React 映射及迁移规范

- **目录位置**：`apps/assistant-web/template/assistai-ui/`
- **当前结构 (已全面 Tailwind 化)**：
  - `js/assistai-data.js`：集中维护原型所需的 mock 数据。
  - `js/assistai-ui.js`：共享的页面骨架、主交互逻辑和消息模板（已全部重构为 Tailwind 实用类）。
  - `js/*-workspace.js`：各功能工作空间的渲染逻辑（gpts、library、automation、explore、admin、voiceLab）。
  - `*.html`：8 个物理入口文件（包含新增的 admin.html 和 voice-lab.html），仅包含最小的 HTML 骨架、Tailwind Play CDN 引入、以及最小化 `<style>` 标签（声明 CSS 主题变量、系统重置和自定义滚动条，不含组件外观样式）。
- **两边架构与布局对应关系**：
  - **组件外壳映射**：原型中的 `js/assistai-ui.js` 骨架 ➔ React 的 `Sidebar.tsx` + `Topbar.tsx` 组件。
  - **视图空间映射**：原型的各个 `js/*-workspace.js` ➔ React `src/views/` 对应的独立视图页面（如 `gpts-workspace.js` ➔ `src/views/Gpts.tsx`）。
  - **布局层级网格**：两边均采用相同的栅格布局（左侧 `sidebar` 272px，右侧 `main-layout` 三行自适应栅格），断点行为（`max-[900px]:`）高度一致。
- **两边样式迁移的注意力点 (Tailwind 变量前缀差异)**：
  - **原型命名空间**：使用无前缀的主题色变量，如 `text-[var(--text)]`、`bg-[var(--bg)]`、`border-[var(--line)]`。
  - **React 命名空间**：为了防冲突，使用 `--assist-` 前缀，如 `text-[var(--assist-text)]`、`bg-[var(--assist-bg)]`、`border-[var(--assist-line)]`。
  - **转换规则**：在将样式/HTML 从原型复制进 React 时，**必须全局将 `(--` 替换为 `(--assist-`**，并将 `class` 换为 `className`，其余 Tailwind 实用类名完全通用。
- **同步与双向修改工作流 (Human-in-the-loop)**：
  - **先原型后 Web (推荐开发流程)**：新业务特性或视觉打磨优先在 HTML 原型中进行，确认表现完美、适配好 Tailwind 响应式后再迁移代码至 React，保持快速设计迭代。
  - **先 Web 后原型 (Bug 修复/样式微调)**：如果在 React 生产应用中修复了某个排版 Bug 或微调了阴影/圆角，**必须把对应的 Tailwind 更改同步修改回原型**，防止两端设计分叉。同步时注意将 `--assist-` 前缀改回原型无前缀格式。
  - **迁移确认约束**：任何往 React 的功能迁移（如未来要实现的“资料库”、“定时任务”），必须经过人为确认对齐元数据接口，且仅复制视图骨架和原子类，状态控制用 React State 重构。

## 管理员页 GPTs 可见性

- **入口位置**：`apps/assistant-web/src/views/AdminConfig.tsx` 的 GPTs 区块。
- **配置语义**：
  - `gpts_feature_enabled` 只表示智能体功能总开关。
  - “更多智能体”菜单对谁可见，由结构化的 GPTs 可见性表单维护，而不是依赖 `gpts.manage`。
- **交互约束**：管理员页应优先提供结构化表单来维护 GPTs 可见范围与人员列表，避免要求管理员直接编辑通用 feature flag JSON。

## 智能体菜单与 Pin 语义

- 左侧菜单数据源固定为 `GET /api/gpts/pined`，该接口返回“当前用户此刻应该在菜单中看到的智能体”。
- 当用户拥有“更多智能体”入口权限时，菜单展示“当前可见且未被该用户显式取消 pin 的智能体”；更多智能体页中的 pin/unpin 只影响菜单展示，不影响访问权限。
- 当用户没有“更多智能体”入口权限时，菜单直接展示全部当前可见智能体；此前在拥有入口权限时做过的 unpin 不应继续把智能体从菜单中隐藏。

## 智能体能力配置与 Runtime v3

- 创建/编辑页通过 `GET /api/gpts/capabilities` 加载平台允许配置的能力，并将勾选结果保存为 `enabled_capabilities`；页面不向普通用户暴露底层引擎版本。
- 创建智能体时权限默认值为 `auth.type=self`（仅自己可见）；只有用户主动切换后才会保存为部分人可见或所有人可见。
- 新创建的智能体由后端固定使用 `agent_runtime_v3`，已有智能体仍按其 `handler_key` 运行。未选择的能力不会进入模型工具列表。
- 当前页面可配置会话附件查看/读取和智能体知识查看/读取四个只读能力。知识与会话附件在后端使用独立工具和授权作用域。
- 流式客户端识别工具结果中的 `CONFIRMATION_REQUIRED`，向用户确认后通过 `confirmed_action_tokens` 重试；令牌由服务端签名并绑定用户及调用参数，客户端不得自行生成确认凭据。
- 智能体创建/编辑页中的 `upload_file_types` 表示该智能体聊天允许用户上传的附件类别（`document` / `image`），属于智能体产品策略，不再跟随后台模型配置。
- 模型是否支持原生图片输入仍由模型元数据 `supports_native_image_input` 控制；聊天页据此决定直接附加图片还是引导后端走附件读取 / OCR 回退链路。

## 资料库 (Library / File Center)

- **入口与路由管理**：
  - 路由地址为 `/library`，对应的懒加载组件为 `src/views/Library.tsx`，在 `src/config/router.tsx` 中注册。
  - 菜单入口显示和访问受鉴权控制，状态由 `App.tsx` 通过请求 `GET /api/library/permission` 获取（`libraryAllowed` 和 `libraryPermissionLoaded`），若未授权则从 `/library` 重定向回主页，同时隐藏 `Sidebar.tsx` 中的资料库菜单。
- **页面布局**：
  - 采用 `<Container>` 与 `<Topbar>` 组合，不渲染主对话的 `<Header>` 及底部的 `<InputArea>`。
  - 布局类在 `App.tsx` 中配置，如果是资料库页面，内容区高度为 `h-screen flex-1`。
- **主要功能与接口联调**：
  - **文件资料 Tab**：
    - 获取列表：`GET /api/library/files`（支持 `keyword` 搜索、`page` 分页和 `sort_by` 排序）。
    - 文件上传：`POST /api/library/files:upload`（使用 `FormData` 携带文件，成功后刷新列表）。
    - 文件下载：`GET /api/library/files/{file_id}/download`（通过生成临时的 `<a>` 标签并点击，依赖浏览器携带 Cookie 鉴权）。
    - 文件删除：`DELETE /api/library/files/{file_id}`（删除前使用 `sendUserConfirm` 工具进行弹窗二次确认，成功后重新拉取列表）。
    - 来源标签：根据文件的 `purpose` 字段，展示相应的徽章（`session_attachment` ➔ "会话上传"、`library_file` ➔ "资料库上传"、`assistant_knowledge` ➔ "智能体知识"）。
  - **知识库 Tab**：
    - 临时以静态 Mock 列表展示经 RAG 处理的知识库卡片（包含分块数、源文件数和索引状态等指标），契合整体 UI/UX。

## 智能办公工作区 (External Assistant Workspace)

- 智能办公是现有两栏壳中的第二种产品模式，不注册新的业务路由；模式使用当前 URL 的 `workspace=external` 查询参数表达，切回智能问答时保留原 pathname 和其他查询参数。
- 前端登录后请求 `GET /api/external-assistant/permission`。未获准用户不显示产品切换 Tab、不挂载外部侧栏或 iframe，并会清理手工添加的外部模式查询参数。
- 获准用户首次进入时请求 `GET /api/external-assistant/bootstrap`，使用返回的标题、菜单和 iframe 地址渲染外部工作区。地址为空时显示待接入占位页，加载失败时提供重试。
- 原生工作区与已打开的外部工作区通过 CSS 显隐切换而不是销毁，保证切回后保留原页面、输入和会话状态；外部工作区未被打开前不创建 iframe。
- 产品切换器由宿主页面控制，并同时存在于原生和外部侧栏顶部，不能下沉进 iframe，确保外部页面异常时用户仍可切回。
- 产品切换器面向用户固定显示为“智能问答 / 智能办公”；产品品牌标题与外部 bootstrap 返回的页面标题不参与 Tab 命名。
- 智能办公顶栏只保留页面标题和必要的侧栏展开入口，不展示宿主级重新加载按钮或白名单试用标签；bootstrap 加载失败页保留重试能力。
- 智能办公菜单由 bootstrap 返回的 `{id,label,url}` 列表驱动；后端从产品配置中的 `external_assistant_base_url`（推荐 `/b/`）和相对 `path` 菜单配置安全拼接 URL。菜单更新后需要刷新当前页面以重新拉取 bootstrap。
