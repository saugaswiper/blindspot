import { describe, it, expect } from "vitest";
import { getPerGapBadgeConfig } from "@/lib/gap-badge";
import type { FeasibilityScore } from "@/types";

/**
 * Unit tests for getPerGapBadgeConfig.
 *
 * This function controls whether a per-gap evidence quality badge appears on
 * individual gap cards in ResultsDashboard. It should return a config object
 * for Low and Moderate feasibility, and null for High and Insufficient.
 */

describe("getPerGapBadgeConfig", () => {
  // -------------------------------------------------------------------------
  // Low feasibility (3–5 studies) → strong caution badge
  // -------------------------------------------------------------------------

  describe("Low feasibility", () => {
    it("returns a config with label 'Low confidence'", () => {
      const config = getPerGapBadgeConfig("Low", 4);
      expect(config).not.toBeNull();
      expect(config!.label).toBe("Low confidence");
    });

    it("uses the 'low' icon variant (◔ — one quarter filled)", () => {
      const config = getPerGapBadgeConfig("Low", 4);
      expect(config!.iconVariant).toBe("low");
    });

    it("interpolates the study count into the tooltip (singular)", () => {
      const config = getPerGapBadgeConfig("Low", 1);
      expect(config!.tooltip).toContain("1 primary study");
    });

    it("interpolates the study count into the tooltip (plural)", () => {
      const config = getPerGapBadgeConfig("Low", 5);
      expect(config!.tooltip).toContain("5 primary studies");
    });

    it("interpolates the study count into the ariaLabel", () => {
      const config = getPerGapBadgeConfig("Low", 3);
      expect(config!.ariaLabel).toContain("3 primary studies");
    });

    it("tooltip mentions 'exploratory' to signal research caution", () => {
      const config = getPerGapBadgeConfig("Low", 4);
      expect(config!.tooltip.toLowerCase()).toContain("exploratory");
    });

    it("returns a non-empty className string", () => {
      const config = getPerGapBadgeConfig("Low", 4);
      expect(config!.className.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Moderate feasibility (6–10 studies) → mild caution badge
  // -------------------------------------------------------------------------

  describe("Moderate feasibility", () => {
    it("returns a config with label 'Moderate evidence'", () => {
      const config = getPerGapBadgeConfig("Moderate", 8);
      expect(config).not.toBeNull();
      expect(config!.label).toBe("Moderate evidence");
    });

    it("uses the 'moderate' icon variant (◑ — half filled)", () => {
      const config = getPerGapBadgeConfig("Moderate", 8);
      expect(config!.iconVariant).toBe("moderate");
    });

    it("interpolates the study count into the tooltip (singular)", () => {
      const config = getPerGapBadgeConfig("Moderate", 1);
      expect(config!.tooltip).toContain("1 primary study");
    });

    it("interpolates the study count into the tooltip (plural)", () => {
      const config = getPerGapBadgeConfig("Moderate", 10);
      expect(config!.tooltip).toContain("10 primary studies");
    });

    it("interpolates the study count into the ariaLabel", () => {
      const config = getPerGapBadgeConfig("Moderate", 6);
      expect(config!.ariaLabel).toContain("6 primary studies");
    });

    it("tooltip references Cochrane threshold", () => {
      const config = getPerGapBadgeConfig("Moderate", 7);
      expect(config!.tooltip.toLowerCase()).toContain("cochrane");
    });

    it("tooltip mentions 'preliminary' to signal milder caution vs 'exploratory'", () => {
      const config = getPerGapBadgeConfig("Moderate", 7);
      expect(config!.tooltip.toLowerCase()).toContain("preliminary");
    });

    it("returns a className distinct from the Low badge className", () => {
      const lowConfig = getPerGapBadgeConfig("Low", 4);
      const moderateConfig = getPerGapBadgeConfig("Moderate", 8);
      expect(moderateConfig!.className).not.toBe(lowConfig!.className);
    });
  });

  // -------------------------------------------------------------------------
  // High feasibility → no badge (no noise for well-evidenced topics)
  // -------------------------------------------------------------------------

  describe("High feasibility", () => {
    it("returns null for High feasibility with a large study count", () => {
      expect(getPerGapBadgeConfig("High", 50)).toBeNull();
    });

    it("returns null for High feasibility at the boundary count of 11", () => {
      expect(getPerGapBadgeConfig("High", 11)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Insufficient feasibility → no badge (ACC-1 gate blocks gap analysis anyway)
  // -------------------------------------------------------------------------

  describe("Insufficient feasibility", () => {
    it("returns null for Insufficient feasibility", () => {
      expect(getPerGapBadgeConfig("Insufficient", 2)).toBeNull();
    });

    it("returns null for Insufficient feasibility with 0 studies", () => {
      expect(getPerGapBadgeConfig("Insufficient", 0)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Null feasibility (score not yet computed)
  // -------------------------------------------------------------------------

  describe("null feasibility score", () => {
    it("returns null when feasibilityScore is null", () => {
      expect(getPerGapBadgeConfig(null, 5)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Boundary values — ensure Low and Moderate thresholds are correctly handled
  // -------------------------------------------------------------------------

  describe("feasibility tier boundaries", () => {
    const TIER_CASES: Array<[FeasibilityScore, number, string | null]> = [
      ["Low", 3, "Low confidence"],        // lowest Low count
      ["Low", 5, "Low confidence"],        // highest Low count
      ["Moderate", 6, "Moderate evidence"], // lowest Moderate count
      ["Moderate", 10, "Moderate evidence"],// highest Moderate count
      ["High", 11, null],                  // lowest High count — no badge
    ];

    it.each(TIER_CASES)(
      "score=%s count=%i → label=%s",
      (score, count, expectedLabel) => {
        const config = getPerGapBadgeConfig(score, count);
        if (expectedLabel === null) {
          expect(config).toBeNull();
        } else {
          expect(config).not.toBeNull();
          expect(config!.label).toBe(expectedLabel);
        }
      }
    );
  });
});
