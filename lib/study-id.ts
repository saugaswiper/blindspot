/**
 * Shared study-identifier primitives — the single source of truth for how
 * Blindspot normalizes and matches study identifiers (PMID, DOI) across
 * sources.
 *
 * Previously the dedup logic lived privately inside `app/api/search/route.ts`.
 * The Search Recall & Provenance Benchmark milestone needs the *exact same*
 * matching semantics to compute recall against gold-standard truth sets, so the
 * primitive is extracted here and reused by both the search route and
 * `lib/recall-benchmark.ts`. Re-deriving it would risk the benchmark and
 * production silently diverging.
 *
 * Matching rules (unchanged from the original route implementation):
 *   - PMID: trimmed string equality.
 *   - DOI: lowercased, trimmed, `https://(dx.)doi.org/` URL prefix stripped.
 *   - Two records are the same study if they share a PMID OR a normalized DOI.
 *   - Dedup precedence when merging sources: PMID first, then DOI.
 */

export interface StudyId {
  pmid?: string;
  doi?: string;
}

/** Normalize a DOI to a bare, lowercased identifier (or undefined if absent). */
export function normalizeDoi(doi: string | undefined | null): string | undefined {
  if (!doi) return undefined;
  const bare = doi
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return bare || undefined;
}

/** Normalize a PMID to a trimmed identifier (or undefined if absent). */
export function normalizePmid(pmid: string | undefined | null): string | undefined {
  if (!pmid) return undefined;
  const bare = pmid.trim();
  return bare || undefined;
}

export interface DedupeStudyIdsResult {
  /** Records kept after removing cross-source duplicates, in merge order. */
  unique: StudyId[];
  /** Total records across all sources before dedup. */
  totalCount: number;
  /** Unique records after dedup. */
  uniqueCount: number;
  /**
   * Fraction of records that were unique, in (0, 1]. 1 means no overlap.
   * Returns 1 for an empty input so callers can multiply safely.
   */
  dedupFraction: number;
}

/**
 * Deduplicate study IDs merged from multiple sources, in the order given.
 *
 * A record is a duplicate if its PMID or its normalized DOI was already seen in
 * an earlier record (within or across sources). This mirrors the production
 * `computeDedupFraction` behaviour exactly.
 */
export function dedupeStudyIds(sources: StudyId[][]): DedupeStudyIdsResult {
  const seenPmids = new Set<string>();
  const seenDois = new Set<string>();
  const unique: StudyId[] = [];
  let totalCount = 0;

  for (const source of sources) {
    for (const id of source) {
      totalCount++;
      const pmid = normalizePmid(id.pmid);
      const doi = normalizeDoi(id.doi);

      if (pmid && seenPmids.has(pmid)) continue;
      if (doi && seenDois.has(doi)) continue;

      if (pmid) seenPmids.add(pmid);
      if (doi) seenDois.add(doi);
      unique.push(id);
    }
  }

  const uniqueCount = unique.length;
  return {
    unique,
    totalCount,
    uniqueCount,
    dedupFraction: totalCount === 0 ? 1 : uniqueCount / totalCount,
  };
}

/**
 * A membership index over a set of study identifiers. Used by the recall
 * benchmark to test, for each gold-standard study, whether a source returned
 * it — matching by PMID or normalized DOI.
 */
export class StudyIdIndex {
  private readonly pmids = new Set<string>();
  private readonly dois = new Set<string>();

  constructor(ids: Iterable<StudyId> = []) {
    for (const id of ids) this.add(id);
  }

  add(id: StudyId): void {
    const pmid = normalizePmid(id.pmid);
    const doi = normalizeDoi(id.doi);
    if (pmid) this.pmids.add(pmid);
    if (doi) this.dois.add(doi);
  }

  /** True if this index contains a record sharing the given study's PMID or DOI. */
  has(id: StudyId): boolean {
    const pmid = normalizePmid(id.pmid);
    if (pmid && this.pmids.has(pmid)) return true;
    const doi = normalizeDoi(id.doi);
    if (doi && this.dois.has(doi)) return true;
    return false;
  }
}
