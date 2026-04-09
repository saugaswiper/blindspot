/**
 * Utilities for PubMed Boolean search strings — both AI-generated output
 * and user-entered queries.
 *
 * These are pure functions with no side effects, making them easy to unit-test
 * and safe to call in both server and client components.
 */

/**
 * Sanitises an AI-generated Boolean search string for safe display.
 * - Trims surrounding whitespace
 * - Collapses 3+ consecutive newlines to a single blank line
 * - Removes leading/trailing blank lines
 */
export function sanitizeBooleanString(raw: string): string {
  return raw.trim().replace(/\n{3,}/g, "\n\n");
}

/**
 * Returns true when the string looks like a plausible PubMed Boolean search
 * string. It must contain at least one Boolean operator (AND, OR, NOT) or a
 * PubMed field qualifier such as [MeSH Terms] or [tiab].
 *
 * Used as a sanity-check after receiving the AI response so that we don't
 * display a free-text paragraph that the model returned by mistake.
 */
export function looksLikeBooleanString(str: string): boolean {
  if (!str || str.trim().length === 0) return false;
  return /\b(AND|OR|NOT)\b|\[(?:MeSH Terms?|tiab|tw|Title\/Abstract|pt|Publication Type)\]/i.test(
    str
  );
}

/**
 * Builds a PubMed search URL that pre-populates the query box with the
 * provided Boolean search string.
 */
export function buildPubMedUrl(booleanString: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(booleanString)}`;
}

// ---------------------------------------------------------------------------
// User-entered Boolean query detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the user's simple search input appears to contain
 * intentional Boolean operators.
 *
 * Criteria (any one is sufficient):
 *  - Uppercase AND / OR / NOT as whole words (e.g. "CBT AND insomnia")
 *  - PubMed field-tag brackets (e.g. "[MeSH Terms]", "[tiab]", "[pt]")
 *
 * Lowercase "and" is intentionally excluded because it is a common natural-
 * language connector ("CBT for insomnia in elderly patients and adolescents")
 * that the auto-split logic in buildReviewQuery() already handles correctly.
 * Only UPPERCASE operators signal a deliberate Boolean query.
 *
 * Used by:
 *  - buildReviewQuery()  in app/api/search/route.ts — to pass the query
 *    through verbatim instead of auto-splitting on connector words.
 *  - TopicInput.tsx       — to show a "Boolean query" visual hint.
 */
export function isUserBooleanQuery(input: string): boolean {
  if (!input || input.trim().length === 0) return false;
  // Uppercase AND / OR / NOT as whole words
  if (/\b(AND|OR|NOT)\b/.test(input)) return true;
  // PubMed field qualifiers: [MeSH Terms], [tiab], [tw], [pt], [Title/Abstract], [Publication Type]
  if (/\[(?:MeSH Terms?|tiab|tw|Title\/Abstract|pt|Publication Type)\]/i.test(input))
    return true;
  return false;
}
