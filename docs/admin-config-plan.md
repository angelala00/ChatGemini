# Admin Config Plan

## Goal

Provide a first-version administrator configuration capability inside `assistant-web` without creating a separate backend service.

- Frontend entry: show an admin-only entry in the main app sidebar/footer area.
- Frontend page: route to a dedicated `/admin` page, not a chat-overlay configuration panel.
- Backend API: add `/api/admin/*` routes to `assistant-bff`.
- Storage: persist admin configuration in Postgres.

## Why This Shape

- Chat is an end-user workflow; configuration is an administrator workflow.
- Embedding a large settings panel into the chat page couples two unrelated contexts.
- Splitting admin APIs into a new service now would add deployment and operational complexity too early.

## What Should Be Configurable

### 1. Model Configuration

Move model list and capability configuration out of scattered code/env where possible.

Use table: `admin_model_configs`

Suggested fields:

- `model_id`: stable model identifier used by the product
- `display_name`: name shown in UI
- `provider_model_name`: upstream provider model name
- `sort_order`
- `enabled`
- `supports_reasoning`
- `supports_tool_calling`
- `supports_native_image_input`
- `reasoning_default_enabled`
- `reasoning_parser_mode`
- `reasoning_parameter_format`
- `allowed_upload_types`: e.g. `["document", "image"]`
- `visibility_scope`: `all | whitelist | hidden`
- `visibility_users`
- `metadata`: reserved extension field

### 2. Permission Configuration

Use table: `admin_user_permissions`

This replaces or gradually supersedes env white lists for product-level permissions.

Suggested permission codes:

- `admin.access`
- `models.manage`
- `gpts.manage`
- `voice_lab.access`
- `feature_flags.manage`

Notes:

- `user_key` may be either email or `sub`
- first version can keep env white lists as fallback defaults

### 3. Product Feature Flags

Use table: `admin_feature_flags`

Suggested first-version keys:

- `gpts_feature_enabled`
- `default_reasoning_enabled`
- `default_visible_models`

Do not overuse this table. Prefer domain-specific tables for model and permission data.

## What Should Stay In Env

These are infrastructure or deployment settings and should not move into admin config:

- `POSTGRES_DSN`
- `MINIO_*`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `SESSION_SECRET`
- `ALLOW_ORIGINS`
- `FILE_BASE`
- `LOG_BASE`
- port configuration
- telemetry/cache retention values
- `PLATFORM_PORTAL_*`

## First-Version Page IA

Route: `/admin`

Tabs:

1. `模型配置`
2. `权限配置`
3. `功能开关`
4. `操作审计`

Keep V1 intentionally narrow. The immediate goal is configuration consolidation, not building a generic admin console.

## API Draft

### Read APIs

- `GET /api/admin/models`
- `GET /api/admin/permissions`
- `GET /api/admin/feature-flags`
- `GET /api/admin/audit-logs`

### Write APIs

- `PUT /api/admin/models/{model_id}`
- `POST /api/admin/models`
- `DELETE /api/admin/models/{model_id}`
- `PUT /api/admin/permissions/{id}`
- `POST /api/admin/permissions`
- `DELETE /api/admin/permissions/{id}`
- `PUT /api/admin/feature-flags/{config_key}`

### Audit

- every write to model config, permission config, and feature flags should append an audit record
- audit records should capture:
  - actor
  - action
  - resource type
  - resource key
  - before snapshot
  - after snapshot

Current implementation status:

- `gpts_feature_enabled` can now be overridden from `admin_feature_flags`
- `voice_lab.access` can now be driven from `admin_user_permissions`
- `gpts.manage` can now be driven from `admin_user_permissions`
- GPTS browse access and GPTS management access are now separated
- admin write access is now split by module:
  - `models.manage`
  - `permissions.manage`
  - `feature_flags.manage`
- `default_visible_models` can now limit the visible model set for `gptassistant`
- `default_reasoning_enabled` can now override the runtime default reasoning state for `gptassistant`
- `default_model` can now override the runtime default model for `gptassistant`
- the admin page now exposes these three `gptassistant` defaults through a dedicated structured form instead of requiring raw JSON editing
- `gpts_feature_enabled` is now also exposed through a dedicated product-switch form instead of only through the generic feature flag editor
- env values remain as fallback bootstrap defaults

## Permission Model

Backend gate:

- only users with `admin.access` may enter `/admin`
- finer-grained actions can be checked by specific permission codes

Recommended V1 approach:

- keep env white list fallback for bootstrap
- once admin UI is stable, gradually migrate these checks to `admin_user_permissions`

## Rollout Order

1. Restore `.env.example` so current deployment variables remain documented.
2. Add Postgres tables and repository layer for admin config.
3. Add read-only admin APIs.
4. Add `/admin` page in `assistant-web`.
5. Add edit/save capabilities.
6. Later migrate selected env-backed product permissions into DB-backed admin config.
