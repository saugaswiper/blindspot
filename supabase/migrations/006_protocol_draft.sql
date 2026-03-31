-- =============================================================================
-- Migration 006: Protocol draft storage
-- Run in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Add a text column to cache the AI-generated PROSPERO protocol draft.
-- Without this column the draft is lost whenever the user refreshes the page,
-- forcing a full Gemini re-generation. Storing it means:
--   1. Users can close the tab and return to find their protocol intact.
--   2. The API can skip re-generation if a draft already exists and return the
--      stored value immediately.
--
-- NULL means no protocol has been generated yet for this result.
-- An empty string is treated the same as NULL in application code.
--
-- The column has no NOT NULL constraint and no default — older rows remain
-- NULL and the UI shows the "Generate Protocol" prompt as before.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS protocol_draft text;
