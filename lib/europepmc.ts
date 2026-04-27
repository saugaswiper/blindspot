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
