/**
 * PRISMA Flow Diagram utilities for Blindspot.
 *
 * Generates structured data for a PRISMA 2020-style flow diagram from
 * Blindspot's search results. Because Blindspot deduplicates reviews
 * cross-database before storing them, per-database counts reflect
 * post-deduplication attribution (each review is counted once, under the
 * first database that found it).
 *
 * All functions are pure (no I/O) so they are easily unit-testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-database breakdown of retrieved systematic reviews. */
export interface PrismaSourceCount {
  name: string;
  /** Number of unique reviews attributed to this source after deduplication. */
  count: number;
}

/** Structured data consumed by the PRISMA diagram UI component. */
export interface PrismaData {
  /** Per-database counts (post-dedup attribution order). */
  sources: PrismaSourceCount[];
  /** Total unique systematic reviews retrieved after deduplication. */
  reviewsRetrieved: number;
  /** Number of databases searched (always 4 in Blindspot's current stack). */
  databasesSearched: number;
  /** Combined primary study count from all databases. */
  primaryStudyCount: number;
  /** Registered trials from ClinicalTrials.gov; null if unavailable. */
  clinicalTrialsCount: number | null;
  /** PROSPERO registrations; null if unavailable or not checked. */
  prosperoCount: number | null;
  /**
   * Number of duplicate records removed during cross-database deduplication.
   * Null for results stored before migration 007 was applied (pre-existing rows).
   * When non-null, the PRISMA diagram shows a proper "Duplicates removed" box.
   */
  deduplicationCount: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Ordered list of databases Blindspot searches. This order controls how
 * databases appear left-to-right in the Identification row of the diagram.
 */
export const KNOWN_SOURCES = [
  "PubMed",
  "OpenAlex",
  "Europe PMC",
  "Semantic Scholar",
] as const;

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Compute PRISMA diagram data from Blindspot search results.
 *
 * @param existingReviews - The deduplicated array of existing reviews, each
 *   with an optional `source` field identifying which database first found it.
 * @param primaryStudyCount - Combined primary study count (from feasibility
 *   scoring — already blended across PubMed, OpenAlex, Europe PMC).
 * @param clinicalTrialsCount - Registered trial count (null = unavailable).
 * @param prosperoCount - PROSPERO registration count (null = unavailable).
 * @param deduplicationCount - Number of cross-database duplicates removed.
 *   Null for results stored before migration 007 (treated as unavailable
 *   in the UI — the "Duplicates removed" box is hidden).
 */
export function computePrismaData(
  existingReviews: Array<{ source?: string }>,
  primaryStudyCount: number,
  clinicalTrialsCount: number | null = null,
  prosperoCount: number | null = null,
  deduplicationCount: number | null = null
): PrismaData {
  // Count reviews per source
  const sourceCounts: Record<string, number> = {};
  for (const review of existingReviews) {
    const source = review.source ?? "Other";
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }

  // Build output: known sources in canonical order first (even if count = 0)
  const sources: PrismaSourceCount[] = KNOWN_SOURCES.map((name) => ({
    name,
    count: sourceCounts[name] ?? 0,
  }));

  // Append any unexpected source names not in the canonical list
  for (const [name, count] of Object.entries(sourceCounts)) {
    if (!(KNOWN_SOURCES as readonly string[]).includes(name)) {
      sources.push({ name, count });
    }
  }

  return {
    sources,
    reviewsRetrieved: existingReviews.length,
    databasesSearched: KNOWN_SOURCES.length,
    primaryStudyCount,
    clinicalTrialsCount,
    prosperoCount,
    deduplicationCount,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a count as a localized string for display in the diagram.
 * Returns "N/A" for null values (e.g. when a data source was unavailable).
 */
export function formatCount(n: number | null): string {
  if (n === null) return "N/A";
  return n.toLocaleString("en-US");
}

/**
 * Returns true if the PRISMA data has any content worth displaying.
 * Specifically: the reviewsRetrieved count is available (always true since it
 * comes from the existingReviews array, which is always present).
 * This guard exists to protect against future API changes that might pass
 * undefined data.
 */
export function hasPrismaData(data: PrismaData): boolean {
  return typeof data.reviewsRetrieved === "number";
}
