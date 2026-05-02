/**
 * Elsevier Scopus API integration for Blindspot.
 *
 * Scopus is one of the world's largest abstract and citation databases,
 * covering 27,000+ peer-reviewed journals across all disciplines.
 * It is particularly strong for interdisciplinary research and provides
 * systematic review coverage not always found in PubMed alone.
 *
 * API docs: https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl
 * Rate limits: 20,000 requests/week per API key (institutional keys higher)
 *
 * All network failures are surfaced as ApiErrors so Promise.allSettled can
 * catch them gracefully in the main search route.
 */

import { ApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

const BASE = "https://api.elsevier.com/content/search/scopus";
const API_KEY = process.env.ELSEVIER_API_KEY ?? "";

// ─── Scopus response shapes ───────────────────────────────────────────────────

interface ScopusEntry {
  "dc:title"?: string;
  "prism:coverDate"?: string;     // "YYYY-MM-DD"
  "prism:publicationName"?: string;
  "dc:description"?: string;      // abstract (not always present in search results)
  "prism:doi"?: string;
  "pubmed-id"?: string;
  "eid"?: string;                  // Scopus internal ID (e.g. "2-s2.0-12345")
}

interface ScopusSearchResults {
  "opensearch:totalResults"?: string;
  "opensearch:itemsPerPage"?: string;
  entry?: ScopusEntry[];
}

interface ScopusResponse {
  "search-results"?: ScopusSearchResults;
  "service-error"?: { status: { statusCode: string; statusText: string } };
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function scopusSearch(
  query: string,
  count: number,
  fields?: string,
): Promise<ScopusResponse> {
  if (!API_KEY) {
    throw new ApiError("ELSEVIER_API_KEY not configured", 500);
  }

  const url = new URL(BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("count", String(Math.min(count, 200)));
  if (fields) url.searchParams.set("field", fields);

  const res = await fetch(url.toString(), {
    headers: {
      "X-ELS-APIKey": API_KEY,
      Accept: "application/json",
    },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    throw new ApiError(`Scopus API returned ${res.status}`, 502);
  }

  const data = (await res.json()) as ScopusResponse;
  if (data["service-error"]) {
    const { statusCode, statusText } = data["service-error"].status;
    throw new ApiError(`Scopus service error ${statusCode}: ${statusText}`, 502);
  }

  return data;
}

// ─── Normalise Scopus query ───────────────────────────────────────────────────

/**
 * Wraps each concept phrase from the review query in TITLE-ABS-KEY() for
 * Scopus field-specific searching. If the input is already a complex boolean
 * expression (contains AND / OR / AND NOT), it is used as-is.
 *
 * Examples:
 *   "CBT" AND "insomnia" → TITLE-ABS-KEY("CBT") AND TITLE-ABS-KEY("insomnia")
 *   "CBT" → TITLE-ABS-KEY("CBT")
 */
function buildScopusQuery(reviewQuery: string): string {
  // Complex boolean queries with field operators: pass through unchanged
  if (/\bTITLE-ABS-KEY\b/i.test(reviewQuery)) return reviewQuery;

  // Split on AND/OR/AND NOT boundaries and wrap each concept
  const parts = reviewQuery
    .split(/(\s+AND NOT\s+|\s+AND\s+|\s+OR\s+)/i)
    .map((part, i) => {
      const op = part.trim().toUpperCase();
      if (op === "AND" || op === "OR" || op === "AND NOT") return ` ${op} `;
      const term = part.trim().replace(/^["']|["']$/g, "");
      return term ? `TITLE-ABS-KEY("${term}")` : "";
    })
    .filter(Boolean);

  return parts.join("") || `TITLE-ABS-KEY(${reviewQuery})`;
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Search Scopus for existing systematic reviews on the given topic.
 * Uses DOCTYPE(re) to limit to review-type documents.
 */
export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  const scopusQuery = `${buildScopusQuery(query)} AND DOCTYPE(re)`;
  const data = await scopusSearch(
    scopusQuery,
    25,
    "dc:title,prism:coverDate,prism:publicationName,dc:description,prism:doi,pubmed-id",
  );

  const entries = data["search-results"]?.entry ?? [];
  return entries
    .filter((e) => e["dc:title"])
    .map((e) => {
      const abstract = e["dc:description"] ?? "";
      const year = parseInt(e["prism:coverDate"]?.slice(0, 4) ?? "0") || 0;
      return {
        title: e["dc:title"]!,
        year,
        journal: e["prism:publicationName"] ?? "Unknown journal",
        abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
        doi: e["prism:doi"] || undefined,
        pmid: e["pubmed-id"] || undefined,
        source: "Scopus",
      } satisfies ExistingReview;
    });
}

/**
 * Count primary studies (articles, not reviews) in Scopus for the given query.
 * Uses DOCTYPE(ar) to exclude reviews, editorials, and other non-primary types.
 *
 * ACC-8: minYear restricts to studies published on or after that year.
 */
export async function countPrimaryStudies(query: string, minYear?: number): Promise<number> {
  const yearPart = minYear ? ` AND PUBYEAR > ${minYear - 1}` : "";
  const scopusQuery = `${buildScopusQuery(query)} AND DOCTYPE(ar)${yearPart}`;
  const data = await scopusSearch(scopusQuery, 1, "dc:identifier");
  return parseInt(data["search-results"]?.["opensearch:totalResults"] ?? "0") || 0;
}

/**
 * Fetch DOIs and PubMed IDs for a sample of primary studies from Scopus.
 * Used for cross-source deduplication in the search route.
 *
 * @param query    Review-mode boolean query string
 * @param minYear  Optional publication year floor
 * @param limit    Maximum number of IDs to fetch (max 200 per Scopus API page)
 */
export async function fetchPrimaryStudyIds(
  query: string,
  minYear?: number,
  limit = 200,
): Promise<Array<{ pmid?: string; doi?: string }>> {
  const yearPart = minYear ? ` AND PUBYEAR > ${minYear - 1}` : "";
  const scopusQuery = `${buildScopusQuery(query)} AND DOCTYPE(ar)${yearPart}`;
  const data = await scopusSearch(scopusQuery, limit, "prism:doi,pubmed-id");
  const entries = data["search-results"]?.entry ?? [];
  return entries.map((e) => ({
    doi: e["prism:doi"] || undefined,
    pmid: e["pubmed-id"] || undefined,
  }));
}
