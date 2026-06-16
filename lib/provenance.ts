/**
 * Per-record provenance for deduplicated search results.
 *
 * Acceptance criterion #3 of the Search Recall & Provenance Benchmark milestone:
 * every returned study should expose which source(s) found it, so the result is
 * auditable and the per-source breakdown is trustworthy. This module replaces
 * the route's anonymous `dedupeReviews` with a provenance-aware version that, as
 * it merges sources, records the set of sources that matched each unique record.
 *
 * Matching semantics are IDENTICAL to the original route dedup so behaviour
 * doesn't change: a record is the same study if it shares a normalized title,
 * a normalized DOI (lib/study-id.ts), or a trimmed PMID. Title is checked
 * first, then DOI, then PMID — the canonical record keeps the first source's
 * object/`source`, and later matching sources are appended to `sources`.
 */

import { normalizeDoi, normalizePmid } from "@/lib/study-id";
import type { ExistingReview } from "@/types";

export interface NamedSource {
  /** Display name attributed to records this source contributed, e.g. "PubMed". */
  name: string;
  reviews: ExistingReview[];
}

export interface DedupeWithProvenanceResult {
  /** Deduplicated records, each carrying `sources` (every source that found it). */
  reviews: ExistingReview[];
  /** Sum of records across all sources before dedup. */
  totalIdentified: number;
  /** Duplicates removed (totalIdentified - unique count). */
  deduplicationCount: number;
}

interface Canonical {
  review: ExistingReview;
  sources: Set<string>;
}

/**
 * Deduplicate review records from multiple named sources, tracking provenance.
 *
 * @param sources  Sources in merge order (earlier sources win the canonical record).
 */
export function dedupeReviewsWithProvenance(sources: NamedSource[]): DedupeWithProvenanceResult {
  const titleMap = new Map<string, Canonical>();
  const doiMap = new Map<string, Canonical>();
  const pmidMap = new Map<string, Canonical>();
  const ordered: Canonical[] = [];
  let totalIdentified = 0;

  for (const { name, reviews } of sources) {
    for (const review of reviews) {
      totalIdentified++;

      const titleKey = review.title.toLowerCase().trim();
      const doiKey = normalizeDoi(review.doi);
      const pmidKey = normalizePmid(review.pmid);

      // Find the canonical record this matches, checking title → DOI → PMID.
      const existing =
        (titleKey && titleMap.get(titleKey)) ||
        (doiKey && doiMap.get(doiKey)) ||
        (pmidKey && pmidMap.get(pmidKey)) ||
        undefined;

      if (existing) {
        // Duplicate: attribute this source and register any new keys it brings
        // so subsequent records can match the same canonical record.
        existing.sources.add(name);
        if (titleKey && !titleMap.has(titleKey)) titleMap.set(titleKey, existing);
        if (doiKey && !doiMap.has(doiKey)) doiMap.set(doiKey, existing);
        if (pmidKey && !pmidMap.has(pmidKey)) pmidMap.set(pmidKey, existing);
        continue;
      }

      // New unique record.
      const canonical: Canonical = { review, sources: new Set([name]) };
      ordered.push(canonical);
      if (titleKey) titleMap.set(titleKey, canonical);
      if (doiKey) doiMap.set(doiKey, canonical);
      if (pmidKey) pmidMap.set(pmidKey, canonical);
    }
  }

  const reviews = ordered.map((c) => ({ ...c.review, sources: [...c.sources] }));

  return {
    reviews,
    totalIdentified,
    deduplicationCount: totalIdentified - reviews.length,
  };
}
