# 后端管理与配置体系 (Admin & Configuration)

## 管理员配置中心 (Admin Config)

本项目实现了一套动态配置管理体系，允许管理员在不重启服务的情况下调整业务参数和模型能力。

### 1. 配置层次与覆盖逻辑
1. **数据库层 (Postgres)**：最高优先级。通过 `admin_feature_flags`、`admin_model_configs` 和 `admin_user_permissions` 表存储。
2. **环境变量层 (.env)**：次高优先级。作为系统启动时的初始默认值（Bootstrap Defaults）。
3. **代码硬编码层**：最低优先级。作为兜底。

### 2. 核心管理功能
- **模型配置**：动态管理模型名称、Provider 对应关系、是否支持思考/工具调用、可见范围（公开/白名单）等。
- **权限管理**：按 `user_key` (Email/Sub) 分配功能权限码，如 `admin.access`, `gpts.manage`, `voice_lab.access`。
- **业务开关 (Feature Flags)**：控制 GPTs 功能是否开放、默认对话模型、默认思考开关等。
- **审计日志**：记录所有管理员写操作的前后快照。

### 3. 实现参考
- **前端入口**：`apps/assistant-web/src/views/AdminConfig.tsx`
- **后端路由**：`servers/assistant-bff/app/routes/admin_routes.py`
- **数据访问**：`servers/assistant-bff/app/db.py`

## 权限模型 (Permission Model)
系统采用功能码权限模型。除 DB 记录外，原有的环境变量白名单（如 `GPTS_WHITE_LIST`）在 V1 版本中依然作为 fallback 生效，以确保系统在未配置数据库时仍可进入管理后台。
