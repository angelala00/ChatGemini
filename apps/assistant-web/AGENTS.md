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
  - `js/*-workspace.js`：各功能工作空间的渲染逻辑（gpts、library、automation、explore）。
  - `*.html`：6 个物理入口文件，仅包含最小的 HTML 骨架、Tailwind Play CDN 引入、以及最小化 `<style>` 标签（声明 CSS 主题变量、系统重置和自定义滚动条，不含组件外观样式）。
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
