-- =============================================================================
-- Recent Primary Study Count — NEW-2: Study Count Trend
-- =============================================================================
--
-- Adds a nullable integer column `recent_primary_study_count` to the
-- `search_results` table. This stores the number of primary studies found
-- (excluding systematic reviews) published within the last 3 years for a
-- given query.
--
-- Combined with `primary_study_count` (all-time), this enables a "Study Trend"
-- indicator in the results dashboard:
--   ≥ 35% recent → "↑ Growing"
--   15–34% recent → "→ Stable"
--   < 15% recent → "↓ Declining"
--   < 5 total → no trend shown (insufficient data)
--
-- Null means the data was unavailable when the search was run (API failure)
-- or the result predates this migration. The UI gracefully hides the trend
-- indicator when the value is null.
-- =============================================================================

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS recent_primary_study_count integer;
