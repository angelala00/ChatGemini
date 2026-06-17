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

## AssistAI 原型模板 (assistai-ui)

- **目录位置**：`apps/assistant-web/template/assistai-ui/`
- **当前结构**：
  - `assistai-ui.css`：四个原型页面共享的样式定义。
  - `assistai-ui.js`：共享的页面骨架、演示数据和交互逻辑。
  - `index.html`、`library.html`、`gpts.html`、`policy.html`：仅保留页面入口配置，通过 `body data-*` 声明初始视图和初始助手。
- **维护约束**：
  - 公共布局、交互、文案数据优先修改共享文件，不要再把整套内联 `style` 或 `script` 复制回单页。
  - 新增原型页面时，优先复用 `assistai-ui.js` 的初始化模式，只增加轻量入口页或扩展共享配置。
