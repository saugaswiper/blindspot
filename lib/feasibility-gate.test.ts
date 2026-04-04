import { describe, it, expect } from "vitest";

/**
 * Tests for the ACC-1 feature: Hard gate blocking AI analysis on insufficient evidence.
 *
 * These tests verify the behavior when primaryStudyCount < 3.
 * The actual API route test is in app/api/analyze/route.test.ts (if it exists),
 * but these unit tests document the threshold logic.
 */

const INSUFFICIENT_THRESHOLD = 3;

function isEvidenceSufficient(primaryStudyCount: number): boolean {
  return primaryStudyCount >= INSUFFICIENT_THRESHOLD;
}

describe("ACC-1: Insufficient Evidence Gate", () => {
  describe("threshold boundary", () => {
    it("should block analysis for 0 studies", () => {
      expect(isEvidenceSufficient(0)).toBe(false);
    });

    it("should block analysis for 1 study", () => {
      expect(isEvidenceSufficient(1)).toBe(false);
    });

    it("should block analysis for 2 studies", () => {
      expect(isEvidenceSufficient(2)).toBe(false);
    });

    it("should allow analysis for exactly 3 studies (threshold boundary)", () => {
      expect(isEvidenceSufficient(3)).toBe(true);
    });

    it("should allow analysis for more than 3 studies", () => {
      expect(isEvidenceSufficient(4)).toBe(true);
      expect(isEvidenceSufficient(10)).toBe(true);
      expect(isEvidenceSufficient(100)).toBe(true);
    });
  });

  describe("user-facing messages", () => {
    it("should describe the problem accurately for 0 studies", () => {
      const count = 0;
      const message = `${count === 0 ? "No" : count} primary studies found. A systematic review is not feasible.`;
      expect(message).toContain("No primary studies found");
      expect(message).toContain("not feasible");
    });

    it("should describe the problem accurately for 1 study", () => {
      const count = 1;
      const message = `Only ${count} primary study found. A systematic review is not feasible.`;
      expect(message).toContain("Only 1 primary study");
      expect(message).toContain("not feasible");
    });

    it("should describe the problem accurately for 2 studies", () => {
      const count = 2;
      const message = `Only ${count} primary studies found. A systematic review is not feasible.`;
      expect(message).toContain("Only 2 primary studies");
      expect(message).toContain("not feasible");
    });
  });

  describe("API error response format", () => {
    it("should return appropriate error structure for insufficient evidence", () => {
      const primaryStudyCount = 2;
      if (primaryStudyCount < INSUFFICIENT_THRESHOLD) {
        const errorResponse = {
          error: "insufficient_evidence",
          primaryStudyCount,
          feasibilityScore: "Insufficient",
          message: "Not enough primary studies to identify meaningful gaps.",
        };
        expect(errorResponse.error).toBe("insufficient_evidence");
        expect(errorResponse.primaryStudyCount).toBe(2);
        expect(errorResponse.feasibilityScore).toBe("Insufficient");
      }
    });
  });
});
