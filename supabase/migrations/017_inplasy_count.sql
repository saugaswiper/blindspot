-- ACC-11: Add inplasy_count column to search_results
-- INPLASY is the #2 systematic review registry (after PROSPERO), with 2,370+
-- registered protocols as of 2026. This column stores the count of matching
-- INPLASY registrations found at search time.
-- NULL = API was unavailable or result predates this migration.

ALTER TABLE search_results
ADD COLUMN IF NOT EXISTS inplasy_count integer;
