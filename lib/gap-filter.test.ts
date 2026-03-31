/**
 * gap-filter.test.ts
 *
 * Unit tests for the gap-filter utility.  These are pure-function tests with
 * no DOM / React / network dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  ALL_DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_SHORT_LABELS,
  isUnfiltered,
  toggleDimension,
  resetFilter,
  filterGapsByDimensions,
  filterTopicsByDimensions,
  countByDimension,
} from "./gap-filter";
import type { Gap, GapDimension, SuggestedTopic } from "@/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function makeGap(dimension: GapDimension, importance: Gap["importance"] = "medium"): Gap {
  return { dimension, importance, description: `Test gap for ${dimension}` };
}

function makeTopic(gap_type: GapDimension): SuggestedTopic {
  return {
    title: `Test topic for ${gap_type}`,
    gap_type,
    pubmed_query: `test[tiab]`,
    estimated_studies: 100,
    rationale: "Test rationale",
    feasibility: "moderate",
    expected_outcomes: "Test outcomes",
  };
}

const allActive = new Set(ALL_DIMENSIONS);

/* ------------------------------------------------------------------ */
/* ALL_DIMENSIONS                                                      */
/* ------------------------------------------------------------------ */

describe("ALL_DIMENSIONS", () => {
  it("contains exactly 6 dimensions", () => {
    expect(ALL_DIMENSIONS).toHaveLength(6);
  });

  it("contains all expected dimension names", () => {
    const expected: GapDimension[] = [
      "population",
      "methodology",
      "outcome",
      "geographic",
      "temporal",
      "theoretical",
    ];
    for (const d of expected) {
      expect(ALL_DIMENSIONS).toContain(d);
    }
  });
});

/* ------------------------------------------------------------------ */
/* DIMENSION_LABELS                                                    */
/* ------------------------------------------------------------------ */

describe("DIMENSION_LABELS", () => {
  it("has a label for every dimension", () => {
    for (const d of ALL_DIMENSIONS) {
      expect(DIMENSION_LABELS[d]).toBeTruthy();
    }
  });
});

describe("DIMENSION_SHORT_LABELS", () => {
  it("has a short label for every dimension", () => {
    for (const d of ALL_DIMENSIONS) {
      expect(DIMENSION_SHORT_LABELS[d]).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ */
/* isUnfiltered                                                        */
/* ------------------------------------------------------------------ */

describe("isUnfiltered", () => {
  it("returns true when all dimensions are active", () => {
    expect(isUnfiltered(allActive)).toBe(true);
  });

  it("returns false when one dimension is missing", () => {
    const partial = new Set(ALL_DIMENSIONS);
    partial.delete("temporal");
    expect(isUnfiltered(partial)).toBe(false);
  });

  it("returns false when only one dimension is active", () => {
    expect(isUnfiltered(new Set<GapDimension>(["population"]))).toBe(false);
  });

  it("returns false for an empty set", () => {
    expect(isUnfiltered(new Set())).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* toggleDimension                                                     */
/* ------------------------------------------------------------------ */

describe("toggleDimension", () => {
  it("adds a dimension that is not currently active", () => {
    const partial = new Set<GapDimension>(["population"]);
    const result = toggleDimension(partial, "methodology");
    expect(result.has("methodology")).toBe(true);
    expect(result.has("population")).toBe(true);
  });

  it("removes a dimension that is currently active (when others also active)", () => {
    const twoActive = new Set<GapDimension>(["population", "methodology"]);
    const result = toggleDimension(twoActive, "methodology");
    expect(result.has("methodology")).toBe(false);
    expect(result.has("population")).toBe(true);
  });

  it("does NOT remove the last remaining dimension", () => {
    const single = new Set<GapDimension>(["geographic"]);
    const result = toggleDimension(single, "geographic");
    expect(result.has("geographic")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("does not mutate the input set", () => {
    const original = new Set<GapDimension>(["population", "outcome"]);
    const sizeBefore = original.size;
    toggleDimension(original, "outcome");
    expect(original.size).toBe(sizeBefore); // unchanged
  });

  it("returns a new Set instance (not the same reference)", () => {
    const original = new Set<GapDimension>(["population", "outcome"]);
    const result = toggleDimension(original, "outcome");
    expect(result).not.toBe(original);
  });

  it("toggling an absent dimension adds it to the full set", () => {
    const noTemporal = new Set(ALL_DIMENSIONS);
    noTemporal.delete("temporal");
    const result = toggleDimension(noTemporal, "temporal");
    expect(result.has("temporal")).toBe(true);
    expect(isUnfiltered(result)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* resetFilter                                                         */
/* ------------------------------------------------------------------ */

describe("resetFilter", () => {
  it("returns a set containing all dimensions", () => {
    const result = resetFilter();
    expect(isUnfiltered(result)).toBe(true);
  });

  it("returns a new Set each time (not a cached singleton)", () => {
    const a = resetFilter();
    const b = resetFilter();
    expect(a).not.toBe(b);
  });
});

/* ------------------------------------------------------------------ */
/* filterGapsByDimensions                                              */
/* ------------------------------------------------------------------ */

describe("filterGapsByDimensions", () => {
  const gaps: Gap[] = [
    makeGap("population", "high"),
    makeGap("methodology", "medium"),
    makeGap("outcome", "low"),
    makeGap("geographic", "high"),
    makeGap("temporal", "medium"),
    makeGap("theoretical", "low"),
  ];

  it("returns the original array reference when all dimensions are active", () => {
    const result = filterGapsByDimensions(gaps, allActive);
    expect(result).toBe(gaps); // same reference — no unnecessary copy
  });

  it("returns only matching gaps when a subset is active", () => {
    const active = new Set<GapDimension>(["population", "outcome"]);
    const result = filterGapsByDimensions(gaps, active);
    expect(result).toHaveLength(2);
    expect(result.every((g) => active.has(g.dimension))).toBe(true);
  });

  it("returns an empty array when active set matches nothing", () => {
    const active = new Set<GapDimension>(["population"]);
    const noPopulationGaps = gaps.filter((g) => g.dimension !== "population");
    const result = filterGapsByDimensions(noPopulationGaps, active);
    expect(result).toHaveLength(0);
  });

  it("handles an empty gaps array gracefully", () => {
    const result = filterGapsByDimensions([], new Set<GapDimension>(["population"]));
    expect(result).toHaveLength(0);
  });

  it("does not modify the original array", () => {
    const active = new Set<GapDimension>(["population"]);
    const copy = [...gaps];
    filterGapsByDimensions(gaps, active);
    expect(gaps).toHaveLength(copy.length);
  });
});

/* ------------------------------------------------------------------ */
/* filterTopicsByDimensions                                            */
/* ------------------------------------------------------------------ */

describe("filterTopicsByDimensions", () => {
  const topics: SuggestedTopic[] = [
    makeTopic("population"),
    makeTopic("methodology"),
    makeTopic("geographic"),
  ];

  it("returns the original array reference when all dimensions are active", () => {
    const result = filterTopicsByDimensions(topics, allActive);
    expect(result).toBe(topics);
  });

  it("returns only topics matching the active dimensions", () => {
    const active = new Set<GapDimension>(["methodology", "geographic"]);
    const result = filterTopicsByDimensions(topics, active);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.gap_type)).toEqual(
      expect.arrayContaining(["methodology", "geographic"])
    );
  });

  it("returns empty array when no topics match the active set", () => {
    const active = new Set<GapDimension>(["temporal"]);
    const result = filterTopicsByDimensions(topics, active);
    expect(result).toHaveLength(0);
  });

  it("handles empty topics array", () => {
    const result = filterTopicsByDimensions([], new Set<GapDimension>(["population"]));
    expect(result).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* countByDimension                                                    */
/* ------------------------------------------------------------------ */

describe("countByDimension", () => {
  it("returns zero counts for all dimensions when gaps array is empty", () => {
    const counts = countByDimension([]);
    for (const d of ALL_DIMENSIONS) {
      expect(counts[d]).toBe(0);
    }
  });

  it("counts gaps correctly per dimension", () => {
    const gaps: Gap[] = [
      makeGap("population"),
      makeGap("population"),
      makeGap("methodology"),
      makeGap("geographic"),
    ];
    const counts = countByDimension(gaps);
    expect(counts.population).toBe(2);
    expect(counts.methodology).toBe(1);
    expect(counts.geographic).toBe(1);
    expect(counts.outcome).toBe(0);
    expect(counts.temporal).toBe(0);
    expect(counts.theoretical).toBe(0);
  });

  it("total of all counts equals the length of the gaps array", () => {
    const gaps: Gap[] = [
      makeGap("population", "high"),
      makeGap("temporal", "low"),
      makeGap("theoretical", "medium"),
    ];
    const counts = countByDimension(gaps);
    const total = ALL_DIMENSIONS.reduce((sum, d) => sum + counts[d], 0);
    expect(total).toBe(gaps.length);
  });
});
