/**
 * Screening simulation for the Set B scorecard (brief 015 item 4, conditions A and B).
 * Replays a review with known labels: random order (A), or `rankRecords` active
 * learning (B) with the validation 015 protocol. Reports metrics only, never record text.
 */
import { rankRecords, estimateRecall, stoppingTest, type RankRecord } from "@/lib/screening-ranker";
import { wss, recallAtK } from "@/lib/screening-benchmark";

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fraction of the pool screened when `target` recall is first reached (1 if never). */
export function screenedToReach(order: boolean[], target: number): number {
  const n = order.length;
  const total = order.filter(Boolean).length;
  if (n === 0 || total === 0) return 1;
  const needed = Math.ceil(target * total);
  let found = 0;
  for (let i = 0; i < n; i++) {
    if (order[i] && ++found >= needed) return (i + 1) / n;
  }
  return 1;
}

export interface Summary {
  median: number;
  worst: number;
  mean: number;
}

/** Median, worst and mean; `higherIsBetter` decides which end is "worst". */
export function summarize(values: number[], higherIsBetter = true): Summary {
  if (values.length === 0) return { median: NaN, worst: NaN, mean: NaN };
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return {
    median: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2,
    worst: higherIsBetter ? s[0] : s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
}

export interface OrderMetrics {
  wss95: number;
  recallAt10: number;
  recallAt20: number;
  recallAt30: number;
  screenedTo95: number;
  screenedTo98: number;
}

export function orderMetrics(order: boolean[]): OrderMetrics {
  const n = order.length;
  const at = (f: number) => recallAtK(order, Math.round(f * n));
  return {
    wss95: wss(order, 0.95),
    recallAt10: at(0.1),
    recallAt20: at(0.2),
    recallAt30: at(0.3),
    screenedTo95: screenedToReach(order, 0.95),
    screenedTo98: screenedToReach(order, 0.98),
  };
}

export function randomOrder(labels: boolean[], seed: number): boolean[] {
  const rand = rng(seed);
  const idx = Array.from({ length: labels.length }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.map((i) => labels[i]);
}

export interface ActiveRun {
  order: boolean[];
  /** Stop point of brief 013's `estimateRecall` lower bound reaching 0.95; null if never. */
  stop: { screenedFrac: number; trueRecall: number; lowerHeld: boolean } | null;
  /** First point where `stoppingTest` (hypergeometric, brief 017) says stop; null if never. */
  hgStop: { screenedFrac: number; trueRecall: number; targetMet: boolean } | null;
  rankCalls: number;
  rankMsTotal: number;
  rankMsMax: number;
}

/**
 * Condition B: seed with 1 random include + 1 random exclude, then repeatedly
 * re-rank on all verdicts and screen the top max(10, n/60) unlabelled with the true label.
 */
export function activeLearningRun(records: RankRecord[], labels: boolean[], seed: number): ActiveRun {
  const n = records.length;
  const total = labels.filter(Boolean).length;
  const rand = rng(seed);
  const incs = labels.flatMap((l, i) => (l ? [i] : []));
  const excs = labels.flatMap((l, i) => (l ? [] : [i]));
  const order = [incs[Math.floor(rand() * incs.length)], excs[Math.floor(rand() * excs.length)]];
  const verdicts = new Map<number, "include" | "exclude">(order.map((i) => [i, labels[i] ? "include" : "exclude"]));
  const batch = Math.max(10, Math.ceil(n / 60));
  let stop: ActiveRun["stop"] = null;
  let hgStop: ActiveRun["hgStop"] = null;
  let rankCalls = 0;
  let rankMsTotal = 0;
  let rankMsMax = 0;
  // Out-of-sample audit for estimateRecall (handoff 129): the previous batch's scores
  // from BEFORE it was screened, paired with its verdicts.
  let audit: { score: number; include: boolean }[] = [];
  while (order.length < n) {
    const t0 = performance.now();
    const ranked = rankRecords(records, [...verdicts].map(([i, v]) => ({ id: String(i), verdict: v })));
    const ms = performance.now() - t0;
    rankCalls++;
    rankMsTotal += ms;
    rankMsMax = Math.max(rankMsMax, ms);
    const unl = ranked.filter((r) => !verdicts.has(Number(r.id)));
    if (!stop) {
      const found = order.filter((i) => labels[i]).length;
      const e = estimateRecall(found, unl.map((r) => r.score), audit);
      if (e.lower >= 0.95) {
        const trueRecall = total ? found / total : 1;
        stop = { screenedFrac: order.length / n, trueRecall, lowerHeld: e.lower <= trueRecall + 1e-9 };
      }
    }
    if (!hgStop && stoppingTest(order.map((i) => labels[i]), n).stop) {
      const trueRecall = total ? order.filter((i) => labels[i]).length / total : 1;
      hgStop = { screenedFrac: order.length / n, trueRecall, targetMet: trueRecall >= 0.95 };
    }
    const next = unl.slice(0, batch);
    audit = next.map((r) => ({ score: r.score, include: labels[Number(r.id)] }));
    for (const r of next) {
      const i = Number(r.id);
      order.push(i);
      verdicts.set(i, labels[i] ? "include" : "exclude");
    }
  }
  return { order: order.map((i) => labels[i]), stop, hgStop, rankCalls, rankMsTotal, rankMsMax };
}
