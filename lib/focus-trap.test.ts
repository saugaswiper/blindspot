/**
 * focus-trap.test.ts
 *
 * Unit tests for the focus-trap utility.
 * Pure-function tests only — no DOM, no React, no browser APIs.
 *
 * The React hook (useFocusTrap) is exercised in integration via the
 * component tests; its correctness flows from getNextFocusIndex which
 * is fully covered here.
 */

import { describe, it, expect } from "vitest";
import { FOCUSABLE_SELECTOR, getNextFocusIndex } from "./focus-trap";

/* ------------------------------------------------------------------ */
/* FOCUSABLE_SELECTOR                                                  */
/* ------------------------------------------------------------------ */

describe("FOCUSABLE_SELECTOR", () => {
  it("is a non-empty string", () => {
    expect(typeof FOCUSABLE_SELECTOR).toBe("string");
    expect(FOCUSABLE_SELECTOR.trim().length).toBeGreaterThan(0);
  });

  it("includes anchor links", () => {
    expect(FOCUSABLE_SELECTOR).toContain("a[href]");
  });

  it("includes non-disabled buttons", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
  });

  it("includes non-disabled inputs", () => {
    expect(FOCUSABLE_SELECTOR).toContain("input:not([disabled])");
  });

  it("includes non-disabled selects", () => {
    expect(FOCUSABLE_SELECTOR).toContain("select:not([disabled])");
  });

  it("includes non-disabled textareas", () => {
    expect(FOCUSABLE_SELECTOR).toContain("textarea:not([disabled])");
  });

  it("includes positive-tabindex elements but excludes tabindex=-1", () => {
    // The selector should match [tabindex] without tabindex='-1'
    expect(FOCUSABLE_SELECTOR).toContain("[tabindex]:not([tabindex='-1'])");
  });

  it("includes details > summary", () => {
    expect(FOCUSABLE_SELECTOR).toContain("details > summary");
  });
});

/* ------------------------------------------------------------------ */
/* getNextFocusIndex — forward Tab (forward = true)                   */
/* ------------------------------------------------------------------ */

describe("getNextFocusIndex — forward Tab", () => {
  it("advances from index 0 to 1 in a 3-element list", () => {
    expect(getNextFocusIndex(0, 3, true)).toBe(1);
  });

  it("advances from index 1 to 2 in a 3-element list", () => {
    expect(getNextFocusIndex(1, 3, true)).toBe(2);
  });

  it("wraps from last element back to index 0 (circular Tab)", () => {
    expect(getNextFocusIndex(2, 3, true)).toBe(0);
  });

  it("wraps from last element in a single-element list back to 0", () => {
    expect(getNextFocusIndex(0, 1, true)).toBe(0);
  });

  it("wraps from last element in a 5-element list to 0", () => {
    expect(getNextFocusIndex(4, 5, true)).toBe(0);
  });

  it("advances correctly through a 2-element list", () => {
    expect(getNextFocusIndex(0, 2, true)).toBe(1);
    expect(getNextFocusIndex(1, 2, true)).toBe(0);
  });

  it("returns 0 when currentIndex is -1 (focus outside trap) and tabbing forward", () => {
    expect(getNextFocusIndex(-1, 5, true)).toBe(0);
  });

  it("returns 0 when currentIndex is -1 and list has exactly 1 element", () => {
    expect(getNextFocusIndex(-1, 1, true)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* getNextFocusIndex — backward Shift+Tab (forward = false)           */
/* ------------------------------------------------------------------ */

describe("getNextFocusIndex — backward Shift+Tab", () => {
  it("moves from index 2 to 1 in a 3-element list", () => {
    expect(getNextFocusIndex(2, 3, false)).toBe(1);
  });

  it("moves from index 1 to 0 in a 3-element list", () => {
    expect(getNextFocusIndex(1, 3, false)).toBe(0);
  });

  it("wraps from index 0 back to last element (circular Shift+Tab)", () => {
    expect(getNextFocusIndex(0, 3, false)).toBe(2);
  });

  it("wraps from index 0 in a single-element list back to 0", () => {
    expect(getNextFocusIndex(0, 1, false)).toBe(0);
  });

  it("wraps from index 0 in a 5-element list to index 4", () => {
    expect(getNextFocusIndex(0, 5, false)).toBe(4);
  });

  it("moves backward through a 2-element list", () => {
    expect(getNextFocusIndex(1, 2, false)).toBe(0);
    expect(getNextFocusIndex(0, 2, false)).toBe(1);
  });

  it("returns last index when currentIndex is -1 (focus outside trap) and tabbing backward", () => {
    expect(getNextFocusIndex(-1, 5, false)).toBe(4);
  });

  it("returns 0 when currentIndex is -1 and list has exactly 1 element", () => {
    expect(getNextFocusIndex(-1, 1, false)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* getNextFocusIndex — edge cases                                      */
/* ------------------------------------------------------------------ */

describe("getNextFocusIndex — edge cases", () => {
  it("returns 0 when total is 0 (safe guard — empty focusable list)", () => {
    // The hook bails out before calling this, but the function should not throw
    expect(getNextFocusIndex(0, 0, true)).toBe(0);
    expect(getNextFocusIndex(-1, 0, false)).toBe(0);
  });

  it("handles a large list correctly at the boundary", () => {
    const total = 100;
    expect(getNextFocusIndex(99, total, true)).toBe(0);  // wrap forward
    expect(getNextFocusIndex(0, total, false)).toBe(99); // wrap backward
  });

  it("cycling forward then backward returns to original index", () => {
    const original = 3;
    const total = 7;
    const after = getNextFocusIndex(original, total, true);
    const back = getNextFocusIndex(after, total, false);
    expect(back).toBe(original);
  });

  it("cycling backward then forward returns to original index", () => {
    const original = 3;
    const total = 7;
    const after = getNextFocusIndex(original, total, false);
    const fwd = getNextFocusIndex(after, total, true);
    expect(fwd).toBe(original);
  });
});
