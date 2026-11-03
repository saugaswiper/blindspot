/**
 * Set B scorecard, conditions A (random) and B (active learning) + stopping rule (brief 015).
 * Run: npx tsx scripts/benchmark-setb.ts [--seeds 1,2,3] [--only CD011218,...] [--max-n 5000]
 * Reads the cache from scripts/fetch-chan2025-setb.ts; writes metrics only (no record text) to
 * spec/benchmarks/015-setb-scorecard.json. Conditions C, D, E are not implemented yet.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSetBReview, reviewIdFromFile } from "../lib/screening-benchmark-setb";
import { activeLearningRun, orderMetrics, randomOrder, summarize } from "../lib/screening-benchmark-sim";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const seeds = (arg("seeds") ?? "1,2,3").split(",").map(Number);
const only = arg("only")?.split(",");
const maxN = Number(arg("max-n") ?? Infinity);
const dir = join(homedir(), ".cache/blindspot/chan2025/x");

const reviews: Record<string, unknown>[] = [];
for (const f of readdirSync(dir).sort()) {
  const id = reviewIdFromFile(f);
  if (!id || (only && !only.includes(id))) continue;
  const review = parseSetBReview(id, readFileSync(join(dir, f), "utf8"));
  const n = review.records.length;
  if (n > maxN) { console.log(`skip ${id} n=${n} > --max-n`); continue; }
  const labels = review.records.map((r) => r.label);
  const recs = review.records.map((r) => ({ id: r.id, title: r.title, abstract: r.abstract }));
  const A = seeds.map((s) => orderMetrics(randomOrder(labels, s + 100)));
  const runs = seeds.map((s) => activeLearningRun(recs.map((r, i) => ({ ...r, id: String(i) })), labels, s));
  const B = runs.map((r) => orderMetrics(r.order));
  reviews.push({
    reviewId: id, n, includes: labels.filter(Boolean).length, seeds,
    A, B,
    stop: runs.map((r) => r.stop),
    latencyMs: { calls: runs[0].rankCalls, meanPerCall: runs[0].rankMsTotal / runs[0].rankCalls, max: runs[0].rankMsMax },
  });
  console.log(`${id} n=${n} B wss95=${B.map((m) => m.wss95.toFixed(3)).join("/")}`);
}

const meanOf = (key: "A" | "B", m: keyof ReturnType<typeof orderMetrics>) =>
  reviews.map((r) => ((r[key] as ReturnType<typeof orderMetrics>[]).reduce((a, x) => a + x[m], 0)) / seeds.length);
const stops = reviews.flatMap((r) => r.stop as ({ trueRecall: number } | null)[]);
const summary = {
  reviews: reviews.length,
  wss95: { A: summarize(meanOf("A", "wss95")), B: summarize(meanOf("B", "wss95")) },
  recallAt10: { A: summarize(meanOf("A", "recallAt10")), B: summarize(meanOf("B", "recallAt10")) },
  stopRule: { runs: stops.length, neverStopped: stops.filter((s) => !s).length, trueRecallBelow95: stops.filter((s) => s && s.trueRecall < 0.95).length },
  claimed: true,
  note: "Conditions C, D, E not run. Metrics only; Cochrane Set B, Chan et al. 2025, CC BY 4.0, doi:10.17632/7sgmg89zb6.1.",
};
mkdirSync("spec/benchmarks", { recursive: true });
const out = process.env.SCORECARD_OUT ?? "spec/benchmarks/015-setb-scorecard.json";
writeFileSync(out, JSON.stringify({ summary, reviews }, null, 2));
console.log(JSON.stringify(summary, null, 2));
