import { describe, it, expect } from "vitest";
import { estimateRecall, hypergeomCdf, stoppingTest, rankRecords, type RankRecord } from "@/lib/screening-ranker";
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
  it("terminates and stays ordered when expected missed is large (mu > 745 underflow)", () => {
    const t0 = Date.now();
    const r = estimateRecall(10, Array(3000).fill(0.5)); // mu = 1500
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(r.lower).toBeGreaterThan(0);
    expect(r.lower).toBeLessThanOrEqual(r.estimate);
    expect(r.estimate).toBeLessThanOrEqual(r.upper);
    expect(r.estimate).toBeCloseTo(10 / 1510, 6);
  });

  it("is advisory with lower <= estimate <= upper", () => {
    const r = estimateRecall(8, [0.5, 0.25, 0.25]);
    expect(r.advisory).toBe(true);
    expect(r.estimate).toBeCloseTo(8 / 9);
    expect(r.lower).toBeLessThanOrEqual(r.estimate);
    expect(r.upper).toBeGreaterThanOrEqual(r.estimate);
    expect(r.method).toBe("poisson-uncalibrated");
  });
  it("is 1 when nothing remains, including 0 includes and an empty pool", () => {
    const r = estimateRecall(0, []);
    expect([r.estimate, r.lower, r.upper]).toEqual([1, 1, 1]);
  });
  it("is monotone in found includes", () => {
    const tail = Array(200).fill(0.02);
    let prev = -1;
    for (let f = 0; f <= 30; f++) {
      const r = estimateRecall(f, tail);
      expect(r.estimate).toBeGreaterThanOrEqual(prev);
      prev = r.estimate;
    }
  });
  it("lower bound is a real bound: far below the point estimate on a long tail", () => {
    const r = estimateRecall(20, Array(1000).fill(0.005)); // expect 5 missed
    expect(r.estimate).toBeCloseTo(20 / 25);
    expect(r.lower).toBeLessThan(0.75);
    expect(r.upper).toBeGreaterThan(r.estimate);
  });
  it("interval narrows as the unscreened tail shrinks", () => {
    const wide = estimateRecall(20, Array(1000).fill(0.005));
    const narrow = estimateRecall(24, Array(100).fill(0.005));
    expect(narrow.upper - narrow.lower).toBeLessThan(wide.upper - wide.lower);
  });
  it("audit showing the model under-predicts lowers the estimate; never raises it", () => {
    const tail = Array(500).fill(0.01);
    const base = estimateRecall(20, tail);
    const bad = estimateRecall(20, tail, Array.from({ length: 20 }, (_, i) => ({ score: 0.05, include: i < 6 })));
    expect(bad.method).toBe("poisson-audit-scaled");
    expect(bad.estimate).toBeLessThan(base.estimate);
    expect(bad.lower).toBeLessThan(base.lower);
    const good = estimateRecall(20, tail, Array.from({ length: 20 }, () => ({ score: 0.5, include: false })));
    expect(good.estimate).toBeCloseTo(base.estimate);
  });
});

describe("rankRecords latency", () => {
  it("ranks n=3000 with 1500 verdicts inside the 10 s budget", () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`);
    const pick = (i: number, k: number) => Array.from({ length: 30 }, (_, j) => words[(i * 7 + j * k) % 400]).join(" ");
    const many: RankRecord[] = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), title: pick(i, 3), abstract: pick(i, 11) }));
    const verdicts = many.slice(0, 1500).map((r, i) => ({ id: r.id, verdict: (i % 10 === 0 ? "include" : "exclude") as "include" | "exclude" }));
    const t0 = Date.now();
    expect(rankRecords(many, verdicts)).toHaveLength(3000);
    expect(Date.now() - t0).toBeLessThan(10_000);
  }, 30_000);
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

describe("stoppingTest (hypergeometric)", () => {
  const head = (d: number, len: number) => Array.from({ length: len }, (_, i) => i < d);
  it("matches hand-computed hypergeometric values", () => {
    // R=10, M=2, k=3: P(X=0)=C(8,3)/C(10,3)=56/120; P(X<=1)=112/120
    expect(hypergeomCdf(0, 10, 2, 3)).toBeCloseTo(56 / 120, 10);
    expect(hypergeomCdf(1, 10, 2, 3)).toBeCloseTo(112 / 120, 10);
  });
  it("never stops before the minimum screened fraction", () => {
    const r = stoppingTest(head(50, 150), 1000); // 15% < 20%, all-negative-looking tail
    expect(r.stop).toBe(false);
    expect(r.method).toBe("hypergeometric-cmh2020");
  });
  it("stops on an all-negative tail once enough is screened", () => {
    const n = 1000;
    expect(stoppingTest(head(400, 500), n).stop).toBe(true);
    expect(stoppingTest(head(400, 500), n).recallLowerBound).toBeGreaterThan(0);
  });
  it("an include in the last k blocks the stop", () => {
    const n = 1000;
    const seq = head(400, 500);
    seq[499] = true;
    expect(stoppingTest(seq, n).stop).toBe(false);
  });
  it("cannot stop with too few includes found", () => {
    const r = stoppingTest(head(5, 300), 1000);
    expect(r.stop).toBe(false);
    expect(r.reason).toBe("untestable-few-includes");
  });
  it("reports a reason only when it does not stop, and the best k", () => {
    const r = stoppingTest(head(400, 500), 1000);
    expect(r.reason).toBeNull();
    expect(r.kUsed).toBeGreaterThan(0);
    expect(stoppingTest(head(400, 500).map((v, i) => v || i % 5 === 0), 1000).reason).toBe("insufficient-sample");
  });
});

describe("rankRecords memoisation (brief 017 AC5)", () => {
  it("gives identical order and scores on a cached array and a fresh copy", () => {
    const verdicts = [
      { id: "a", verdict: "include" as const },
      { id: "b", verdict: "exclude" as const },
    ];
    const first = rankRecords(recs, verdicts);
    const second = rankRecords(recs, verdicts); // vectors served from cache
    const fresh = rankRecords(recs.map((r) => ({ ...r })), verdicts); // new array, no cache
    expect(second).toEqual(first);
    expect(fresh).toEqual(first);
  });

  it("re-vectorises when the array grows", () => {
    const grown = recs.slice();
    const verdicts = [
      { id: "a", verdict: "include" as const },
      { id: "b", verdict: "exclude" as const },
    ];
    rankRecords(grown, verdicts);
    grown.push({ id: "z", title: "Ketamine depression", abstract: "trial" });
    expect(rankRecords(grown, verdicts).map((r) => r.id)).toContain("z");
  });
});

describe("rankRecords active-term fit", () => {
  it("is deterministic and ranks the matching record first", () => {
    const recs = [
      { id: "a", title: "ketamine depression trial", abstract: "randomised ketamine" },
      { id: "b", title: "bridge engineering", abstract: "steel load" },
      { id: "c", title: "ketamine randomised", abstract: "depression outcome" },
      { id: "d", title: "steel bridge", abstract: "concrete" },
    ];
    const v = [{ id: "a", verdict: "include" as const }, { id: "b", verdict: "exclude" as const }];
    const r1 = rankRecords(recs, v);
    expect(rankRecords(recs, v)).toEqual(r1);
    expect(r1.findIndex((r) => r.id === "c")).toBeLessThan(r1.findIndex((r) => r.id === "d"));
  });
});
