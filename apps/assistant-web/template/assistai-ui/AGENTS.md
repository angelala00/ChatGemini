# AssistAI 原型架构与模块规范 (Scoped AGENTS.md)

本目录（`apps/assistant-web/template/assistai-ui`）是 **AssistAI 企业员工助手**的静态原型演示。采用模块化与页面隔离架构，以便后续向 React/TypeScript 应用进行高保真迁移。

---

## 1. 核心设计原则

1. **按页面与工作空间物理隔离**：除基础对话主航道外，所有高频业务工作空间（智能体广场、资料库等）的 CSS 与 JS 渲染代码全部拆分为独立文件。
2. **零容错启动机制**：核心控制器对各工作空间脚本执行安全可选渲染（Optional Chaining），即使某一页面选择性不加载特定工作空间脚本，也绝对不会发生 JavaScript 阻塞或崩毁。
3. **HTML URL 控制页面视图**：通过在各自 HTML 文件的 `body` 上挂载 `data-initial-view` 与 `data-initial-assistant` 属性，无需复杂的前端 Router 框架即可实现清爽的页面状态流转。

---

## 2. 模块与文件映射表

下表详列了原型中每个业务功能所包含的具体文件，帮助你一眼看清逻辑对应关系：

| 模块名称 | HTML 页面 (视图入口) | 专职 CSS 样式 | 专职 JS 逻辑 (DOM 渲染) | 模块职责与核心逻辑 |
| :--- | :--- | :--- | :--- | :--- |
| **公共基础 & 外壳** | — | `css/assistai-base.css`<br>`css/assistai-sidebar.css`<br>`css/assistai-chat.css` | `js/assistai-data.js`<br>`js/assistai-ui.js` | **数据与控制中枢**：定义配色、布局网格；统一侧边栏；承载全局 Mock 数据仓库；控制视图切换和输入框自适应。 |
| **AI 对话主航道** | `index.html` | *(仅加载公共样式)* | *(仅加载公共 JS)* | **主聊天界面**：空状态下的提问引导、追问消息流、回复文本排版（含步骤条、提示卡）。 |
| **制度助手** | `policy.html` | *(仅加载公共样式)* | *(仅加载公共 JS)* | **专职 GPT 演示**：初始化为 `regulation-assistant` 助手，加载针对差旅、采购审批等高频制度的问答口径。 |
| **智能体广场** | `gpts.html` | `css/gpts-workspace.css` | `js/gpts-workspace.js` | **智能体中心**：常用智能体展示、全部智能体卡片流；提供类 GPTs 的创建/配置向导与实时预览面板。 |
| **个人资料库** | `library.html` | `css/library-workspace.css` | `js/library-workspace.js` | **文档与索引管理**：最近文件资料分类列表、已索引的知识库网格（模拟用于 RAG 检索的分块数据）。 |
| **定时任务** | `automation.html` | `css/automation-workspace.css` | `js/automation-workspace.js` | **日程自动化**：运行中定时汇总任务卡片列表（包含 Cron 执行时间、负责人、通知群聊渠道及日志入口）。 |
| **探索技能** | `explore.html` | `css/explore-workspace.css` | `js/explore-workspace.js` | **高频 prompt 广场**：展示适用特定协同办公场景（如纪要提炼、FAQ生成、周报自动成稿）的推荐技能列表。 |

---

## 3. 静态资源规范

所有媒体文件存放在 `assets/` 目录下：
* `assets/logo.svg`：企业 AI 助手的标志 Logo。
* `assets/assistant-avatar.svg`：主助手默认头像。

---

## 4. 目录结构树

```text
apps/assistant-web/template/assistai-ui/
├── AGENTS.md                  # 本文档 (原型架构描述)
├── index.html                 # 1. 聊天主页视图
├── policy.html                # 2. 制度助手会话页
├── gpts.html                  # 3. 智能体广场页
├── library.html               # 4. 资料库工作台
├── explore.html               # 5. 技能探索页
├── automation.html            # 6. 定时任务台
├── assets/                    # 静态素材
│   ├── logo.svg
│   └── assistant-avatar.svg
├── css/                       # 拆分后的模块化样式
│   ├── assistai-base.css      # CSS 变量、Reset、公共工作空间排版
│   ├── assistai-sidebar.css   # 侧栏、账户面板、历史会话
│   ├── assistai-chat.css      # 消息流气泡、富文本渲染、底部输入区
│   ├── gpts-workspace.css     # 广场网格、创建配置表单
│   ├── library-workspace.css  # 资料列表、知识库卡片、使用度看板
│   ├── automation-workspace.css # 任务日程卡片
│   └── explore-workspace.css  # 推荐技能卡片
└── js/                        # 拆分后的核心脚本逻辑
    ├── assistai-data.js       # 全局 Mock 数据库
    ├── assistai-ui.js         # 主交互控制器、视图调度总线
    ├── gpts-workspace.js      # 智能体渲染器
    ├── library-workspace.js   # 资料库渲染器
    ├── automation-workspace.js # 定时任务渲染器
    └── explore-workspace.js   # 技能探索渲染器
```
