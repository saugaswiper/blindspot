/**
 * Unit tests for lib/cache-freshness.ts (UI-3)
 *
 * All tests use a pinned "now" date so results are deterministic.
 */

import { describe, it, expect } from "vitest";
import { getAgeInDays, getCacheFreshnessStatus, formatResultAge } from "./cache-freshness";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): string {
  const d = new Date("2026-04-05T12:00:00Z");
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const NOW = new Date("2026-04-05T12:00:00Z");

// ---------------------------------------------------------------------------
// getAgeInDays
// ---------------------------------------------------------------------------

describe("getAgeInDays", () => {
  it("returns 0 for a result created right now", () => {
    expect(getAgeInDays(NOW.toISOString(), NOW)).toBeCloseTo(0, 5);
  });

  it("returns approximately 1 for a result created 1 day ago", () => {
    expect(getAgeInDays(daysAgo(1), NOW)).toBeCloseTo(1, 1);
  });

  it("returns approximately 30 for a result created 30 days ago", () => {
    expect(getAgeInDays(daysAgo(30), NOW)).toBeCloseTo(30, 1);
  });
});

// ---------------------------------------------------------------------------
// getCacheFreshnessStatus
// ---------------------------------------------------------------------------

describe("getCacheFreshnessStatus", () => {
  it("returns 'fresh' for a result created today", () => {
    expect(getCacheFreshnessStatus(daysAgo(0), NOW)).toBe("fresh");
  });

  it("returns 'fresh' for a result created 3 days ago", () => {
    expect(getCacheFreshnessStatus(daysAgo(3), NOW)).toBe("fresh");
  });

  it("returns 'fresh' for a result created 6 days ago (boundary — below threshold)", () => {
    // 6.9 days — still within the 7-day fresh window
    const sixPointNineDaysAgo = new Date(NOW.getTime() - 6.9 * 24 * 60 * 60 * 1000);
    expect(getCacheFreshnessStatus(sixPointNineDaysAgo.toISOString(), NOW)).toBe("fresh");
  });

  it("returns 'aging' for a result created 7 days ago (at threshold)", () => {
    expect(getCacheFreshnessStatus(daysAgo(7), NOW)).toBe("aging");
  });

  it("returns 'aging' for a result created 14 days ago", () => {
    expect(getCacheFreshnessStatus(daysAgo(14), NOW)).toBe("aging");
  });

  it("returns 'aging' for a result created 29 days ago (boundary — below stale)", () => {
    // 29.9 days
    const twentyNinePointNine = new Date(NOW.getTime() - 29.9 * 24 * 60 * 60 * 1000);
    expect(getCacheFreshnessStatus(twentyNinePointNine.toISOString(), NOW)).toBe("aging");
  });

  it("returns 'stale' for a result created 30 days ago (at stale threshold)", () => {
    expect(getCacheFreshnessStatus(daysAgo(30), NOW)).toBe("stale");
  });

  it("returns 'stale' for a result created 60 days ago", () => {
    expect(getCacheFreshnessStatus(daysAgo(60), NOW)).toBe("stale");
  });

  it("returns 'stale' for a result created 365 days ago", () => {
    expect(getCacheFreshnessStatus(daysAgo(365), NOW)).toBe("stale");
  });
});

// ---------------------------------------------------------------------------
// formatResultAge
// ---------------------------------------------------------------------------

describe("formatResultAge", () => {
  it("returns 'today' for a result created < 1 day ago", () => {
    const sixHoursAgo = new Date(NOW.getTime() - 6 * 60 * 60 * 1000);
    expect(formatResultAge(sixHoursAgo.toISOString(), NOW)).toBe("today");
  });

  it("returns 'today' for a result created moments ago", () => {
    expect(formatResultAge(NOW.toISOString(), NOW)).toBe("today");
  });

  it("returns 'yesterday' for a result created ~1 day ago", () => {
    expect(formatResultAge(daysAgo(1), NOW)).toBe("yesterday");
  });

  it("returns 'N days ago' for 2–13 days", () => {
    expect(formatResultAge(daysAgo(2), NOW)).toBe("2 days ago");
    expect(formatResultAge(daysAgo(5), NOW)).toBe("5 days ago");
    expect(formatResultAge(daysAgo(13), NOW)).toBe("13 days ago");
  });

  it("returns '2 weeks ago' for 14 days", () => {
    expect(formatResultAge(daysAgo(14), NOW)).toBe("2 weeks ago");
  });

  it("returns '1 week ago' for 7 days (singular)", () => {
    expect(formatResultAge(daysAgo(7), NOW)).toBe("1 week ago");
  });

  it("returns '4 weeks ago' for 28 days", () => {
    expect(formatResultAge(daysAgo(28), NOW)).toBe("4 weeks ago");
  });

  it("returns '1 month ago' for 30 days (singular)", () => {
    expect(formatResultAge(daysAgo(30), NOW)).toBe("1 month ago");
  });

  it("returns '2 months ago' for 60 days (plural)", () => {
    expect(formatResultAge(daysAgo(60), NOW)).toBe("2 months ago");
  });

  it("returns '6 months ago' for ~180 days", () => {
    expect(formatResultAge(daysAgo(180), NOW)).toBe("6 months ago");
  });
});
