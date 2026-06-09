-- =============================================================================
-- Migration 023 — Screening Results Column
-- Adds a screening_result JSONB column to search_results for storing
-- AI-powered title/abstract screening decisions (ScreeningResult type).
-- =============================================================================

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS screening_result jsonb DEFAULT NULL;

-- Index for non-null screening results (used by future "my screens" dashboard)
CREATE INDEX IF NOT EXISTS search_results_screening_idx
  ON search_results ((screening_result IS NOT NULL))
  WHERE screening_result IS NOT NULL;

COMMENT ON COLUMN search_results.screening_result IS
  'AI-powered title/abstract screening result (ScreeningResult JSON). '
  'Null until the owner runs screening via /api/screening/run. '
  'Stores criteria, per-review decisions, and summary counts.';
