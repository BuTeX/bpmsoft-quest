CREATE TABLE IF NOT EXISTS player_progress (
  player_id UUID PRIMARY KEY,
  state JSONB NOT NULL,
  progress_score SMALLINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_progress_updated_at_idx
  ON player_progress (updated_at DESC);

CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name VARCHAR(40) NOT NULL,
  password_hash TEXT NOT NULL,
  access_mode VARCHAR(16) NOT NULL DEFAULT 'progression'
    CHECK (access_mode IN ('progression', 'study')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ,
  privacy_accepted_at TIMESTAMPTZ,
  policy_version VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS account_sessions_account_idx
  ON account_sessions (account_id);

CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx
  ON account_sessions (expires_at);

CREATE TABLE IF NOT EXISTS account_tokens (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  purpose VARCHAR(32) NOT NULL
    CHECK (purpose IN ('verify_email', 'reset_password', 'change_email')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS account_tokens_account_purpose_idx
  ON account_tokens (account_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS account_tokens_expiry_idx
  ON account_tokens (expires_at);

CREATE TABLE IF NOT EXISTS account_progress (
  account_id UUID PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  chapter1_state JSONB,
  chapter1_score SMALLINT NOT NULL DEFAULT 0,
  chapter1_revision BIGINT NOT NULL DEFAULT 0,
  chapter1_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chapter2_state JSONB,
  chapter2_score SMALLINT NOT NULL DEFAULT 0,
  chapter2_revision BIGINT NOT NULL DEFAULT 0,
  chapter2_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chapter3_state JSONB,
  chapter3_score SMALLINT NOT NULL DEFAULT 0,
  chapter3_revision BIGINT NOT NULL DEFAULT 0,
  chapter3_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chapter4_state JSONB,
  chapter4_score SMALLINT NOT NULL DEFAULT 0,
  chapter4_revision BIGINT NOT NULL DEFAULT 0,
  chapter4_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chapter5_state JSONB,
  chapter5_score SMALLINT NOT NULL DEFAULT 0,
  chapter5_revision BIGINT NOT NULL DEFAULT 0,
  chapter5_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter1_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter1_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter2_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter2_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter3_state JSONB;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter3_score SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter3_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter3_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter4_state JSONB;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter4_score SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter4_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter4_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter5_state JSONB;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter5_score SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter5_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE account_progress
  ADD COLUMN IF NOT EXISTS chapter5_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS account_progress_updated_at_idx
  ON account_progress (updated_at DESC);

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  chapter_id VARCHAR(16) NOT NULL
    CHECK (chapter_id IN ('chapter1', 'chapter2', 'chapter3', 'chapter4', 'chapter5')),
  mission_key VARCHAR(64),
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN (
      'session_started',
      'mission_started',
      'answer_checked',
      'hint_used',
      'mission_completed',
      'chapter_reset'
    )),
  outcome VARCHAR(16)
    CHECK (outcome IS NULL OR outcome IN ('success', 'failure', 'cancelled')),
  attempt SMALLINT
    CHECK (attempt IS NULL OR (attempt >= 1 AND attempt <= 100)),
  duration_ms INTEGER
    CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 86400000)),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS learning_events_account_time_idx
  ON learning_events (account_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS learning_events_mission_time_idx
  ON learning_events (chapter_id, mission_key, occurred_at DESC);

CREATE INDEX IF NOT EXISTS learning_events_type_time_idx
  ON learning_events (event_type, occurred_at DESC);
