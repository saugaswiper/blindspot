/**
 * ACC-11: INPLASY (International Platform of Registered Systematic Review and
 * Meta-analysis Protocols) integration for Blindspot.
 *
 * INPLASY is the #2 registry by volume after PROSPERO, with 2,370+ registered
 * protocols as of 2026. It is particularly used in East Asian academic contexts
 * (China, South Korea, Japan) and medical topics. The OSF comment in
 * lib/osf-registry.ts mistakenly implied INPLASY was already checked — this
 * module closes that coverage gap.
 *
 * INPLASY URL:  https://inplasy.com/
 * API endpoint: https://inplasy.com/wp-json/wp/v2/posts?search=<query>&per_page=1
 *               Returns `X-WP-Total` header with the full match count.
 */

/**
 * Search INPLASY for registered systematic review protocols matching a query.
 * Returns the count of matching registrations.
 *
 * Uses the WordPress REST API which is available without authentication.
 * The `X-WP-Total` response header returns the full match count without
 * requiring us to fetch all records.
 *
 * @param query - The research topic query
 * @returns Promise<number> — count of matching INPLASY registrations (0 on any failure)
 */
export async function searchINPLASY(query: string): Promise<number> {
  if (!query || query.trim().length === 0) {
    return 0;
  }

  try {
    const url = new URL("https://inplasy.com/wp-json/wp/v2/posts");
    url.searchParams.set("search", query.trim());
    // per_page=1 minimises payload — we only need the X-WP-Total header.
    url.searchParams.set("per_page", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Blindspot (blindspot-sr.dev; school.dharmayu@gmail.com)",
        Accept: "application/json",
      },
      // Cache for 24 hours — INPLASY registration data doesn't change frequently
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      console.warn(`INPLASY API returned ${res.status}; treating as no matches`);
      return 0;
    }

    // X-WP-Total contains the full count of matching posts
    const total = res.headers.get("X-WP-Total");
    const count = parseInt(total ?? "0", 10);
    return isNaN(count) ? 0 : count;
  } catch (error) {
    // Network errors, malformed JSON, rate limits — never crash the search.
    console.warn("INPLASY search failed:", error);
    return 0;
  }
}

/**
 * Format a compact INPLASY registry status label for UI display.
 *
 * Returns a label suitable for an inline badge, plus a flag indicating
 * whether any matching registrations were found.
 *
 * @param count — Number of matching INPLASY registrations
 */
export function formatINPLASYStatus(count: number): { label: string; hasMatch: boolean } {
  if (count === 0) {
    return { label: "No match", hasMatch: false };
  }
  if (count === 1) {
    return { label: "1 match", hasMatch: true };
  }
  return { label: `${count} matches`, hasMatch: true };
}

/**
 * Format a human-friendly INPLASY warning message for the detail banner.
 *
 * @param count — Number of matching INPLASY registrations
 * @returns Warning string, or empty string if count is 0
 */
export function formatINPLASYWarning(count: number): string {
  if (count === 0) return "";
  if (count === 1) {
    return "⚠ 1 systematic review protocol may already be registered on INPLASY for this topic.";
  }
  return `⚠ ${count} systematic review protocols may already be registered on INPLASY for this topic.`;
}
