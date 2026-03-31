/**
 * lib/related-searches.ts
 *
 * Pure utilities for deriving "Related Searches" from a completed gap analysis.
 *
 * Each suggested_topic in a GapAnalysis includes a `pubmed_query` field —
 * 3-5 keywords designed for PubMed. This module:
 *   1. Strips PubMed-specific syntax from those keywords (MeSH qualifiers,
 *      Boolean operators, parentheses) to produce plain-language search strings.
 *   2. Derives up to `maxSuggestions` deduplicated `RelatedSearch` objects,
 *      prioritised by topic feasibility (high → moderate → low).
 *
 * These suggestions are shown at the bottom of every results page so users can
 * pivot to an adjacent topic in a single click without retyping anything.
 */

import type { GapAnalysis, GapDimension, SuggestedTopic } from "@/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RelatedSearch {
  /** The plain-language query to pre-fill the search box with. */
  query: string;
  /** Short human-readable label (query, truncated if needed). */
  label: string;
  /** One-sentence rationale snippet explaining why this search is suggested. */
  snippet: string;
  /** Which gap dimension this search addresses. */
  gapType: GapDimension;
  /** Feasibility tier of the underlying suggested topic. */
  feasibility: "high" | "moderate" | "low";
}

// ---------------------------------------------------------------------------
// Query cleaning
// ---------------------------------------------------------------------------

/**
 * Clean a PubMed-style query string into a plain-language search string.
 *
 * Handles both fully-qualified PubMed syntax (with `[MeSH Terms]`, `[tiab]`,
 * `[pt]`, Boolean AND/OR/NOT operators, parentheses) and the lighter
 * "3-5 MeSH-style keywords" format that Gemini typically returns.
 *
 * Examples:
 *   "ketamine elderly depression treatment"      → "ketamine elderly depression treatment"
 *   '"insomnia"[MeSH Terms] AND "elderly"[tiab]' → "insomnia elderly"
 *   '("CBT"[tiab] OR "cognitive behavioral"[tiab]) AND "insomnia"[MeSH Terms]'
 *                                                 → "CBT cognitive behavioral insomnia"
 */
export function cleanPubMedQuery(raw: string): string {
  return raw
    // Strip MeSH/field qualifiers: [MeSH Terms], [tiab], [pt], [tw], etc.
    .replace(/\[[\w\s]+\]/gi, "")
    // Strip Boolean operators (whole words only to avoid clobbering substrings)
    .replace(/\b(AND|OR|NOT)\b/g, " ")
    // Strip quotes and brackets/parens
    .replace(/["'()[\]]/g, " ")
    // Collapse multiple spaces → single space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Truncate a query label to at most `maxChars` characters, appending "…" if needed.
 */
export function truncateLabel(text: string, maxChars = 60): string {
  if (text.length <= maxChars) return text;
  // Truncate at word boundary
  const cut = text.slice(0, maxChars).replace(/\s+\S*$/, "");
  return cut + "…";
}

/**
 * Extract the first sentence from a rationale string.
 * Falls back to the first 120 characters if no sentence boundary is found.
 */
export function extractSnippet(rationale: string, maxChars = 120): string {
  const sentenceEnd = rationale.search(/[.!?]/);
  if (sentenceEnd !== -1 && sentenceEnd < maxChars) {
    return rationale.slice(0, sentenceEnd + 1).trim();
  }
  const truncated = rationale.slice(0, maxChars).trim();
  return truncated.length < rationale.length ? truncated + "…" : truncated;
}

// ---------------------------------------------------------------------------
// Derivation logic
// ---------------------------------------------------------------------------

const FEASIBILITY_PRIORITY: Record<SuggestedTopic["feasibility"], number> = {
  high: 0,
  moderate: 1,
  low: 2,
};

/**
 * Derive up to `maxSuggestions` related searches from a completed GapAnalysis.
 *
 * Algorithm:
 * 1. Sort suggested_topics by feasibility (high → moderate → low).
 * 2. For each topic, clean the `pubmed_query` to a plain-language string.
 * 3. Skip topics whose cleaned query is too short (< 5 chars) or is a
 *    case-insensitive duplicate of an already-seen query.
 * 4. Return the first `maxSuggestions` remaining topics as RelatedSearch objects.
 *
 * Returns an empty array when gapAnalysis is null or has no suggested_topics.
 */
export function deriveRelatedSearches(
  gapAnalysis: GapAnalysis | null,
  maxSuggestions = 4
): RelatedSearch[] {
  if (!gapAnalysis || !Array.isArray(gapAnalysis.suggested_topics)) return [];

  const sorted = [...gapAnalysis.suggested_topics].sort(
    (a, b) => FEASIBILITY_PRIORITY[a.feasibility] - FEASIBILITY_PRIORITY[b.feasibility]
  );

  const results: RelatedSearch[] = [];
  const seenQueries = new Set<string>();

  for (const topic of sorted) {
    if (results.length >= maxSuggestions) break;

    const cleanedQuery = cleanPubMedQuery(topic.pubmed_query);
    if (cleanedQuery.length < 5) continue;

    const key = cleanedQuery.toLowerCase();
    if (seenQueries.has(key)) continue;
    seenQueries.add(key);

    results.push({
      query: cleanedQuery,
      label: truncateLabel(cleanedQuery),
      snippet: extractSnippet(topic.rationale),
      gapType: topic.gap_type,
      feasibility: topic.feasibility,
    });
  }

  return results;
}
