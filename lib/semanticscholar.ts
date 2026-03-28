import { ApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

const BASE = "https://api.semanticscholar.org/graph/v1";

interface S2Paper {
  paperId: string;
  title?: string | null;
  year?: number | null;
  venue?: string | null;
  abstract?: string | null;
  externalIds?: {
    DOI?: string;
    PubMed?: string;
  } | null;
}

interface S2SearchResponse {
  total: number;
  data: S2Paper[];
}

/**
 * Search Semantic Scholar for systematic reviews on the given query.
 * Free API — no key required. Rate-limited to ~100 requests / 5 min.
 */
export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  const url = new URL(`${BASE}/paper/search`);
  // Append "systematic review" to bias results toward evidence-synthesis papers
  url.searchParams.set("query", `${query} systematic review`);
  url.searchParams.set("fields", "title,year,venue,abstract,externalIds");
  url.searchParams.set("limit", "25");
  // Filter to Review publication type to reduce primary-study contamination;
  // combined with the keyword bias above this strongly favours review articles.
  url.searchParams.set("publicationTypes", "Review");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new ApiError(`Semantic Scholar search failed: ${res.status}`, 502);

  const data = (await res.json()) as S2SearchResponse;

  return (data.data ?? [])
    .filter((p): p is S2Paper & { title: string } => Boolean(p.title))
    .map((p) => {
      const abstract = p.abstract ?? "";
      return {
        title: p.title,
        year: p.year ?? 0,
        journal: p.venue ?? "Unknown journal",
        abstract_snippet:
          abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
        doi: p.externalIds?.DOI ?? undefined,
        pmid: p.externalIds?.PubMed ?? undefined,
        source: "Semantic Scholar",
      };
    });
}
