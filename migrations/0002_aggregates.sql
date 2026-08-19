-- UNLOGGED Table with pure append-only design (No Primary Key constraint to avoid lock serialization)
CREATE UNLOGGED TABLE IF NOT EXISTS logs_agg_1m (
  bucket_start TIMESTAMPTZ NOT NULL,
  service TEXT NOT NULL,
  level TEXT NOT NULL,
  count BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_agg_1m_bucket ON logs_agg_1m (bucket_start, service, level);
