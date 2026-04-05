/**
 * PROSPERO registry integration for Blindspot.
 *
 * Queries the PROSPERO (International Prospective Register of Systematic Reviews)
 * to check if a systematic review is already registered on a given topic.
 *
 * PROSPERO URL: https://www.crd.york.ac.uk/prospero/
 * API endpoint: https://www.crd.york.ac.uk/prospero/api/
 *
 * This prevents researchers from pursuing topics where a review is already in progress.
 */

interface ProsperoRecord {
  id: string;
  title: string;
  status: string;
}

interface ProsperoApiResponse {
  total: number;
  records: ProsperoRecord[];
}

/**
 * Search PROSPERO for registered systematic reviews matching a query.
 * Returns the number of matching registrations.
 *
 * @param query - The search query (topic, title keywords, etc.)
 * @returns Promise<number> - Count of matching PROSPERO registrations
 * @throws ApiError if the PROSPERO API request fails
 */
export async function searchProspero(query: string): Promise<number> {
  if (!query || query.trim().length === 0) {
    return 0;
  }

  try {
    // PROSPERO search endpoint
    const url = new URL("https://www.crd.york.ac.uk/prospero/api/");
    url.searchParams.set("q", query.trim());

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Blindspot (blindspot-sr.dev)",
      },
      // Cache for 24 hours since PROSPERO data doesn't change frequently
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      // PROSPERO API may return 503 or other errors; don't crash
      // Just return 0 results to allow the search to continue
      console.warn(
        `PROSPERO API returned ${res.status}; treating as no matches`,
      );
      return 0;
    }

    const data = (await res.json()) as ProsperoApiResponse;
    return data.total ?? 0;
  } catch (error) {
    // Network errors, malformed JSON, etc. Don't crash the whole search.
    console.warn("PROSPERO search failed:", error);
    return 0;
  }
}

/**
 * Format a message about existing PROSPERO registrations.
 *
 * @param count - Number of matching registrations
 * @returns A human-friendly string describing the finding, or empty string if none
 */
export function formatProsperoWarning(count: number): string {
  if (count === 0) {
    return "";
  }
  if (count === 1) {
    return "⚠ 1 systematic review may already be registered on PROSPERO for this topic.";
  }
  return `⚠ ${count} systematic reviews may already be registered on PROSPERO for this topic.`;
}

/**
 * NEW-1: Formats a compact PROSPERO status for the persistent metric badge
 * in the results summary header.
 *
 * Returns a label suitable for an inline badge, plus a flag indicating
 * whether any matching registrations were found.
 *
 * @param count - Number of matching PROSPERO registrations
 * @returns { label: string; hasMatch: boolean }
 */
export function formatProsperoStatus(count: number): { label: string; hasMatch: boolean } {
  if (count === 0) {
    return { label: "No match", hasMatch: false };
  }
  if (count === 1) {
    return { label: "1 match", hasMatch: true };
  }
  return { label: `${count} matches`, hasMatch: true };
}

/**
 * Check if a query should trigger PROSPERO search.
 * Returns false for very short or generic queries to avoid noise.
 *
 * @param query - The search query
 * @returns boolean - True if the query is substantial enough to search
 */
export function isQuerySubstantialEnough(query: string): boolean {
  // Require at least 3 words or 15 characters
  const words = query.trim().split(/\s+/).length;
  return words >= 2 && query.length >= 10;
}
