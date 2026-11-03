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

type SparseVec = Map<string, number>;

function vectorize(records: RankRecord[]): SparseVec[] {
  const docs = records.map(termCounts);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = records.length;
  return docs.map((d) => {
    const v: SparseVec = new Map();
    let norm = 0;
    for (const [t, c] of d) {
      const w = (1 + Math.log(c)) * (Math.log((1 + n) / (1 + (df.get(t) ?? 0))) + 1);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  });
}

/**
 * Fit logistic regression by batch gradient descent with L2 regularisation.
 * Fixed iteration count and zero init keep it fully deterministic.
 */
function fit(x: SparseVec[], y: number[], epochs = 200, lr = 1, l2 = 0.01) {
  const w = new Map<string, number>();
  let b = 0;
  const m = x.length;
  for (let e = 0; e < epochs; e++) {
    const grad = new Map<string, number>();
    let gb = 0;
    for (let i = 0; i < m; i++) {
      let z = b;
      for (const [t, v] of x[i]) z += (w.get(t) ?? 0) * v;
      const err = 1 / (1 + Math.exp(-z)) - y[i];
      gb += err;
      for (const [t, v] of x[i]) grad.set(t, (grad.get(t) ?? 0) + err * v);
    }
    b -= (lr * gb) / m;
    for (const [t, g] of grad) {
      const cur = w.get(t) ?? 0;
      w.set(t, cur - lr * (g / m + l2 * cur));
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

  const vecs = vectorize(records);
  const trainX: SparseVec[] = [];
  const trainY: number[] = [];
  records.forEach((r, i) => {
    const v = known.get(r.id);
    if (v) {
      trainX.push(vecs[i]);
      trainY.push(v === "include" ? 1 : 0);
    }
  });
  const { w, b } = fit(trainX, trainY);

  const scored = records.map((r, i) => {
    let z = b;
    for (const [t, v] of vecs[i]) z += (w.get(t) ?? 0) * v;
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
