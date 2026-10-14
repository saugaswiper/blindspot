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
  /** Conservative lower bound (Wilson-style, scaled by unscreened mass). */
  lower: number;
  advisory: true;
}

/**
 * Advisory stopping estimate: found includes / (found + expected includes
 * among unscreened records, from model scores). Never auto-excludes; the
 * reviewer decides when to stop. The lower bound assumes the unscreened
 * expectation could be up to 2x the model's estimate.
 */
export function estimateRecall(foundIncludes: number, unscreenedScores: number[]): RecallEstimate {
  const expectedMissed = unscreenedScores.reduce((s, p) => s + p, 0);
  const denom = foundIncludes + expectedMissed;
  const estimate = denom === 0 ? 1 : foundIncludes / denom;
  const lowerDenom = foundIncludes + 2 * expectedMissed;
  const lower = lowerDenom === 0 ? 1 : foundIncludes / lowerDenom;
  return { estimate, lower, advisory: true };
}
