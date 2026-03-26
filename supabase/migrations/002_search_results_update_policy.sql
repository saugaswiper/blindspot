-- Allow users to update search_results rows linked to their own searches
-- (needed for saving gap analysis, feasibility score, study design back to the row)
CREATE POLICY "search_results_update_own" ON search_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );
