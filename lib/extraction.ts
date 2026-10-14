/**
 * Extraction verification orchestrator (Brief 009, slice 2b).
 *
 * Combines the four independent checks of the extraction gate into a single
 * per-target disposition. A value is `verified` ONLY when all four pass:
 *   1. Source-presence   — `checkSourcePresence` (`lib/extraction-source`)
 *   2. Two-pass agreement — the two framed passes read the same number
 *   3. Internal consistency — `runConsistencyChecks` (`lib/extraction-checks`)
 *   4. Instrument range  — `checkInstrumentRange` (`lib/extraction-checks`)
 * Anything that fails a check becomes `check` (a human reads it); anything the
 * tool cannot attempt becomes `manual`; a value that lives only in a figure
 * becomes `author_contact` (operator rule: no figure digitising here).
 *
 * Design rules (from the brief / Cochrane Ch 5):
 *   - The two passes are two differently-framed passes of ONE model — this is
 *     AI-assisted extraction, NOT the dual-independent (two-human) extraction of
 *     Cochrane §5.5.2. The result's `method` field discloses this; callers must
 *     not relabel it.
 *   - On disagreement the result is a `conflict`, NEVER an average (AC4). The two
 *     readings are surfaced in `detail`; `value` carries one reading for context,
 *     never their mean.
 *   - No value is ever mutated or converted; `calculated` is always false.
 *
 * This module is model-/network-pure: the two passes are injected as functions
 * (`ExtractOptions`), so the deterministic gate can be unit-tested with stubs,
 * exactly as `lib/fulltext.ts` is testable. Wiring the passes to a live model and
 * the `POST /api/extract` route are a follow-on (slice 2c).
 */

import type {
  ExtractedValue,
  ExtractionFailureCode,
  ExtractionResult,
  ExtractionStatus,
} from "@/types";
import { ModelTimeoutError } from "./extraction-passes";
import { checkSourcePresence, type SourcePage } from "./extraction-source";
import {
  checkInstrumentRange,
  runConsistencyChecks,
  type InstrumentRange,
  type ReportedStats,
} from "./extraction-checks";

/** One outcome the caller wants extracted. */
export interface ExtractionTarget {
  /** Stable id — row identity, so decisions survive re-extraction (Ch 5 §5.2). */
  id: string;
  /** Human label of the outcome (e.g. "MADRS change, week 1, ketamine arm"). */
  label: string;
  /** Instrument name for the range check, resolved via the registry. */
  instrument?: string;
  /** An explicit range, overriding (or supplying) the named registry lookup. */
  range?: InstrumentRange;
}

/** What a single model pass returns for one target. */
export interface PassCandidate {
  /** The numeric value this pass read; null when the pass could not find it. */
  value: number | null;
  /** 1-based page the value was read from. */
  page?: number;
  /** The verbatim text strip the number was read from. */
  source_text?: string;
  /** A within-page locator (e.g. "Table 2, row 3"). */
  locator?: string;
  /** Reported statistics for the consistency checks, if the pass captured them. */
  stats?: ReportedStats;
  /** True when the value was read from a figure → `author_contact` (never digitised). */
  from_figure?: boolean;
}

/**
 * One extraction pass: given the source pages and a target, read the value.
 * Injected so the orchestrator stays model-/network-pure under test.
 */
export type ExtractionPass = (
  pages: SourcePage[],
  target: ExtractionTarget,
) => PassCandidate | Promise<PassCandidate>;

export interface ExtractOptions {
  /** Pass A — a cell-by-cell transcriber (reads the table as a grid). */
  transcriber: ExtractionPass;
  /** Pass B — a target-hunting pass (seeks the specific outcome). */
  hunter: ExtractionPass;
  /** Epoch ms after which no new target is started; the rest become `manual`. */
  deadline?: number;
}

/**
 * Two readings agree when they are the same reported number — exact for
 * integers and tolerant only of the final printed decimal place. This is a
 * deliberately tight test (unlike the 5% analysis tolerance in
 * `extraction-checks`): two passes reading the *same* printed value must match
 * to the digit, so a genuine discrepancy is never smoothed into agreement.
 */
function valuesAgree(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= 5e-10 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Pick the richest provenance of the two passes (prefer the transcriber's). */
function mergeProvenance(a: PassCandidate, b: PassCandidate) {
  const page = a.page ?? b.page;
  const source_text = a.source_text ?? b.source_text;
  const locator = a.locator ?? b.locator;
  if (page === undefined && source_text === undefined && locator === undefined) {
    return undefined;
  }
  return { page, source_text, locator };
}

/** Build an `ExtractedValue` and fold it into the running summary counts. */
function record(
  summary: Record<ExtractionStatus, number>,
  v: ExtractedValue,
): ExtractedValue {
  summary[v.status] += 1;
  return v;
}

/**
 * Run the four-check gate for one target against its two passes.
 * Precedence of dispositions:
 *   author_contact (figure) → manual (no reading) → check:conflict (passes
 *   disagree) → check:<first failing check> → verified (all passed).
 */
function verifyTarget(
  target: ExtractionTarget,
  pages: SourcePage[],
  a: PassCandidate,
  b: PassCandidate,
): ExtractedValue {
  const base = { target_id: target.id, label: target.label, calculated: false as const };

  // A value that lives only in a figure cannot be verified from the text layer.
  // Both passes must say figure AND the value must not appear verbatim in any
  // table/body unit — a table cell a pass called a "figure" is text (validation 012).
  const figureValue = a.value ?? b.value;
  if (
    a.from_figure &&
    b.from_figure &&
    (figureValue === null || !checkSourcePresence(figureValue, pages).ok)
  ) {
    return {
      ...base,
      value: a.value ?? b.value ?? null,
      status: "author_contact",
      provenance: mergeProvenance(a, b),
      detail: "value appears in a figure; obtain from the authors (no figure digitising at extraction)",
    };
  }

  // The tool could not read a value from either pass.
  if (a.value === null && b.value === null) {
    return {
      ...base,
      value: null,
      status: "manual",
      detail: "neither pass could read a value for this target",
    };
  }

  // Check 2 — two-pass agreement. A one-sided reading (only one pass found it)
  // or two differing readings are both a conflict; NEVER averaged (AC4).
  if (a.value === null || b.value === null || !valuesAgree(a.value, b.value)) {
    const shown = a.value ?? b.value ?? null;
    return {
      ...base,
      value: shown,
      status: "check",
      failure_code: "conflict",
      failure_codes: ["conflict"],
      provenance: mergeProvenance(a, b),
      detail: `two-pass disagreement: transcriber read ${a.value ?? "none"}, hunter read ${b.value ?? "none"} — not reconciled (never averaged)`,
    };
  }

  // The passes agree on a single value; the remaining checks run against it.
  const value = a.value;
  const provenance = mergeProvenance(a, b);
  const stats: ReportedStats | undefined = a.stats ?? b.stats;
  const failures: ExtractionFailureCode[] = [];
  const details: string[] = [];

  // Check 1 — source-presence (fabrication / mis-citation guard).
  const presence = checkSourcePresence(value, pages, provenance?.page);
  if (!presence.ok && presence.code) {
    failures.push(presence.code);
    if (presence.detail) details.push(presence.detail);
  }

  // Check 3 — internal consistency (Cochrane Ch 6 relations).
  if (stats) {
    const consistency = runConsistencyChecks(stats);
    for (const f of consistency.failures) {
      if (f.code) failures.push(f.code);
      if (f.detail) details.push(f.detail);
    }
  }

  // Check 4 — instrument range.
  const range = checkInstrumentRange(value, target.range ?? target.instrument);
  if (!range.ok && range.code) {
    failures.push(range.code);
    if (range.detail) details.push(range.detail);
  }

  if (failures.length === 0) {
    return { ...base, value, status: "verified", provenance };
  }
  return {
    ...base,
    value,
    status: "check",
    failure_code: failures[0],
    failure_codes: failures,
    provenance,
    detail: details.join("; ") || undefined,
  };
}

function emptySummary(): Record<ExtractionStatus, number> {
  return { verified: 0, check: 0, manual: 0, human: 0, author_contact: 0 };
}

/**
 * Extract and verify every target against a resolved full-text source.
 * Synchronous: both passes must be sync (stubs). Live model passes are async —
 * use `extractOutcomesAsync`.
 *
 * @param pages    the source's pages + text layers (from `lib/fulltext`)
 * @param targets  the outcomes to extract
 * @param opts     the two injected passes (transcriber + hunter)
 */
export function extractOutcomes(
  pages: SourcePage[],
  targets: ExtractionTarget[],
  opts: ExtractOptions,
): ExtractionResult {
  const summary = emptySummary();
  const values = targets.map((target) => {
    const a = opts.transcriber(pages, target);
    const b = opts.hunter(pages, target);
    if (a instanceof Promise || b instanceof Promise) {
      throw new Error("extractOutcomes got an async pass; use extractOutcomesAsync");
    }
    return record(summary, verifyTarget(target, pages, a, b));
  });
  return { values, summary, method: "ai-assisted-two-pass" };
}

/** Async variant for live model passes; identical gate and dispositions. */
export async function extractOutcomesAsync(
  pages: SourcePage[],
  targets: ExtractionTarget[],
  opts: ExtractOptions,
): Promise<ExtractionResult> {
  const summary = emptySummary();
  const values: ExtractedValue[] = [];
  for (const target of targets) {
    const manual = (detail: string) =>
      record(summary, {
        target_id: target.id,
        label: target.label,
        calculated: false,
        value: null,
        status: "manual",
        detail,
      });
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) {
      values.push(manual("model_timeout: request time budget exhausted before this target; extract manually"));
      continue;
    }
    try {
      const [a, b] = await Promise.all([
        opts.transcriber(pages, target),
        opts.hunter(pages, target),
      ]);
      values.push(record(summary, verifyTarget(target, pages, a, b)));
    } catch (e) {
      if (!(e instanceof ModelTimeoutError)) throw e;
      values.push(manual("model_timeout: the model did not respond in time; extract manually"));
    }
  }
  return { values, summary, method: "ai-assisted-two-pass" };
}
