/**
 * Utilities for AI-generated PubMed Boolean search strings.
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
