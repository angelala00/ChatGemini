# 统一权限能力（RBAC）设计

> **状态**: 草案（讨论中）
> **目标读者**: 平台后端/前端维护者、各子应用接入方
> **工作方式**: 本文档先于实现存在，通过持续讨论更新内容，定稿后才进入落地；讨论结论一律回写到本文，不散落在会话记录里。

| 日期 | 变更 |
| --- | --- |
| 2026-08-31 | 初稿：现状盘点 + 概念模型草案 + 开放问题清单 |
| 2026-08-31 | 重构：动机分两条（子系统统一对接 + 收敛存量）；当前状态改为总览表+分述；新增子系统需求占位章节 |

## 1. 背景与动机

两个动机：

1. **为子系统提供统一对接的 RBAC 能力**。平台内的子系统（assistant-web、developer-portal、smart office 及后续接入者）目前各自处理权限或借用 bff 的功能级权限码，缺一个可共享的授权层。需要实现一套统一的 RBAC，作为所有子系统对接权限的标准入口，子系统不再各自发明权限逻辑。
2. **借建设之机收敛项目内散乱的权限逻辑**。当前项目里的权限模型缺乏统一设计与规划，同类问题（"谁能用某功能"）由功能权限码、特性可见性、环境变量白名单三套机制并行求解（见 §2）。本次建设将它们收敛到统一模型：前期不强制迁移、后续渐进迁移，但**新的统一模型必须兼容当前项目里已有的权限能力**（能表达现有权限码、用户直挂、名单式可见性），保证存量迁移路径存在。

由此带来的直接问题（收敛的必要性）：

- **同类问题多处求解**：一个功能"谁能用"，可能由 `admin_user_permissions` 表、feature flag 的 `visible_users`、环境变量白名单三处共同决定，排查"某用户为何能看到/看不到某功能"要查三处。
- **无角色抽象**：权限直接挂在用户键上，每接入一个新用户要手工点 5~6 个权限码；同类型用户（如"平台运维"）没有可复用的授权单元。

## 2. 当前状态（2026-08，事实基准）

三套并行机制一览：

| 机制 | 控制什么 | 配置载体 | 失效回退 |
| --- | --- | --- | --- |
| 功能权限码 | 管理后台与各功能入口（6 个码） | `admin_user_permissions` 表 | env 白名单回退授权 |
| 特性可见性 | GPTS / Library / 外部助手对谁可见 | feature flag（scope + visible_users） | env 白名单 |
| env 白名单 | 以上两套的兜底来源 | 环境变量 | — |

### 2.1 身份与用户键

- `get_current_user`（`servers/assistant-bff/app/auth/auth_login_token.py:20`）目前为 **mock**，返回固定测试用户，字段含 `sub`/`name`/`email`/`group`（LDAP DN）/`auth_provider`。
- 权限判断使用的用户键是 **email 与 sub 双键**：`user_keys()`（`servers/assistant-bff/app/admin/access_control.py:42`）返回 `[email, sub]`，任一命中即生效。真实 SSO 落地后两者是否稳定一致，尚无验证。

### 2.2 功能权限码（用户 → 权限直接映射）

- 存储：`admin_user_permissions` 表（`servers/assistant-bff/app/storage/business_store.py:2273`），`user_key × permission_code × enabled`，无角色层。
- 现有权限码全集（6 个）：

  | 权限码 | 保护对象 | 判断点 |
  | --- | --- | --- |
  | `admin.access` | `/api/admin/*` 全部路由 | `admin_routes.py:84` `ensure_admin_access` |
  | `gpts.manage` | GPTS 管理入口 | `gpts_routes.py:99` |
  | `models.manage` | 模型配置管理 | 种子数据（见下） |
  | `permissions.manage` | 权限管理本身 | 种子数据 |
  | `feature_flags.manage` | 特性开关管理 | 种子数据 |
  | `voice_lab.access` | 语音实验室 | `voice_lab_routes.py:11` |

- 解析逻辑：`resolve_user_permissions()`（`access_control.py:61`）= DB 启用权限 ∪ 白名单回退权限。
- 白名单回退：GPTS 白名单命中 → `admin.access` + `gpts.manage`；VOICE_LAB 白名单命中 → `voice_lab.access`（`access_control.py:51-58`）。
- 种子迁移：启动时把 env 白名单写入权限表，GPTS 白名单用户获得 5 个管理权限码（`business_store.py:1822-1853`）。

### 2.3 特性可见性（feature flag + scope + 用户列表）

- 三个特性走 `VisibilityPolicyConfig`（`access_control.py:17-39`）：GPTS、Library、ExternalAssistant。
- 每个特性由三要素控制：总开关（feature flag）、可见范围 scope（all / restricted）、restricted 时的 `visible_users` 名单；无 DB 配置时回退到 env 白名单。
- 另有资源级可见性：`admin_model_configs` 表自带 `visibility_scope` / `visibility_users` 字段（`business_store.py:2243`），即模型这个资源有自己的可见性，与上面 2.3 的特性级可见性是两层。

### 2.4 环境变量白名单（第三套）

- `GPTS_WHITE_LIST` / `VOICE_LAB_WHITE_LIST` / `EXTERNAL_ASSISTANT_WHITE_LIST`（`servers/assistant-bff/app/base_config/model_config.py:93-102`），既是 2.2 的回退权限来源，又是 2.3 的回退名单来源。

### 2.5 管理界面与审计

- 前端权限管理 UI 在 `apps/assistant-web/src/views/AdminConfig.tsx`（增删用户权限码）。
- 管理操作全量写 `admin_audit_logs`，resource_key 形如 `user_key::permission_code`。

### 2.6 子系统对接现状

- 其他子系统目前仅通过 `/api/auth/userinfo` 拿身份（见 `docs/auth/bff-auth-integration.md`），**没有**任何权限查询接口；developer-portal 等的授权各自处理。

## 3. 子系统一需求（占位，章节名待替换为具体子系统）

> 本章按子系统收集对统一权限能力的接入需求，讨论一条固化一条。

- 待补充：该子系统有哪些角色 / 使用人群？
- 待补充：需要控制哪些功能或资源？
- 待补充：期望的对接形态（透传查询 / 本地判断，见 Q5）？

## 4. 子系统二需求（占位，章节名待替换为具体子系统）

> 同上，按子系统单章收集。

- 待补充：该子系统有哪些角色 / 使用人群？
- 待补充：需要控制哪些功能或资源？
- 待补充：期望的对接形态（透传查询 / 本地判断，见 Q5）？

## 5. 目标与非目标（草案，待确认）

**目标**

1. 用户 → 角色 → 权限 三层模型，角色是授权的主要操作单元。
2. 统一"功能权限码 / 特性可见性 / 白名单"三套机制为同一模型下的不同表达。
3. bff 与子应用共享同一套授权判断能力（形态见开放问题 Q5）。
4. 管理界面支持角色 CRUD 与用户-角色分配，保持审计。
5. **兼容现状**：统一模型能表达现有 6 个权限码、用户直挂权限与名单式可见性；存量数据不强制迁移，但迁移路径必须存在（呼应动机 2）。

**非目标（草案，待确认）**

- 不做 ABAC/策略引擎（属性条件表达式）。
- 不做多租户隔离。
- 不替换认证（SSO/session 归 `docs/auth/`，本域只管授权）。
- 前期不迁移存量权限数据（只做能力兼容设计，迁移另行排期）。

## 6. 概念模型草案（strawman，欢迎推翻）

```
用户(sub) ──分配──> 角色(role) ──包含──> 权限码(permission)
                          │
可选直通: 用户也可直接挂权限码（兼容现状 admin_user_permissions）
```

- **角色**：内置角色（如 `platform-admin`、`feature-operator`）+ 自定义角色两类；角色与权限码多对多。
- **权限码**：沿用现有 `domain.action` 命名，新增 `roles.manage`。
- **可见性归位**：特性可见性（2.3）改由"角色可见"或"用户列表直配"表达，feature flag 只保留总开关职责，不再携带用户名单。
- **迁移**：现有 `admin_user_permissions` 原样保留为"用户直挂权限"，白名单 seed 逻辑冻结只读。

## 7. 开放问题清单（讨论驱动）

| # | 问题 | 备选/备注 |
| --- | --- | --- |
| Q1 | 角色是否允许自定义，还是仅内置固定集合？ | 内置简单但每种"岗位"都要改代码 |
| Q2 | 权限粒度到功能级（现状）还是延伸到资源级（某个 GPT/某组模型）？ | `admin_model_configs.visibility_*` 已是资源级先例 |
| Q3 | 授权主体键定谁？`sub` 还是 `email`？`group`（LDAP DN）要不要作为批量授权来源（组→角色绑定）？ | 现状 email/sub 双键，SSO 落地后需实测稳定性 |
| Q4 | 三套旧机制（权限码表/可见性/白名单）是迁移合并还是长期共存？ | 合并需要迁移方案与回滚预案 |
| Q5 | 跨子应用的判断形态：bff 提供 `/api/auth/permissions` 类查询接口由子应用透传调用（同 userinfo 模式），还是下发 JWT/签名的权限声明让子应用本地判断？ | 透传简单实时；本地判断省一跳但有时效性 |
| Q6 | 角色变更的生效时机：即时（每次请求查库/带缓存 TTL）还是显式刷新？ | 现状是每请求查库，无缓存 |
| Q7 | 特性可见性与 RBAC 的边界：`visible_users` 这类"名单式灰度"是权限问题还是发布策略问题，是否该留在 feature flag 域？ | 影响 2.3 归属 |
| Q8 | 谁可以管理角色与分配？`permissions.manage` 拆分粒度（能管权限 vs 只能分配角色）？ | 防止提权：给他人授予自己没有的角色是否允许 |
| Q9 | 审计粒度：沿用 `admin_audit_logs` 的 resource_key 约定，还是为角色变更定义新事件结构？ | |
| Q10 | 落地顺序：先 bff 内部收敛三套机制，还是先开跨子应用接口？ | 影响第一批接口契约 |

## 8. 决策记录

（讨论定论后从开放问题清单移入此处，标注日期与结论。）
