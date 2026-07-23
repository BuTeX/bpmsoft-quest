ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(64);
