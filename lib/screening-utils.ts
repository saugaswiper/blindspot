/**
 * Pure helpers for the screening workflow — shared by ScreeningPanel and
 * covered by unit tests (lib/screening-utils.test.ts).
 *
 * RAISE guidance: every AI decision remains subject to human review. A human
 * override (`human_decision`) supersedes the AI verdict everywhere — counts,
 * filters, exports — while the original AI decision is kept for audit.
 */

import { normalizeDoi } from "@/lib/study-id";
import type { ScreeningDecision, ScreeningResult } from "@/types";

export type Verdict = "include" | "exclude" | "uncertain";

export type SortMode = "default" | "needs_review" | "confidence" | "year";

/** The verdict that counts: the human's override when present, else the AI's. */
export function effectiveDecision(d: ScreeningDecision): Verdict {
  return d.human_decision ?? d.decision;
}

/** Include/exclude/uncertain tallies over effective verdicts. */
export function computeCounts(decisions: ScreeningDecision[]) {
  return {
    included_count: decisions.filter((d) => effectiveDecision(d) === "include").length,
    excluded_count: decisions.filter((d) => effectiveDecision(d) === "exclude").length,
    uncertain_count: decisions.filter((d) => effectiveDecision(d) === "uncertain").length,
  };
}

/** A record the human should look at: AI was uncertain, or low-confidence and not yet human-verified. */
export function needsReview(d: ScreeningDecision): boolean {
  if (d.human_decision) return false; // already human-verified
  return d.decision === "uncertain" || d.confidence === "low";
}

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

/**
 * Order a (filtered) decision list for display.
 *
 * - "default":      input order (screening order)
 * - "needs_review": work-priority — unreviewed flagged items first, lowest
 *                   confidence first within each group
 * - "confidence":   lowest confidence first
 * - "year":         newest first
 */
export function sortDecisions(
  list: Array<{ d: ScreeningDecision; idx: number }>,
  mode: SortMode,
): Array<{ d: ScreeningDecision; idx: number }> {
  if (mode === "default") return list;
  const copy = [...list];
  if (mode === "needs_review") {
    copy.sort((a, b) => {
      const na = needsReview(a.d) ? 0 : 1;
      const nb = needsReview(b.d) ? 0 : 1;
      if (na !== nb) return na - nb;
      return (CONFIDENCE_RANK[a.d.confidence ?? "high"]) - (CONFIDENCE_RANK[b.d.confidence ?? "high"]);
    });
  } else if (mode === "confidence") {
    copy.sort((a, b) =>
      (CONFIDENCE_RANK[a.d.confidence ?? "high"]) - (CONFIDENCE_RANK[b.d.confidence ?? "high"]));
  } else if (mode === "year") {
    copy.sort((a, b) => (b.d.year || 0) - (a.d.year || 0));
  }
  return copy;
}

/**
 * CSV audit-trail export: AI decision, human override, and final (effective)
 * decision per record, plus identifiers for cross-referencing.
 */
export function buildCsv(decisions: ScreeningDecision[], criteria: ScreeningResult["criteria"]): string {
  const header = ["Title", "Year", "Journal", "AI Decision", "Human Override", "Final Decision", "Confidence", "Reason Code", "Reason", "DOI", "PMID"].join(",");
  const escape = (s: string | number | undefined) => {
    const str = String(s ?? "");
    return `"${str.replace(/"/g, '""')}"`;
  };
  const rows = decisions.map((d) =>
    [
      escape(d.title),
      escape(d.year),
      escape(d.journal),
      escape(d.decision),
      escape(d.human_decision ?? ""),
      escape(effectiveDecision(d)),
      escape(d.confidence ?? ""),
      escape(d.reason_code ?? ""),
      escape(d.reason),
      escape(d.doi ?? ""),
      escape(d.pmid ?? ""),
    ].join(",")
  );
  const meta = [
    `# Screening results for gap: ${criteria.topic_title}`,
    `# Gap focus: ${criteria.focus_gap}`,
    `# Exported from Blindspot`,
  ].join("\n");
  return [meta, header, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// Human-verdict carry-over across re-screens
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// normalizeDoi is the canonical primitive from lib/study-id.ts (trim-then-strip);
// using it here keeps screening dedup/carry-over consistent with search dedup.

/**
 * Copy human verdicts from a previous screening run onto the decisions of a
 * new run, matching records by PMID, then DOI, then normalized title.
 *
 * Without this, "Adjust criteria & re-screen" silently discards every verdict
 * the reviewer recorded — re-screening is an iteration on the SAME records,
 * so the reviewer's judgements about those records still stand.
 *
 * Returns a new array; the input decisions are not mutated.
 */
export function carryOverHumanVerdicts(
  previous: ScreeningDecision[],
  next: ScreeningDecision[],
): ScreeningDecision[] {
  const byPmid = new Map<string, ScreeningDecision>();
  const byDoi = new Map<string, ScreeningDecision>();
  const byTitle = new Map<string, ScreeningDecision>();

  for (const d of previous) {
    if (!d.human_decision) continue;
    if (d.pmid?.trim()) byPmid.set(d.pmid.trim(), d);
    const doi = normalizeDoi(d.doi);
    if (doi) byDoi.set(doi, d);
    byTitle.set(normalizeTitle(d.title), d);
  }

  if (byPmid.size === 0 && byDoi.size === 0 && byTitle.size === 0) return next;

  return next.map((d) => {
    const match =
      (d.pmid?.trim() && byPmid.get(d.pmid.trim())) ||
      (normalizeDoi(d.doi) && byDoi.get(normalizeDoi(d.doi)!)) ||
      byTitle.get(normalizeTitle(d.title));

    if (!match) return d;
    return {
      ...d,
      human_decision: match.human_decision,
      human_decided_at: match.human_decided_at,
    };
  });
}
