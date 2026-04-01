/**
 * lib/cron-search.ts
 *
 * Lightweight search helpers used by the email-alerts cron job.
 *
 * The cron job needs to detect genuinely NEW systematic reviews that were
 * published after a user originally ran their Blindspot search. To do this
 * without hammering all four external APIs on every run, we:
 *
 *   1. Re-search PubMed only (fastest, most reliable, free-tier friendly).
 *   2. Compare fresh PubMed results against the stored `existing_reviews`
 *      snapshot using DOI, PMID, and normalised title as deduplication keys.
 *   3. Treat anything not in the snapshot as "new".
 *
 * After sending an alert, the cron job merges the new reviews into the stored
 * snapshot (via `mergeReviews`) so the same reviews are not re-reported the
 * following week.
 *
 * All functions here are pure (except `runCronSearch` which is async/side-effectful)
 * so they are easy to unit-test without a DOM or database.
 */

import * as PubMed from "@/lib/pubmed";
import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// Public: lightweight re-search
// ---------------------------------------------------------------------------

/**
 * Run a PubMed-only search for existing systematic reviews on `query`.
 *
 * Returns an empty array on API failure so the cron job does not crash — a
 * temporary PubMed outage should silently skip alert processing for that run.
 */
export async function runCronSearch(query: string): Promise<ExistingReview[]> {
  try {
    return await PubMed.searchExistingReviews(query);
  } catch (error) {
    console.error(`[cron-search] PubMed re-search failed for "${query}":`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public: DOI normalisation (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Normalise a DOI to a bare lower-case identifier, stripping any URL prefix.
 *
 * OpenAlex returns DOIs as "https://doi.org/10.xxx/..." while PubMed and
 * Europe PMC return bare DOIs ("10.xxx/..."). Normalising before comparison
 * prevents the same paper from appearing as two different reviews.
 */
export function normalizeDoi(doi: string): string {
  return doi
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}

// ---------------------------------------------------------------------------
// Public: merge helper
// ---------------------------------------------------------------------------

/**
 * Merge `incoming` reviews into `existing`, deduplicating by DOI, PMID, or
 * normalised title.
 *
 * - Preserves the original `existing` order (old reviews first).
 * - Appends genuinely new reviews from `incoming` to the end.
 * - A review is considered a duplicate if it matches any existing review by:
 *     1. DOI (after normalisation), OR
 *     2. PMID, OR
 *     3. Title (lower-cased and trimmed) — only when neither DOI nor PMID is
 *        present on the incoming review (avoids false-positive deduplication
 *        for unrelated papers that happen to share a common title fragment).
 *
 * @param existing  Reviews stored from the original user search (snapshot)
 * @param incoming  Fresh reviews returned by the cron re-search
 * @returns         Merged array, no duplicates
 */
export function mergeReviews(
  existing: ExistingReview[],
  incoming: ExistingReview[]
): ExistingReview[] {
  // Seed the seen-sets from the existing snapshot
  const seenDois = new Set<string>();
  const seenPmids = new Set<string>();
  const seenTitles = new Set<string>();

  for (const r of existing) {
    if (r.doi) seenDois.add(normalizeDoi(r.doi));
    if (r.pmid) seenPmids.add(r.pmid.trim());
    seenTitles.add(r.title.toLowerCase().trim());
  }

  const added: ExistingReview[] = [];

  for (const r of incoming) {
    const doi = r.doi ? normalizeDoi(r.doi) : null;
    const pmid = r.pmid?.trim() ?? null;
    const titleKey = r.title.toLowerCase().trim();

    // Deduplicate by DOI
    if (doi && seenDois.has(doi)) continue;
    // Deduplicate by PMID
    if (pmid && seenPmids.has(pmid)) continue;
    // Deduplicate by title when no strong identifier is available
    if (!doi && !pmid && seenTitles.has(titleKey)) continue;

    // Mark as seen
    if (doi) seenDois.add(doi);
    if (pmid) seenPmids.add(pmid);
    seenTitles.add(titleKey);

    added.push(r);
  }

  return [...existing, ...added];
}
