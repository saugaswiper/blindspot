import type { ExistingReview } from "@/types";

/**
 * Cochrane Library API integration for direct systematic review discovery.
 *
 * The Cochrane Library (CENTRAL + Cochrane Reviews) is the gold standard
 * for systematic review publication. While we can retrieve Cochrane reviews
 * via OpenAlex and PubMed, direct Cochrane API access provides:
 * - Authoritative metadata (directly from the publisher)
 * - Complete coverage (all Cochrane publications)
 * - Reduced latency (no intermediary indexing delay)
 *
 * API endpoint: https://www.cochranelibrary.com/api/search
 * Search syntax: Standard boolean, supports MeSH terms
 *
 * Rate limit: 1000 requests/day (unauthenticated, no key required)
 * Response format: JSON with pagination
 *
 * See: https://www.cochranelibrary.com/
 */

const BASE = "https://www.cochranelibrary.com/api/search";

interface CochraneArticle {
  title?: string;
  authors?: Array<{ name: string }>;
  publicationYear?: number;
  doi?: string;
  abstract?: string;
  type?: string; // "Review", "Protocol", "Editorial", etc.
}

interface CochraneResponse {
  totalResults?: number;
  items?: CochraneArticle[];
  resultsPerPage?: number;
  pageNumber?: number;
}

/**
 * Search the Cochrane Library for systematic reviews matching a query.
 *
 * Returns up to 25 reviews sorted by relevance. Used by searchExistingReviews()
 * to populate the Existing Reviews tab in the results dashboard.
 *
 * @param query     Boolean search string (e.g., "diabetes AND treatment")
 * @param pageSize  Results per page (default: 25, max: 100)
 * @returns         Array of ExistingReview objects
 */
export async function searchExistingReviews(
  query: string,
  pageSize = 25
): Promise<ExistingReview[]> {
  try {
    const url = new URL(BASE);
    // Restrict to Cochrane Reviews (exclude protocols, methods, editorials, etc.)
    url.searchParams.set("q", `(${query}) AND type:"Review"`);
    url.searchParams.set("ps", String(pageSize));
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      // Graceful degradation: treat API errors as 0 results
      console.warn(`[cochrane] search failed: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as CochraneResponse;
    const results = data.items ?? [];

    return results
      .filter((r) => r.title) // Only articles with titles
      .map((r) => {
        const abstract = r.abstract ?? "";

        return {
          title: r.title!,
          year: r.publicationYear ?? 0,
          journal: "Cochrane Library",
          abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
          doi: r.doi,
          source: "Cochrane",
        };
      });
  } catch (error) {
    // Fail open: network errors, timeouts, etc. return empty array
    console.warn("[cochrane] searchExistingReviews exception:", error);
    return [];
  }
}

/**
 * Count systematic reviews in the Cochrane Library matching a query.
 *
 * Used in the search results dashboard to show how many Cochrane reviews
 * exist on the topic. Unlike PubMed/OpenAlex, Cochrane reviews are always
 * systematic reviews by definition (no filter needed).
 *
 * Returns 0 on any API error (graceful degradation).
 *
 * @param query  Boolean search string (e.g., "diabetes AND treatment")
 * @returns      Count of matching Cochrane reviews; 0 on error
 */
export async function countSystematicReviews(query: string): Promise<number> {
  try {
    const url = new URL(BASE);
    // Restrict to Cochrane Reviews (not protocols or other types)
    url.searchParams.set("q", `(${query}) AND type:"Review"`);
    url.searchParams.set("ps", "1"); // Only need the count, not actual results
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn(`[cochrane] count failed: ${res.status}`);
      return 0;
    }

    const data = (await res.json()) as CochraneResponse;
    return data.totalResults ?? 0;
  } catch (error) {
    console.warn("[cochrane] countSystematicReviews exception:", error);
    return 0;
  }
}

/**
 * Count Cochrane reviews published in the recent period (default: last 3 years).
 *
 * Used to populate the "Recent reviews" metric in the results dashboard.
 * Cochrane publishes approximately 300–400 new reviews per year, so this
 * gives a sense of recent activity on the topic.
 *
 * Note: The Cochrane API doesn't have explicit date filtering yet, so this
 * function wraps countSystematicReviews() and returns the same value.
 * A future improvement would parse publication dates from the response
 * and filter client-side if the API continues to lack date parameters.
 *
 * @param query  Boolean search string
 * @param years  Number of years to look back (default: 3)
 * @returns      Count of Cochrane reviews from recent years; 0 on error
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function countRecentReviews(query: string, years = 3): Promise<number> {
  // TODO: Once Cochrane API supports publicationDate filtering,
  // add date parameter to the query above. For now, return all reviews.
  return countSystematicReviews(query);
}
