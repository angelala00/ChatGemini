# ChatGemini 数据看板日志采集建议

为了支撑看板上的实时指标与趋势分析，建议平台侧在网关、应用层与模型服务层补充或统一以下日志字段。所有日志均需携带 `request_id` 用于跨系统关联。

## 1. 用户行为日志
- `timestamp`：事件时间戳（ISO8601）。
- `user_id` / `tenant_id`：用户与租户标识。
- `action`：行为类型（登录、发起对话、创建 GPT、导出报表等）。
- `channel`：触达渠道（Web、API、移动端）。
- `gpt_id` / `gpt_name`：涉及的 GPT 或助手。
- `model`：调用的模型名称与版本。
- `latency_ms`：端到端耗时，拆分前端、后端、模型推理等阶段更佳。
- `success`：布尔值，标记行为是否成功。
- `error_code` / `error_message`：失败时的错误编码与摘要。

## 2. 请求追踪日志
- `request_id`：与链路追踪系统关联。
- `start_time` / `end_time`：请求起止时间。
- `duration_ms`：总耗时。
- `model_provider`：模型提供方（OpenAI、Anthropic、自建等）。
- `input_tokens` / `output_tokens`：分阶段 token 使用量。
- `billing_cost`：本次调用的预估成本。
- `retries`：重试次数与原因。
- `status`：成功、部分成功、失败等枚举。

## 3. 系统资源与健康日志
- `service_name` / `instance_id`：服务与实例标识。
- `cpu_usage` / `memory_usage`：关键资源占用。
- `queue_depth`：排队消息长度，用于观察高峰。
- `model_latency_p95` / `model_latency_p99`：模型调用尾延迟。
- `sla_violation`：是否触发 SLA 风险预警。
- `alert_type` / `alert_level`：触发告警的类别与等级。

## 4. 聚合与指标存储建议
- 将原始日志写入集中式日志平台（如 Loki / Elasticsearch）。
- 通过流式处理（Kafka + Flink / ClickHouse Materialized View）实时聚合指标。
- 将聚合结果写入 TSDB（Prometheus / TimescaleDB）或缓存层（Redis）以供看板查询。
- 对于需要实时推送的指标，使用消息队列或 WebSocket 通知前端触发 React Query 更新。

## 5. 数据保留与治理
- 针对用户行为日志至少保留 90 天便于增长分析。
- 对敏感字段（用户输入、业务机密）在日志写入前进行脱敏或加密。
- 定期校验日志模式，确保新增功能同步更新埋点与告警规则。
