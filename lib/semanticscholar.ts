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
 * NEW-11: Exponential-backoff retry wrapper for Semantic Scholar requests.
 *
 * Semantic Scholar has tightened its rate limits; unauthenticated users share a
 * ~5,000-req / 5-min pool. On 429 (Too Many Requests), we wait 1s, 2s, 4s
 * before giving up. On all-retries-exhausted, we return null so the caller can
 * degrade gracefully rather than propagating a hard error.
 */
async function fetchWithRetry(
  url: URL,
  options: RequestInit,
  maxAttempts = 3,
): Promise<Response | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url.toString(), options);

    if (res.status !== 429) return res;

    // Rate-limited — wait with exponential backoff unless this is the last attempt
    if (attempt < maxAttempts - 1) {
      const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // All retries exhausted
  return null;
}

/**
 * Search Semantic Scholar for systematic reviews on the given query.
 * Free API — no key required. Rate-limited to ~100 requests / 5 min.
 *
 * NEW-11: Uses exponential-backoff retry on 429 responses and degrades
 * gracefully (returns empty array) instead of throwing on rate-limit failures,
 * so a Semantic Scholar throttle never blocks the main search response.
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

  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  // null = all retries exhausted (rate-limited). Degrade gracefully.
  if (res === null) {
    console.warn("[SemanticScholar] Rate-limit retries exhausted — returning empty results");
    return [];
  }

  if (!res.ok) {
    // Non-429 error codes still throw so the search route can log them properly
    throw new ApiError(`Semantic Scholar search failed: ${res.status}`, 502);
  }

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
