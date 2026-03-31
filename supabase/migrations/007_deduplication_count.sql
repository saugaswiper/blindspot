-- Migration 007: Add deduplication_count column to search_results
--
-- Stores the number of duplicate records removed across databases during the
-- search pipeline (totalIdentified - uniqueCount). Used to display a proper
-- PRISMA 2020 "Duplicates removed" box in the flow diagram.
--
-- Nullable: NULL for all pre-migration rows (the UI treats NULL as "no data"
-- and renders the diagram without the duplicates-removed box, unchanged from
-- the previous behaviour).
--
-- No index needed: read once per page load for a single known id.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS deduplication_count integer;
