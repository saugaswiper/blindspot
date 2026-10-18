/**
 * Validation 015 harness — screening ranker (handoff 127, brief 010 slice 1).
 * Run:  SYN_CACHE=/tmp/syn-cache npx vitest run spec/validation/015-harness.test.ts
 * Prereq: node spec/validation/015-fetch.mjs /tmp/syn-cache   (title/abstract text is cached outside git)
 *
 * External truth: SYNERGY (De Bruin et al. 2023, CC0) — full-text-stage inclusion labels of published systematic
 * reviews, joined to OpenAlex title/abstract. The harness simulates a reviewer: seed with 1 include + 1 exclude,
 * then repeatedly screen the top-ranked unlabeled records (labels revealed from truth), retraining via rankRecords
 * on the revealed verdicts only. Metrics come from lib/screening-benchmark.ts AND an independent re-implementation here.
 */
import { describe, it } from "vitest";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { rankRecords, estimateRecall, type RankRecord } from "@/lib/screening-ranker";
import { wss, recallAtK } from "@/lib/screening-benchmark";

const cache = process.env.SYN_CACHE;
const REVIEWS = (process.env.REVIEWS ?? "Donners_2021,Nelson_2002,Sep_2021,Oud_2018,Jeyaraman_2020,Appenzeller_Herzog_2019,Bos_2018").split(",");
const SEEDS = Number(process.env.SEEDS ?? 5);

interface Rec extends RankRecord { inc: boolean }

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

/** independent WSS@t: records not screened at the point t of includes are found, minus (1-t) */
function wssIndep(order: boolean[], t: number): number {
  const total = order.filter(Boolean).length;
  const need = Math.ceil(t * total);
  let f = 0;
  for (let i = 0; i < order.length; i++) { if (order[i]) f++; if (f >= need) return (order.length - (i + 1)) / order.length - (1 - t); }
  return 0;
}

function simulate(recs: Rec[], seed: number) {
  const r = rng(seed);
  const incs = recs.filter((x) => x.inc), excs = recs.filter((x) => !x.inc);
  const s1 = incs[Math.floor(r() * incs.length)], s0 = excs[Math.floor(r() * excs.length)];
  const labeled = [s1, s0];
  const seen = new Set([s1.id, s0.id]);
  const total = incs.length;
  const need = Math.ceil(0.95 * total);
  const batch = Math.max(20, Math.ceil(recs.length / 50));
  const trace: { n: number; found: number; est: number; lower: number }[] = [];
  let found = 1;
  while (found < need && seen.size < recs.length) {
    const verdicts = labeled.map((x) => ({ id: x.id, verdict: x.inc ? ("include" as const) : ("exclude" as const) }));
    const ranked = rankRecords(recs, verdicts);
    const un = ranked.filter((x) => !seen.has(x.id));
    const byId = new Map(recs.map((x) => [x.id, x]));
    const est = estimateRecall(found, un.map((x) => x.score));
    trace.push({ n: labeled.length, found, est: est.estimate, lower: est.lower });
    for (const u of un.slice(0, batch)) {
      const rec = byId.get(u.id)!;
      labeled.push(rec); seen.add(rec.id);
      if (rec.inc) found++;
      if (found >= need) break;
    }
  }
  // Order for metrics: remainder is treated as unscreened (worst case: includes found = need; rest assumed after).
  const order = labeled.map((x) => x.inc);
  const rest = recs.filter((x) => !seen.has(x.id));
  for (const x of rest) order.push(x.inc);
  return { order, trace, screened: labeled.length };
}

describe.skipIf(!cache)("015 ranker vs SYNERGY", () => {
  it("runs", { timeout: 3_600_000 }, () => {
    const out: unknown[] = [];
    for (const name of REVIEWS) {
      const file = `${cache}/${name}.json`;
      if (!existsSync(file)) continue;
      const raw = JSON.parse(readFileSync(file, "utf8")) as Rec[];
      const seenIds = new Set<string>();
      const recs = raw.filter((x) => (seenIds.has(x.id) ? false : (seenIds.add(x.id), true)));
      const nInc = recs.filter((x) => x.inc).length;
      const perSeed = [];
      for (let s = 1; s <= SEEDS; s++) {
        const t0 = Date.now();
        const { order, trace, screened } = simulate(recs, s * 7919);
        // random baseline for same seed
        const rr = rng(s * 31);
        const rand = [...order].map((v, i) => ({ v, k: rr(), i })).sort((a, b) => a.k - b.k).map((x) => x.v);
        const w = wss(order, 0.95), wi = wssIndep(order, 0.95);
        // stopping-estimate evaluation: true recall at each trace point
        const tr = trace.map((p) => ({ ...p, trueRecall: p.found / nInc }));
        const firstEst95 = tr.find((p) => p.est >= 0.95);
        const firstLow95 = tr.find((p) => p.lower >= 0.95);
        perSeed.push({
          seed: s, screened, wss95: w, wss95Indep: wi, wss95Random: wss(rand, 0.95),
          recall10pct: recallAtK(order, Math.ceil(recs.length * 0.1)),
          recallAt20: recallAtK(order, 20),
          estCoverage: tr.length ? tr.filter((p) => p.lower <= p.trueRecall).length / tr.length : null,
          pointEstOverstates: tr.filter((p) => p.est > p.trueRecall + 1e-9).length / Math.max(1, tr.length),
          stopEst95: firstEst95 ? { n: firstEst95.n, trueRecall: firstEst95.trueRecall } : null,
          stopLow95: firstLow95 ? { n: firstLow95.n, trueRecall: firstLow95.trueRecall } : null,
          lastPoint: tr.length ? { n: tr[tr.length - 1].n, trueRecall: tr[tr.length - 1].trueRecall, est: tr[tr.length - 1].est, lower: tr[tr.length - 1].lower } : null,
          midPoint: tr.length ? { n: tr[Math.floor(tr.length / 2)].n, trueRecall: tr[Math.floor(tr.length / 2)].trueRecall, est: tr[Math.floor(tr.length / 2)].est } : null,
          ms: Date.now() - t0,
        });
        appendFileSync(process.env.OUT ?? "spec/validation/015-results.jsonl", JSON.stringify({ name, n: recs.length, includes: nInc, ...perSeed[perSeed.length - 1] }) + "\n");
      }
      out.push({ name, n: recs.length, includes: nInc, perSeed });
    }
    writeFileSync("/tmp/015-last.json", JSON.stringify(out));
  });
});
