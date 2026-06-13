# ChatGemini 测试与质量保障指南 (Testing & QA Strategy)

本文档旨在为 ChatGemini 项目提供一套体系化的测试指导，确保在快速迭代过程中，核心功能和架构稳定性得到有效保护。

---

## 1. 核心回归场景 (Critical Paths)
*每次重大改动或发布前必须验证的链路。*

### 1.1 对话链路“三级跳” (Chat Tiers)
- **第一级：通用助手 (Standard Chat)**
    - 验证基础 SSE 流式渲染、上下文（Context）管理。
    - 重点检查模型路由是否准确选择指定的 Provider。
- **第二级：附件增强对话 (File-Aware Chat)**
    - 验证 Minio 文件读写流的稳定性。
    - 验证 PDF/Docx 解析后，模型能否基于文件内容准确回答。
- **第三级：制度助手与工具调用 (Function Calling/Agent)**
    - 验证模型输出的 JSON 格式解析是否正确。
    - 验证工具（如搜索、数据库查询）执行结果返回给模型后的二次对话逻辑。

### 1.2 存储与持久化 (Storage & Persistence)
- **Minio 状态一致性**：验证文件上传、读取、以及生命周期（自动删除）是否生效。
- **跨端同步与隔离**：验证多标签页操作时的会话同步，以及 A/B 用户间的物理隔离。
- **迁移兼容性**：验证从本地 SQLite 迁移至 Postgres 后，历史记录和文件关联的完整性。

### 1.3 安全与接入 (Security & Auth)
- **Provider 作用域隔离**：验证不同 Provider 下的模型和资源绝对不会“串台”。
- **Token 异常行为**：验证 Token 过期或被手动清除后，系统是否能优雅重定向至登录页。

---

## 2. 极端边界测试 (Edge Cases)
- **长文本压力**：输入超长 Prompt，验证后端 Token 计算与 API 限制处理（413 处理）。
- **网络稳定性**：在 Playwright 中模拟高延迟或断网，验证前端的重连逻辑与报错提示。
- **并发请求**：同一会话内连续点击发送，验证后端的“Busy”锁机制。

---

## 3. 架构风险点 (Architectural Risk Areas)
*根据本项目多层架构特点，以下地方最容易出现回归 Bug。*

| 模块 | 风险点 | 关注逻辑 |
| :--- | :--- | :--- |
| **LLM Kernel** | 模型路由失效 | `app/llm_kernel/api_registry.py` 中 Provider 注册与回退逻辑。 |
| **Storage Layer** | 数据库 Schema 冲突 | SQLite 与 Postgres 之间的类型差异，尤其是 `jsonb` 字段。 |
| **Frontend State** | 数据版本不兼容 | `Redux Persist` 中的旧 Session 数据可能导致新代码白屏。 |
| **Auth Provider** | 登录态过期/丢失 | OAuth 回调后的 HttpOnly Cookie 写入及 CSRF 校验。 |

---

## 3. 测试分层 (Test Layers)

### 3.1 后端单元测试 (Unit & Integration)
- **工具**：`pytest`
- **执行**：`cd servers/assistant-bff && pytest`
- **重点**：模型协议转换 (`llm_kernel`)、文件处理逻辑、鉴权中间件。

### 3.2 前端 E2E 测试 (End-to-End)
- **工具**：`Playwright`
- **执行**：`cd apps/assistant-web && pnpm run test:e2e`
- **重点**：登录流程、对话输入框交互、侧边栏会话切换、管理后台配置保存。

### 3.3 手动回归 Checkpoint
- 检查移动端适配（Sidebar 在窄屏下是否自动折叠）。
- 检查代码块的高亮和“点击复制”功能。
- 检查会话导出功能（PDF/Markdown）。

---

## 4. 开发者准则
1. **Bug 驱动开发**：修复 Bug 前，先在 `servers/assistant-bff/tests` 下写一个复现该 Bug 的失败测试用例。
2. **UI 改动验证**：涉及 InputArea 或 Sidebar 的重大样式改动，必须使用 `npx playwright test --ui` 观察交互细节。
3. **环境一致性**：验证改动时，应同时测试 `dev` 模式（Vite）和 `preview` 模式（生产构建）。

---

*最近更新日期：2026-06-13*
