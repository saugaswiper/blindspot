import { describe, it, expect } from "vitest";
import { estimateRecall, rankRecords, type RankRecord } from "@/lib/screening-ranker";
import { recallAtK, splitHasNoOverlap, wss } from "@/lib/screening-benchmark";

const recs: RankRecord[] = [
  { id: "a", title: "Ketamine for treatment-resistant depression", abstract: "randomised trial ketamine infusion" },
  { id: "b", title: "Bridge construction methods", abstract: "steel concrete engineering" },
  { id: "c", title: "Ketamine infusion trial in depression", abstract: "double blind randomised ketamine" },
  { id: "d", title: "Concrete bridge steel design", abstract: "engineering load" },
  { id: "e", title: "Intravenous ketamine depressive episode", abstract: "randomised placebo" },
];

describe("rankRecords", () => {
  it("preserves order with flat scores on cold start", () => {
    const out = rankRecords(recs, [{ id: "a", verdict: "include" }]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(new Set(out.map((r) => r.score)).size).toBe(1);
  });

  it("ranks topical records above off-topic ones once both classes exist", () => {
    const out = rankRecords(recs, [
      { id: "a", verdict: "include" },
      { id: "b", verdict: "exclude" },
    ]);
    const pos = (id: string) => out.findIndex((r) => r.id === id);
    expect(pos("c")).toBeLessThan(pos("d"));
    expect(pos("e")).toBeLessThan(pos("d"));
  });

  it("is deterministic", () => {
    const v = [
      { id: "a", verdict: "include" as const },
      { id: "b", verdict: "exclude" as const },
    ];
    expect(rankRecords(recs, v)).toEqual(rankRecords(recs, v));
  });
});

describe("estimateRecall", () => {
  it("is advisory with lower <= estimate", () => {
    const r = estimateRecall(8, [0.5, 0.25, 0.25]);
    expect(r.advisory).toBe(true);
    expect(r.estimate).toBeCloseTo(8 / 9);
    expect(r.lower).toBeLessThanOrEqual(r.estimate);
  });
  it("is 1 when nothing remains", () => {
    expect(estimateRecall(0, []).estimate).toBe(1);
  });
});

describe("benchmark metrics", () => {
  it("recallAtK", () => {
    expect(recallAtK([true, false, true, false], 1)).toBe(0.5);
    expect(recallAtK([false, false], 2)).toBe(1);
  });
  it("wss: perfect ordering beats random; random-like order ~0", () => {
    const perfect = [...Array(5).fill(true), ...Array(95).fill(false)];
    expect(wss(perfect)).toBeCloseTo(0.9, 5); // reach 95% at k=5 → 0.95 - 0.05
    const worst = [...Array(95).fill(false), ...Array(5).fill(true)];
    expect(wss(worst)).toBeLessThanOrEqual(0);
  });
  it("split overlap check", () => {
    expect(splitHasNoOverlap(["r1", "r2"], ["r3"])).toBe(true);
    expect(splitHasNoOverlap(["r1", "r2"], ["r2"])).toBe(false);
  });
});
