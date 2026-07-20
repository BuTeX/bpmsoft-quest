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
  last_login_at TIMESTAMPTZ
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

CREATE TABLE IF NOT EXISTS account_progress (
  account_id UUID PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  chapter1_state JSONB,
  chapter1_score SMALLINT NOT NULL DEFAULT 0,
  chapter2_state JSONB,
  chapter2_score SMALLINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_progress_updated_at_idx
  ON account_progress (updated_at DESC);
