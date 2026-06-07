CREATE TABLE IF NOT EXISTS session_history (
  conversation_id TEXT PRIMARY KEY,
  history JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_history_client (
  conversation_id TEXT PRIMARY KEY,
  history JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_history_meta (
  conversation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'c',
  gid TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_history_meta_user_updated
  ON session_history_meta(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_history_meta_user_provider_updated
  ON session_history_meta(user_id, auth_provider, updated_at DESC);

CREATE TABLE IF NOT EXISTS custom_gpts (
  gid TEXT PRIMARY KEY,
  config JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS user_gpts_state (
  user_id TEXT NOT NULL,
  gpts_id TEXT NOT NULL,
  pinned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, gpts_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pinned
  ON user_gpts_state(user_id, pinned_at DESC);

CREATE TABLE IF NOT EXISTS user_config_version (
  user_id TEXT PRIMARY KEY,
  version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_mapping (
  file_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  content_type TEXT,
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL,
  storage_backend TEXT NOT NULL,
  size_bytes BIGINT,
  upload_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gid TEXT NOT NULL,
  owner_user_id TEXT,
  owner_user_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_file_mapping_gid
  ON file_mapping(gid);

CREATE INDEX IF NOT EXISTS idx_file_mapping_owner
  ON file_mapping(owner_user_id, owner_user_email);

CREATE TABLE IF NOT EXISTS file_upload_reservations (
  reservation_id TEXT PRIMARY KEY,
  gid TEXT NOT NULL,
  owner_user_id TEXT,
  owner_user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_upload_reservations_owner
  ON file_upload_reservations(gid, owner_user_id, owner_user_email);
