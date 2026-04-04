-- =============================================================================
-- Guest Searches — allow one unauthenticated search before sign-up gate
-- =============================================================================
--
-- Makes searches.user_id nullable so the /api/search route can save a single
-- guest result (user_id = NULL) via the service-role client without requiring
-- a Supabase auth session.
--
-- Guest results are always saved with is_public = TRUE so the results page
-- can be viewed without authentication. The existing
-- search_results_select_public and searches_select_via_public_result RLS
-- policies (added in migration 003) already cover this case — no new policies
-- are needed.
--
-- A cookie (blindspot_guest_search) is set by the API after the first guest
-- search and checked on subsequent unauthenticated requests to enforce the
-- one-search-per-session limit at the application layer.
-- =============================================================================

ALTER TABLE searches ALTER COLUMN user_id DROP NOT NULL;
