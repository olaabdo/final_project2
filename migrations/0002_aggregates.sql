CREATE UNLOGGED TABLE IF NOT EXISTS logs_agg_1m (
  bucket_start TIMESTAMPTZ NOT NULL,
  service TEXT NOT NULL,
  level TEXT NOT NULL,
  count BIGINT NOT NULL,
  PRIMARY KEY (bucket_start, service, level)
);

CREATE INDEX IF NOT EXISTS idx_logs_agg_1m_bucket ON logs_agg_1m (bucket_start, service, level);
