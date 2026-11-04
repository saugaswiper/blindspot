/**
 * Validation 017 harness: handoff 137 (exact active-term speed-up of `fit` in lib/screening-ranker.ts).
 * Truth: Chan, He, Leung, Verspoor 2025 "Set B" Cochrane human labels (doi:10.17632/7sgmg89zb6.1, CC BY 4.0),
 * cache ~/.cache/blindspot/chan2025/x (not committed). The "before" ranker is the file at git rev 1f0b349
 * (pre-change), extracted at run time via `git show` to a temp file next to this harness and deleted afterwards.
 * Run: [WRITE_RESULTS=1] npx vitest run spec/validation/017-harness.test.ts
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseSetBReview } from "@/lib/screening-benchmark-setb";
import { rankRecords, type RankRecord, type RankVerdict, type RankedRecord } from "@/lib/screening-ranker";
import { activeLearningRun, orderMetrics, rng } from "@/lib/screening-benchmark-sim";

const dir = join(homedir(), ".cache/blindspot/chan2025/x");
const haveCache = existsSync(dir);
const BEFORE_REV = "1f0b349";
const tmpPath = join(__dirname, ".017-ranker-before.tmp.ts");
type RankFn = (r: RankRecord[], v: RankVerdict[]) => RankedRecord[];

const EXACT = (process.env.EXACT ?? "CD011218,CD013042,CD015306,CD013295").split(",");
const LAT = (process.env.LAT ?? "CD013295,CD013358").split(",");
const REPRO = (process.env.REPRO ?? "CD011218,CD015306,CD013197").split(",");
const results: Record<string, unknown> = {};

function load(id: string) {
  const rv = parseSetBReview(id, readFileSync(join(dir, `${id}_data_cleaned.csv`), "utf8"));
  const labels = rv.records.map((x) => x.label);
  const recs: RankRecord[] = rv.records.map((x, i) => ({ id: String(i), title: x.title, abstract: x.abstract }));
  return { labels, recs };
}

/** Random labelled training set of size m that always has >=1 include and >=1 exclude. */
function verdictsFor(labels: boolean[], m: number, seed: number): RankVerdict[] {
  const r = rng(seed);
  const idx = labels.map((_, i) => i).sort(() => r() - 0.5);
  const inc = idx.find((i) => labels[i])!;
  const exc = idx.find((i) => !labels[i])!;
  const pick = new Set([inc, exc, ...idx.slice(0, m)]);
  return [...pick].map((i) => ({ id: String(i), verdict: labels[i] ? "include" : "exclude" }));
}

let before: RankFn;
describe.skipIf(!haveCache)("fit active-term change: before vs after", () => {
  it("loads pre-change ranker from git", async () => {
    writeFileSync(tmpPath, execFileSync("git", ["show", `${BEFORE_REV}:lib/screening-ranker.ts`], { encoding: "utf8", maxBuffer: 1 << 26 }));
    before = ((await import(/* @vite-ignore */ tmpPath)) as { rankRecords: RankFn }).rankRecords;
    expect(typeof before).toBe("function");
  });

  it("identical id order AND bit-identical scores on real Set B data", () => {
    const rows: unknown[] = [];
    let maxDiff = 0;
    let orderMismatch = 0;
    let cases = 0;
    for (const id of EXACT) {
      const { labels, recs } = load(id);
      for (const m of [5, 20, 100, 400]) {
        for (const seed of [1, 2]) {
          const v = verdictsFor(labels, m, seed);
          const a = before(recs, v);
          const b = rankRecords(recs, v);
          cases++;
          let d = 0;
          let om = 0;
          for (let i = 0; i < a.length; i++) {
            if (a[i].id !== b[i].id) om++;
            d = Math.max(d, Math.abs(a[i].score - b[i].score));
          }
          maxDiff = Math.max(maxDiff, d);
          orderMismatch += om;
          rows.push({ id, n: recs.length, trainRows: v.length, seed, orderMismatches: om, maxScoreDiff: d });
        }
      }
    }
    results.exactness = { cases, orderMismatch, maxScoreDiff: maxDiff, rows };
    expect(orderMismatch).toBe(0);
    expect(maxDiff).toBe(0);
  }, 3600000);

  it("per-call latency before vs after (warm), n≈3,000+", () => {
    const rows: unknown[] = [];
    for (const id of LAT) {
      const { labels, recs } = load(id);
      for (const m of [100, 400]) {
        const v = verdictsFor(labels, m, 3);
        before(recs, v);
        rankRecords(recs, v); // warm-up (vectorise cache)
        const time = (f: RankFn) => {
          const t: number[] = [];
          for (let k = 0; k < 5; k++) {
            const t0 = performance.now();
            f(recs, v);
            t.push(performance.now() - t0);
          }
          t.sort((x, y) => x - y);
          return { median: t[2], min: t[0], max: t[4] };
        };
        rows.push({ id, n: recs.length, trainRows: v.length, beforeMs: time(before), afterMs: time(rankRecords) });
      }
    }
    results.latency = rows;
  }, 3600000);

});

afterAll(() => {
  if (existsSync(tmpPath)) unlinkSync(tmpPath);
  if (process.env.WRITE_RESULTS) writeFileSync(join(__dirname, "017-results.json"), JSON.stringify(results, null, 1));
});

describe.skipIf(!haveCache)("scorecard reproduction (condition B, seed 1) vs committed scorecard", () => {
  const sc = JSON.parse(readFileSync(join(__dirname, "../benchmarks/015-setb-scorecard.json"), "utf8")) as {
    reviews: { reviewId: string; B: { wss95: number }[]; hgStop: ({ screenedFrac: number; trueRecall: number } | null)[] }[];
  };
  const rows: unknown[] = [];
  for (const id of REPRO) {
    it(`${id}`, () => {
      const { labels, recs } = load(id);
      const t0 = Date.now();
      const run = activeLearningRun(recs, labels, 1);
      const secs = (Date.now() - t0) / 1000;
      const m = orderMetrics(run.order);
      const total = labels.filter(Boolean).length;
      const ref = sc.reviews.find((r) => r.reviewId === id)!;
      let hg: unknown = null;
      if (run.hgStop) {
        const k = Math.round(run.hgStop.screenedFrac * labels.length);
        const tr = run.order.slice(0, k).filter(Boolean).length / total;
        expect(Math.abs(tr - run.hgStop.trueRecall)).toBeLessThan(1e-9);
        hg = { screenedFrac: run.hgStop.screenedFrac, trueRecallIndependent: tr };
      }
      rows.push({ id, n: labels.length, total, wss95: m.wss95, scorecardWss95: ref.B[0].wss95, hgStop: hg, scorecardHg: ref.hgStop[0], secs, meanMs: run.rankMsTotal / run.rankCalls, maxMs: run.rankMsMax });
      results.reproduction = rows;
      expect(Math.abs(m.wss95 - ref.B[0].wss95)).toBeLessThan(1e-9);
    }, 3600000);
  }
});
