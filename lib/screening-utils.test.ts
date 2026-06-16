import { describe, it, expect } from "vitest";
import {
  buildCsv,
  carryOverHumanVerdicts,
  computeCounts,
  effectiveDecision,
  needsReview,
  sortDecisions,
} from "@/lib/screening-utils";
import type { ScreeningCriteria, ScreeningDecision } from "@/types";

/**
 * Unit tests for the pure screening helpers shared by ScreeningPanel.
 *
 * The invariant under test throughout: the human override (`human_decision`)
 * supersedes the AI verdict everywhere, while the AI verdict is preserved.
 */

function decision(overrides: Partial<ScreeningDecision> = {}): ScreeningDecision {
  return {
    title: "Effects of CBT on insomnia in adults",
    year: 2023,
    journal: "Sleep Medicine",
    decision: "include",
    reason: "Meets all inclusion criteria.",
    ...overrides,
  };
}

const criteria: ScreeningCriteria = {
  inclusion: ["Adults with insomnia"],
  exclusion: ["Animal studies"],
  focus_gap: "CBT for insomnia in older adults",
  gap_type: "population",
  topic_title: "CBT & insomnia",
};

describe("effectiveDecision", () => {
  it("returns the AI decision when no override exists", () => {
    expect(effectiveDecision(decision({ decision: "exclude" }))).toBe("exclude");
  });

  it("returns the human override when present", () => {
    expect(
      effectiveDecision(decision({ decision: "exclude", human_decision: "include" }))
    ).toBe("include");
  });
});

describe("computeCounts", () => {
  it("tallies effective verdicts, not raw AI verdicts", () => {
    const decisions = [
      decision({ decision: "exclude", human_decision: "include" }),
      decision({ decision: "exclude" }),
      decision({ decision: "uncertain" }),
    ];
    expect(computeCounts(decisions)).toEqual({
      included_count: 1,
      excluded_count: 1,
      uncertain_count: 1,
    });
  });
});

describe("needsReview", () => {
  it("flags uncertain decisions", () => {
    expect(needsReview(decision({ decision: "uncertain" }))).toBe(true);
  });

  it("flags low-confidence decisions", () => {
    expect(needsReview(decision({ decision: "exclude", confidence: "low" }))).toBe(true);
  });

  it("does not flag confident decisions", () => {
    expect(needsReview(decision({ decision: "include", confidence: "high" }))).toBe(false);
  });

  it("never flags human-verified decisions", () => {
    expect(
      needsReview(decision({ decision: "uncertain", confidence: "low", human_decision: "exclude" }))
    ).toBe(false);
  });
});

describe("sortDecisions", () => {
  const list = [
    { d: decision({ title: "A", year: 2020, confidence: "high" }), idx: 0 },
    { d: decision({ title: "B", year: 2024, decision: "uncertain", confidence: "low" }), idx: 1 },
    { d: decision({ title: "C", year: 2022, confidence: "medium" }), idx: 2 },
  ];

  it("returns input order for 'default'", () => {
    expect(sortDecisions(list, "default").map((x) => x.idx)).toEqual([0, 1, 2]);
  });

  it("puts unreviewed flagged items first for 'needs_review'", () => {
    expect(sortDecisions(list, "needs_review")[0].idx).toBe(1);
  });

  it("orders lowest confidence first for 'confidence'", () => {
    expect(sortDecisions(list, "confidence").map((x) => x.idx)).toEqual([1, 2, 0]);
  });

  it("orders newest first for 'year'", () => {
    expect(sortDecisions(list, "year").map((x) => x.idx)).toEqual([1, 2, 0]);
  });

  it("does not mutate the input list", () => {
    const before = list.map((x) => x.idx);
    sortDecisions(list, "year");
    expect(list.map((x) => x.idx)).toEqual(before);
  });
});

describe("buildCsv", () => {
  it("includes AI, human, and final decision columns", () => {
    const csv = buildCsv(
      [decision({ decision: "exclude", human_decision: "include" })],
      criteria
    );
    const header = csv.split("\n")[3];
    expect(header).toContain("AI Decision");
    expect(header).toContain("Human Override");
    expect(header).toContain("Final Decision");
    const row = csv.split("\n")[4];
    expect(row).toContain('"exclude"');
    expect(row).toContain('"include"');
  });

  it("escapes double quotes in titles", () => {
    const csv = buildCsv(
      [decision({ title: 'The "gold standard" trial' })],
      criteria
    );
    expect(csv).toContain('"The ""gold standard"" trial"');
  });
});

describe("carryOverHumanVerdicts", () => {
  it("carries a verdict across runs by PMID", () => {
    const prev = [decision({ pmid: "123", human_decision: "exclude", human_decided_at: "2026-06-10T00:00:00Z" })];
    const next = [decision({ pmid: "123", title: "Retitled record", decision: "include" })];
    const merged = carryOverHumanVerdicts(prev, next);
    expect(merged[0].human_decision).toBe("exclude");
    expect(merged[0].human_decided_at).toBe("2026-06-10T00:00:00Z");
    expect(merged[0].decision).toBe("include"); // AI verdict untouched
  });

  it("matches DOIs regardless of doi.org URL prefix", () => {
    const prev = [decision({ doi: "https://doi.org/10.1000/ABC", human_decision: "include" })];
    const next = [decision({ doi: "10.1000/abc" })];
    expect(carryOverHumanVerdicts(prev, next)[0].human_decision).toBe("include");
  });

  it("matches a whitespace-padded URL DOI against a bare DOI (F3 regression)", () => {
    // The old strip-then-trim normalizeDoi left the prefix on a padded URL DOI,
    // splitting one study into two. The canonical trim-then-strip primitive fixes it.
    const prev = [decision({ doi: "\thttps://doi.org/10.1000/ABC\n", human_decision: "exclude" })];
    const next = [decision({ doi: "10.1000/abc" })];
    expect(carryOverHumanVerdicts(prev, next)[0].human_decision).toBe("exclude");
  });

  it("falls back to normalized title matching", () => {
    const prev = [decision({ title: "CBT for Insomnia: a Trial!", human_decision: "uncertain" })];
    const next = [decision({ title: "cbt for insomnia   a trial" })];
    expect(carryOverHumanVerdicts(prev, next)[0].human_decision).toBe("uncertain");
  });

  it("leaves unmatched records untouched", () => {
    const prev = [decision({ pmid: "123", human_decision: "exclude" })];
    const next = [decision({ pmid: "999", title: "Different study entirely" })];
    expect(carryOverHumanVerdicts(prev, next)[0].human_decision).toBeUndefined();
  });

  it("ignores previous decisions without a human verdict", () => {
    const prev = [decision({ pmid: "123" })];
    const next = [decision({ pmid: "123" })];
    expect(carryOverHumanVerdicts(prev, next)[0].human_decision).toBeUndefined();
  });

  it("does not mutate the new decisions array", () => {
    const prev = [decision({ pmid: "123", human_decision: "exclude" })];
    const next = [decision({ pmid: "123" })];
    carryOverHumanVerdicts(prev, next);
    expect(next[0].human_decision).toBeUndefined();
  });
});
