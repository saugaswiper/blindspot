import { ApiError } from "@/lib/errors";
import { getCachedTopicCounts, setCachedTopicCounts } from "@/lib/cache";
import type { ExistingReview } from "@/types";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY ?? "";

interface ESearchResult {
  esearchresult: {
    count: string;
    idlist: string[];
  };
}

// Very small XML parser for PubMed EFetch responses
function parseArticles(xml: string): ExistingReview[] {
  const articles: ExistingReview[] = [];
  const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];

  for (const block of articleBlocks) {
    const title = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .trim() ?? "Untitled";

    const year =
      block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] ??
      block.match(/<Year>(\d{4})<\/Year>/)?.[1] ??
      "Unknown";

    const journal =
      block.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/)?.[1]?.trim() ??
      block.match(/<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim() ??
      "Unknown journal";

    const abstract =
      block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim() ?? "";

    const pmid = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];

    articles.push({
      title,
      year: parseInt(year) || 0,
      journal,
      abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
      pmid,
      source: "PubMed",
    });
  }

  return articles;
}

async function esearch(
  term: string,
  retmax = 50,
  sort?: string,
): Promise<{ count: number; ids: string[] }> {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("term", term);
  url.searchParams.set("retmax", String(retmax));
  url.searchParams.set("retmode", "json");
  // Default (no sort) preserves PubMed's implicit date-sorted order for count
  // and existing-review callers. "relevance" uses PubMed's Best Match ranking,
  // needed so comprehensive primary-study retrieval is not date-truncated.
  if (sort) url.searchParams.set("sort", sort);
  if (API_KEY) url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`PubMed ESearch failed: ${res.status}`, 502);

  const data = (await res.json()) as ESearchResult;
  return {
    count: parseInt(data.esearchresult.count) || 0,
    ids: data.esearchresult.idlist,
  };
}

async function efetch(ids: string[]): Promise<ExistingReview[]> {
  if (ids.length === 0) return [];

  const url = new URL(`${BASE}/efetch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("rettype", "xml");
  url.searchParams.set("retmode", "xml");
  if (API_KEY) url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`PubMed EFetch failed: ${res.status}`, 502);

  return parseArticles(await res.text());
}

export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  const { ids } = await esearch(`${query} AND systematic[sb]`, 50);
  return efetch(ids);
}

export async function countPrimaryStudies(query: string, minYear?: number): Promise<number> {
  // Exclude systematic reviews from the primary study count.
  // We want to assess how much raw primary evidence exists — not whether
  // there are existing reviews of that evidence.
  // PubMed's systematic[sb] filter matches all systematic reviews, Cochrane
  // reviews, and related secondary study types.
  //
  // ACC-8: When minYear is provided, restrict counts to studies published
  // on or after that year using PubMed's [dp] (date published) field tag.
  // Current year is used as the upper bound to capture in-press records.
  //
  // NEW-12: Check cache first (only for unfiltered queries; minYear bypasses cache).
  // This prevents redundant API calls for frequently-searched topics like "diabetes",
  // "heart failure", "anxiety" — estimated ~40% reduction in PubMed API calls.
  if (!minYear) {
    const cached = await getCachedTopicCounts(query);
    if (cached?.cached) {
      return cached.pubmed_count ?? 0;
    }
  }

  const datePart = minYear ? ` AND ${minYear}:${new Date().getFullYear()}[dp]` : "";
  // Exclude systematic reviews with a BINARY `NOT systematic[sb]` (not `AND NOT`).
  // Validation 005 (F1) proved PubMed's ATM silently drops the NOT from `AND NOT`,
  // counting SRs instead of excluding them (handoff 106 / validation 006).
  const { count } = await esearch(`(${query}) NOT systematic[sb]${datePart}`, 1);

  // NEW-12: Store in cache if this was an unfiltered query (for reuse next time)
  if (!minYear) {
    // Fire and forget: cache write errors don't propagate
    setCachedTopicCounts(query, count, null).catch((err) => {
      console.warn("[pubmed] Failed to cache PubMed count:", err);
    });
  }

  return count;
}

export async function countSystematicReviews(query: string): Promise<number> {
  const { count } = await esearch(`${query} AND systematic[sb]`, 1);
  return count;
}

/**
 * NEW-8: Counts "living systematic reviews" (LSRs) on the topic.
 *
 * LSRs are continuously updated reviews that incorporate new evidence as it
 * emerges. They are increasingly common in clinical research — Cochrane, BMJ,
 * and Campbell all run formal LSR programs. A researcher who identifies a
 * "gap" may not realise an LSR already covers that gap with rolling updates,
 * so we surface the count as an informational banner in the dashboard.
 *
 * Uses the same `systematic[sb]` filter as `countSystematicReviews`, narrowed
 * to records that mention "living systematic review" or "living review" in
 * the title or abstract via PubMed's `[tiab]` field tag.
 *
 * @param query  Concept-AND boolean review query (matches `searchExistingReviews`).
 * @returns      Count of matching living systematic reviews; 0 on any error.
 */
export async function countLivingReviews(query: string): Promise<number> {
  // Combine the two phrase variants with OR so we catch both terminology choices.
  // The `[tiab]` (title/abstract) tag prevents false positives from MeSH terms.
  const livingFilter =
    '("living systematic review"[tiab] OR "living review"[tiab])';
  const { count } = await esearch(
    `(${query}) AND systematic[sb] AND ${livingFilter}`,
    1,
  );
  return count;
}

/**
 * ACC-14: Check whether a pubmed_query string's key terms are recognized MeSH vocabulary.
 *
 * Strategy: query PubMed's MeSH database (`db=mesh`) with the full pubmed_query string.
 * If at least one MeSH term matches, the query uses standard vocabulary → returns true.
 * If zero MeSH matches AND the term also returns 0 PubMed title/abstract hits, the
 * terminology is likely non-standard → returns false.
 *
 * This catches cases where Gemini invents composite terms (e.g. "neuro-psychological
 * intervention") that aren't established MeSH headings, which could mislead researchers
 * when they build their own searches.
 *
 * Graceful degradation: returns true (no badge) on any API failure to avoid false positives.
 */
export async function checkMeshTerms(pubmedQuery: string): Promise<boolean> {
  try {
    const meshUrl = new URL(`${BASE}/esearch.fcgi`);
    meshUrl.searchParams.set("db", "mesh");
    meshUrl.searchParams.set("term", pubmedQuery);
    meshUrl.searchParams.set("retmax", "1");
    meshUrl.searchParams.set("retmode", "json");
    if (API_KEY) meshUrl.searchParams.set("api_key", API_KEY);

    const res = await fetch(meshUrl.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return true; // degrade gracefully
    const data = (await res.json()) as ESearchResult;
    const meshCount = parseInt(data.esearchresult.count) || 0;

    if (meshCount > 0) return true; // recognized MeSH vocabulary

    // Zero MeSH results — also check if the terms appear in PubMed at all ([tiab] search)
    const tiabUrl = new URL(`${BASE}/esearch.fcgi`);
    tiabUrl.searchParams.set("db", "pubmed");
    tiabUrl.searchParams.set("term", `${pubmedQuery}[tiab]`);
    tiabUrl.searchParams.set("retmax", "1");
    tiabUrl.searchParams.set("retmode", "json");
    if (API_KEY) tiabUrl.searchParams.set("api_key", API_KEY);

    const tiabRes = await fetch(tiabUrl.toString(), { next: { revalidate: 0 } });
    if (!tiabRes.ok) return true;
    const tiabData = (await tiabRes.json()) as ESearchResult;
    const tiabCount = parseInt(tiabData.esearchresult.count) || 0;

    // If neither MeSH nor PubMed title/abstract found the term, flag as non-standard
    return tiabCount > 0;
  } catch {
    return true; // fail open — don't flag as non-standard on errors
  }
}

/**
 * Fetch primary study records (title + abstract) from PubMed for AI screening.
 *
 * ESearch retrieves up to `limit` PMIDs in a single call (PubMed supports up
 * to 10 000 via retmax). EFetch is then called in batches of 200 — the PubMed
 * per-request ID limit — so any `limit` value works without extra pagination.
 *
 * @param query  Boolean search string
 * @param limit  Max articles to fetch (default 500; ESearch supports up to 10 000)
 */
export async function fetchPrimaryStudiesForScreening(
  query: string,
  limit = 500,
): Promise<ExistingReview[]> {
  // Binary `NOT systematic[sb]` (not `AND NOT`): ATM silently drops the NOT from
  // `AND NOT`, feeding the screening workbench systematic reviews instead of the
  // primary studies it is supposed to screen (validation 006 F4).
  const { ids } = await esearch(`(${query}) NOT systematic[sb]`, Math.min(limit, 10000));
  if (ids.length === 0) return [];

  // EFetch supports up to 200 IDs per call — batch as needed
  const EFETCH_BATCH = 200;
  const results: ExistingReview[] = [];
  for (let i = 0; i < ids.length; i += EFETCH_BATCH) {
    const batch = ids.slice(i, i + EFETCH_BATCH);
    const records = await efetch(batch);
    results.push(...records);
  }
  return results;
}

/**
 * Fetch PMIDs for a sample of primary studies from PubMed.
 * Used for cross-source deduplication: the route collects IDs from all sources,
 * deduplicates them by PMID/DOI, and uses the overlap fraction to estimate
 * the true unique primary study count.
 *
 * @param query    Review-mode boolean query string
 * @param minYear  Optional publication year floor (ACC-8)
 * @param limit    Maximum PMIDs to fetch (PubMed ESearch max is 10 000)
 */
export async function fetchPrimaryStudyIds(
  query: string,
  minYear?: number,
  limit = 2000,
): Promise<Array<{ pmid?: string; doi?: string }>> {
  const datePart = minYear ? ` AND ${minYear}:${new Date().getFullYear()}[dp]` : "";
  // Exclude systematic reviews with a BINARY `NOT systematic[sb]` (not `AND NOT`).
  // Validation 005 (F1) proved PubMed's ATM silently drops the NOT from
  // `... AND NOT systematic[sb]`, translating it to `... AND "systematic"[Filter]`
  // — so the function returned systematic-review IDs, the exact inverse of intent
  // (measured: NOT-systematic and systematic sets were 313/313 identical). PubMed
  // treats NOT as a binary operator; `(topic) NOT systematic[sb]` is respected
  // (count 313 → 3421 for the Mitchell query) and the included primary studies appear.
  //
  // Relevance ("Best Match") sort + a high retmax ceiling: the truth papers sit at
  // relevance positions ~855–1619, so the 2 000-record ceiling is required to reach
  // them (validation 005). ESearch retmax supports up to 10 000 in a single call, so
  // the full result set is retrieved without a pagination loop.
  const { ids } = await esearch(`(${query}) NOT systematic[sb]${datePart}`, limit, "relevance");
  // PubMed ESearch returns bare PMIDs; no DOI available without an EFetch round-trip
  return ids.map((pmid) => ({ pmid }));
}

/**
 * Counts primary studies published within the last `years` years.
 * Uses PubMed's `datetype=pdat` filter with `mindate` set to (currentYear - years).
 * Excludes systematic reviews for the same reason as `countPrimaryStudies`.
 *
 * Used for NEW-2: Study Count Trend to determine if a research field is
 * growing, stable, or declining.
 */
export async function countPrimaryStudiesRecent(query: string, years = 3): Promise<number> {
  const minYear = new Date().getFullYear() - years;
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  // Binary `NOT systematic[sb]` (not `AND NOT`): see countPrimaryStudies (validation 006 F4).
  url.searchParams.set("term", `(${query}) NOT systematic[sb]`);
  url.searchParams.set("retmax", "1");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("datetype", "pdat");
  url.searchParams.set("mindate", String(minYear));
  url.searchParams.set("maxdate", String(new Date().getFullYear()));
  if (API_KEY) url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`PubMed ESearch (recent) failed: ${res.status}`, 502);

  const data = (await res.json()) as ESearchResult;
  return parseInt(data.esearchresult.count) || 0;
}
