/**
 * Extraction consistency & range checks (Brief 009, check 3 + check 4).
 *
 * Pure, network-free, model-free implementations of the Cochrane Handbook
 * Chapter 6 arithmetic relations used to decide whether a set of reported
 * numbers are *internally consistent*, plus the instrument range check. These
 * are the deterministic half of the 4-check extraction gate; the source-presence
 * and two-pass-agreement checks (checks 1 & 2) live with the extractor itself.
 *
 * Design rules (from the brief / Cochrane Ch 5 §5.2.3):
 *   - These functions NEVER mutate or convert a reported value. They compare a
 *     reported value against a value *computed from other reported values* and
 *     report agreement or a discrepancy. Any SE→SD / endpoint→change conversion
 *     belongs in analysis, not extraction.
 *   - A check that cannot run because an input is missing returns `ok: true`
 *     with `ran: false` — absence of evidence is not a failure (the datum simply
 *     is not disconfirmed by this relation).
 *
 * Cochrane cites in-line refer to the Cochrane Handbook v6 Chapter 6
 * (§6.3.1 obtaining SDs; §6.5.2.2–3 from CIs / small samples).
 */

import type { ExtractionFailureCode } from "@/types";

/** Outcome of one consistency relation. */
export interface CheckResult {
  /** True if the relation held (or could not be evaluated — see `ran`). */
  ok: boolean;
  /** False when a required input was absent, so no judgement was made. */
  ran: boolean;
  /** The Cochrane-named failure code when `ok` is false. */
  code?: ExtractionFailureCode;
  /** The value computed from the other reported fields, when applicable. */
  computed?: number;
  /** The reported value this relation checked, when applicable. */
  reported?: number;
  /** Human-readable explanation (for the `check` queue / audit log). */
  detail?: string;
}

/** The numbers an extractor may report for a single outcome, any of them absent. */
export interface ReportedStats {
  /** Sample size for this arm/outcome (used as √n and the t divisor). */
  n?: number;
  /** Number randomised to this arm (the ceiling for `n`). */
  randomised?: number;
  mean?: number;
  sd?: number;
  se?: number;
  /** 95% confidence-interval bounds, as reported. */
  ciLow?: number;
  ciHigh?: number;
  /** For proportions/event outcomes. */
  events?: number;
  total?: number;
  /** The reported proportion, as a fraction in [0,1] (not a percent). */
  proportion?: number;
}

/** Relative tolerance for "two numbers agree" (5% by default). */
export const DEFAULT_REL_TOLERANCE = 0.05;
/** Absolute floor so near-zero values do not demand impossible precision. */
export const DEFAULT_ABS_TOLERANCE = 1e-6;

/**
 * True when `a` and `b` agree within a combined relative/absolute tolerance.
 * The absolute floor keeps the relative test meaningful as values approach 0.
 */
export function approxEqual(
  a: number,
  b: number,
  relTol: number = DEFAULT_REL_TOLERANCE,
  absTol: number = DEFAULT_ABS_TOLERANCE,
): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return diff <= relTol * scale;
}

/**
 * Two-sided 0.975 critical value of Student's t with `df` degrees of freedom —
 * the multiplier Cochrane §6.5.2.3 substitutes for 1.96 when a sample is small
 * (the SE divisor is `2 × t`, i.e. 3.92 only in the large-sample limit).
 *
 * Implemented as a lookup table (df 1–30, then 40/50/60/80/100) with
 * nearest-lower-df selection — conservative (a slightly wider t for an
 * unlisted df) and exactly unit-testable against published t-tables. df ≥ 100
 * plateaus at the 100-row value (1.984, already within ~1% of the normal 1.96);
 * invalid df (< 1) returns the normal value 1.96.
 */
export function tCritical975(df: number): number {
  if (!Number.isFinite(df) || df < 1) return 1.96;
  const table: Array<[number, number]> = [
    [1, 12.706],
    [2, 4.303],
    [3, 3.182],
    [4, 2.776],
    [5, 2.571],
    [6, 2.447],
    [7, 2.365],
    [8, 2.306],
    [9, 2.262],
    [10, 2.228],
    [11, 2.201],
    [12, 2.179],
    [13, 2.16],
    [14, 2.145],
    [15, 2.131],
    [16, 2.12],
    [17, 2.11],
    [18, 2.101],
    [19, 2.093],
    [20, 2.086],
    [21, 2.08],
    [22, 2.074],
    [23, 2.069],
    [24, 2.064],
    [25, 2.06],
    [26, 2.056],
    [27, 2.052],
    [28, 2.048],
    [29, 2.045],
    [30, 2.042],
    [40, 2.021],
    [50, 2.009],
    [60, 2.0],
    [80, 1.99],
    [100, 1.984],
  ];
  const whole = Math.floor(df);
  let chosen = 1.96;
  for (const [d, t] of table) {
    if (whole >= d) chosen = t;
    else break;
  }
  return chosen;
}

/**
 * The divisor that turns a 95% CI width into a standard error:
 * `SE = (CI_hi − CI_lo) / divisor`. For n ≥ 60 (or unknown n) this is 3.92
 * (= 2 × 1.96); for smaller samples Cochrane uses the t distribution, so the
 * divisor is `2 × t_{0.975, n−1}` (§6.5.2.2–3).
 */
export function ciDivisor(n?: number): number {
  if (n === undefined || !Number.isFinite(n) || n >= 60) return 3.92;
  return 2 * tCritical975(n - 1);
}

/** SE implied by a reported 95% CI (Cochrane §6.5.2.2). */
export function seFromCi(ciLow: number, ciHigh: number, n?: number): number {
  return (ciHigh - ciLow) / ciDivisor(n);
}

/** SD implied by a reported SE and sample size: `SD = SE · √n` (Cochrane §6.3.1). */
export function sdFromSe(se: number, n: number): number {
  return se * Math.sqrt(n);
}

/** SE implied by a reported SD and sample size: `SE = SD / √n` (Cochrane §6.3.1). */
export function seFromSd(sd: number, n: number): number {
  return sd / Math.sqrt(n);
}

// ---------------------------------------------------------------------------
// Individual relation checks. Each returns `ran: false` when it lacks inputs.
// ---------------------------------------------------------------------------

/** CI bounds must be ordered: `CI_lo ≤ CI_hi`. */
export function checkCiOrder(s: ReportedStats): CheckResult {
  if (s.ciLow === undefined || s.ciHigh === undefined) return { ok: true, ran: false };
  if (s.ciLow <= s.ciHigh) return { ok: true, ran: true };
  return {
    ok: false,
    ran: true,
    code: "ci_order",
    detail: `CI lower bound ${s.ciLow} exceeds upper bound ${s.ciHigh}`,
  };
}

/** A reported point estimate (mean) must lie within its own 95% CI. */
export function checkMeanInCi(s: ReportedStats): CheckResult {
  if (s.mean === undefined || s.ciLow === undefined || s.ciHigh === undefined) {
    return { ok: true, ran: false };
  }
  const lo = Math.min(s.ciLow, s.ciHigh);
  const hi = Math.max(s.ciLow, s.ciHigh);
  // Allow a tolerance band so rounding in the report does not trip the check.
  const pad = Math.max(DEFAULT_ABS_TOLERANCE, DEFAULT_REL_TOLERANCE * (hi - lo));
  if (s.mean >= lo - pad && s.mean <= hi + pad) return { ok: true, ran: true };
  return {
    ok: false,
    ran: true,
    code: "mean_outside_ci",
    reported: s.mean,
    detail: `mean ${s.mean} lies outside its 95% CI [${s.ciLow}, ${s.ciHigh}]`,
  };
}

/**
 * The reported SE must agree with the SE implied by the reported 95% CI
 * (Cochrane §6.5.2.2). Runs only when SE and both CI bounds are present and the
 * CI is ordered.
 */
export function checkSeAgainstCi(s: ReportedStats): CheckResult {
  if (s.se === undefined || s.ciLow === undefined || s.ciHigh === undefined) {
    return { ok: true, ran: false };
  }
  if (s.ciHigh < s.ciLow) return { ok: true, ran: false }; // checkCiOrder owns this
  const computed = seFromCi(s.ciLow, s.ciHigh, s.n);
  if (approxEqual(s.se, computed)) {
    return { ok: true, ran: true, computed, reported: s.se };
  }
  return {
    ok: false,
    ran: true,
    code: "inconsistent_se_ci",
    computed,
    reported: s.se,
    detail: `reported SE ${s.se} disagrees with SE ${computed.toFixed(4)} implied by the 95% CI (divisor ${ciDivisor(s.n)})`,
  };
}

/**
 * The reported SD must agree with `SE · √n` (Cochrane §6.3.1). Runs only when
 * SD, SE and n are all present.
 */
export function checkSdAgainstSe(s: ReportedStats): CheckResult {
  if (s.sd === undefined || s.se === undefined || s.n === undefined) {
    return { ok: true, ran: false };
  }
  if (!(s.n > 0)) return { ok: true, ran: false };
  const computed = sdFromSe(s.se, s.n);
  if (approxEqual(s.sd, computed)) {
    return { ok: true, ran: true, computed, reported: s.sd };
  }
  return {
    ok: false,
    ran: true,
    code: "inconsistent_sd_se",
    computed,
    reported: s.sd,
    detail: `reported SD ${s.sd} disagrees with SD ${computed.toFixed(4)} = SE·√n`,
  };
}

/**
 * A reported proportion must agree with `events / total`. Runs only when a
 * proportion and both counts are present.
 */
export function checkProportion(s: ReportedStats): CheckResult {
  if (s.proportion === undefined || s.events === undefined || s.total === undefined) {
    return { ok: true, ran: false };
  }
  if (!(s.total > 0)) {
    return {
      ok: false,
      ran: true,
      code: "inconsistent_proportion",
      reported: s.proportion,
      detail: `total is ${s.total}; cannot form events/total`,
    };
  }
  const computed = s.events / s.total;
  if (approxEqual(s.proportion, computed)) {
    return { ok: true, ran: true, computed, reported: s.proportion };
  }
  return {
    ok: false,
    ran: true,
    code: "inconsistent_proportion",
    computed,
    reported: s.proportion,
    detail: `reported proportion ${s.proportion} disagrees with events/total = ${computed.toFixed(4)}`,
  };
}

/** Analysed n must not exceed the number randomised (Cochrane: no gained participants). */
export function checkSampleSize(s: ReportedStats): CheckResult {
  if (s.n === undefined || s.randomised === undefined) return { ok: true, ran: false };
  if (s.n <= s.randomised) return { ok: true, ran: true };
  return {
    ok: false,
    ran: true,
    code: "n_exceeds_randomised",
    reported: s.n,
    detail: `analysed n ${s.n} exceeds randomised ${s.randomised}`,
  };
}

/** Run every applicable consistency relation; collect the discrepancies. */
export interface ConsistencyReport {
  /** True when no relation that *ran* reported a discrepancy. */
  consistent: boolean;
  /** Only the relations that actually ran (had their inputs). */
  ran: CheckResult[];
  /** The subset of `ran` that failed. */
  failures: CheckResult[];
}

/**
 * Check 3 of the gate: cross-check all reported statistics for internal
 * consistency. A datum passes when every relation that could be evaluated held.
 * Relations that lacked inputs are neither pass nor fail — they are omitted.
 */
export function runConsistencyChecks(s: ReportedStats): ConsistencyReport {
  const all = [
    checkCiOrder(s),
    checkMeanInCi(s),
    checkSeAgainstCi(s),
    checkSdAgainstSe(s),
    checkProportion(s),
    checkSampleSize(s),
  ];
  const ran = all.filter((r) => r.ran);
  const failures = ran.filter((r) => !r.ok);
  return { consistent: failures.length === 0, ran, failures };
}

// ---------------------------------------------------------------------------
// Check 4 — instrument range.
// ---------------------------------------------------------------------------

/** The plausible numeric range of a measurement instrument. */
export interface InstrumentRange {
  /** Canonical name (what the extractor matched on). */
  name: string;
  min: number;
  max: number;
  /** Short note on the scale (direction, items) for the audit log. */
  note?: string;
}

/**
 * Ranges for instruments seen in the depression/TRD truth set (field report §2)
 * plus common vitals. Keyed by a normalised alias → canonical range. This is a
 * seed registry; the extractor passes an explicit range when it knows one, and
 * callers can extend this map. Ranges are the *possible* score span, not a
 * clinically expected one (an out-of-range value is impossible, not merely odd).
 */
export const INSTRUMENT_RANGES: Record<string, InstrumentRange> = {
  madrs: { name: "MADRS", min: 0, max: 60, note: "10 items × 0–6" },
  "ham-d": { name: "HAM-D (17-item)", min: 0, max: 52, note: "17-item Hamilton" },
  hamd: { name: "HAM-D (17-item)", min: 0, max: 52 },
  "hamd-17": { name: "HAM-D (17-item)", min: 0, max: 52 },
  "hamd-21": { name: "HAM-D (21-item)", min: 0, max: 64 },
  bdi: { name: "BDI", min: 0, max: 63, note: "21 items × 0–3" },
  "bdi-ii": { name: "BDI-II", min: 0, max: 63 },
  phq9: { name: "PHQ-9", min: 0, max: 27, note: "9 items × 0–3" },
  "phq-9": { name: "PHQ-9", min: 0, max: 27 },
  qids: { name: "QIDS-SR16", min: 0, max: 27 },
  sofas: { name: "SOFAS", min: 0, max: 100 },
  cgi: { name: "CGI", min: 1, max: 7 },
  percent: { name: "percentage", min: 0, max: 100 },
  proportion: { name: "proportion", min: 0, max: 1 },
};

/** Normalise an instrument name for registry lookup. */
export function normalizeInstrument(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[().]/g, "");
}

/** Resolve a free-text instrument name to a known range, if any. */
export function lookupInstrumentRange(name: string): InstrumentRange | undefined {
  return INSTRUMENT_RANGES[normalizeInstrument(name)];
}

/**
 * Check 4 of the gate: a value must be possible for its instrument. `range`
 * may be passed explicitly or named (resolved via the registry). When the
 * instrument is unknown the check cannot run (`ran: false`) — an unknown scale
 * is not a failure.
 */
export function checkInstrumentRange(
  value: number,
  range: InstrumentRange | string | undefined,
): CheckResult {
  const r = typeof range === "string" ? lookupInstrumentRange(range) : range;
  if (!r) return { ok: true, ran: false };
  if (value >= r.min && value <= r.max) {
    return { ok: true, ran: true, reported: value };
  }
  return {
    ok: false,
    ran: true,
    code: "out_of_range",
    reported: value,
    detail: `value ${value} is outside the possible range of ${r.name} [${r.min}, ${r.max}]`,
  };
}
