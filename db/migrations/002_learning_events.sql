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
    CHECK (attempt IS NULL OR attempt BETWEEN 1 AND 100),
  duration_ms INTEGER
    CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000),
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
