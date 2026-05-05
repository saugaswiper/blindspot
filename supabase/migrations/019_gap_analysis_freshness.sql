-- ACC-12: Add gap_analysis_generated_at timestamp column
--
-- Tracks when the AI gap analysis was generated. This allows the UI to:
-- 1. Show "Analysis generated on [date]" informational text
-- 2. Display a "Refresh analysis" button for analyses older than 6 months
-- 3. Warn researchers that the underlying existing reviews may be stale
--
-- NULL = analysis does not exist, OR result predates this migration.
-- When gap_analysis is NULL, this column must also be NULL.
-- When gap_analysis is not NULL, this should contain the timestamp of generation.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS gap_analysis_generated_at timestamp with time zone;

-- Optional: add an index for "stale analysis" queries later
-- CREATE INDEX idx_search_results_gap_analysis_freshness
--   ON search_results(gap_analysis_generated_at)
--   WHERE gap_analysis IS NOT NULL;
