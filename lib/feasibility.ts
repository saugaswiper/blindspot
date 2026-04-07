import type { ExistingReview, FeasibilityResult, FeasibilityScore, ExistingReviewStatus } from "@/types";

const CURRENT_YEAR = new Date().getFullYear();

function getExistingReviewStatus(reviews: ExistingReview[]): ExistingReviewStatus {
  if (reviews.length === 0) return "novel";
  const mostRecent = Math.max(...reviews.map((r) => r.year || 0));
  if (mostRecent >= CURRENT_YEAR - 2) return "recent_exists";
  if (mostRecent >= CURRENT_YEAR - 5) return "update_opportunity";
  return "novel";
}

function getScore(primaryStudyCount: number): FeasibilityScore {
  if (primaryStudyCount >= 11) return "High";
  if (primaryStudyCount >= 6) return "Moderate";
  if (primaryStudyCount >= 3) return "Low";
  return "Insufficient";
}

/**
 * Returns a feasibility score based purely on primary study count.
 * Exported for use in ACC-4: verifying AI-suggested topic feasibility
 * against real PubMed counts.
 *
 * Thresholds (Cochrane-aligned):
 *   ≥ 11 → High
 *    6–10 → Moderate
 *    3–5  → Low
 *    < 3  → Insufficient
 */
export function getFeasibilityScore(primaryStudyCount: number): FeasibilityScore {
  return getScore(primaryStudyCount);
}

function buildExplanation(
  score: FeasibilityScore,
  primaryStudyCount: number,
  reviewStatus: ExistingReviewStatus,
  reviews: ExistingReview[]
): string {
  const studyPhrase =
    primaryStudyCount === 0
      ? "No primary studies found"
      : `${primaryStudyCount} primary ${primaryStudyCount === 1 ? "study" : "studies"} found`;

  const reviewPhrase =
    reviewStatus === "novel"
      ? "No recent systematic review covers this topic"
      : reviewStatus === "update_opportunity"
      ? `Existing reviews are ${CURRENT_YEAR - Math.max(...reviews.map((r) => r.year || 0))}+ years old — an update may be warranted`
      : "A recent systematic review already exists on this topic";

  const feasibilityPhrase: Record<FeasibilityScore, string> = {
    High: "Strong candidate for a systematic review or meta-analysis.",
    Moderate: "Feasible for a systematic review with narrative synthesis.",
    Low: "Consider a scoping review to map the available evidence first.",
    Insufficient: "Not enough evidence for a review — primary research may be needed.",
  };

  return `${studyPhrase}. ${reviewPhrase}. ${feasibilityPhrase[score]}`;
}

function buildFlags(
  score: FeasibilityScore,
  reviewStatus: ExistingReviewStatus,
  reviews: ExistingReview[],
  primaryStudyCount: number
): string[] {
  const flags: string[] = [];

  if (reviewStatus === "recent_exists") {
    const mostRecent = Math.max(...reviews.map((r) => r.year || 0));
    flags.push(`Recent systematic review published in ${mostRecent} — consider a different angle or an updated review with new evidence.`);
  }

  if (reviewStatus === "update_opportunity") {
    flags.push("Existing reviews are outdated — an updated systematic review could be highly valuable.");
  }

  if (score === "Insufficient") {
    flags.push("Fewer than 3 primary studies found — a systematic review is not feasible at this time.");
  }

  if (score === "Low") {
    flags.push("Limited evidence base — a scoping review is more appropriate than a systematic review.");
  }

  if (primaryStudyCount > 2000) {
    flags.push(
      `Very large evidence base (${primaryStudyCount.toLocaleString("en-US")} studies) — the query appears very broad. A full systematic review would be resource-intensive; consider narrowing your PICO question or planning a scoping review to map the field first.`
    );
  }

  return flags;
}

export function scoreFeasibility(
  primaryStudyCount: number,
  existingReviews: ExistingReview[]
): FeasibilityResult {
  const score = getScore(primaryStudyCount);
  const existingReviewStatus = getExistingReviewStatus(existingReviews);
  const explanation = buildExplanation(score, primaryStudyCount, existingReviewStatus, existingReviews);
  const flags = buildFlags(score, existingReviewStatus, existingReviews, primaryStudyCount);

  return {
    score,
    primary_study_count: primaryStudyCount,
    existing_review_status: existingReviewStatus,
    explanation,
    flags,
  };
}
