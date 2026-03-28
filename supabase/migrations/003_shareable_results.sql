-- =============================================================================
-- Shareable Result Links
-- Adds is_public flag to search_results so results can be shared without auth.
-- Apply in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Add is_public column (defaults to false so all existing results stay private)
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Allow anyone (authenticated or anonymous) to read results marked public.
-- Works alongside the existing search_results_select_own policy: a result is
-- readable if the viewer owns it OR if it has been explicitly shared.
CREATE POLICY "search_results_select_public" ON search_results
  FOR SELECT USING (is_public = true);

-- Allow the searches row (containing query_text) to be read by anyone when
-- its associated result is public — so the topic is visible to public viewers.
CREATE POLICY "searches_select_via_public_result" ON searches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM search_results
      WHERE search_results.search_id = searches.id
        AND search_results.is_public = true
    )
  );

-- Partial index: only indexes the (small) set of public results for fast lookup
CREATE INDEX IF NOT EXISTS search_results_is_public_idx
  ON search_results(id)
  WHERE is_public = true;
