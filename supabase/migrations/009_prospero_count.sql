-- =============================================================================
-- Migration 009: PROSPERO registration count storage
-- Run in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Adds a column to store the PROSPERO pre-registration count for a search.
-- NULL means the value was not available or the column didn't exist for older
-- rows (pre-migration). The UI treats NULL as "data unavailable".

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS prospero_registrations_count integer;
