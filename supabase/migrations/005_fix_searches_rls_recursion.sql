-- =============================================================================
-- Migration 005: Fix infinite recursion in searches RLS policies
--
-- Migration 003 added searches_select_via_public_result, which queries
-- search_results. search_results_select_own in turn queries searches,
-- creating infinite recursion whenever a SELECT on searches is evaluated
-- (including on INSERT ... RETURNING).
--
-- Fix: drop the recursive policy and replace it with a SECURITY DEFINER
-- function that queries search_results without triggering RLS on that table.
-- Apply in Supabase Dashboard → SQL Editor
-- =============================================================================

-- Drop the recursive policy
DROP POLICY IF EXISTS "searches_select_via_public_result" ON searches;

-- Security-definer helper: checks whether a given search has a public result
-- Runs as the function owner (bypasses RLS on search_results → no recursion)
CREATE OR REPLACE FUNCTION public.search_has_public_result(p_search_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM search_results
    WHERE search_results.search_id = p_search_id
      AND search_results.is_public = true
  );
$$;

-- Recreate the policy using the helper (no direct subquery on search_results)
CREATE POLICY "searches_select_via_public_result" ON searches
  FOR SELECT USING (
    public.search_has_public_result(id)
  );
