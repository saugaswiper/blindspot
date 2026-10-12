import { ApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

/**
 * Restrict a query to EuropePMC's title + abstract fields.
 *
 * EuropePMC searches full text by default, which inflates primary-study counts
 * by ~10–20% compared to PubMed's [tiab]-restricted queries (papers match when
 * the terms appear only in body text, references, or supplementary material).
 *
 * Wrapping with TITLE_ABS:() narrows scope to title + abstract, matching the
 * intent of PubMed's `[tiab]` and OpenAlex's `title_abstract` filters.
 *
 * Not applied when the query already contains EuropePMC field qualifiers
 * (TITLE_ABS:, SRC:, PUB_TYPE:, FIRST_PDATE:) or PubMed field tags ([tiab],
 * [MeSH Terms]), which indicates the caller has already crafted a field-aware query.
 */
function withFieldRestriction(query: string): string {
  const hasFieldTag = /(\[[\w\s]+\]|TITLE_ABS:|TITLE:|ABSTRACT:|SRC:|PUB_TYPE:|FIRST_PDATE:)/i.test(query);
  if (hasFieldTag) return query;
  return `TITLE_ABS:(${query})`;
}

interface EuropePMCArticle {
  title?: string;
  pubYear?: string;
  journalTitle?: string;
  abstractText?: string;
  pmid?: string;
  doi?: string;
}

interface EuropePMCResponse {
  hitCount: number;
  resultList: {
    result: EuropePMCArticle[];
  };
  // Top-level pagination cursor returned by the REST search endpoint; present when
  // cursorMark is supplied. Confirmed by validation 006 Probe C2 (not nested in resultList).
  nextCursorMark?: string;
}

async function search(query: string, reviewsOnly: boolean, pageSize = 25): Promise<EuropePMCResponse> {
  const url = new URL(`${BASE}/search`);
  const fullQuery = reviewsOnly
    ? `(${query}) AND PUB_TYPE:"Systematic Review"`
    : query;

  url.searchParams.set("query", fullQuery);
  url.searchParams.set("resultType", "core");
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(pageSize));

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`Europe PMC search failed: ${res.status}`, 502);

  return (await res.json()) as EuropePMCResponse;
}

export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  // Apply TITLE_ABS field restriction to systematic review searches to match
  // the scope of PubMed's [tiab] and prevent inflated counts from full-text mentions.
  // This ensures existing reviews are found only when the topic appears in title/abstract,
  // reducing noise from tangential mentions in the full text.
  const restricted = withFieldRestriction(query);
  const data = await search(restricted, true, 25);
  const results = data.resultList?.result ?? [];

  return results
    .filter((r) => r.title)
    .map((r) => {
      const abstract = r.abstractText ?? "";
      return {
        title: r.title!,
        year: parseInt(r.pubYear ?? "0") || 0,
        journal: r.journalTitle ?? "Unknown journal",
        abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
        pmid: r.pmid,
        doi: r.doi,
        source: "Europe PMC",
      };
    });
}

export async function countPrimaryStudies(query: string, minYear?: number): Promise<number> {
  // Exclude systematic reviews and meta-analyses from the primary study count.
  // Apply TITLE_ABS field restriction so only records where the query terms
  // appear in the title or abstract are counted — matching PubMed's [tiab] scope
  // and preventing inflated counts from full-text-only mentions.
  //
  // ACC-8: When minYear is provided, restrict to studies published on or after
  // that year using Europe PMC's FIRST_PDATE range syntax.
  const restricted = withFieldRestriction(query);
  const datePart = minYear
    ? ` AND FIRST_PDATE:[${minYear}-01-01 TO 3000-01-01]`
    : "";
  const primaryQuery = `${restricted} NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"${datePart}`;
  const data = await search(primaryQuery, false, 1);
  return data.hitCount ?? 0;
}

export async function countSystematicReviews(query: string): Promise<number> {
  // Apply TITLE_ABS field restriction to systematic review search to match the scope
  // of PubMed's [tiab] and prevent inflated counts from full-text-only mentions.
  // This ensures we count only reviews where the topic appears explicitly in title/abstract.
  const restricted = withFieldRestriction(query);
  const data = await search(restricted, true, 1);
  return data.hitCount ?? 0;
}

/**
 * Fetch PMIDs and DOIs for a sample of primary studies from Europe PMC.
 * Europe PMC is a superset of PubMed (all PubMed records + European literature),
 * so its records bridge PubMed PMIDs and OpenAlex/Scopus DOIs — making it the
 * ideal "linker" source for cross-database deduplication.
 *
 * EuropePMC's single-page window is date-sorted, so a one-shot fetch silently drops
 * every record beyond the first page. For a 1 994-hit query that meant only ~185 of
 * ~2 000 records were ever seen, excluding older relevant RCTs from the union
 * (validation 006 F3: EPMC recall was 0/5 purely from this truncation). We instead
 * paginate with `cursorMark` up to the ceiling so the full result set contributes.
 *
 * @param query    Review-mode boolean query string
 * @param minYear  Optional publication year floor (ACC-8)
 * @param limit    Maximum records to fetch, capped at 2 000 (matches PubMed/OpenAlex
 *                 ceilings). Default 2 000 so a bare call retrieves full depth; the
 *                 search route passes an explicit lower limit for its sampled union.
 */
export async function fetchPrimaryStudyIds(
  query: string,
  minYear?: number,
  limit = 2000,
): Promise<Array<{ pmid?: string; doi?: string }>> {
  const restricted = withFieldRestriction(query);
  const datePart = minYear
    ? ` AND FIRST_PDATE:[${minYear}-01-01 TO 3000-01-01]`
    : "";
  const primaryQuery = `${restricted} NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"${datePart}`;

  // Paginate with cursorMark. No sort param — sort=RELEVANCE is deprecated and returns
  // zero results (validation 005 F5); default date sort with full pagination retrieves
  // every record regardless of position.
  const ceiling = Math.min(limit, 2000);
  const pageSize = 200;
  const collected: Array<{ pmid?: string; doi?: string }> = [];
  let cursor = "*";

  while (collected.length < ceiling) {
    const url = new URL(`${BASE}/search`);
    url.searchParams.set("query", primaryQuery);
    // "lite" result type returns the bibliographic fields (including PMID + DOI) this
    // function needs for cross-database deduplication; "idlist" would omit the DOI.
    url.searchParams.set("resultType", "lite");
    url.searchParams.set("format", "json");
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("cursorMark", cursor);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) throw new ApiError(`Europe PMC ID fetch failed: ${res.status}`, 502);

    const data = (await res.json()) as EuropePMCResponse;
    const page = data.resultList?.result ?? [];
    for (const r of page) {
      if (collected.length >= ceiling) break;
      collected.push({
        pmid: r.pmid || undefined,
        doi: r.doi?.toLowerCase() || undefined,
      });
    }

    // End of results: no cursor, cursor unchanged (API signals the last page), or empty page.
    const next = data.nextCursorMark;
    if (!next || next === cursor || page.length === 0) break;
    cursor = next;
  }

  return collected;
}
