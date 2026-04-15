/**
 * Unit tests for lib/search-telemetry.ts
 *
 * Tests cover:
 *   - getCorpusTier: boundary conditions for all 5 tiers
 *   - buildTelemetryPayload: field presence, tier correctness, CI ordering,
 *     guest flag propagation, zero-study edge case
 *
 * insertSearchTelemetry is not tested here (requires live Supabase service-role
 * key). Its error-handling (catch + warn) is verified by inspection.
 */

import { describe, it, expect } from "vitest";
import { getCorpusTier } from "@/lib/prisma-diagram";
import { buildTelemetryPayload } from "@/lib/search-telemetry";

// ---------------------------------------------------------------------------
// getCorpusTier — tier boundary tests
// ---------------------------------------------------------------------------

describe("getCorpusTier", () => {
  describe("small tier (afterDedup < 15)", () => {
    it("returns 'small' for 0 studies", () => {
      expect(getCorpusTier(0)).toBe("small");
    });

    it("returns 'small' for 1 study", () => {
      expect(getCorpusTier(1)).toBe("small");
    });

    it("returns 'small' for 14 studies (upper boundary)", () => {
      expect(getCorpusTier(14)).toBe("small");
    });
  });

  describe("medium tier (15 ≤ afterDedup < 60)", () => {
    it("returns 'medium' for 15 studies (lower boundary)", () => {
      expect(getCorpusTier(15)).toBe("medium");
    });

    it("returns 'medium' for 30 studies (midpoint)", () => {
      expect(getCorpusTier(30)).toBe("medium");
    });

    it("returns 'medium' for 59 studies (upper boundary)", () => {
      expect(getCorpusTier(59)).toBe("medium");
    });
  });

  describe("large tier (60 ≤ afterDedup < 500)", () => {
    it("returns 'large' for 60 studies (lower boundary)", () => {
      expect(getCorpusTier(60)).toBe("large");
    });

    it("returns 'large' for 250 studies (midpoint)", () => {
      expect(getCorpusTier(250)).toBe("large");
    });

    it("returns 'large' for 499 studies (upper boundary)", () => {
      expect(getCorpusTier(499)).toBe("large");
    });
  });

  describe("xl tier (500 ≤ afterDedup < 1500)", () => {
    it("returns 'xl' for 500 studies (lower boundary)", () => {
      expect(getCorpusTier(500)).toBe("xl");
    });

    it("returns 'xl' for 1000 studies (midpoint)", () => {
      expect(getCorpusTier(1000)).toBe("xl");
    });

    it("returns 'xl' for 1499 studies (upper boundary)", () => {
      expect(getCorpusTier(1499)).toBe("xl");
    });
  });

  describe("xxl tier (afterDedup ≥ 1500)", () => {
    it("returns 'xxl' for 1500 studies (lower boundary)", () => {
      expect(getCorpusTier(1500)).toBe("xxl");
    });

    it("returns 'xxl' for 5000 studies", () => {
      expect(getCorpusTier(5000)).toBe("xxl");
    });

    it("returns 'xxl' for 100000 studies", () => {
      expect(getCorpusTier(100000)).toBe("xxl");
    });
  });

  describe("boundary table (it.each)", () => {
    it.each([
      [0,    "small"],
      [14,   "small"],
      [15,   "medium"],
      [59,   "medium"],
      [60,   "large"],
      [499,  "large"],
      [500,  "xl"],
      [1499, "xl"],
      [1500, "xxl"],
      [9999, "xxl"],
    ])("getCorpusTier(%i) === '%s'", (afterDedup, expected) => {
      expect(getCorpusTier(afterDedup)).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// buildTelemetryPayload — payload shape tests
// ---------------------------------------------------------------------------

describe("buildTelemetryPayload", () => {
  const RESULT_ID = "550e8400-e29b-41d4-a716-446655440000";

  it("returns the correct search_result_id", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 100, false);
    expect(payload.search_result_id).toBe(RESULT_ID);
  });

  it("stores after_dedup equal to primaryStudyCount", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 42, false);
    expect(payload.after_dedup).toBe(42);
  });

  it("sets is_guest = false for authenticated user", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 100, false);
    expect(payload.is_guest).toBe(false);
  });

  it("sets is_guest = true for guest user", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 100, true);
    expect(payload.is_guest).toBe(true);
  });

  it("derives tier correctly for a small corpus (8 studies)", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 8, false);
    expect(payload.tier).toBe("small");
  });

  it("derives tier correctly for a medium corpus (30 studies)", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 30, false);
    expect(payload.tier).toBe("medium");
  });

  it("derives tier correctly for a large corpus (200 studies)", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 200, false);
    expect(payload.tier).toBe("large");
  });

  it("derives tier correctly for an xl corpus (800 studies)", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 800, false);
    expect(payload.tier).toBe("xl");
  });

  it("derives tier correctly for an xxl corpus (2000 studies)", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 2000, false);
    expect(payload.tier).toBe("xxl");
  });

  it("included_estimate is a positive integer", () => {
    const payload = buildTelemetryPayload(RESULT_ID, 100, false);
    expect(payload.included_estimate).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(payload.included_estimate)).toBe(true);
  });

  it("CI is monotonically ordered: included_low ≤ included_estimate ≤ included_high", () => {
    for (const count of [5, 20, 80, 600, 2000]) {
      const payload = buildTelemetryPayload(RESULT_ID, count, false);
      expect(payload.included_low).toBeLessThanOrEqual(payload.included_estimate);
      expect(payload.included_estimate).toBeLessThanOrEqual(payload.included_high);
    }
  });

  it("included_low >= 1 (CI lower bound never drops to zero)", () => {
    for (const count of [0, 1, 3, 10, 50, 500]) {
      const payload = buildTelemetryPayload(RESULT_ID, count, false);
      expect(payload.included_low).toBeGreaterThanOrEqual(1);
    }
  });

  it("included_high > included_low (CI always has positive width)", () => {
    for (const count of [5, 20, 80, 600, 2000]) {
      const payload = buildTelemetryPayload(RESULT_ID, count, false);
      expect(payload.included_high).toBeGreaterThan(payload.included_low);
    }
  });

  it("tier matches getCorpusTier for the given primaryStudyCount", () => {
    for (const count of [0, 14, 15, 59, 60, 499, 500, 1499, 1500, 9999]) {
      const payload = buildTelemetryPayload(RESULT_ID, count, false);
      expect(payload.tier).toBe(getCorpusTier(count));
    }
  });

  it("handles primaryStudyCount = 0 without throwing", () => {
    expect(() => buildTelemetryPayload(RESULT_ID, 0, false)).not.toThrow();
  });

  it("produces a larger included_estimate for larger corpora (monotonic trend)", () => {
    const small = buildTelemetryPayload(RESULT_ID, 5, false);
    const medium = buildTelemetryPayload(RESULT_ID, 30, false);
    const large = buildTelemetryPayload(RESULT_ID, 200, false);
    expect(medium.included_estimate).toBeGreaterThan(small.included_estimate);
    expect(large.included_estimate).toBeGreaterThan(medium.included_estimate);
  });
});
