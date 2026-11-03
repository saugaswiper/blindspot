/**
 * Validation 016 harness: handoff 132 (lib/screening-benchmark-sim.ts, brief 015 slice 2).
 * Truth: Chan, He, Leung, Verspoor 2025 "Set B" (22 Cochrane reviews, doi:10.17632/7sgmg89zb6.1, CC BY 4.0).
 * Cache (not committed): ~/.cache/blindspot/chan2025/x, sha256 of the zip checked in the report.
 * Committed fixture: fixtures/016-setb-counts.json (n, includes, no-abstract counts, from an independent Python csv parse).
 * Run: [WRITE_RESULTS=1] [AL=CD011218:1,CD011218:2] npx vitest run spec/validation/016-harness.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSetBReview } from "@/lib/screening-benchmark-setb";
import { activeLearningRun, orderMetrics, randomOrder, rng, screenedToReach, summarize } from "@/lib/screening-benchmark-sim";

const dir = join(homedir(), ".cache/blindspot/chan2025/x");
const haveCache = existsSync(dir);
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures/016-setb-counts.json"), "utf8")) as Record<
  string,
  { n: number; includes: number; noAbstract: number }
>;

/** Independent reference: fraction screened when ceil(r*total) includes are first seen. */
function refToReach(order: boolean[], r: number): number {
  const total = order.filter(Boolean).length;
  const need = Math.ceil(r * total);
  let c = 0;
  for (let k = 1; k <= order.length; k++) {
    if (order[k - 1]) c++;
    if (c >= need) return k / order.length;
  }
  return 1;
}
const refRecallAt = (order: boolean[], f: number) => {
  const k = Math.round(f * order.length);
  return order.slice(0, k).filter(Boolean).length / order.filter(Boolean).length;
};

describe("sim metric math vs independent reference", () => {
  it("screenedToReach, orderMetrics, summarize", () => {
    const r = rng(11);
    let maxDiff = 0;
    for (let t = 0; t < 300; t++) {
      const n = 30 + Math.floor(r() * 500);
      const p = 0.01 + r() * 0.2;
      const order = Array.from({ length: n }, () => r() < p);
      if (!order.some(Boolean)) continue;
      const m = orderMetrics(order);
      maxDiff = Math.max(
        maxDiff,
        Math.abs(screenedToReach(order, 0.95) - refToReach(order, 0.95)),
        Math.abs(m.screenedTo98 - refToReach(order, 0.98)),
        Math.abs(m.wss95 - (1 - refToReach(order, 0.95) - 0.05)),
        Math.abs(m.recallAt10 - refRecallAt(order, 0.1)),
        Math.abs(m.recallAt20 - refRecallAt(order, 0.2)),
        Math.abs(m.recallAt30 - refRecallAt(order, 0.3)),
      );
    }
    expect(maxDiff).toBeLessThan(1e-12);
    expect(summarize([3, 1, 2], true)).toEqual({ median: 2, worst: 1, mean: 2 });
    expect(summarize([3, 1, 2, 10], false)).toEqual({ median: 2.5, worst: 10, mean: 4 });
  });
  it("randomOrder is a seeded permutation of the labels", () => {
    const labels = Array.from({ length: 500 }, (_, i) => i % 25 === 0);
    const a = randomOrder(labels, 5);
    expect(a).toEqual(randomOrder(labels, 5));
    expect(a).not.toEqual(randomOrder(labels, 6));
    expect(a.filter(Boolean).length).toBe(20);
  });
  it("random baseline WSS@95 averages ~0 on a Set-B-like imbalance", () => {
    const labels = Array.from({ length: 3000 }, (_, i) => i < 30);
    const v = Array.from({ length: 200 }, (_, s) => orderMetrics(randomOrder(labels, s)).wss95);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    expect(Math.abs(mean)).toBeLessThan(0.02);
  });
});

describe.skipIf(!haveCache)("loader vs independent Python parse (Set B, all 22)", () => {
  it("n, includes, no-abstract match fixture", () => {
    const out: Record<string, unknown> = {};
    for (const id of Object.keys(fixture)) {
      const rv = parseSetBReview(id, readFileSync(join(dir, `${id}_data_cleaned.csv`), "utf8"));
      const inc = rv.records.filter((x) => x.label).length;
      const na = rv.records.filter((x) => !x.abstract).length;
      out[id] = { n: rv.records.length, inc, na };
      expect(rv.records.length, id).toBe(fixture[id].n);
      expect(inc, id).toBe(fixture[id].includes);
      expect(na, id).toBe(fixture[id].noAbstract);
    }
    expect(readdirSync(dir).filter((f) => f.endsWith(".csv")).length).toBe(22);
  }, 300000);
});

const AL = (process.env.AL ?? "").split(",").filter(Boolean);
describe.skipIf(!haveCache || AL.length === 0)("active learning on real Set B", () => {
  const results: unknown[] = [];
  const cache = new Map<string, number[]>();
  for (const spec of AL) {
    const [id, seedS] = spec.split(":");
    const seed = Number(seedS);
    it(`${id} seed ${seed}`, () => {
      const rv = parseSetBReview(id, readFileSync(join(dir, `${id}_data_cleaned.csv`), "utf8"));
      const labels = rv.records.map((x) => x.label);
      const recs = rv.records.map((x, i) => ({ id: String(i), title: x.title, abstract: x.abstract }));
      const total = labels.filter(Boolean).length;
      const t0 = Date.now();
      const run = activeLearningRun(recs, labels, seed);
      const secs = (Date.now() - t0) / 1000;
      const m = orderMetrics(run.order);
      // independent recomputation from the returned order
      expect(run.order.length).toBe(labels.length);
      expect(run.order.filter(Boolean).length).toBe(total);
      expect(Math.abs(m.wss95 - (1 - refToReach(run.order, 0.95) - 0.05))).toBeLessThan(1e-12);
      let stopCheck: unknown = null;
      if (run.stop) {
        const k = Math.round(run.stop.screenedFrac * labels.length);
        const trueRec = run.order.slice(0, k).filter(Boolean).length / total;
        expect(Math.abs(trueRec - run.stop.trueRecall)).toBeLessThan(1e-9);
        stopCheck = { k, trueRecallIndependent: trueRec };
      }
      // determinism fingerprint
      const fp = run.order.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
      const key = `${id}:${seed}`;
      if (cache.has(key)) expect(fp).toEqual(cache.get(key));
      cache.set(key, fp);
      results.push({ id, seed, n: labels.length, total, secs, calls: run.rankCalls, meanMs: run.rankMsTotal / run.rankCalls, maxMs: run.rankMsMax, ...m, stop: run.stop, stopCheck, includePositions: fp.length });
      if (process.env.WRITE_RESULTS) writeFileSync(join(__dirname, "016-results.json"), JSON.stringify(results, null, 1));
    }, 3600000);
  }
});
