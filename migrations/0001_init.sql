CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL,
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keyset pagination + range scans, newest first
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs (ts DESC, id DESC);

-- Composite index: covers (service, level, ts)
CREATE INDEX IF NOT EXISTS idx_logs_composite ON logs (service, level, ts DESC);

-- Level filtering with time range
CREATE INDEX IF NOT EXISTS idx_logs_level_ts ON logs (level, ts DESC);

-- Plain GIN indexes without fastupdate stalls
CREATE INDEX IF NOT EXISTS idx_logs_attributes_gin ON logs USING GIN (attributes jsonb_path_ops);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_logs_message_trgm ON logs USING GIN (message gin_trgm_ops);
