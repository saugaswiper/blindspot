import { ApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

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
  const data = await search(query, true, 25);
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
  // Europe PMC's PUB_TYPE filter matches publication types from MEDLINE.
  // We wrap the user query in parens to safely append the NOT clauses.
  //
  // ACC-8: When minYear is provided, restrict to studies published on or after
  // that year using Europe PMC's FIRST_PDATE range syntax.
  const datePart = minYear
    ? ` AND FIRST_PDATE:[${minYear}-01-01 TO 3000-01-01]`
    : "";
  const primaryQuery = `(${query}) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"${datePart}`;
  const data = await search(primaryQuery, false, 1);
  return data.hitCount ?? 0;
}

export async function countSystematicReviews(query: string): Promise<number> {
  const data = await search(query, true, 1);
  return data.hitCount ?? 0;
}

/**
 * Fetch PMIDs and DOIs for a sample of primary studies from Europe PMC.
 * Europe PMC is a superset of PubMed (all PubMed records + European literature),
 * so its records bridge PubMed PMIDs and OpenAlex/Scopus DOIs — making it the
 * ideal "linker" source for cross-database deduplication.
 *
 * @param query    Review-mode boolean query string
 * @param minYear  Optional publication year floor (ACC-8)
 * @param limit    Maximum records to fetch (Europe PMC supports up to 1 000 per page)
 */
export async function fetchPrimaryStudyIds(
  query: string,
  minYear?: number,
  limit = 200,
): Promise<Array<{ pmid?: string; doi?: string }>> {
  const datePart = minYear
    ? ` AND FIRST_PDATE:[${minYear}-01-01 TO 3000-01-01]`
    : "";
  const primaryQuery = `(${query}) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"${datePart}`;

  const url = new URL(`${BASE}/search`);
  url.searchParams.set("query", primaryQuery);
  // "lite" result type returns just the bibliographic fields (including PMID + DOI)
  url.searchParams.set("resultType", "lite");
  url.searchParams.set("format", "json");
  url.searchParams.set("pageSize", String(Math.min(limit, 1000)));

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`Europe PMC ID fetch failed: ${res.status}`, 502);

  const data = (await res.json()) as { resultList?: { result?: EuropePMCArticle[] } };
  return (data.resultList?.result ?? []).map((r) => ({
    pmid: r.pmid || undefined,
    doi: r.doi?.toLowerCase() || undefined,
  }));
}
