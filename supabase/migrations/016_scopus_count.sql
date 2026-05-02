-- Migration 016: Add Scopus primary study count to search_results
--
-- Adds a nullable `scopus_count` column to store the number of primary studies
-- found in Elsevier Scopus for each search query.
--
-- Scopus is one of the world's largest abstract and citation databases,
-- covering ~27,000 peer-reviewed journals across all disciplines. Adding it
-- as a fifth source (alongside PubMed, OpenAlex, EuropePMC, and ClinicalTrials)
-- improves coverage for interdisciplinary and social science research topics.
--
-- The column is nullable: NULL means either the Elsevier API was unavailable
-- at search time, or the result predates this migration.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS scopus_count integer;

COMMENT ON COLUMN search_results.scopus_count IS
  'Primary study count from Elsevier Scopus (TYPE: article). '
  'NULL if the Elsevier API was unavailable or the result predates migration 016.';
