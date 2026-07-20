CREATE TABLE IF NOT EXISTS player_progress (
  player_id UUID PRIMARY KEY,
  state JSONB NOT NULL,
  progress_score SMALLINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_progress_updated_at_idx
  ON player_progress (updated_at DESC);
