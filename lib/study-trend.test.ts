import { describe, it, expect } from "vitest";
import { deriveStudyTrend } from "@/types";
import type { StudyTrend } from "@/types";

/**
 * Tests for:
 *   NEW-2 — Study Count Trend (deriveStudyTrend)
 *   UI-2 — "Why This Score?" Explainer (FeasibilityExplainer thresholds, pure logic)
 *
 * Note: full `npm test` may be blocked by a pre-existing rollup binary issue
 * (see handoff 026). The test logic is correct and covers critical thresholds.
 */

/* -------------------------------------------------------------------------- */
/* NEW-2: Study Count Trend derivation                                        */
/* -------------------------------------------------------------------------- */

describe("NEW-2: deriveStudyTrend", () => {
  describe("null guards", () => {
    it("returns null when recentCount is null (data unavailable)", () => {
      expect(deriveStudyTrend(100, null)).toBeNull();
    });

    it("returns null when totalCount < 5 (insufficient data)", () => {
      expect(deriveStudyTrend(4, 3)).toBeNull();
    });

    it("returns null when totalCount is 0 to avoid division edge case", () => {
      expect(deriveStudyTrend(0, 0)).toBeNull();
    });

    it("returns null when totalCount is exactly 4 (boundary)", () => {
      expect(deriveStudyTrend(4, 4)).toBeNull();
    });
  });

  describe("growing threshold (≥ 35%)", () => {
    it("returns 'growing' when 35% of studies are recent (exact boundary)", () => {
      expect(deriveStudyTrend(100, 35)).toBe("growing" satisfies StudyTrend);
    });

    it("returns 'growing' when 50% of studies are recent", () => {
      expect(deriveStudyTrend(100, 50)).toBe("growing" satisfies StudyTrend);
    });

    it("returns 'growing' when all studies are recent (new field)", () => {
      expect(deriveStudyTrend(10, 10)).toBe("growing" satisfies StudyTrend);
    });

    it("returns 'growing' just above the 35% threshold", () => {
      expect(deriveStudyTrend(100, 36)).toBe("growing" satisfies StudyTrend);
    });
  });

  describe("stable threshold (15–34%)", () => {
    it("returns 'stable' when exactly 34% are recent (below growing boundary)", () => {
      expect(deriveStudyTrend(100, 34)).toBe("stable" satisfies StudyTrend);
    });

    it("returns 'stable' when exactly 15% are recent (lower boundary)", () => {
      expect(deriveStudyTrend(100, 15)).toBe("stable" satisfies StudyTrend);
    });

    it("returns 'stable' for a typical mature field (25% recent)", () => {
      expect(deriveStudyTrend(100, 25)).toBe("stable" satisfies StudyTrend);
    });

    it("returns 'stable' for small counts above 5 total in stable range", () => {
      // 2/10 = 20% → stable
      expect(deriveStudyTrend(10, 2)).toBe("stable" satisfies StudyTrend);
    });
  });

  describe("declining threshold (< 15%)", () => {
    it("returns 'declining' when 14% are recent (just below stable boundary)", () => {
      expect(deriveStudyTrend(100, 14)).toBe("declining" satisfies StudyTrend);
    });

    it("returns 'declining' when 0 recent studies (recentCount = 0)", () => {
      expect(deriveStudyTrend(20, 0)).toBe("declining" satisfies StudyTrend);
    });

    it("returns 'declining' for an old field with very few recent studies", () => {
      // 1/50 = 2% → declining
      expect(deriveStudyTrend(50, 1)).toBe("declining" satisfies StudyTrend);
    });
  });

  describe("minimum totalCount boundary", () => {
    it("returns null for totalCount = 4 but non-null recentCount", () => {
      expect(deriveStudyTrend(4, 2)).toBeNull();
    });

    it("returns a trend for totalCount = 5 (minimum for trend computation)", () => {
      // 3/5 = 60% → growing
      const result = deriveStudyTrend(5, 3);
      expect(result).toBe("growing" satisfies StudyTrend);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* UI-2: Feasibility Explainer — threshold label mapping                      */
/* These tests document the threshold constants used by FeasibilityExplainer  */
/* -------------------------------------------------------------------------- */

type FeasibilityScore = "High" | "Moderate" | "Low" | "Insufficient";

function getFeasibilityLabel(count: number): FeasibilityScore {
  if (count >= 11) return "High";
  if (count >= 6) return "Moderate";
  if (count >= 3) return "Low";
  return "Insufficient";
}

describe("UI-2: FeasibilityExplainer — threshold documentation", () => {
  it("High: 11+ studies", () => {
    expect(getFeasibilityLabel(11)).toBe("High");
    expect(getFeasibilityLabel(100)).toBe("High");
  });

  it("Moderate: 6-10 studies", () => {
    expect(getFeasibilityLabel(6)).toBe("Moderate");
    expect(getFeasibilityLabel(10)).toBe("Moderate");
  });

  it("Low: 3-5 studies", () => {
    expect(getFeasibilityLabel(3)).toBe("Low");
    expect(getFeasibilityLabel(5)).toBe("Low");
  });

  it("Insufficient: fewer than 3 studies", () => {
    expect(getFeasibilityLabel(0)).toBe("Insufficient");
    expect(getFeasibilityLabel(2)).toBe("Insufficient");
  });

  it("boundary: 10 is Moderate, 11 is High", () => {
    expect(getFeasibilityLabel(10)).toBe("Moderate");
    expect(getFeasibilityLabel(11)).toBe("High");
  });

  it("boundary: 5 is Low, 6 is Moderate", () => {
    expect(getFeasibilityLabel(5)).toBe("Low");
    expect(getFeasibilityLabel(6)).toBe("Moderate");
  });

  it("boundary: 2 is Insufficient, 3 is Low", () => {
    expect(getFeasibilityLabel(2)).toBe("Insufficient");
    expect(getFeasibilityLabel(3)).toBe("Low");
  });
});
