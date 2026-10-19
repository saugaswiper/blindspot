/**
 * Validation 015 harness — handoff 127 (screening ranker + benchmark metrics, brief 010 slice).
 * Truth: SYNERGY (De Bruin et al. 2023, doi 10.34894/HE6NAQ, CC0): human full-text include labels of 10 published SRs.
 * Fetch (not committed, abstracts may be copyrighted):
 *   python3 -m venv v; v/bin/pip install synergy-dataset pandas
 *   v/bin/python -m synergy_dataset get -l -o OUT -v id,doi,title,abstract -d Nelson_2002 Sep_2021 ...
 * Run: SYNERGY_DIR=OUT [WRITE_RESULTS=1] npx vitest run spec/validation/015-harness.test.ts
 * Committed fixture: fixtures/015-synergy-labels.json (doi + label only, no text).
 * Simulation: ASReview-style active learning. Prior = 1 random include + 1 random exclude; each round the code under
 * test (rankRecords) re-ranks on all verdicts so far, the top-B unlabelled are "screened" with the true label.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { rankRecords, estimateRecall, type RankRecord } from "@/lib/screening-ranker";
import { wss as libWss, recallAtK } from "@/lib/screening-benchmark";

const dir = process.env.SYNERGY_DIR;
const REVIEWS = (process.env.REVIEWS ?? "Nelson_2002,Sep_2021,Oud_2018,van_der_Valk_2021,Menon_2022,Donners_2021,Meijboom_2021,Jeyaraman_2020,Chou_2004").split(",");
const SEEDS = (process.env.SEEDS ?? "1,2,3").split(",").map(Number);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Independent WSS@r (ASReview definition): (n - k)/n - (1 - r), k = fewest screened to reach ceil(r * total) includes. */
function refWss(order: boolean[], r: number): number {
  const total = order.filter(Boolean).length, need = Math.ceil(r * total), n = order.length;
  let c = 0;
  for (let k = 1; k <= n; k++) { if (order[k - 1]) c++; if (c >= need) return (n - k) / n - (1 - r); }
  return 0;
}
const wilson = (x: number, n: number) => { const z = 1.96, p = x / n, d = 1 + z * z / n, c = p + z * z / (2 * n), a = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - a) / d), Math.min(1, (c + a) / d)]; };

describe("metric math vs independent reference (no data needed)", () => {
  it("lib wss == reference on random orders", () => {
    const r = rng(7);
    let maxDiff = 0;
    for (let t = 0; t < 200; t++) {
      const n = 20 + Math.floor(r() * 300);
      const order = Array.from({ length: n }, () => r() < 0.1);
      for (const tg of [0.8, 0.95, 1]) maxDiff = Math.max(maxDiff, Math.abs(libWss(order, tg) - refWss(order, tg)));
    }
    expect(maxDiff).toBeLessThan(1e-12);
  });
});

describe.skipIf(!dir)("015 SYNERGY active-learning simulation", () => {
  it("runs", { timeout: 3_000_000 }, () => {
    const fixture = JSON.parse(readFileSync("spec/validation/fixtures/015-synergy-labels.json", "utf8")) as Record<string, { n: number; includes: number; rows: [string, number][] }>;
    const out: Record<string, unknown>[] = [];
    for (const name of REVIEWS) {
      const rows = parseCsv(readFileSync(`${dir}/${name}.csv`, "utf8"));
      const head = rows[0];
      const body = rows.slice(1).filter((r) => r.length === head.length);
      const iDoi = head.indexOf("doi"), iT = head.indexOf("title"), iA = head.indexOf("abstract"), iL = head.indexOf("label_included");
      const recs: RankRecord[] = body.map((r, i) => ({ id: String(i), title: r[iT], abstract: r[iA] || null }));
      const lab = body.map((r) => r[iL] === "1");
      const fx = fixture[name];
      expect(recs.length).toBe(fx.n);
      expect(lab.filter(Boolean).length).toBe(fx.includes);
      expect(body.every((r, i) => r[iDoi] === fx.rows[i][0])).toBe(true);
      const n = recs.length, total = fx.includes;
      const B = Math.max(10, Math.ceil(n / 60));
      for (const seed of SEEDS) {
        const rand = rng(seed);
        const incs = lab.flatMap((l, i) => (l ? [i] : [])), excs = lab.flatMap((l, i) => (l ? [] : [i]));
        const order: number[] = [incs[Math.floor(rand() * incs.length)], excs[Math.floor(rand() * excs.length)]];
        const verdicts = new Map<number, "include" | "exclude">(order.map((i) => [i, lab[i] ? "include" : "exclude"]));
        const rounds: { screened: number; trueRecall: number; est: number; lower: number }[] = [];
        while (order.length < n) {
          const ranked = rankRecords(recs, [...verdicts].map(([i, v]) => ({ id: String(i), verdict: v })));
          const unl = ranked.filter((r) => !verdicts.has(Number(r.id)));
          const found = order.filter((i) => lab[i]).length;
          const e = estimateRecall(found, unl.map((r) => r.score));
          rounds.push({ screened: order.length, trueRecall: found / total, est: e.estimate, lower: e.lower });
          for (const r of unl.slice(0, B)) { const i = Number(r.id); order.push(i); verdicts.set(i, lab[i] ? "include" : "exclude"); }
        }
        const seq = order.map((i) => lab[i]);
        const shuf = Array.from({ length: n }, (_, i) => i);
        const rr = rng(seed + 100);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [shuf[i], shuf[j]] = [shuf[j], shuf[i]]; }
        const randSeq = shuf.map((i) => lab[i]);
        const first = (key: "est" | "lower", th: number) => rounds.find((x) => x[key] >= th);
        const e95 = first("est", 0.95), l95 = first("lower", 0.95);
        out.push({
          review: name, seed, n, total, B,
          wss95: libWss(seq), wss95Ref: refWss(seq, 0.95), wss95Random: libWss(randSeq),
          recallAt10pct: recallAtK(seq, Math.round(0.1 * n)), recallAt20pct: recallAtK(seq, Math.round(0.2 * n)),
          estStop: e95 ? { screenedFrac: e95.screened / n, trueRecall: e95.trueRecall } : null,
          lowerStop: l95 ? { screenedFrac: l95.screened / n, trueRecall: l95.trueRecall } : null,
          lowerCoverage: rounds.filter((x) => x.lower <= x.trueRecall + 1e-9).length / rounds.length,
          estOverRounds: rounds.filter((x) => x.est > x.trueRecall + 1e-9).length / rounds.length,
        });
        if (process.env.PROGRESS) appendFileSync(process.env.PROGRESS, JSON.stringify(out[out.length - 1]) + "\n");
      }
    }
    if (process.env.WRITE_RESULTS === "1") writeFileSync("spec/validation/015-results.json", JSON.stringify(out, null, 1));
    const w = out.map((o) => o.wss95 as number);
    console.log("mean WSS95", w.reduce((a, b) => a + b, 0) / w.length, wilson(0, 1));
  });
});
