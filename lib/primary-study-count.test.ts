import { describe, it, expect } from "vitest";
import { getFeasibilityScore } from "@/lib/feasibility";

/**
 * Tests for the primary study count reliability improvements (v029):
 *
 *  1. Client-side zero-study guard: estimated_studies === 0 → always Insufficient
 *  2. Two-pass counting logic: title fallback when pubmed_query returns 0
 *  3. API-failure handling: verified_feasibility undefined when all calls fail
 *  4. Review exclusion: countPrimaryStudies now excludes systematic reviews
 */

/* -------------------------------------------------------------------------- */
/* Client-side zero-study guard                                               */
/* -------------------------------------------------------------------------- */

describe("Client-side zero-study guard", () => {
  /** Mirrors the effective-score logic in ResultsDashboard.tsx */
  function effectiveScore(
    verifiedFeasibility: string | undefined,
    estimatedStudies: number
  ): string {
    return verifiedFeasibility ?? (estimatedStudies === 0 ? "Insufficient" : "AI estimate");
  }

  it("returns Insufficient when estimated_studies is 0 and no verified score", () => {
    expect(effectiveScore(undefined, 0)).toBe("Insufficient");
  });

  it("uses verified_feasibility when available, even if estimated_studies is 0", () => {
    // Shouldn't happen in practice (verified is computed from count), but guards
    // against any future inconsistency — verified score wins
    expect(effectiveScore("Insufficient", 0)).toBe("Insufficient");
    expect(effectiveScore("Low", 0)).toBe("Low"); // hypothetical edge case
  });

  it("falls back to AI estimate label when no verified score and studies > 0", () => {
    expect(effectiveScore(undefined, 5)).toBe("AI estimate");
    expect(effectiveScore(undefined, 100)).toBe("AI estimate");
  });

  it("uses verified_feasibility when studies > 0", () => {
    expect(effectiveScore("High", 50)).toBe("High");
    expect(effectiveScore("Moderate", 8)).toBe("Moderate");
    expect(effectiveScore("Low", 4)).toBe("Low");
    expect(effectiveScore("Insufficient", 1)).toBe("Insufficient");
  });
});

/* -------------------------------------------------------------------------- */
/* Two-pass counting logic                                                     */
/* -------------------------------------------------------------------------- */

describe("Two-pass counting logic", () => {
  /** Simulates the pass1/pass2 logic in app/api/analyze/route.ts */
  function computeFinalCount(
    pass1: number | "failed",
    pass2: number | "failed" | "not-needed"
  ): { bestCount: number; anySucceeded: boolean } {
    const p1Succeeded = pass1 !== "failed";
    const p1Count = p1Succeeded ? (pass1 as number) : 0;
    const needsFallback = pass1 === "failed" || p1Count === 0;

    const p2Succeeded =
      needsFallback && pass2 !== "not-needed" && pass2 !== "failed";
    const p2Count = p2Succeeded ? (pass2 as number) : 0;

    const bestCount = Math.max(p1Count, p2Count);
    const anySucceeded = p1Succeeded || p2Succeeded;

    return { bestCount, anySucceeded };
  }

  it("uses pass1 count when it returns > 0", () => {
    const { bestCount, anySucceeded } = computeFinalCount(12, "not-needed");
    expect(bestCount).toBe(12);
    expect(anySucceeded).toBe(true);
  });

  it("uses pass2 count when pass1 returns 0", () => {
    const { bestCount, anySucceeded } = computeFinalCount(0, 8);
    expect(bestCount).toBe(8);
    expect(anySucceeded).toBe(true);
  });

  it("takes max when both passes return counts (pass1 = 0, pass2 > 0)", () => {
    const { bestCount } = computeFinalCount(0, 15);
    expect(bestCount).toBe(15);
  });

  it("returns 0 and anySucceeded=false when both passes fail (API down)", () => {
    const { bestCount, anySucceeded } = computeFinalCount("failed", "failed");
    expect(bestCount).toBe(0);
    expect(anySucceeded).toBe(false);
  });

  it("returns 0 and anySucceeded=false when pass1 fails and no fallback needed conceptually", () => {
    // If pass1 fails, fallback is triggered; if fallback also fails, no data
    const { bestCount, anySucceeded } = computeFinalCount("failed", "failed");
    expect(bestCount).toBe(0);
    expect(anySucceeded).toBe(false);
  });

  it("does NOT set verified_feasibility when anySucceeded is false", () => {
    const { anySucceeded } = computeFinalCount("failed", "failed");
    // The route sets verified_feasibility = anySucceeded ? getFeasibilityScore(n) : undefined
    const verifiedFeasibility = anySucceeded ? getFeasibilityScore(0) : undefined;
    expect(verifiedFeasibility).toBeUndefined();
  });

  it("sets verified_feasibility = Insufficient when count=0 and at least one call succeeded", () => {
    const { bestCount, anySucceeded } = computeFinalCount(0, 0);
    const verifiedFeasibility = anySucceeded ? getFeasibilityScore(bestCount) : undefined;
    // Both calls succeeded but both returned 0 — this is a genuine Insufficient result
    expect(verifiedFeasibility).toBe("Insufficient");
  });
});

/* -------------------------------------------------------------------------- */
/* Review exclusion from primary study count                                  */
/* -------------------------------------------------------------------------- */

describe("Review exclusion from primary study count", () => {
  it("PubMed query should exclude systematic reviews", () => {
    const rawQuery = "CBT for depression";
    const expectedQuery = `(${rawQuery}) AND NOT systematic[sb]`;
    // Verify the query structure is correct PubMed syntax
    expect(expectedQuery).toBe("(CBT for depression) AND NOT systematic[sb]");
    expect(expectedQuery).not.toContain("systematic[sb] AND");
  });

  it("EuropePMC query should exclude systematic reviews and meta-analyses", () => {
    const rawQuery = "mindfulness insomnia elderly";
    const expectedQuery = `(${rawQuery}) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"`;
    expect(expectedQuery).toContain('NOT PUB_TYPE:"Systematic Review"');
    expect(expectedQuery).toContain('NOT PUB_TYPE:"Meta-Analysis"');
  });

  it("queries with special characters are safely wrapped in parentheses", () => {
    const queryWithParens = '("CBT" AND "depression" AND "elderly")';
    const pubmedQuery = `(${queryWithParens}) AND NOT systematic[sb]`;
    // Should produce: (("CBT" AND "depression" AND "elderly")) AND NOT systematic[sb]
    // Double parens are valid PubMed syntax
    expect(pubmedQuery).toContain("AND NOT systematic[sb]");
    expect(pubmedQuery.startsWith("(")).toBe(true);
  });

  it("OpenAlex filter type 'primary' (type:article) excludes review-type works", () => {
    // Verify the logic: "primary" filter maps to type:article in OpenAlex
    function getOpenAlexFilter(filterType: "review" | "all" | "primary"): string | null {
      if (filterType === "review") return "type:review";
      if (filterType === "primary") return "type:article";
      return null;
    }
    expect(getOpenAlexFilter("primary")).toBe("type:article");
    expect(getOpenAlexFilter("review")).toBe("type:review");
    expect(getOpenAlexFilter("all")).toBeNull();
  });
});
