-- NEW-8: Add living_review_count column to search_results
--
-- Stores the number of "living systematic reviews" (continuously-updated
-- reviews) found on the topic at search time. Displayed as an informational
-- banner in the dashboard so researchers know whether an LSR program is
-- already addressing the gap they identified.
--
-- NULL = the PubMed `countLivingReviews` call was unavailable, OR the result
-- predates this migration. UI hides the banner when null.

ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS living_review_count integer;
