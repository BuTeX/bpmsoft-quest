ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

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
