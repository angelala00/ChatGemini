# AI 开发者平台与 Skill Registry 设计讨论

## 1. 背景

当前内网同时运行 `model-api` 与 ChatGemini：

- `model-api` 提供模型网关、模型接入、鉴权、计量与相关管理能力。
- ChatGemini 是面向最终用户的 AI 产品，并正在演进多智能体、智能体能力配置等功能。
- ChatGemini 仓库中的 `apps/llm-platform` 当前作为模型网关的用户侧控制台，已经包含或规划模型市场、API Key、用量、诊断、API 文档、Skills 和 MCP 等入口。

长期规划中，`llm-platform` 可能从 ChatGemini 仓库拆出，演进为独立的 AI 开发者平台。与此同时，需要明确通用 Skills 市场与 ChatGemini 产品内部 Skills 能力之间的关系，避免重复建设两套互相割裂的 Skill 体系。

本文记录当前阶段的产品与架构思路，供后续设计和拆分时参考。本文不是已完成实现的架构说明。

## 2. 核心判断

建议只建设一个统一的 Skill Registry，负责 Skill 资产的发布、版本、分发和治理；ChatGemini 及其他 Agent 产品作为 Skill 的消费者，各自负责安装、绑定、授权和运行。

简化关系如下：

```text
                         +----------------------+
                         |    Skill Registry    |
                         | 发布 / 版本 / 分发 / 治理 |
                         +----------+-----------+
                                    |
                 +------------------+------------------+
                 |                  |                  |
                 v                  v                  v
        +----------------+  +----------------+  +----------------+
        |   ChatGemini   |  | 其他自研 Agent |  | 外部 Agent/IDE |
        | 绑定 / 授权 / 运行 |  | 绑定 / 授权 / 运行 |  | 下载 / 本地配置 |
        +----------------+  +----------------+  +----------------+
```

这意味着开发者平台和 ChatGemini 都可以出现“Skills”页面，但两个页面表达的是不同层次：

- 开发者平台中的 Skills 是资产中心和分发入口。
- ChatGemini 中的 Skills 是智能体装配、授权和运行入口。

两者不应各自维护一份独立的 Skill 本体。

## 3. 产品定位

### 3.1 model-api

`model-api` 继续定位为模型基础设施，主要负责：

- 模型供应方和模型配置管理。
- 统一模型 API 和协议适配。
- API Key、鉴权、配额与访问控制。
- Token、费用、请求日志和网关可观测性。
- 模型服务稳定性和治理。

Skill Registry 不宜直接成为模型网关核心运行链路的一部分，避免 Skills 的产品迭代影响核心网关的稳定性。

### 3.2 AI 开发者平台

`llm-platform` 的长期定位可以从“模型网关用户控制台”扩展为“AI 开发者平台”。它是面向开发者、Agent 构建者和平台管理员的统一控制面，可逐步承载：

- 模型目录与模型调用文档。
- API Key、配额、用量与诊断。
- Skill Registry 与 Skills 市场。
- MCP 服务发现与接入。
- 团队、权限与审计。
- 后续可能出现的 Agent 应用、评测和可观测性入口。

前端可以形成统一产品，但后端不必成为单体服务。模型网关、Skill Registry、遥测等能力可以是相互独立的服务，由开发者平台组合呈现。

### 3.3 ChatGemini

ChatGemini 是开发者平台能力的第一方消费者，也是具体的 AI 应用和 Agent Runtime。它负责：

- 创建和管理智能体。
- 给智能体选择并绑定 Skill。
- 按用户、团队、应用智能体等维度控制可用范围。
- 解析 Skill 依赖并装载到运行环境。
- 绑定凭据和实际权限。
- 执行 Skill，并保存详细运行日志和审计记录。
- 在需要时向 Skill Registry 回传聚合遥测。

长期看，ChatGemini 应当只是开发者平台上的一个第一方 AI 产品，而不是开发者平台的所有者。

## 4. Skill 的可移植性边界

开放的 Agent Skills 规范正在形成以 `SKILL.md` 为核心的通用格式。一个 Skill 通常可以包含：

```text
example-skill/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

格式通用不等于运行环境完全通用。Skill 的兼容性应按层次理解：

| 层次 | 通用程度 | 说明 |
| --- | --- | --- |
| 描述与自然语言指令 | 高 | 名称、描述和工作流程通常可被不同 Agent 理解 |
| 静态参考资料与模板 | 较高 | 主要受文件格式和上下文能力影响 |
| 工具调用 | 中等 | 不同 Agent 的工具名称、参数和权限模型可能不同 |
| 脚本与执行环境 | 较低 | 依赖操作系统、解释器、网络、文件系统和密钥 |

因此，平台应描述兼容性，而不是简单承诺“所有 Skill 在所有 Agent 上完全通用”。可考虑使用以下兼容性分类：

- `portable`：主要由指令和静态资料组成，通常可以跨 Agent 使用。
- `standard`：符合开放 `SKILL.md` 结构，但仍需消费方验证运行条件。
- `adapter-required`：工具调用或目录结构需要适配器。
- `runtime-specific`：依赖特定 Agent Runtime 或托管服务。

## 5. 职责与数据所有权

### 5.1 Skill Registry 拥有的数据

Registry 管理“Skill 是什么、由谁发布、谁有权获得”：

```text
Skill
  id
  name
  description
  owner
  visibility

SkillVersion
  skill_id
  version
  package
  manifest
  checksum
  compatibility
  required_capabilities
  required_secrets
  security_status
  release_channel

SkillEntitlement
  subject_type
  subject_id
  skill_id
  allowed_versions
  acquired_at
```

其中 `SkillEntitlement` 表示用户或团队是否有权获取某个 Skill，不代表 Skill 已经绑定到某个智能体。

### 5.2 Agent 产品拥有的数据

ChatGemini 或其他 Agent 产品管理“Skill 如何在本产品中被使用”：

```text
InstalledSkill
  workspace_id
  skill_id
  resolved_version
  local_package_ref
  installed_at

AgentSkillBinding
  agent_id
  skill_id
  version_constraint
  resolved_version
  enabled
  runtime_config
  permission_policy
  credential_binding
```

`AgentSkillBinding` 不属于 Skill Registry。原因包括：

- 不同 Agent 产品可能按智能体、工作区、项目、会话或本地目录管理 Skill，并不存在统一的 `agent_id`。
- 实际运行权限由 Agent Runtime 决定，Registry 只能声明所需能力。
- 真实凭据必须留在消费方，不应交给 Skills 平台保存。
- 外部 Agent 应能在 Registry 暂时不可用时继续使用已经安装的 Skill。
- Registry 不应理解和耦合所有 Agent 产品的内部模型。

边界可以概括为：

> Skill Registry 拥有 Skill；Agent 产品拥有 Skill 的安装、绑定、授权和运行。

只有当开发者平台未来进一步演变为统一创建、部署和运行 Agent 的 Agent Platform 时，平台侧才有理由拥有其自身托管 Agent 的 `AgentSkillBinding`。即便如此，外部 Agent 的绑定仍应归外部产品所有。

## 6. 权限、依赖与凭据

Skill 包只声明运行需求，不直接携带真实授权。例如：

```yaml
required_capabilities:
  - file.read
  - document.parse
required_secrets:
  - external-api-token
```

ChatGemini 在绑定时决定实际授权：

```text
合同审查智能体
  document-review: 1.3.2
  file.read: 仅允许当前会话附件
  network: 禁止
  external-api-token: credential://cred_123
```

Registry 可以管理依赖声明、风险等级和兼容性；消费方必须负责：

- 将抽象能力映射到本地工具。
- 对文件、网络、数据库等资源进行最小授权。
- 保存和轮换真实凭据。
- 对高风险操作进行确认。
- 隔离脚本执行环境。

## 7. 统计与可观测性边界

完全可下载、可离线运行的 Skill 无法被 Registry 强制统计真实运行次数。平台只能可靠统计发生在自身边界内的行为。

### 7.1 可可靠统计的分发数据

- 详情页浏览量。
- 下载、拉取和更新次数。
- 独立下载用户或团队数量。
- 下载的版本分布。
- 收藏、评分和反馈。
- 安全扫描和审核结果。

这些数据应称为“下载量”“安装包拉取量”或“分发量”，不能直接称为“调用量”。

### 7.2 外部 Agent 的自愿遥测

平台可以提供 Consumer SDK 或遥测 API，由合作方主动上报：

```text
skill.started
skill.completed
skill.failed
```

这类数据不是全量事实，应明确标记为“已接入遥测的运行数据”。设计时应满足：

- 默认不上传用户提示词、文件内容和业务数据。
- 支持关闭、批量和异步上报。
- 支持消费方身份签名，降低伪造风险。
- 企业环境可以使用内部遥测接收端。
- 不把自愿遥测作为强制按次计费的唯一依据。

不建议在 Skill 指令或脚本中强行植入不可关闭的统计逻辑。用户可以删除代码，纯指令型 Skill 也没有可靠上报能力；同时还会引入隐私、安全和离线运行问题。

### 7.3 第一方产品遥测

ChatGemini 可以保存完整运行数据，包括：

- Skill 与 Agent 的绑定关系。
- 激活、执行、成功和失败次数。
- 延迟、Token 消耗和失败原因。
- 用户确认、高风险操作和审计记录。
- 用户、团队、Agent、模型和版本维度的分析。

详细日志应保留在 ChatGemini。向 Registry 同步时，优先使用按周期聚合的数据：

```text
skill_id
skill_version
consumer_type
tenant_id
period
executions
successes
failures
```

Registry 使用这些数据形成跨产品趋势，但不因此成为 Agent 配置或详细运行日志的权威数据源。

### 7.4 托管运行统计

如果 Skill 的核心能力必须经过平台控制的 API、MCP Server、云端沙箱或托管工具执行，平台就可以进行可靠的鉴权、计量、配额和计费。

此时产品形态实际上是：

```text
可下载的 Skill 描述 + 平台托管的能力服务
```

应明确区分“纯离线 Skill”和“依赖托管服务的 Skill”，避免用户误解其可移植性和运行成本。

## 8. 商业模式与统计能力的关系

收费方式必须与平台能够可靠观察到的边界匹配：

- 免费或开源 Skill：主要统计分发量，不承诺真实执行量。
- 一次性购买或团队订阅：出售下载权、更新权、团队使用权和支持服务，不依赖每次执行统计。
- 按调用收费：核心执行必须经过平台控制的 API、MCP 或托管 Runtime。
- 企业私有化：可以按席位、团队、实例或年度授权收费，而不是依赖外网遥测。

## 9. 建议的演进路径

### 阶段一：内部 Skill Registry

先解决内部真实需求：

- Skill 创建与发布。
- 版本管理和包存储。
- 用户、团队和私有可见性。
- 兼容性、依赖和风险声明。
- 下载与更新。
- 基础审核和安全扫描。

这一阶段不急于建设支付、复杂推荐和公开排行榜。

### 阶段二：ChatGemini 成为第一方消费者

- 在智能体配置中从 Registry 选择 Skill。
- 在 ChatGemini 保存安装与绑定关系。
- 建立能力映射、凭据绑定和权限确认。
- 验证 Skill 的加载、运行、版本固定和升级流程。
- 建立第一方运行统计和聚合回传。

### 阶段三：开放给其他 Agent

- 提供标准 Skill 包下载接口。
- 提供 API、CLI 或 MCP 发现能力。
- 为主流 Agent 提供轻量安装适配器。
- 建立清晰的兼容性矩阵。
- 提供可选的遥测 SDK。

### 阶段四：根据真实需求扩展市场或托管能力

- 公开发布与审核。
- 组织认证和可信发布者。
- 评分、反馈和推荐。
- 商业授权。
- 托管 Skill、MCP 或能力 API。

是否进一步建设统一 Agent Platform，应根据 Agent 托管、部署和跨产品编排的实际需求单独决策，不应为了 Skills 市场提前扩大职责。

## 10. 当前建议

当前阶段建议采用以下原则：

1. `llm-platform` 可以继续以 AI 开发者平台方向演进，后续从 ChatGemini 仓库独立。
2. 只建设一个平台级 Skill Registry，不在 ChatGemini 内再建设另一套 Skill 资产库。
3. ChatGemini 作为第一方 Agent 消费者，拥有自己的安装、绑定、权限、凭据与运行数据。
4. Registry 负责标准包、版本、兼容性、分发、安全和权益管理。
5. 对可离线下载的 Skill，只承诺分发统计；可靠运行统计依赖消费方自愿遥测或平台托管执行。
6. 先验证内部发布与 ChatGemini 消费闭环，再考虑公开市场和商业化。
