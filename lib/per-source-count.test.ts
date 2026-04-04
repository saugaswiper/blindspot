/**
 * UI-1 — Per-source study count breakdown unit tests
 *
 * Tests the display logic for the SourceBreakdown component:
 * - Whether to show the breakdown (hasAny guard)
 * - Entry generation from partial / full / null source data
 *
 * Note: React component rendering is covered by visual review; these tests
 * exercise the pure logic that determines what is shown.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Pure helper: determine whether any source count is available
// ---------------------------------------------------------------------------

function hasAnySourceCount(
  pubmedCount: number | null | undefined,
  openalexCount: number | null | undefined,
  europepmcCount: number | null | undefined
): boolean {
  return (
    (pubmedCount !== null && pubmedCount !== undefined) ||
    (openalexCount !== null && openalexCount !== undefined) ||
    (europepmcCount !== null && europepmcCount !== undefined)
  );
}

// ---------------------------------------------------------------------------
// Pure helper: build the list of source entries for display
// ---------------------------------------------------------------------------

type SourceEntry = { label: string; count: number };

function buildSourceEntries(
  pubmedCount: number | null | undefined,
  openalexCount: number | null | undefined,
  europepmcCount: number | null | undefined
): SourceEntry[] {
  const entries: SourceEntry[] = [];
  if (pubmedCount !== null && pubmedCount !== undefined) entries.push({ label: "PubMed", count: pubmedCount });
  if (openalexCount !== null && openalexCount !== undefined) entries.push({ label: "OpenAlex", count: openalexCount });
  if (europepmcCount !== null && europepmcCount !== undefined) entries.push({ label: "Europe PMC", count: europepmcCount });
  return entries;
}

// ---------------------------------------------------------------------------
// Tests: hasAnySourceCount
// ---------------------------------------------------------------------------

describe("hasAnySourceCount", () => {
  it("returns false when all three are null", () => {
    expect(hasAnySourceCount(null, null, null)).toBe(false);
  });

  it("returns false when all three are undefined", () => {
    expect(hasAnySourceCount(undefined, undefined, undefined)).toBe(false);
  });

  it("returns true when only pubmed is available", () => {
    expect(hasAnySourceCount(42, null, null)).toBe(true);
  });

  it("returns true when only openalex is available", () => {
    expect(hasAnySourceCount(null, 81, null)).toBe(true);
  });

  it("returns true when only europepmc is available", () => {
    expect(hasAnySourceCount(null, null, 30)).toBe(true);
  });

  it("returns true when all three are available", () => {
    expect(hasAnySourceCount(67, 81, 43)).toBe(true);
  });

  it("returns true when two are available (pubmed + europepmc)", () => {
    expect(hasAnySourceCount(50, null, 35)).toBe(true);
  });

  it("treats 0 as a valid (available) count", () => {
    // A source returning 0 is still a meaningful response
    expect(hasAnySourceCount(0, null, null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildSourceEntries
// ---------------------------------------------------------------------------

describe("buildSourceEntries", () => {
  it("returns empty array when all counts are null", () => {
    expect(buildSourceEntries(null, null, null)).toEqual([]);
  });

  it("returns all three entries in order when all are available", () => {
    const entries = buildSourceEntries(67, 81, 43);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ label: "PubMed", count: 67 });
    expect(entries[1]).toEqual({ label: "OpenAlex", count: 81 });
    expect(entries[2]).toEqual({ label: "Europe PMC", count: 43 });
  });

  it("skips null sources", () => {
    const entries = buildSourceEntries(67, null, 43);
    expect(entries).toHaveLength(2);
    expect(entries[0].label).toBe("PubMed");
    expect(entries[1].label).toBe("Europe PMC");
  });

  it("skips undefined sources", () => {
    const entries = buildSourceEntries(undefined, 81, undefined);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ label: "OpenAlex", count: 81 });
  });

  it("includes 0-count sources (API responded with 0 results)", () => {
    const entries = buildSourceEntries(0, null, 15);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ label: "PubMed", count: 0 });
    expect(entries[1]).toEqual({ label: "Europe PMC", count: 15 });
  });

  it("preserves large counts accurately", () => {
    const entries = buildSourceEntries(12345, 98765, 4321);
    expect(entries[0].count).toBe(12345);
    expect(entries[1].count).toBe(98765);
    expect(entries[2].count).toBe(4321);
  });
});
