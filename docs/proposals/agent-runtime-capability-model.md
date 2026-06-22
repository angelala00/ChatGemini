
```text
flowchart TD
    U[用户消息] --> R[Agent Runtime]
    R --> A[装配上下文 / 能力列表]
    A --> L[调用 LLM]

    L --> D{LLM 输出}

    D -->|直接文本回复| T[返回用户]

    D -->|能力调用| C[Runtime 执行能力]

    C --> S{能力是否立即完成?}

    S -->|是| RES[返回结果]
    RES --> A

    S -->|否| JOB[创建异步任务]
    JOB --> P[保存 Run 状态]
    P --> W[返回用户：任务处理中]

    JOB --> DONE[异步任务完成 / 回调 / 轮询发现完成]
    DONE --> RE[恢复 Run]
    RE --> INJ[把异步结果写入上下文]
    INJ --> A

```



```text
第一层：统一调用协议
ActionCall / ToolCall

第二层：能力大类
1. Primitive Tool
2. Resource Access
3. Skill Package
4. Sub-Agent
5. Task / Workflow

第三层：具体实例

Primitive Tool
  - 搜索
  - 发邮件
  - 调业务 API
  - 执行代码
  - sandbox_exec

Resource Access
  - 知识库 search/read
  - 文件 read/list/parse
  - 记忆 retrieve
  - 资料库 search/read
  - 沙箱文件 read/write/list

Skill Package
  - 规划 skill
  - 写作 skill
  - 代码审查 skill
  - 数据分析 skill
  - 引用整理 skill

Sub-Agent
  - 制度助手
  - 代码助手
  - 运维诊断助手
  - 研究助手

Task / Workflow
  - DeepResearch
  - 沙箱代码修改任务
  - 批量文件分析任务
  - 报告生成任务
  - 长时间异步任务
```
