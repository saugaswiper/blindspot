-- =============================================================================
-- Migration 013 — Security Hardening
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. search_results — add missing DELETE and UPDATE RLS policies
--
--    CREATE POLICY does not support IF NOT EXISTS, so we use DO blocks to
--    check pg_policies before creating each policy idempotently.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'search_results'
      AND policyname = 'search_results_delete_own'
  ) THEN
    CREATE POLICY "search_results_delete_own" ON search_results
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM searches
          WHERE searches.id = search_results.search_id
            AND searches.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'search_results'
      AND policyname = 'search_results_update_own'
  ) THEN
    CREATE POLICY "search_results_update_own" ON search_results
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM searches
          WHERE searches.id = search_results.search_id
            AND searches.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. searches — add guest_ip_hash column for server-side guest rate limiting
--
--    Stores a one-way SHA-256 hash (truncated to 32 hex chars) of the guest
--    client IP so /api/search can enforce 3 guest searches per IP per 24 hours,
--    resistant to cookie clearing / incognito mode.
--
--    Only populated for guest searches (user_id IS NULL).
-- -----------------------------------------------------------------------------

ALTER TABLE searches
  ADD COLUMN IF NOT EXISTS guest_ip_hash text;

CREATE INDEX IF NOT EXISTS searches_guest_ip_hash_created_at_idx
  ON searches (guest_ip_hash, created_at DESC)
  WHERE guest_ip_hash IS NOT NULL;
