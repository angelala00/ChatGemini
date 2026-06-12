# Assistant BFF

## 运行

```bash
./start.sh
./status.sh
./stop.sh
```

可先复制 [`.env.example`](./.env.example) 为 `.env`，再按环境填写连接信息。

## 验收与建表

- [`.env.example`](./.env.example): 环境变量模板
- [`sql/business_schema.postgres.sql`](./sql/business_schema.postgres.sql): 业务轻量表的显式 Postgres 建表 SQL
- [`verify_storage.sh`](./verify_storage.sh): 启动服务后检查 `/healthz`、`/healthz/dependencies`、`/readyz`
- [`migrate_local_sqlite_to_postgres.py`](./migrate_local_sqlite_to_postgres.py): 将节点本地 sqlite 会话历史、`file_mapping`、GPTs 配置与用户状态幂等迁移到 Postgres；`start.sh` 在 Postgres 模式启动前会自动执行一次

## 测试

在 `servers/assistant-bff` 目录下执行：

```bash
.venv/bin/python -m unittest tests/test_storage_backends.py tests/test_gptassistant_model_auth.py
```

## 配置

- `ASSISTANT_BFF_PORT`: 服务端口，默认 `5008`。
- `BUSINESS_STORAGE_BACKEND`: 业务数据存储后端。生产建议 `postgres`，本地开发可用 `sqlite`。
- `POSTGRES_DSN`: Postgres 连接串；当 `BUSINESS_STORAGE_BACKEND=postgres` 时必填。
- `POSTGRES_POOL_MIN_SIZE`: Postgres 连接池最小连接数，默认 `1`。
- `POSTGRES_POOL_MAX_SIZE`: Postgres 连接池最大连接数，默认 `5`。
- `SQLITE_MIGRATION_NODE_ID`: 本节点 sqlite 迁移状态标识；当 `BUSINESS_STORAGE_BACKEND=postgres` 时必填，并且每个节点必须不同，例如 `node-a`、`node-b`。
- `SESSION_HISTORY_ENCRYPTION_KEY`: 会话历史加密密钥。当前要求在 `BUSINESS_STORAGE_BACKEND=postgres` 时必填，格式为 `Fernet` key。
- `OBJECT_STORAGE_BACKEND`: 文件存储后端。生产建议 `minio`，本地开发可用 `filesystem`。
- `MINIO_ENDPOINT`: MinIO 地址，例如 `minio.example.com:9000`。
- `MINIO_ACCESS_KEY`: MinIO access key。
- `MINIO_SECRET_KEY`: MinIO secret key。
- `MINIO_BUCKET`: MinIO bucket 名称，默认 `gptassistant`。
- `MINIO_REGION`: 可选的 MinIO region。
- `MINIO_BASE_PREFIX`: MinIO 对象 key 前缀，默认 `assistant-files`。
- `MINIO_SECURE`: 是否启用 HTTPS，默认 `false`。
- `USAGE_EVENT_RETENTION_DAYS`: 本地 usage 日志保留天数，默认 `14`。
- `TRACE_RETENTION_DAYS`: 本地 trace 文件保留天数，默认 `7`。
- `OBJECT_CACHE_RETENTION_DAYS`: MinIO 本地缓存保留天数，默认 `3`。

## 健康检查

- `/healthz`: 进程基础存活检查，保持兼容旧探针。
- `/healthz/dependencies`: 依赖连通性检查，返回 `businessStorage` 和 `objectStorage` 的详细状态。
- `/readyz`: 就绪检查。当前配置的 `businessStorage` 和 `objectStorage` 都健康时返回 `200`；否则返回 `503`。

## 启动策略

- 启动阶段会校验存储配置。
- 当 `BUSINESS_STORAGE_BACKEND=postgres` 且缺少 `POSTGRES_DSN` 时，服务会直接启动失败。
- 当 `BUSINESS_STORAGE_BACKEND=postgres` 且缺少 `SQLITE_MIGRATION_NODE_ID` 时，服务会直接启动失败。
- 当 `BUSINESS_STORAGE_BACKEND=postgres` 且缺少 `SESSION_HISTORY_ENCRYPTION_KEY` 时，服务会直接启动失败。
- 当 `BUSINESS_STORAGE_BACKEND=postgres` 且连接池大小配置不合法时，服务会直接启动失败。
- 当 `OBJECT_STORAGE_BACKEND=minio` 且缺少 `MINIO_*` 关键配置时，服务会直接启动失败。

## 存储分层

- 业务轻量数据：`Postgres` / 本地开发时可回退到 `sqlite`
  - `session_history`
    - 库内存储为密文，读取时由服务端自动解密
  - `session_history_client`
    - 库内存储为密文，读取时由服务端自动解密
  - `session_history_meta`
    - 会按登录用户和服务端解析出的登录端 Provider 隔离历史列表，适用于同一套后端服务多个登录端但历史互不串的场景
  - `custom_gpts`
  - `user_gpts_state`
  - `user_config_version`
  - `file_mapping`
- 文件本体：`MinIO` / 本地开发时可回退到 `filesystem`
- 观测数据：节点本地日志文件
  - `usage_events`
  - `chat_traces`
  - `chat_trace_events`

## 滚动升级

当前生产若采用 `Postgres + filesystem` 过渡方案，建议按“先升级目标节点，不动当前活跃节点”的方式滚动发布。

### 推荐顺序

1. 在目标节点（例如 `B`）部署新代码。
2. 在目标节点配置：
   - `BUSINESS_STORAGE_BACKEND=postgres`
   - `POSTGRES_DSN=...`
   - `SQLITE_MIGRATION_NODE_ID=node-b`
   - `OBJECT_STORAGE_BACKEND=filesystem`
3. 在目标节点检查本地 sqlite 表结构和待迁移数据；正式启动时 `start.sh` 会自动执行迁移，也可手动提前执行：

```bash
cd servers/assistant-bff
.venv/bin/python migrate_local_sqlite_to_postgres.py --inspect
.venv/bin/python migrate_local_sqlite_to_postgres.py --dry-run
.venv/bin/python migrate_local_sqlite_to_postgres.py
```

4. 启动目标节点服务并检查：

```bash
curl http://localhost:5008/readyz
```

5. 仅在目标节点确认正常后，再从 nginx 层把流量切到目标节点。

### 为什么切流量前不动当前活跃节点

- 当前活跃节点（例如 `A`）在切流量前保持不变，便于出现问题时立即回切。
- 这意味着从 `A` 切到 `B` 的那一刻，`A` 上尚未迁入 `Postgres` 的最新本地会话，到了 `B` 仍可能接不上。
- 这是一个有意识接受的过渡期取舍：优先保回滚能力，而不是在第一次切换时就强求所有会话 100% 连续。

### 迁移脚本当前范围

当前迁移脚本默认迁移以下本地 sqlite 业务数据：

- `session_history`
- `session_history_client`
- `session_history_meta`
- `file_mapping`
- `custom_gpts`
- `user_gpts_state`
- `user_config_version`

会话历史会按 `updated_at` 幂等合并，`file_mapping` 会按 `file_id` 幂等插入，适合在多节点上重复执行。
`custom_gpts` 和 `user_config_version` 会按主键 upsert，`user_gpts_state` 会按 `(user_id, gpts_id)` 插入忽略。
迁移状态按 `(SQLITE_MIGRATION_NODE_ID, source_path)` 记录；多节点共用同一套 Postgres 时，每个节点必须配置不同的 `SQLITE_MIGRATION_NODE_ID`，否则节点间会互相覆盖迁移状态。
脚本会默认扫描 `FILE_BASE/gptassistant/business-dev.db`、`FILE_BASE/gptassistant/pins.db` 和 `servers/assistant-bff/app.db`；旧版 `pins.db` 中 `file_mapping(file_id, filename, fileExtension, path, uploadTime, gid)` 会映射到新版 `file_mapping` 表结构。
老库中的会话元信息如果没有 `auth_provider` 字段，会统一按默认 Provider 写入；新请求会按当前请求上下文自动解析 Provider。

### 暂不处理的内容

- 本地上传文件目录：当前接受两周过渡期风险，待 `MinIO` 就绪后再处理。
- `usage_events` / `chat_traces` / `chat_trace_events`：不迁移。
