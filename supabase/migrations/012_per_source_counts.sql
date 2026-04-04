-- =============================================================================
-- Per-Source Study Counts — UI-1: Per-Database Study Count Breakdown
-- =============================================================================
--
-- Adds three nullable integer columns to `search_results` that store the
-- individual primary-study counts from each academic database:
--
--   pubmed_count       — PubMed (primary source; systematic reviews excluded)
--   openalex_count     — OpenAlex (broad coverage; type:article filter)
--   europepmc_count    — Europe PMC (clinical focus; SR excluded)
--
-- These are the same values already computed in /api/search but previously
-- discarded after the blended primary_study_count was calculated.
--
-- Null means:
--   a) The API for that source was temporarily unavailable during the search, or
--   b) The result predates this migration (pre-v031 rows).
--
-- The UI shows an expandable "Sources" detail under the primary study count
-- when at least one per-source value is non-null.
-- =============================================================================

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS pubmed_count    integer,
  ADD COLUMN IF NOT EXISTS openalex_count  integer,
  ADD COLUMN IF NOT EXISTS europepmc_count integer;
