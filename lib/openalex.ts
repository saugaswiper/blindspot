import { ApiError } from "@/lib/errors";
import { getCachedTopicCounts, setCachedTopicCounts } from "@/lib/cache";
import type { ExistingReview } from "@/types";

// CRIT-1: OpenAlex discontinued the `mailto=` polite pool on 2026-02-13.
// All requests now require an API key (free at openalex.org/settings/api).
// Fallback to legacy OPENALEX_EMAIL so pre-migration deployments degrade
// gracefully rather than breaking immediately.
const OPENALEX_API_KEY =
  process.env.OPENALEX_API_KEY ?? process.env.OPENALEX_EMAIL ?? "";
const BASE = "https://api.openalex.org";

interface OpenAlexWork {
  title: string | null;
  publication_year: number | null;
  primary_location?: {
    source?: {
      display_name?: string;
    };
  };
  abstract_inverted_index?: Record<string, number[]> | null;
  doi?: string | null;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
  meta: { count: number };
}

// OpenAlex stores abstracts as inverted index — reconstruct plain text
function invertedIndexToAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

async function searchOpenAlex(
  query: string,
  filterType: "review" | "all" | "primary",
  perPage = 25,
  minYear?: number,
  searchScope: "full_text" | "title_abstract" = "full_text",
): Promise<OpenAlexResponse> {
  const url = new URL(`${BASE}/works`);

  // Build filter string — multiple criteria joined with comma
  const filters: string[] = [];

  if (searchScope === "title_abstract") {
    // Use title_and_abstract.search filter to restrict to title+abstract only.
    // This avoids the massive overcounting caused by OpenAlex's default `search`
    // parameter, which performs full-text search across title, abstract, full
    // text body, references, and concept descriptions (100–430× PubMed counts).
    filters.push(`title_and_abstract.search:${query}`);
  } else {
    // Full-text search: used for review discovery where recall matters more
    // than precision. NOT used for primary-study counting.
    url.searchParams.set("search", query);
  }

  if (filterType === "review") filters.push("type:review");
  // "primary" targets original research articles only — excludes OpenAlex's
  // review-type works (systematic reviews, narrative reviews) so the count
  // reflects actual primary research the field can support.
  if (filterType === "primary") filters.push("type:article");
  // ACC-8: restrict by publication year when caller provides a minYear
  if (minYear) filters.push(`from_publication_date:${minYear}-01-01`);

  if (filters.length > 0) url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("select", "title,publication_year,primary_location,abstract_inverted_index,doi");
  if (OPENALEX_API_KEY) url.searchParams.set("api_key", OPENALEX_API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`OpenAlex search failed: ${res.status}`, 502);

  return (await res.json()) as OpenAlexResponse;
}

export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  const data = await searchOpenAlex(query, "review", 25);

  return data.results
    .filter((w) => w.title)
    .map((w) => {
      const abstract = invertedIndexToAbstract(w.abstract_inverted_index);
      return {
        title: w.title!,
        year: w.publication_year ?? 0,
        journal: w.primary_location?.source?.display_name ?? "Unknown journal",
        abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
        doi: w.doi ?? undefined,
        source: "OpenAlex",
      };
    });
}

export async function countPrimaryStudies(query: string, minYear?: number): Promise<number> {
  // Use "primary" filter (type:article) to count original research papers only.
  // Previously used "all" which included systematic reviews, editorials, and
  // letters — inflating counts for broad topics significantly.
  //
  // ACC-8: Pass minYear through so OpenAlex filters by from_publication_date.
  //
  // Use title_abstract scope to avoid the 100–430× overcounting caused by
  // OpenAlex's default full-text `search` parameter. title_and_abstract.search
  // restricts matching to title and abstract fields, comparable to PubMed scope.
  //
  // NEW-12: Check cache first (only for unfiltered queries; minYear bypasses cache).
  // This prevents redundant API calls for frequently-searched topics.
  if (!minYear) {
    const cached = await getCachedTopicCounts(query);
    if (cached?.cached) {
      return cached.openalex_count ?? 0;
    }
  }

  const data = await searchOpenAlex(query, "primary", 1, minYear, "title_abstract");
  const count = data.meta.count;

  // NEW-12: Store in cache if this was an unfiltered query (for reuse next time)
  if (!minYear) {
    // Fire and forget: cache write errors don't propagate
    setCachedTopicCounts(query, null, count).catch((err) => {
      console.warn("[openalex] Failed to cache OpenAlex count:", err);
    });
  }

  return count;
}

/**
 * Fetch DOIs (and PubMed IDs when available) for a sample of primary studies
 * from OpenAlex. Used for cross-source deduplication in the search route.
 *
 * OpenAlex works have a `doi` field (URL-prefixed) and an `ids.pmid` field.
 * We normalise DOIs to bare identifiers and include both where present so the
 * route can match them against PubMed PMIDs and EuropePMC records.
 *
 * @param query    Review-mode boolean query string
 * @param minYear  Optional publication year floor (ACC-8)
 * @param limit    Maximum records to fetch (OpenAlex max per-page is 200)
 */
export async function fetchPrimaryStudyIds(
  query: string,
  minYear?: number,
  limit = 200,
): Promise<Array<{ pmid?: string; doi?: string }>> {
  const url = new URL(`${BASE}/works`);

  // Use title_and_abstract.search filter (not the global `search` param) to
  // restrict matching to title+abstract only. This keeps the ID sample
  // representative of the same scope as countPrimaryStudies and avoids pulling
  // in tens of thousands of tangentially-related works via full-text matching,
  // which would skew the deduplication fraction calculation.
  const filters: string[] = ["type:article", `title_and_abstract.search:${query}`];
  if (minYear) filters.push(`from_publication_date:${minYear}-01-01`);
  url.searchParams.set("filter", filters.join(","));
  url.searchParams.set("per-page", String(Math.min(limit, 200)));
  // Request doi and ids (which includes pmid for indexed works)
  url.searchParams.set("select", "doi,ids");
  if (OPENALEX_API_KEY) url.searchParams.set("api_key", OPENALEX_API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`OpenAlex ID fetch failed: ${res.status}`, 502);

  const data = (await res.json()) as {
    results: Array<{ doi?: string | null; ids?: { pmid?: string | null } }>;
  };

  return (data.results ?? []).map((w) => ({
    doi: w.doi
      ? w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase()
      : undefined,
    pmid: w.ids?.pmid?.replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, "") || undefined,
  }));
}

/**
 * Fetches primary study records (title + abstract) for AI screening.
 *
 * Unlike fetchPrimaryStudyIds (which returns only PMIDs/DOIs for deduplication),
 * this function retrieves the full metadata needed to screen each record:
 * title, year, journal, and abstract.
 *
 * Uses the same title_and_abstract.search scope as countPrimaryStudies to
 * keep results consistent with the displayed primary_study_count.
 *
 * @param query  Boolean search string (same query used in the search)
 * @param limit  Max records to fetch (capped at 200 — Gemini screening cap is 100)
 * @returns      Array of ExistingReview-shaped objects with source = "OpenAlex"
 */
export async function fetchPrimaryStudiesForScreening(
  query: string,
  limit = 100,
): Promise<ExistingReview[]> {
  const data = await searchOpenAlex(query, "primary", Math.min(limit, 200), undefined, "title_abstract");

  return data.results
    .filter((w) => w.title)
    .map((w) => {
      const abstract = invertedIndexToAbstract(w.abstract_inverted_index);
      return {
        title: w.title!,
        year: w.publication_year ?? 0,
        journal: w.primary_location?.source?.display_name ?? "Unknown journal",
        abstract_snippet: abstract.slice(0, 400) + (abstract.length > 400 ? "…" : ""),
        doi: w.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() ?? undefined,
        source: "OpenAlex",
      };
    });
}
