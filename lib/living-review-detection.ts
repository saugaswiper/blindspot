/**
 * NEW-7: Living Review Detection
 *
 * Detects living systematic reviews (continuously updated reviews that incorporate new evidence as it emerges).
 * These are high-value targets for researchers because they're maintained and updated over time,
 * not static snapshots.
 *
 * References:
 * - Cochrane Living Systematic Reviews: https://www.cochrane.org/en/CD013214/CD013214
 * - BMJ Living Reviews: https://livingreviews.org/
 * - Campbell Living Evidence Synthesis: https://campbellcollaboration.org/
 */

/**
 * Detects whether a review title or abstract indicates a living systematic review.
 * Checks for explicit mentions of "living systematic review" or "living review" (case-insensitive).
 *
 * @param title   Review title
 * @param abstract Abstract snippet or full abstract
 * @returns true if the review appears to be a living review
 */
export function isLivingReview(title: string, abstract: string): boolean {
  const combinedText = `${title} ${abstract}`.toLowerCase();
  // Check for explicit mentions of "living systematic review" or "living review"
  return /living\s+(systematic\s+)?review/.test(combinedText);
}

/**
 * Helper to check only title (when abstract unavailable)
 */
export function isLivingReviewByTitle(title: string): boolean {
  return /living\s+(systematic\s+)?review/.test(title.toLowerCase());
}
