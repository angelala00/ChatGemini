# Agent Runtime 与能力模型设计

> 状态：指导性提案，作为后续设计和分阶段实现的共同基线  
> 范围：Agent Runtime、能力抽象、同步与异步 Run、工具调用闭环  
> 非目标：本文不规定具体数据库表、接口路径、消息协议和框架选型

## 1. 目标

ChatGemini 的目标不是继续为每类智能体堆叠独立聊天流程，而是形成一个通用 Agent Runtime：

- 使用同一套运行循环驱动普通助手、自定义智能体和专用智能体。
- 能力可以按配置装配，而不是写死在聊天主流程中。
- 支持工具、Skill 和子智能体逐步接入。
- 当前先保证同步工具调用简单可靠，未来可以扩展异步任务和 Run 恢复。

核心闭环：

```text
用户消息
  -> 创建或恢复 Run
  -> 装配上下文与可用能力
  -> 调用 LLM
  -> LLM 直接回复，结束 Run
  -> 或请求能力调用
  -> Runtime 执行能力并写回结果
  -> 再次装配上下文并调用 LLM
```

## 2. 核心概念

### 2.1 Agent Runtime

Runtime 是执行控制层，负责：

- 管理一次请求对应的 Run。
- 装配系统规则、智能体配置、会话历史和能力列表。
- 调用模型并解释模型输出。
- 调度能力，记录调用与结果。
- 控制循环次数、超时、取消、错误和最终输出。

Runtime 不直接实现搜索、知识读取或业务操作。具体行为由能力实现。

### 2.2 Capability

Capability 表示“当前 Agent 被允许使用的一项能力”。统一抽象的目标是统一：

- 注册与标识。
- 配置与启停。
- 授权与风险策略。
- 运行时发现与装配。
- 调用记录、错误和观测。

统一抽象不意味着三类能力必须具有相同的内部实现，也不意味着它们都必须原样暴露为 LLM function call。

能力只保留三个一级类型：

```text
Capability
  - Tool
  - Skill
  - Agent
```

### 2.3 Run

Run 是一次可追踪的 Agent 执行实例，至少包含：

- `run_id`
- Agent、用户与会话标识
- 当前状态
- 当前步骤与调用次数
- 能力调用记录
- 最终结果或错误

建议状态语义：

```text
created -> running -> completed
                   -> failed
                   -> cancelled
                   -> waiting（异步阶段再引入）
```

## 3. 三类能力

### 3.1 Tool

Tool 是一次边界清晰、输入输出结构化的原子操作，通常直接映射为模型可调用函数。

示例：

- 搜索网络或业务数据。
- 调用业务 API。
- 发送邮件。
- 执行受控代码。
- 搜索和读取知识库。
- 列出、读取和解析文件。
- 读取记忆或资料库。
- 操作沙箱文件。

因此，`Resource Access` 不再是一级能力。知识、文件、记忆和资料库都是资源域，对它们的操作通过 Tool 暴露。这样既保留资源语义，也避免 Runtime 增加一种新的调度机制。

### 3.2 Skill

Skill 是可复用的任务方法包，用来改变 Agent “如何完成一类任务”。它可以包含：

- 指令与约束。
- 领域知识说明。
- 推荐步骤。
- 所需 Tool 或 Agent 依赖。
- 输入输出规范。

示例包括规划、写作、代码审查、数据分析和引用整理。

Skill 与 Tool 的区别：Tool 执行一个动作；Skill 规定一类任务的完成方法。Skill 激活后通常被编译进上下文，并向 Runtime 声明依赖能力；只有需要显式选择 Skill 时，才额外暴露选择入口。

### 3.3 Agent

Agent 能力表示把一个目标委派给另一个具有独立配置的 Agent。被委派 Agent 可以拥有自己的：

- 系统指令。
- 上下文范围。
- Tool 与 Skill 集合。
- 运行限制。

制度助手、代码助手、运维诊断助手和研究助手都可以成为 Agent 实例。

Agent 调用与 Tool 调用可以共享统一调用信封，但 Agent 执行器内部会创建子 Run，而不是执行普通函数。父子 Run 必须保留关联关系，并限制递归深度和总预算。

## 4. 统一调用协议

模型请求执行动作时，Runtime 使用统一的 `ActionCall` 语义接收和记录：

```json
{
  "call_id": "call-123",
  "capability_id": "knowledge.search",
  "capability_type": "tool",
  "arguments": {},
  "parent_run_id": "run-123"
}
```

统一调用协议负责描述“调用什么”，具体执行由类型适配器完成：

```text
ActionCall
  -> ToolExecutor
  -> SkillActivator
  -> AgentExecutor
```

第一阶段可以继续兼容模型原生 `ToolCall`，由 Runtime 转换为内部 `ActionCall`。不要为了统一概念而过早替换现有模型协议。

## 5. 同步与异步属于 Run

同步、异步、长任务和固定 Workflow 是执行方式，不是新的能力类型。

```text
Run Mode
  - sync
  - async
```

例如 DeepResearch、批量文件分析和报告生成，可以由 Agent、Skill 与 Tool 组合完成，并以异步 Run 运行。它们不需要统一定义为第四类 Capability。

异步执行的目标流程：

```text
能力未立即完成
  -> Run 进入 waiting
  -> 保存检查点并返回任务状态
  -> 回调或轮询获得结果
  -> 恢复 Run
  -> 将结果写入上下文
  -> 继续 Runtime 循环
```

实现异步前必须先解决持久化、幂等、重复回调、取消、超时和恢复版本兼容问题，因此不进入第一阶段 MVP。

## 6. Runtime 执行规则

每轮执行遵循以下约束：

1. Runtime 只装配当前 Agent 已配置且当前用户已授权的能力。
2. 模型只能调用本轮能力清单中的能力。
3. 每次调用先校验参数、权限、风险等级和用户确认状态。
4. 能力结果以结构化消息写回上下文，不直接拼接为无来源文本。
5. Runtime 设置最大步骤数、最大调用数、超时和预算，防止无限循环。
6. 写操作、高风险操作和外部副作用必须支持显式确认。
7. 每次调用记录输入摘要、结果、耗时、状态和错误，但不得记录敏感明文。
8. 能力失败由 Runtime 转换为模型可理解的结构化错误；模型不能伪造成功结果。

## 7. 配置与装配

建议每个 Agent 配置由以下部分组成：

```text
Agent Definition
  - identity / instructions
  - model policy
  - enabled capabilities
  - context policy
  - runtime limits
```

Capability Descriptor 至少表达：

```text
id
type: tool | skill | agent
name / description
enabled
authorization policy
risk / confirmation policy
configuration
```

Tool 的参数 Schema、Skill 的依赖与激活方式、Agent 的委派策略属于各类型扩展字段，不应全部塞进一个巨大的公共结构。

## 8. 分阶段落地

### 阶段一：统一同步 Runtime

- 固化 `Run -> LLM -> Tool -> LLM` 循环。
- 建立 Capability Descriptor，但只实现 ToolExecutor。
- 将知识、文件和资料库访问统一作为 Tool 注册。
- 统一权限、确认、超时、错误与调用日志。
- 保持现有流式协议和模型 ToolCall 兼容。

### 阶段二：Skill

- 定义 Skill 包格式、版本和依赖。
- 实现 Skill 装载、上下文编译和按 Agent 配置启用。
- 先支持静态启用，再评估是否需要模型动态选择。

### 阶段三：子 Agent

- 实现 AgentExecutor 与父子 Run。
- 限制递归深度、并发、上下文共享和预算。
- 明确委派结果格式及父 Agent 的最终责任。

### 阶段四：异步 Run

- 持久化 Run 和执行检查点。
- 支持任务状态查询、回调、轮询、取消和恢复。
- 在此基础上实现 DeepResearch、批处理和长时间工作流。

## 9. 架构边界

以下做法应避免：

- 为知识库、文件和资料库各写一套 Runtime 分支。
- 把所有能力都简化成无治理的 Python 函数调用。
- 把 Skill 等同于 Tool，导致方法论与动作边界混乱。
- 把 Workflow 定义成第四种能力，重复实现调度和状态管理。
- 在同步闭环未稳定前直接建设复杂 Planner 或异步状态机。
- 让专用智能体复制一套独立聊天引擎，继续扩大分叉。

## 10. 与现有提案的关系

本文定义 Runtime 与 Capability 的上层模型。知识、附件和上下文如何装配，继续由 [智能体知识上下文设计讨论稿](./agent-knowledge-context-design-discussion.md)细化；前后端流式事件继续由 [Chat Streaming Protocol](./chat-streaming-protocol.md)约束。

后续实现形成稳定事实后，应将最终架构和约定迁移到 `servers/assistant-bff/app/AGENTS.md`，本文保留设计决策与演进背景。
