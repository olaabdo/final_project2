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

-- service=/level= filters combined with a time range
CREATE INDEX IF NOT EXISTS idx_logs_service_ts ON logs (service, ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_ts ON logs (level, ts DESC);

-- attr.<key>=<value> filters (attributes ->> key = value)
CREATE INDEX IF NOT EXISTS idx_logs_attributes_gin ON logs USING GIN (attributes jsonb_path_ops);

-- q= substring search against message
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_logs_message_trgm ON logs USING GIN (message gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_composite ON logs (service, level, ts DESC);