-- Migration 015: Add OSF Registries count to search_results
--
-- ACC-6: OSF (Open Science Framework) is the third-largest systematic review
-- registry with 2,960+ protocols as of 2026. Storing the OSF registration count
-- alongside the existing PROSPERO count allows the UI to show a comprehensive
-- registry check across PROSPERO + OSF.
--
-- The column is nullable: NULL means the count was not available when the search
-- ran (e.g. the OSF API was down, or the result predates this migration).

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS osf_registrations_count integer;

COMMENT ON COLUMN search_results.osf_registrations_count IS
  'Number of systematic review protocols matching this query in OSF Registries. '
  'NULL if the OSF API was unavailable or the result predates migration 015.';
