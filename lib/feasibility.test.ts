import { describe, it, expect } from "vitest";
import { scoreFeasibility, getFeasibilityScore } from "./feasibility";
import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReview(year: number): ExistingReview {
  return { title: "Test SR", year, journal: "Test Journal", abstract_snippet: "", source: "PubMed" };
}

const NO_REVIEWS: ExistingReview[] = [];

// ---------------------------------------------------------------------------
// getFeasibilityScore — threshold boundaries
// ---------------------------------------------------------------------------

describe("getFeasibilityScore", () => {
  it("returns Insufficient for 0 studies", () => {
    expect(getFeasibilityScore(0)).toBe("Insufficient");
  });
  it("returns Insufficient for 2 studies", () => {
    expect(getFeasibilityScore(2)).toBe("Insufficient");
  });
  it("returns Low at lower boundary (3)", () => {
    expect(getFeasibilityScore(3)).toBe("Low");
  });
  it("returns Low at upper boundary (5)", () => {
    expect(getFeasibilityScore(5)).toBe("Low");
  });
  it("returns Moderate at lower boundary (6)", () => {
    expect(getFeasibilityScore(6)).toBe("Moderate");
  });
  it("returns Moderate at upper boundary (10)", () => {
    expect(getFeasibilityScore(10)).toBe("Moderate");
  });
  it("returns High at boundary (11)", () => {
    expect(getFeasibilityScore(11)).toBe("High");
  });
  it("returns High for large counts", () => {
    expect(getFeasibilityScore(1000)).toBe("High");
    expect(getFeasibilityScore(5000)).toBe("High");
  });
});

// ---------------------------------------------------------------------------
// scoreFeasibility — score and flags
// ---------------------------------------------------------------------------

describe("scoreFeasibility — standard cases", () => {
  it("score is High for primaryStudyCount >= 11", () => {
    const result = scoreFeasibility(15, NO_REVIEWS);
    expect(result.score).toBe("High");
  });

  it("score is Moderate for 6–10", () => {
    expect(scoreFeasibility(6, NO_REVIEWS).score).toBe("Moderate");
    expect(scoreFeasibility(10, NO_REVIEWS).score).toBe("Moderate");
  });

  it("score is Low for 3–5", () => {
    expect(scoreFeasibility(3, NO_REVIEWS).score).toBe("Low");
    expect(scoreFeasibility(5, NO_REVIEWS).score).toBe("Low");
  });

  it("score is Insufficient for 0–2", () => {
    expect(scoreFeasibility(0, NO_REVIEWS).score).toBe("Insufficient");
    expect(scoreFeasibility(2, NO_REVIEWS).score).toBe("Insufficient");
  });

  it("primary_study_count is echoed in result", () => {
    expect(scoreFeasibility(42, NO_REVIEWS).primary_study_count).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// scoreFeasibility — review status logic
// ---------------------------------------------------------------------------

describe("scoreFeasibility — existing review status", () => {
  const currentYear = new Date().getFullYear();

  it("novel when no reviews", () => {
    expect(scoreFeasibility(20, NO_REVIEWS).existing_review_status).toBe("novel");
  });

  it("recent_exists when a review was published within 2 years", () => {
    const result = scoreFeasibility(20, [makeReview(currentYear - 1)]);
    expect(result.existing_review_status).toBe("recent_exists");
  });

  it("update_opportunity when most recent review is 3–5 years old", () => {
    const result = scoreFeasibility(20, [makeReview(currentYear - 4)]);
    expect(result.existing_review_status).toBe("update_opportunity");
  });

  it("novel when most recent review is older than 5 years", () => {
    const result = scoreFeasibility(20, [makeReview(currentYear - 6)]);
    expect(result.existing_review_status).toBe("novel");
  });
});

// ---------------------------------------------------------------------------
// scoreFeasibility — broad-query flag (NEW: primaryStudyCount > 2000)
// ---------------------------------------------------------------------------

describe("scoreFeasibility — broad-query flag for very large corpora", () => {
  it("does NOT add broad-query flag when count is exactly 2000", () => {
    const result = scoreFeasibility(2000, NO_REVIEWS);
    const hasBroadFlag = result.flags.some((f) => f.includes("Very large evidence base"));
    expect(hasBroadFlag).toBe(false);
  });

  it("adds broad-query flag when count is 2001", () => {
    const result = scoreFeasibility(2001, NO_REVIEWS);
    const hasBroadFlag = result.flags.some((f) => f.includes("Very large evidence base"));
    expect(hasBroadFlag).toBe(true);
  });

  it("adds broad-query flag when count is 5000", () => {
    const result = scoreFeasibility(5000, NO_REVIEWS);
    const hasBroadFlag = result.flags.some((f) => f.includes("Very large evidence base"));
    expect(hasBroadFlag).toBe(true);
  });

  it("broad-query flag includes the formatted count", () => {
    const result = scoreFeasibility(3500, NO_REVIEWS);
    const broadFlag = result.flags.find((f) => f.includes("Very large evidence base"));
    expect(broadFlag).toContain("3,500");
  });

  it("broad-query flag recommends narrowing the PICO question", () => {
    const result = scoreFeasibility(2500, NO_REVIEWS);
    const broadFlag = result.flags.find((f) => f.includes("Very large evidence base"));
    expect(broadFlag).toContain("PICO");
  });

  it("score is still High for >2000 (no score penalty, only a flag)", () => {
    const result = scoreFeasibility(3000, NO_REVIEWS);
    expect(result.score).toBe("High");
  });

  it("flag coexists with recent_exists flag correctly", () => {
    const currentYear = new Date().getFullYear();
    const result = scoreFeasibility(3000, [makeReview(currentYear - 1)]);
    const hasBroadFlag = result.flags.some((f) => f.includes("Very large evidence base"));
    const hasRecentFlag = result.flags.some((f) => f.includes("Recent systematic review"));
    expect(hasBroadFlag).toBe(true);
    expect(hasRecentFlag).toBe(true);
  });
});
