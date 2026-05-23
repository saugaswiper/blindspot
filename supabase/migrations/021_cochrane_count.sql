-- Cochrane Library integration: Add cochrane_count to search_results
-- Purpose: Track Cochrane Library systematic review count per search
-- Added by: Daily Improver Session (May 23, 2026)
-- Impact: Provides gold-standard systematic review discovery directly from Cochrane

ALTER TABLE search_results ADD COLUMN IF NOT EXISTS cochrane_count integer;

-- Index for filtering/sorting by Cochrane count
CREATE INDEX IF NOT EXISTS idx_search_results_cochrane_count
ON search_results (cochrane_count);

-- Comment for documentation
COMMENT ON COLUMN search_results.cochrane_count IS 'Number of Cochrane Library systematic reviews matching the search query. NULL indicates this column was added after the search was performed.';
