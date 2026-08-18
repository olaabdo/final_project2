-- Pre-aggregated rollup for GET /logs/aggregate. Insert-only by design: every
-- ingest batch appends one row per (bucket, service, level) it touched, instead
-- of UPDATEing a shared counter row. An UPDATE-based upsert here would take a
-- row lock per key, and with many concurrent ingest batches all writing "now"
-- (a handful of buckets), that serializes almost every transaction behind a
-- handful of locks. A plain INSERT never blocks another INSERT. Counts are
-- summed at query time (see aggregateFromRollup) instead of maintained as a
-- single running total.
CREATE TABLE IF NOT EXISTS logs_agg_1m (
  bucket_start TIMESTAMPTZ NOT NULL,
  service TEXT NOT NULL,
  level TEXT NOT NULL,
  count BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_agg_1m_bucket ON logs_agg_1m (bucket_start, service, level);
