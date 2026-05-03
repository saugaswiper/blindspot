/**
 * Temporary diagnostic endpoint — tests Scopus API connectivity.
 * Hit GET /api/debug-scopus to check if the API key is loaded and
 * if requests from this server reach Elsevier successfully.
 *
 * Remove or gate behind auth once the issue is diagnosed.
 */

export async function GET() {
  const apiKey = process.env.ELSEVIER_API_KEY ?? "";

  if (!apiKey) {
    return Response.json({
      ok: false,
      error: "ELSEVIER_API_KEY environment variable is not set",
      hint: "Add it to .env.local (local dev) and to Vercel Environment Variables (production)",
    }, { status: 500 });
  }

  try {
    const url = new URL("https://api.elsevier.com/content/search/scopus");
    url.searchParams.set("query", 'TITLE-ABS-KEY("cognitive behavioral therapy") AND DOCTYPE(ar)');
    url.searchParams.set("count", "1");
    url.searchParams.set("field", "dc:identifier");

    const res = await fetch(url.toString(), {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
      next: { revalidate: 0 },
    });

    const body = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return Response.json({
        ok: false,
        status: res.status,
        error: `Scopus API returned HTTP ${res.status}`,
        body,
        keyPrefix: apiKey.slice(0, 8) + "…",
      }, { status: 502 });
    }

    const serviceError = (body as { "service-error"?: { status: { statusCode: string; statusText: string } } })["service-error"];
    if (serviceError) {
      return Response.json({
        ok: false,
        error: `Scopus service error: ${serviceError.status.statusCode} — ${serviceError.status.statusText}`,
        body,
        keyPrefix: apiKey.slice(0, 8) + "…",
      }, { status: 502 });
    }

    const results = (body as { "search-results"?: { "opensearch:totalResults"?: string } })["search-results"];
    const total = results?.["opensearch:totalResults"] ?? "unknown";

    return Response.json({
      ok: true,
      message: "Scopus API reachable and responding",
      totalResults: total,
      keyPrefix: apiKey.slice(0, 8) + "…",
      httpStatus: res.status,
    });
  } catch (err) {
    return Response.json({
      ok: false,
      error: "Network error reaching Scopus API",
      detail: err instanceof Error ? err.message : String(err),
      keyPrefix: apiKey.slice(0, 8) + "…",
    }, { status: 502 });
  }
}
