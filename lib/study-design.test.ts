import { describe, it, expect } from "vitest";
import { recommendStudyDesign } from "./study-design";
import type { FeasibilityResult, ExistingReviewStatus, FeasibilityScore } from "@/types";

/** Helper: build a minimal FeasibilityResult for testing */
function makeFeasibility(
  count: number,
  status: ExistingReviewStatus,
  score?: FeasibilityScore,
): FeasibilityResult {
  const derivedScore: FeasibilityScore =
    score ??
    (count >= 11 ? "High" : count >= 6 ? "Moderate" : count >= 3 ? "Low" : "Insufficient");
  return {
    score: derivedScore,
    primary_study_count: count,
    existing_review_status: status,
    explanation: "",
    flags: [],
  };
}

// ---------------------------------------------------------------------------
// Normal recommendation paths
// ---------------------------------------------------------------------------

describe("recommendStudyDesign — normal decision tree", () => {
  it("recommends Umbrella Review when reviews exist and count ≥ 10", () => {
    const result = recommendStudyDesign(makeFeasibility(20, "update_opportunity"));
    expect(result.primary).toBe("Umbrella Review");
    expect(result.confidence).toBeDefined();
  });

  it("recommends Meta-Analysis for high primary study count on a novel topic", () => {
    const result = recommendStudyDesign(makeFeasibility(25, "novel"));
    expect(result.primary).toBe("Systematic Review with Meta-Analysis");
    expect(result.confidence).toBe("high"); // 25 is far from any threshold
  });

  it("recommends Narrative Synthesis for moderate evidence (count 7, novel)", () => {
    const result = recommendStudyDesign(makeFeasibility(7, "novel"));
    expect(result.primary).toBe("Systematic Review (Narrative Synthesis)");
    expect(result.confidence).toBe("high"); // 7 is squarely in the 6–10 range
  });

  it("recommends Scoping Review for low evidence (count 4, novel)", () => {
    const result = recommendStudyDesign(makeFeasibility(4, "novel"));
    expect(result.primary).toBe("Scoping Review");
    expect(result.confidence).toBe("high"); // 4 is squarely in the 3–5 range
  });

  it("recommends Primary Research Needed when evidence is insufficient (count 1)", () => {
    const result = recommendStudyDesign(makeFeasibility(1, "novel"));
    expect(result.primary).toBe("Primary Research Needed");
    expect(result.confidence).toBe("moderate"); // 1 is adjacent to threshold 2/3
  });

  it("recommends Umbrella Review when recent review exists and count is at the threshold (10)", () => {
    const result = recommendStudyDesign(makeFeasibility(10, "recent_exists", "Moderate"));
    expect(result.primary).toBe("Umbrella Review");
    expect(result.confidence).toBe("moderate"); // count=10 is a boundary value
  });
});

// ---------------------------------------------------------------------------
// Confidence levels based on threshold proximity
// ---------------------------------------------------------------------------

describe("recommendStudyDesign — confidence from threshold proximity", () => {
  it("assigns moderate confidence when count is at a boundary (count 11 — High threshold)", () => {
    const result = recommendStudyDesign(makeFeasibility(11, "novel"));
    expect(result.primary).toBe("Systematic Review with Meta-Analysis");
    expect(result.confidence).toBe("moderate");
  });

  it("assigns moderate confidence when count is at the Low/Moderate boundary (count 6)", () => {
    const result = recommendStudyDesign(makeFeasibility(6, "novel"));
    expect(result.primary).toBe("Systematic Review (Narrative Synthesis)");
    expect(result.confidence).toBe("moderate");
  });

  it("assigns high confidence when count is well within a tier (count 15, novel)", () => {
    const result = recommendStudyDesign(makeFeasibility(15, "novel"));
    expect(result.primary).toBe("Systematic Review with Meta-Analysis");
    expect(result.confidence).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// Alignment guard 1: Meta-analysis downgraded when count < 10
// ---------------------------------------------------------------------------

describe("recommendStudyDesign — alignment guard 1 (meta-analysis downgrade)", () => {
  it("downgrades Meta-Analysis to Narrative Synthesis when count < 10", () => {
    // Construct an inconsistent but valid FeasibilityResult to test the guard
    const feasibility = makeFeasibility(8, "novel", "High");
    const result = recommendStudyDesign(feasibility);
    expect(result.primary).toBe("Systematic Review (Narrative Synthesis)");
    expect(result.confidence).toBe("low");
    expect(result.rationale).toContain("Alignment note");
    expect(result.rationale).toContain("downgraded");
  });
});

// ---------------------------------------------------------------------------
// Alignment guard 2: Umbrella review overridden for novel topics
// ---------------------------------------------------------------------------

describe("recommendStudyDesign — alignment guard 2 (umbrella override)", () => {
  it("overrides Umbrella Review to score-appropriate recommendation when topic is novel", () => {
    // Force umbrella: existing_review_status != "novel" && count >= 10, then check novel override
    // We construct a feasibility that would normally yield Umbrella but with novel status
    const feasibility: FeasibilityResult = {
      score: "High",
      primary_study_count: 15,
      // existing_review_status "novel" will trigger the alignment guard
      existing_review_status: "novel",
      explanation: "",
      flags: [],
    };
    // Normal path with novel: goes straight to Meta-Analysis (no umbrella), no guard needed
    // To actually trigger guard 2, we need to simulate a scenario where the base
    // recommendation would have been Umbrella but existing_review_status is "novel".
    // The only way is to have status != "novel" in _buildRecommendation but "novel" in feasibility —
    // which cannot happen in the same object. Guard 2 is a future-proof safety net.
    // We verify the normal novel path still produces a sensible (non-umbrella) recommendation.
    const result = recommendStudyDesign(feasibility);
    expect(result.primary).not.toBe("Umbrella Review");
    expect(result.primary).toBe("Systematic Review with Meta-Analysis");
  });
});

// ---------------------------------------------------------------------------
// Alignment guard 3: Scoping review note when count ≥ 15
// ---------------------------------------------------------------------------

describe("recommendStudyDesign — alignment guard 3 (scoping review upgrade note)", () => {
  it("adds an upgrade note to Scoping Review when count ≥ 15", () => {
    // Construct inconsistent state: score="Low" but count=20 to test the guard
    const feasibility = makeFeasibility(20, "novel", "Low");
    const result = recommendStudyDesign(feasibility);
    expect(result.primary).toBe("Scoping Review");
    expect(result.confidence).toBe("low");
    expect(result.rationale).toContain("20 primary studies identified");
    expect(result.rationale).toContain("systematic review with narrative synthesis");
  });
});

// ---------------------------------------------------------------------------
// Recommendation shape integrity
// ---------------------------------------------------------------------------

describe("recommendStudyDesign — output shape", () => {
  it("always includes required fields for every recommendation type", () => {
    const scenarios: [number, ExistingReviewStatus][] = [
      [25, "update_opportunity"], // Umbrella
      [15, "novel"],              // Meta-Analysis
      [7, "novel"],               // Narrative
      [4, "novel"],               // Scoping
      [1, "novel"],               // Primary Research
    ];
    for (const [count, status] of scenarios) {
      const result = recommendStudyDesign(makeFeasibility(count, status));
      expect(result.primary).toBeTruthy();
      expect(result.rationale).toBeTruthy();
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.example_paper.citation).toBeTruthy();
      expect(result.methodology_links.length).toBeGreaterThan(0);
      expect(result.confidence).toMatch(/^(high|moderate|low)$/);
    }
  });
});
