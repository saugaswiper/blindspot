/**
 * Shared query normalisation — mirrors the text-splitting logic in
 * `buildReviewQuery` (app/api/search/route.ts) so that verification counts
 * displayed in FieldExplorer and AlternativesSection use the same PubMed
 * query that the actual search will run.
 *
 * Rule: split natural-language connector words into AND-joined concept phrases,
 * wrapping multi-word phrases in double-quotes.  If the input already contains
 * explicit Boolean operators or PubMed field tags ([tiab], [MeSH Terms] …),
 * return it verbatim.
 *
 * Examples:
 *   "CBT for insomnia"           → "CBT" AND "insomnia"
 *   "Sleep Disorders in Children" → "Sleep Disorders" AND "Children"
 *   "ketamine"                   → "ketamine"   (single concept, unchanged)
 *   "depression AND anxiety"     → "depression AND anxiety"  (pass-through)
 */
export function buildNormalizedQuery(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // Already contains explicit Boolean / PubMed syntax — pass through verbatim
  if (/\b(AND|OR|NOT)\b|\[/i.test(trimmed)) return trimmed;

  const concepts = trimmed
    .split(/\s+(?:for|in|with|and|of|on|about|among|between)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (concepts.length <= 1) return trimmed;
  return concepts.map((c) => (c.includes(" ") ? `"${c}"` : c)).join(" AND ");
}
