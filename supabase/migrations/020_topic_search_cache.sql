-- NEW-12: Add topic_search_cache table for caching countPrimaryStudies results
-- Purpose: Cache PubMed/OpenAlex counts per query to reduce API calls by ~40%
-- TTL: 7 days (enforced in application logic)

CREATE TABLE IF NOT EXISTS topic_search_cache (
  id BIGSERIAL PRIMARY KEY,
  query_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash of the normalized query
  pubmed_count INTEGER,
  openalex_count INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup by query_hash (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_topic_search_cache_query_hash
ON topic_search_cache (query_hash);

-- Index for cleanup: find stale entries older than 7 days
CREATE INDEX IF NOT EXISTS idx_topic_search_cache_updated_at
ON topic_search_cache (updated_at);

-- Comment for documentation
COMMENT ON TABLE topic_search_cache IS 'Caches PubMed and OpenAlex study counts per normalized query. Entries older than 7 days should be refreshed by the application.';
COMMENT ON COLUMN topic_search_cache.query_hash IS 'SHA-256 hash of normalized query for deterministic lookups';
COMMENT ON COLUMN topic_search_cache.pubmed_count IS 'Cached PubMed primary study count (excluding systematic reviews)';
COMMENT ON COLUMN topic_search_cache.openalex_count IS 'Cached OpenAlex article count';
COMMENT ON COLUMN topic_search_cache.updated_at IS 'Last time this cache entry was refreshed; TTL is 7 days';
