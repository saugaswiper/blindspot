-- =============================================================================
-- Migration 013 — Security Hardening
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. search_results — add missing DELETE RLS policy
--
--    The initial schema had SELECT and INSERT policies but no DELETE policy,
--    meaning users could never delete their own results through the normal
--    (non-service-role) client. Make the policy explicit.
-- -----------------------------------------------------------------------------

CREATE POLICY IF NOT EXISTS "search_results_delete_own" ON search_results
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );

-- Also add an UPDATE policy (needed by /api/analyze which writes gap_analysis back).
-- Previously this worked only because the service-role client was used; adding an
-- explicit RLS UPDATE policy lets the normal authenticated client do it too, which
-- is safer (principle of least privilege).
CREATE POLICY IF NOT EXISTS "search_results_update_own" ON search_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 2. searches — add guest_ip_hash column for server-side guest rate limiting
--
--    Stores a one-way SHA-256 hash (truncated, 32 hex chars) of the guest
--    client's IP address so the /api/search route can enforce a per-IP limit
--    of 3 guest searches per 24-hour window — resistant to cookie clearing.
--
--    Only populated for guest searches (user_id IS NULL).
--    Authenticated users always have user_id set; this column is NULL for them.
-- -----------------------------------------------------------------------------

ALTER TABLE searches
  ADD COLUMN IF NOT EXISTS guest_ip_hash text;

-- Index for fast rate-limit lookups (guest_ip_hash + created_at).
CREATE INDEX IF NOT EXISTS searches_guest_ip_hash_created_at_idx
  ON searches (guest_ip_hash, created_at DESC)
  WHERE guest_ip_hash IS NOT NULL;
