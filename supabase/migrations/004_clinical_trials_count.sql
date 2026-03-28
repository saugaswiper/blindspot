-- =============================================================================
-- Migration 004: ClinicalTrials.gov count storage
-- Run in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Add a dedicated column to store the ClinicalTrials.gov result count.
-- Previously this value was fetched during search but only used to influence
-- primary_study_count; it was never stored separately. This migration lets us
-- display it prominently in the results header as an "Ongoing Trials" metric.
--
-- NULL means the value was not yet fetched or the column didn't exist for older
-- rows (pre-migration). The UI treats NULL as "data unavailable" and hides the
-- metric rather than showing 0.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS clinical_trials_count integer;

-- Partial index for fast non-null lookups (used when surfacing the metric)
CREATE INDEX IF NOT EXISTS idx_search_results_clinical_trials_count
  ON search_results (id)
  WHERE clinical_trials_count IS NOT NULL;
