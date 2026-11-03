/**
 * Screening prioritization (brief 010, v0 slice): rank records by inclusion
 * probability from a reviewer's verified verdicts, plus an advisory recall
 * estimate for a stopping rule.
 *
 * TF-IDF over title + abstract and logistic regression, all in memory and
 * deterministic. Ranking only reorders the queue — it never excludes a record
 * (RAISE: humans decide; recall is paramount). Trains only on human-verified
 * verdicts, never on the model's own predictions.
 */

export interface RankRecord {
  id: string;
  title: string;
  abstract?: string | null;
}

export interface RankVerdict {
  id: string;
  verdict: "include" | "exclude";
}

export interface RankedRecord {
  id: string;
  score: number;
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were with".split(" ")
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termCounts(r: RankRecord): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokenize(`${r.title} ${r.abstract ?? ""}`)) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

/** Sparse row: parallel term-index / weight arrays. */
interface SparseVec {
  idx: Int32Array;
  val: Float64Array;
}

interface Vectorized {
  rows: SparseVec[];
  dim: number;
}

function vectorize(records: RankRecord[]): Vectorized {
  const docs = records.map(termCounts);
  const df = new Map<string, number>();
  const index = new Map<string, number>();
  for (const d of docs) {
    for (const t of d.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
      if (!index.has(t)) index.set(t, index.size);
    }
  }
  const n = records.length;
  const rows = docs.map((d) => {
    const idx = new Int32Array(d.size);
    const val = new Float64Array(d.size);
    let norm = 0;
    let k = 0;
    for (const [t, c] of d) {
      const w = (1 + Math.log(c)) * (Math.log((1 + n) / (1 + (df.get(t) ?? 0))) + 1);
      idx[k] = index.get(t)!;
      val[k++] = w;
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (let j = 0; j < val.length; j++) val[j] /= norm;
    return { idx, val };
  });
  return { rows, dim: index.size };
}

// Vectors depend only on the records, and a review calls rankRecords ~60 times
// on the same array. Memoise per array instance; treat arrays as immutable
// (the length guard catches the common push/splice mutation).
const vectorCache = new WeakMap<RankRecord[], Vectorized & { n: number }>();

function vectorizeCached(records: RankRecord[]): Vectorized {
  const hit = vectorCache.get(records);
  if (hit && hit.n === records.length) return hit;
  const v = { ...vectorize(records), n: records.length };
  vectorCache.set(records, v);
  return v;
}

/**
 * Fit logistic regression by batch gradient descent with L2 regularisation.
 * Fixed iteration count and zero init keep it fully deterministic. Weights live
 * in a dense Float64Array over the term index.
 */
function fit(x: SparseVec[], y: number[], dim: number, epochs = 200, lr = 1, l2 = 0.01) {
  const w = new Float64Array(dim);
  const grad = new Float64Array(dim);
  let b = 0;
  const m = x.length;
  // Terms absent from every training row keep zero gradient and zero weight
  // (zero init, L2 decay of 0 is 0), so updating only the active terms is exact.
  const seen = new Uint8Array(dim);
  const active: number[] = [];
  for (const { idx } of x) for (let j = 0; j < idx.length; j++) if (!seen[idx[j]]) { seen[idx[j]] = 1; active.push(idx[j]); }
  for (let e = 0; e < epochs; e++) {
    for (let a = 0; a < active.length; a++) grad[active[a]] = 0;
    let gb = 0;
    for (let i = 0; i < m; i++) {
      const { idx, val } = x[i];
      let z = b;
      for (let j = 0; j < idx.length; j++) z += w[idx[j]] * val[j];
      const err = 1 / (1 + Math.exp(-z)) - y[i];
      gb += err;
      for (let j = 0; j < idx.length; j++) grad[idx[j]] += err * val[j];
    }
    b -= (lr * gb) / m;
    for (let a = 0; a < active.length; a++) {
      const t = active[a];
      w[t] -= lr * (grad[t] / m + l2 * w[t]);
    }
  }
  return { w, b };
}

/**
 * Rank records most-likely-include first. With no include AND no exclude
 * verdict yet (cold start) the input order is preserved with a flat score.
 * Verdict records are scored too; callers decide whether to show them.
 */
export function rankRecords(records: RankRecord[], verdicts: RankVerdict[] = []): RankedRecord[] {
  const known = new Map(verdicts.map((v) => [v.id, v.verdict]));
  const hasInc = verdicts.some((v) => v.verdict === "include");
  const hasExc = verdicts.some((v) => v.verdict === "exclude");
  if (!hasInc || !hasExc) return records.map((r) => ({ id: r.id, score: 0.5 }));

  const { rows, dim } = vectorizeCached(records);
  const trainX: SparseVec[] = [];
  const trainY: number[] = [];
  records.forEach((r, i) => {
    const v = known.get(r.id);
    if (v) {
      trainX.push(rows[i]);
      trainY.push(v === "include" ? 1 : 0);
    }
  });
  const { w, b } = fit(trainX, trainY, dim);

  const scored = records.map((r, i) => {
    let z = b;
    const { idx, val } = rows[i];
    for (let j = 0; j < idx.length; j++) z += w[idx[j]] * val[j];
    return { id: r.id, score: 1 / (1 + Math.exp(-z)), i };
  });
  // Stable: ties keep input order.
  scored.sort((a, c) => c.score - a.score || a.i - c.i);
  return scored.map(({ id, score }) => ({ id, score }));
}

export interface RecallEstimate {
  /** Point estimate of the share of all includes already found (0–1). */
  estimate: number;
  /** One-sided 97.5% lower bound on recall (0–1): found / (found + upper bound on missed). */
  lower: number;
  /** One-sided 97.5% upper bound on recall (0–1). */
  upper: number;
  /** Interval method used; "audit-scaled" means scores were corrected by an out-of-sample audit. */
  method: "poisson-uncalibrated" | "poisson-audit-scaled";
  advisory: true;
}

/** An out-of-sample audit pair: the score a record had BEFORE it was screened, and the human verdict. */
export interface RecallAudit {
  score: number;
  include: boolean;
}

const ALPHA = 0.025;

// Terms are built in log space: exp(-mu) underflows to 0 for mu > ~745, which
// would make the CDF 0 forever and the quantile search never terminate.
function poissonCdf(k: number, mu: number): number {
  if (mu <= 0) return 1;
  let logTerm = -mu;
  let sum = Math.exp(logTerm);
  for (let i = 1; i <= k; i++) {
    logTerm += Math.log(mu / i);
    sum += Math.exp(logTerm);
  }
  return Math.min(1, sum);
}

/** Smallest integer m with P(Pois(mu) <= m) >= q. Single pass, O(m). */
function poissonQuantile(mu: number, q: number): number {
  if (mu <= 0) return 0;
  let logTerm = -mu;
  let cdf = Math.exp(logTerm);
  let m = 0;
  const cap = Math.ceil(mu + 50 * Math.sqrt(mu) + 50);
  while (cdf < q && m < cap) {
    m++;
    logTerm += Math.log(mu / m);
    cdf += Math.exp(logTerm);
  }
  return m;
}

/** Garwood upper limit: largest mu still compatible with seeing k events (P(Pois(mu) <= k) > ALPHA). */
function poissonUpperMean(k: number): number {
  let lo = 0;
  let hi = k + 10 * Math.sqrt(k + 1) + 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (poissonCdf(k, mid) > ALPHA) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Advisory stopping estimate. Missed includes among the unscreened records are
 * modelled as Poisson with mean = sum of model scores. A Poisson upper tail
 * dominates the Poisson-binomial tail (Hoeffding), so the bound is conservative
 * for any score vector. Raw scores come from a regularised model and are not
 * calibrated, so callers SHOULD pass `audit` — (score-before-screening, verdict)
 * pairs for records the model had not trained on, e.g. the latest screened batch.
 * The expected-vs-observed include ratio then scales the unscreened mean up (never
 * down), with a Garwood upper limit on the observed count feeding the lower bound.
 * Never auto-excludes; the reviewer decides when to stop.
 *
 * @deprecated as a stopping signal (validation 016: the lower bound never reached 0.95 on
 * Set B). Use `stoppingTest`. Kept exported for compatibility and comparison.
 */
export function estimateRecall(
  foundIncludes: number,
  unscreenedScores: number[],
  audit: RecallAudit[] = []
): RecallEstimate {
  const sumP = unscreenedScores.reduce((s, p) => s + p, 0);
  let ratioPt = 1;
  let ratioHi = 1;
  if (audit.length > 0) {
    const expected = audit.reduce((s, a) => s + a.score, 0);
    const hits = audit.filter((a) => a.include).length;
    const e = Math.max(expected, 1e-6);
    ratioPt = Math.max(1, hits / e);
    ratioHi = Math.max(ratioPt, poissonUpperMean(hits) / e);
  }
  const muPt = sumP * ratioPt;
  const muHi = sumP * ratioHi;
  const missedHi = Math.max(muPt, poissonQuantile(muHi, 1 - ALPHA));
  const missedLo = Math.min(muPt, poissonQuantile(muPt, ALPHA));
  const rec = (missed: number) => (foundIncludes + missed === 0 ? 1 : foundIncludes / (foundIncludes + missed));
  return {
    estimate: rec(muPt),
    lower: rec(missedHi),
    upper: rec(missedLo),
    method: audit.length > 0 ? "poisson-audit-scaled" : "poisson-uncalibrated",
    advisory: true,
  };
}

// ---------------------------------------------------------------------------
// Hypergeometric stopping test (Callaghan & Müller-Hansen 2020, Syst Rev 9:273).
// The paper's full text was not accessed; this is the test from first principles.
//
// Let s records be screened in ranked order. Take the last k as the sample and the
// first s-k as "already reviewed" with d' includes. The population is the R = N-(s-k)
// records not yet reviewed at that point; it holds M includes, x of them in the sample.
// H0: recall at s-k is below target t, i.e. d'/(d'+M) < t, i.e. M >= M0 = floor(d'(1-t)/t)+1.
// Under H0 and a random sample, X ~ Hypergeometric(R, M, k), so
//   p = max over M >= M0 of P(X <= x) = P(X <= x | M0)   (the tail shrinks as M grows).
// Reject H0 (stop) when p < alpha. The last k of a ranked list are the likeliest
// includes of the tail, so x is biased upward and the test errs towards not stopping.
// ---------------------------------------------------------------------------

export interface StoppingOptions {
  /** Recall to certify (default 0.95). */
  target?: number;
  /** Significance level (default 0.05). */
  alpha?: number;
  /** Never stop before this share of the pool is screened (default 0.2). */
  minScreenedFrac?: number;
}

export interface StoppingResult {
  stop: boolean;
  /** Smallest P(X <= x) over all k, under the least favourable H0 (recall just below target). */
  p: number;
  /** One-sided (1-alpha) lower bound on recall at the start of the best sample; 0 if untestable. */
  recallLowerBound: number;
  /** The k (last-k-screened sample size) that gave the smallest p. */
  kUsed: number;
  /**
   * Why the test did not stop (null when it stopped): `untestable-few-includes` = fewer than
   * ~19 includes found, so M0 = 1 and certifying the target means ruling out even one missed
   * include; `insufficient-sample` = enough includes but the evidence so far is not enough.
   */
  reason: "untestable-few-includes" | "insufficient-sample" | null;
  method: "hypergeometric-cmh2020";
  advisory: true;
}

const logFactCache: number[] = [0];
function logFact(n: number): number {
  for (let i = logFactCache.length; i <= n; i++) logFactCache.push(logFactCache[i - 1] + Math.log(i));
  return logFactCache[n];
}
function logChoose(n: number, r: number): number {
  return r < 0 || r > n ? -Infinity : logFact(n) - logFact(r) - logFact(n - r);
}

/** P(X <= x) for X ~ Hypergeometric(population R, M successes, k draws). */
export function hypergeomCdf(x: number, R: number, M: number, k: number): number {
  const denom = logChoose(R, k);
  let sum = 0;
  for (let j = 0; j <= Math.min(x, M, k); j++) {
    const lp = logChoose(M, j) + logChoose(R - M, k - j) - denom;
    if (lp > -Infinity) sum += Math.exp(lp);
  }
  return Math.min(1, sum);
}

/**
 * Advisory statistical stopping test. `screenedInOrder[i]` is the human verdict
 * (true = include) of the i-th screened record; `nTotal` is the pool size.
 * Every sample size k = 1..s-1 is evaluated and the smallest p is used.
 * NOTE: the paper's multiplicity handling for scanning k could not be verified (no access to
 * the full text); the min-p is unadjusted, so validity is for the tester to check. Never auto-excludes.
 */
export function stoppingTest(
  screenedInOrder: boolean[],
  nTotal: number,
  { target = 0.95, alpha = 0.05, minScreenedFrac = 0.2 }: StoppingOptions = {}
): StoppingResult {
  const s = screenedInOrder.length;
  const none: StoppingResult = { stop: false, p: 1, recallLowerBound: 0, kUsed: 0, reason: "insufficient-sample", method: "hypergeometric-cmh2020", advisory: true };
  if (s < minScreenedFrac * nTotal || s < 2 || s > nTotal) return none;
  // prefix[i] = includes among the first i screened
  const prefix = new Array<number>(s + 1).fill(0);
  for (let i = 0; i < s; i++) prefix[i + 1] = prefix[i] + (screenedInOrder[i] ? 1 : 0);
  const found = prefix[s];
  if (Math.floor((found * (1 - target)) / target) + 1 <= 1) return { ...none, reason: "untestable-few-includes" };
  let best = { p: 1, k: 0, x: 0, dPrev: 0, R: 0 };
  for (let k = 1; k < s; k++) {
    const dPrev = prefix[s - k];
    if (dPrev === 0) break; // shorter heads only have fewer includes
    const x = found - dPrev;
    const R = nTotal - (s - k);
    const M0 = Math.floor((dPrev * (1 - target)) / target) + 1;
    if (M0 > R) continue;
    const p = hypergeomCdf(x, R, Math.max(M0, x), k);
    if (p < best.p) best = { p, k, x, dPrev, R };
  }
  if (best.k === 0) return none;
  // Largest M still compatible with x at level alpha (p(M) decreases in M).
  let lo = best.x;
  let hi = best.R;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (hypergeomCdf(best.x, best.R, mid, best.k) >= alpha) lo = mid;
    else hi = mid - 1;
  }
  const stop = best.p < alpha;
  return {
    stop,
    p: best.p,
    recallLowerBound: best.dPrev / (best.dPrev + lo),
    kUsed: best.k,
    reason: stop ? null : "insufficient-sample",
    method: "hypergeometric-cmh2020",
    advisory: true,
  };
}
