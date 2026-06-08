-- NEW-8 Enhancement: Add living_reviews column for actual LSR details
--
-- Stores the full list of living systematic reviews (titles, sources, years, IDs)
-- found on the topic. Previously only the count was stored. Now researchers can
-- see actual review titles and click through to PubMed/DOI links.
--
-- NULL = this result predates this migration, or the search API did not extract
-- the living reviews (graceful degradation). UI shows count-only banner in this case.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS living_reviews jsonb;

-- Index for efficient future queries on living_reviews data
CREATE INDEX IF NOT EXISTS idx_search_results_living_reviews
  ON search_results USING gin(living_reviews);
