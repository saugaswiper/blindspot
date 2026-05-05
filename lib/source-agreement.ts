/**
 * ACC-15: Cross-Source Confidence Score (Triangulation Quality Indicator).
 *
 * Blindspot queries up to 5 sources for primary study counts:
 *   PubMed, OpenAlex, Europe PMC, Scopus, Semantic Scholar
 * (Semantic Scholar is review-only; the per-source counts surfaced are the
 *  first four.)
 *
 * A topic where all sources return similar counts is more confidently
 * measured than one where PubMed says 5 and OpenAlex says 500. The
 * coefficient of variation (CV = std_dev / mean) is a dimensionless
 * indicator of relative dispersion that is well-suited to this:
 *   - CV < 0.30  → sources agree (high confidence in the count)
 *   - 0.30–0.80  → sources vary (interpret with caution)
 *   - > 0.80     → sources disagree (likely an over-broad query, or partial
 *                  coverage by one of the databases)
 *
 * Why CV rather than std dev or range? CV normalises by the mean, so a topic
 * with thousands of studies is not penalised relative to a niche one with
 * a few dozen — only the *relative* spread of the sources matters.
 *
 * This module is fully pure: no network calls, no Supabase reads. The caller
 * passes the per-source counts (already stored on `search_results`) and gets
 * back a label, badge color, and tooltip ready for direct UI rendering.
 */

export type SourceAgreementLevel = "agree" | "vary" | "disagree";

export interface SourceAgreement {
  /** Categorised level used for badge styling. */
  level: SourceAgreementLevel;
  /** Coefficient of variation across the supplied counts (NaN when n < 2). */
  cv: number;
  /** Number of sources contributing to the calculation. */
  sourcesContributing: number;
  /** Human-readable label for the badge. */
  label: string;
  /** Detailed tooltip explaining why this level applies. */
  tooltip: string;
}

/**
 * Threshold for classifying CV into agreement levels.
 * Exposed for unit testing; not part of the runtime API.
 */
export const AGREE_THRESHOLD = 0.30;
export const DISAGREE_THRESHOLD = 0.80;

/**
 * Computes the coefficient of variation across the supplied source counts.
 * Returns NaN when fewer than 2 sources contribute, or when the mean is 0
 * (cannot meaningfully measure relative dispersion of a zero-mean sample).
 *
 * The standard deviation uses the *population* formula (divide by n) rather
 * than the sample formula (divide by n-1) because we are summarising the
 * exact sources we consulted, not estimating a population parameter.
 */
export function computeCv(counts: number[]): number {
  const valid = counts.filter((c) => Number.isFinite(c));
  if (valid.length < 2) return NaN;
  const mean = valid.reduce((sum, c) => sum + c, 0) / valid.length;
  if (mean === 0) return NaN;
  const variance =
    valid.reduce((sum, c) => sum + (c - mean) ** 2, 0) / valid.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Classify a CV value into one of three agreement levels.
 * Boundary values: CV exactly equal to 0.30 falls into "vary" (inclusive lower
 * bound), CV exactly equal to 0.80 falls into "disagree" (inclusive lower bound).
 */
export function classifyCv(cv: number): SourceAgreementLevel {
  if (!Number.isFinite(cv)) return "vary"; // n<2 or zero-mean: treat as inconclusive
  if (cv < AGREE_THRESHOLD) return "agree";
  if (cv < DISAGREE_THRESHOLD) return "vary";
  return "disagree";
}

/**
 * Build a complete `SourceAgreement` summary from per-source counts.
 *
 * Accepts each source as `number | null | undefined` so callers can pass the
 * raw values from `search_results` without filtering. Sources that are null
 * or undefined are excluded from the calculation (treated as "this source
 * had no result" rather than "this source returned 0").
 *
 * Returns `null` when fewer than 2 sources contributed — there is no
 * meaningful "agreement" to report from a single data point, and the UI
 * should hide the indicator entirely in that case.
 */
export function computeSourceAgreement(sources: {
  pubmed?: number | null;
  openalex?: number | null;
  europepmc?: number | null;
  scopus?: number | null;
}): SourceAgreement | null {
  const counts: number[] = [];
  if (typeof sources.pubmed === "number") counts.push(sources.pubmed);
  if (typeof sources.openalex === "number") counts.push(sources.openalex);
  if (typeof sources.europepmc === "number") counts.push(sources.europepmc);
  if (typeof sources.scopus === "number") counts.push(sources.scopus);

  if (counts.length < 2) return null;

  const cv = computeCv(counts);
  const level = classifyCv(cv);

  // Build the human-readable bits up front so the UI doesn't need to know
  // the threshold values.
  if (level === "agree") {
    return {
      level,
      cv,
      sourcesContributing: counts.length,
      label: "Sources agree",
      tooltip: `The ${counts.length} databases queried returned similar primary study counts (CV = ${cv.toFixed(2)}). This is a high-confidence measurement.`,
    };
  }
  if (level === "vary") {
    return {
      level,
      cv,
      sourcesContributing: counts.length,
      label: "Sources vary",
      tooltip: `The ${counts.length} databases queried returned moderately different counts (CV = ${cv.toFixed(2)}). The estimate is reasonable but interpret with some caution.`,
    };
  }
  return {
    level,
    cv,
    sourcesContributing: counts.length,
    label: "Sources disagree",
    tooltip: `The ${counts.length} databases queried returned widely different counts (CV = ${cv.toFixed(2)}). This often indicates an over-broad query — review the per-database breakdown for outliers.`,
  };
}
