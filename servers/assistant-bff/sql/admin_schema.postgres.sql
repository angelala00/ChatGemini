CREATE TABLE IF NOT EXISTS admin_model_configs (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  provider_model_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  supports_reasoning BOOLEAN NOT NULL DEFAULT FALSE,
  supports_tool_calling BOOLEAN NOT NULL DEFAULT FALSE,
  supports_native_image_input BOOLEAN NOT NULL DEFAULT FALSE,
  reasoning_default_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reasoning_parser_mode TEXT,
  reasoning_parameter_format TEXT,
  allowed_upload_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_scope TEXT NOT NULL DEFAULT 'all',
  visibility_users JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_model_configs_enabled_sort
  ON admin_model_configs(enabled, sort_order);

CREATE TABLE IF NOT EXISTS admin_user_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_key TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  remark TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_key, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_admin_user_permissions_lookup
  ON admin_user_permissions(user_key, permission_code, enabled);

CREATE TABLE IF NOT EXISTS admin_feature_flags (
  config_key TEXT PRIMARY KEY,
  config_value JSONB NOT NULL,
  value_type TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_key TEXT NOT NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs(created_at DESC);
