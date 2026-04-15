/**
 * OSF (Open Science Framework) Registries integration for Blindspot.
 *
 * Queries the OSF Registries API to check if a systematic review protocol
 * is already registered on OSF for a given topic.
 *
 * OSF Registries URL: https://osf.io/registries/
 * API documentation: https://developer.osf.io/
 *
 * OSF is the third-largest systematic review registry (2,960+ SR protocols as of
 * 2026, per a Frontiers meta-research study). It is particularly important for
 * social science, psychology, education, and public health research, where
 * PROSPERO's health focus may not apply.
 *
 * ACC-6: This check closes the coverage gap left by PROSPERO + INPLASY alone.
 */

interface OsfRegistrationsApiResponse {
  /** Total number of matching registrations */
  meta?: {
    total?: number;
  };
  data?: unknown[];
}

/**
 * Search the OSF Registries API for registered protocols matching a query.
 * Returns the count of matching OSF registrations (not the full records).
 *
 * The search is keyword-based via the OSF v2 API `q` parameter, which performs
 * a full-text search across title, description, and tags of all public registrations.
 *
 * @param query - The research topic query
 * @returns Promise<number> — count of matching OSF registrations (0 on any failure)
 */
export async function searchOSFRegistrations(query: string): Promise<number> {
  if (!query || query.trim().length === 0) {
    return 0;
  }

  try {
    const url = new URL("https://api.osf.io/v2/registrations/");
    url.searchParams.set("q", query.trim());
    // Only return page metadata — we only need the total count, not the records.
    // page[size]=1 minimises response payload and latency.
    url.searchParams.set("page[size]", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Blindspot (blindspot-sr.dev; school.dharmayu@gmail.com)",
        Accept: "application/vnd.api+json",
      },
      // Cache for 24 hours — OSF registration data doesn't change frequently
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      console.warn(`OSF Registries API returned ${res.status}; treating as no matches`);
      return 0;
    }

    const data = (await res.json()) as OsfRegistrationsApiResponse;
    return data.meta?.total ?? 0;
  } catch (error) {
    // Network errors, malformed JSON, rate limits — never crash the search.
    console.warn("OSF Registries search failed:", error);
    return 0;
  }
}

/**
 * Format a compact OSF registry status label for UI display.
 *
 * Returns a label suitable for an inline badge, plus a flag indicating
 * whether any matching registrations were found.
 *
 * @param count — Number of matching OSF registrations
 */
export function formatOSFStatus(count: number): { label: string; hasMatch: boolean } {
  if (count === 0) {
    return { label: "No match", hasMatch: false };
  }
  if (count === 1) {
    return { label: "1 match", hasMatch: true };
  }
  return { label: `${count} matches`, hasMatch: true };
}

/**
 * Format a human-friendly OSF warning message for the detail banner.
 *
 * @param count — Number of matching OSF registrations
 * @returns Warning string, or empty string if count is 0
 */
export function formatOSFWarning(count: number): string {
  if (count === 0) return "";
  if (count === 1) {
    return "⚠ 1 systematic review protocol may already be registered on OSF Registries for this topic.";
  }
  return `⚠ ${count} systematic review protocols may already be registered on OSF Registries for this topic.`;
}
