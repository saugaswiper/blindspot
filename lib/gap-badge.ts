/**
 * Per-gap evidence quality badge configuration.
 *
 * Blindspot surfaces a small inline badge on each gap card when the primary
 * study count is in the Low or Moderate feasibility tier. The badge warns
 * researchers that individual AI-identified gaps should be treated with care
 * given the thin evidence base.
 *
 * Tier mapping (Cochrane-aligned, mirrors lib/feasibility.ts thresholds):
 *   Low        (3–5 studies)  → ◔ Low confidence   — gray badge, strong caution
 *   Moderate   (6–10 studies) → ◑ Moderate evidence — stone badge, mild caution
 *   High / Insufficient       → null (no badge)
 *
 * Design rationale:
 * - Low feasibility already shows an amber banner at the top of the GapsTab.
 *   The per-gap badge reinforces the caution at the point of consumption of
 *   each individual gap, so researchers don't lose the warning when scrolling.
 * - Moderate feasibility does NOT get a top-of-tab banner (evidence is
 *   borderline sufficient per Cochrane). The per-gap badge provides a lighter
 *   touch — visible context without an alarming page-level alert.
 * - High feasibility → no badge; no noise for well-evidenced topics.
 * - Insufficient feasibility → gap analysis is blocked by ACC-1; this function
 *   is never called.
 */

import type { FeasibilityScore } from "@/types";

/**
 * Visual and semantic configuration for a per-gap evidence quality badge.
 * Consumed by ResultsDashboard.tsx to render the inline badge on each gap card.
 */
export interface PerGapBadgeConfig {
  /** Short human-readable label rendered inside the badge */
  label: string;
  /**
   * Which SVG icon to render alongside the label.
   * "low"      → ◔ (upper-right quadrant filled)   — one quarter evidence
   * "moderate" → ◑ (right half filled)              — half evidence
   */
  iconVariant: "low" | "moderate";
  /** Tailwind class string for the badge container */
  className: string;
  /** Title attribute / hover tooltip text */
  tooltip: string;
  /** aria-label for screen readers */
  ariaLabel: string;
}

/**
 * Returns a per-gap evidence quality badge config for the given feasibility
 * score and primary study count, or `null` if no badge should be shown.
 *
 * @param feasibilityScore - The overall feasibility score for the result
 * @param primaryStudyCount - Number of primary studies found
 */
export function getPerGapBadgeConfig(
  feasibilityScore: FeasibilityScore | null,
  primaryStudyCount: number
): PerGapBadgeConfig | null {
  const studyWord = primaryStudyCount === 1 ? "study" : "studies";

  if (feasibilityScore === "Low") {
    return {
      label: "Low confidence",
      iconVariant: "low",
      // Same muted gray used for the "low importance" gap badge; visually
      // consistent, clearly secondary to the amber importance badges.
      className:
        "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700",
      tooltip: `Based on only ${primaryStudyCount} primary ${studyWord} — this gap should be treated as exploratory, not authoritative`,
      ariaLabel: `Low confidence — only ${primaryStudyCount} primary ${studyWord} analyzed`,
    };
  }

  if (feasibilityScore === "Moderate") {
    return {
      label: "Moderate evidence",
      iconVariant: "moderate",
      // Lighter stone tone — subtler than the Low badge to reflect that
      // Moderate (6–10 studies) is borderline sufficient, not alarming.
      className:
        "bg-stone-50 dark:bg-stone-800/30 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-600",
      tooltip: `Based on ${primaryStudyCount} primary ${studyWord} — near Cochrane's threshold for reliable gap analysis. Treat individual gaps as preliminary`,
      ariaLabel: `Moderate evidence — ${primaryStudyCount} primary ${studyWord} analyzed`,
    };
  }

  // High or Insufficient → no badge
  return null;
}
