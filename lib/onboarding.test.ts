/**
 * lib/onboarding.test.ts
 *
 * Unit tests for the onboarding tour pure-function utilities.
 * Run with: npx vitest run lib/onboarding.test.ts
 *
 * Node smoke runner: does NOT work with --experimental-transform-types
 * due to ESM module resolution (same limitation as all other test files).
 * Tests are designed for vitest; run them on the deployment platform
 * after `npm install` with the native rollup binary.
 */

import { describe, it, expect } from "vitest";
import {
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  getTourStep,
  getTourStepCount,
  isFirstStep,
  isLastStep,
  hasTourBeenSeen,
  markTourAsSeen,
  resetTourSeen,
} from "./onboarding";

// ---------------------------------------------------------------------------
// TOUR_STEPS constant
// ---------------------------------------------------------------------------

describe("TOUR_STEPS", () => {
  it("has exactly 3 steps", () => {
    expect(TOUR_STEPS).toHaveLength(3);
  });

  it("each step has a non-empty title", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("each step has a non-empty description", () => {
    for (const step of TOUR_STEPS) {
      expect(step.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("each step has a non-empty icon", () => {
    for (const step of TOUR_STEPS) {
      expect(step.icon.trim().length).toBeGreaterThan(0);
    }
  });

  it("each step has a non-empty hint", () => {
    for (const step of TOUR_STEPS) {
      expect(step.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("step 1 title mentions search or PICO", () => {
    const title = TOUR_STEPS[0].title.toLowerCase();
    expect(title.includes("search") || title.includes("pico")).toBe(true);
  });

  it("step 2 content mentions feasibility", () => {
    const text = (TOUR_STEPS[1].title + TOUR_STEPS[1].description).toLowerCase();
    expect(text.includes("feasib")).toBe(true);
  });

  it("step 3 content mentions gap analysis", () => {
    const text = (TOUR_STEPS[2].title + TOUR_STEPS[2].description).toLowerCase();
    expect(text.includes("gap")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTourStepCount
// ---------------------------------------------------------------------------

describe("getTourStepCount", () => {
  it("returns 3", () => {
    expect(getTourStepCount()).toBe(3);
  });

  it("equals TOUR_STEPS.length", () => {
    expect(getTourStepCount()).toBe(TOUR_STEPS.length);
  });
});

// ---------------------------------------------------------------------------
// getTourStep
// ---------------------------------------------------------------------------

describe("getTourStep", () => {
  it("index 0 returns the first step", () => {
    const step = getTourStep(0);
    expect(step).not.toBeNull();
    expect(step!.title).toBe(TOUR_STEPS[0].title);
  });

  it("index 1 returns the second step", () => {
    const step = getTourStep(1);
    expect(step).not.toBeNull();
    expect(step!.title).toBe(TOUR_STEPS[1].title);
  });

  it("index 2 (last) returns the third step", () => {
    const step = getTourStep(2);
    expect(step).not.toBeNull();
    expect(step!.title).toBe(TOUR_STEPS[2].title);
  });

  it("negative index returns null", () => {
    expect(getTourStep(-1)).toBeNull();
  });

  it("index equal to step count returns null", () => {
    expect(getTourStep(TOUR_STEPS.length)).toBeNull();
  });

  it("large out-of-range index returns null", () => {
    expect(getTourStep(999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isFirstStep
// ---------------------------------------------------------------------------

describe("isFirstStep", () => {
  it("index 0 is the first step", () => {
    expect(isFirstStep(0)).toBe(true);
  });

  it("index 1 is not the first step", () => {
    expect(isFirstStep(1)).toBe(false);
  });

  it("index 2 is not the first step", () => {
    expect(isFirstStep(2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLastStep
// ---------------------------------------------------------------------------

describe("isLastStep", () => {
  it("last index (2) is the last step", () => {
    expect(isLastStep(TOUR_STEPS.length - 1)).toBe(true);
  });

  it("index 0 is not the last step", () => {
    expect(isLastStep(0)).toBe(false);
  });

  it("index 1 is not the last step", () => {
    expect(isLastStep(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TOUR_STORAGE_KEY
// ---------------------------------------------------------------------------

describe("TOUR_STORAGE_KEY", () => {
  it("is a non-empty string", () => {
    expect(typeof TOUR_STORAGE_KEY).toBe("string");
    expect(TOUR_STORAGE_KEY.trim().length).toBeGreaterThan(0);
  });

  it("contains a version suffix so future redesigns can show again", () => {
    expect(TOUR_STORAGE_KEY).toMatch(/v\d/);
  });
});

// ---------------------------------------------------------------------------
// hasTourBeenSeen / markTourAsSeen / resetTourSeen
// In the Node test environment (no browser window), all three are safe no-ops.
// Full localStorage round-trip tests are validated manually in the browser.
// ---------------------------------------------------------------------------

describe("localStorage helpers (Node/SSR fallback behaviour)", () => {
  it("hasTourBeenSeen returns false in SSR/Node context (no window)", () => {
    // In the Node test environment window is undefined, so this always returns false
    expect(hasTourBeenSeen()).toBe(false);
  });

  it("markTourAsSeen does not throw in SSR/Node context", () => {
    expect(() => markTourAsSeen()).not.toThrow();
  });

  it("resetTourSeen does not throw in SSR/Node context", () => {
    expect(() => resetTourSeen()).not.toThrow();
  });
});
