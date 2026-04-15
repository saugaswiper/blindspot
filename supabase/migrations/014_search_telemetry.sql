-- =============================================================================
-- Migration 014 — Search Telemetry Table
-- =============================================================================
--
-- Adds a `search_telemetry` table that logs per-search PRISMA rate data.
-- Purpose: validate whether the estimated PRISMA "included" count and its
-- confidence interval (÷0.5 to ×2, handoff 038) captures the true included
-- count when compared against subsequently published systematic reviews.
--
-- Data collected per search (at search time, without AI study-design context):
--   after_dedup      — blended unique primary study count (= primary_study_count)
--   tier             — corpus size tier (small/medium/large/xl/xxl)
--   included_estimate — PRISMA point estimate using generic (no study-design) rates
--   included_low     — CI lower bound
--   included_high    — CI upper bound
--   is_guest         — whether the search was run by a guest (no user account)
--
-- Note: study design is not available at search time; it is only set when the
-- user requests AI gap analysis. The telemetry uses generic (null study-design)
-- rates so all rows are comparable on the same basis for tier calibration.
--
-- Access policy: only the service role (internal analytics) can read or write.
-- Regular authenticated users and anon role have no access to this table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS search_telemetry (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  search_result_id   uuid         NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
  after_dedup        integer      NOT NULL CHECK (after_dedup >= 0),
  tier               text         NOT NULL CHECK (tier IN ('small', 'medium', 'large', 'xl', 'xxl')),
  included_estimate  integer      NOT NULL CHECK (included_estimate >= 1),
  included_low       integer      NOT NULL CHECK (included_low >= 1),
  included_high      integer      NOT NULL CHECK (included_high >= 1),
  is_guest           boolean      NOT NULL DEFAULT false,
  created_at         timestamptz  NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Indexes
-- -----------------------------------------------------------------------------

-- Fast lookup by result (FK traversal, cascade delete)
CREATE INDEX IF NOT EXISTS search_telemetry_search_result_id_idx
  ON search_telemetry (search_result_id);

-- Time-series queries for calibration validation (newest first)
CREATE INDEX IF NOT EXISTS search_telemetry_created_at_idx
  ON search_telemetry (created_at DESC);

-- Tier-sliced calibration queries (e.g. "all XXL rows")
CREATE INDEX IF NOT EXISTS search_telemetry_tier_created_at_idx
  ON search_telemetry (tier, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Row-Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE search_telemetry ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS entirely, so no explicit service-role policy is
-- needed. However, we add an explicit DENY for authenticated users and anon
-- to make the intent clear and auditable.

-- Deny all access to authenticated users (telemetry is internal-only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'search_telemetry'
      AND policyname = 'search_telemetry_deny_authenticated'
  ) THEN
    CREATE POLICY "search_telemetry_deny_authenticated" ON search_telemetry
      FOR ALL TO authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

-- Deny all access to anon role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'search_telemetry'
      AND policyname = 'search_telemetry_deny_anon'
  ) THEN
    CREATE POLICY "search_telemetry_deny_anon" ON search_telemetry
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END $$;
