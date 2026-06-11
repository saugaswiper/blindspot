"use client";

/**
 * ScreeningPanel — three-step UI for AI-powered title/abstract screening.
 *
 * Step 1 (suggest)   : Button "Screen for this gap" → calls /api/screening/suggest
 *                      Shows a loading state while criteria are being generated.
 *
 * Step 2 (approve)   : Displays editable inclusion/exclusion criteria.
 *                      User can add/remove/edit items, then click "Approve & Screen".
 *
 * Step 3 (results)   : Shows per-review decisions in a table with counts.
 *                      Decisions colour-coded: green = include, red = exclude, amber = uncertain.
 *                      User can dismiss (collapse) back to the button.
 *
 * Props:
 *   resultId      – search_results.id (needed by both API endpoints)
 *   topicIndex    – index into gapAnalysis.suggested_topics
 *   topicTitle    – display label for the gap topic
 *   reviewCount   – total existing reviews (shown in button label)
 *   initialResult – previously saved ScreeningResult (if any) from the DB
 */

import { useEffect, useState } from "react";
import type { CalibrationExample, ExistingReview, ScreeningCriteria, ScreeningDecision, ScreeningReasonCode, ScreeningResult } from "@/types";
import { downloadTextFile, toRis } from "@/lib/citation-export";
import {
  buildCsv,
  carryOverHumanVerdicts,
  computeCounts,
  effectiveDecision,
  needsReview,
  sortDecisions,
  type SortMode,
  type Verdict,
} from "@/lib/screening-utils";

// ---------------------------------------------------------------------------
// Decision badge helpers
//
// All status styling flows through the semantic design tokens (--success,
// --danger, --warning + their -bg pairs) defined in globals.css, so the panel
// follows the editorial palette and stays readable in both themes.
// ---------------------------------------------------------------------------

const DECISION_TONES = {
  include:   { color: "var(--success)", bg: "var(--success-bg)", icon: "✓", label: "Include" },
  exclude:   { color: "var(--danger)",  bg: "var(--danger-bg)",  icon: "✕", label: "Exclude" },
  uncertain: { color: "var(--warning)", bg: "var(--warning-bg)", icon: "?", label: "Uncertain" },
} as const;

function toneBadgeStyle(v: keyof typeof DECISION_TONES): React.CSSProperties {
  const t = DECISION_TONES[v];
  return { color: t.color, background: t.bg, border: `1px solid ${t.color}` };
}

// ---------------------------------------------------------------------------
// Reason code display
// ---------------------------------------------------------------------------

const REASON_CODE_LABELS: Record<ScreeningReasonCode, string> = {
  wrong_population:      "Wrong population",
  wrong_intervention:    "Wrong intervention",
  wrong_outcome:         "Wrong outcome",
  wrong_design:          "Wrong design",
  wrong_timeframe:       "Wrong timeframe",
  duplicate:             "Duplicate",
  not_systematic_review: "Not a SR",
  insufficient_data:     "Insufficient data",
  off_topic:             "Off-topic",
};

function ReasonCodeBadge({ code }: { code: ScreeningReasonCode }) {
  return (
    <span
      className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
      style={{
        background: "var(--danger-bg)",
        color: "var(--danger)",
        border: "1px solid var(--danger)",
      }}
    >
      {REASON_CODE_LABELS[code]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confidence indicator
// ---------------------------------------------------------------------------

const CONFIDENCE_CONFIG = {
  high:   { dot: "var(--success)", label: "High confidence" },
  medium: { dot: "var(--warning)", label: "Medium confidence" },
  low:    { dot: "var(--danger)",  label: "Low confidence — review recommended" },
};

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0 mt-1"
      style={{ background: cfg.dot }}
      title={cfg.label}
      aria-label={cfg.label}
    />
  );
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

// buildCsv (audit-trail CSV) lives in lib/screening-utils.ts.

// ---------------------------------------------------------------------------
// Criteria editor helpers
// ---------------------------------------------------------------------------

function CriteriaList({
  title,
  items,
  tone,
  onChange,
}: {
  title: string;
  items: string[];
  tone: "include" | "exclude";
  onChange: (next: string[]) => void;
}) {
  function handleEdit(idx: number, value: string) {
    const next = [...items];
    next[idx] = value;
    onChange(next);
  }
  function handleRemove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function handleAdd() {
    onChange([...items, ""]);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--foreground)" }}>
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span
              className="mt-2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
              style={toneBadgeStyle(tone)}
            >
              {title === "Inclusion" ? "I" : "E"}{idx + 1}
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) => handleEdit(idx, e.target.value)}
              className="flex-1 text-sm px-2 py-1.5 rounded-md focus:outline-none focus:ring-1"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
              placeholder={`${title} criterion ${idx + 1}`}
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="mt-1.5 text-xs px-1.5 py-1 rounded transition-opacity hover:opacity-70 shrink-0"
              style={{ color: "var(--muted)" }}
              aria-label={`Remove ${title.toLowerCase()} criterion ${idx + 1}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--accent)" }}
      >
        + Add criterion
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

type FilterMode = "all" | "include" | "exclude" | "uncertain" | "needs_review";

/** Rows rendered before the "Show more" button — keeps the DOM light for 1 000+ records. */
const PAGE_SIZE = 100;

function ScreeningResultsTable({
  result,
  onOverride,
  onRefine,
  refining,
}: {
  result: ScreeningResult;
  /** Set or clear the human override for the decision at this index in result.decisions. */
  onOverride: (index: number, verdict: Verdict | null) => void;
  /** Re-screen flagged records using the reviewer's verified decisions as calibration. */
  onRefine: () => void;
  refining: boolean;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  // Incremental rendering: with 1 000+ decisions a full render is sluggish.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Keyboard speed mode: position of the active row within the visible list.
  const [activeIdx, setActiveIdx] = useState(-1);

  const { decisions, criteria } = result;
  const total = decisions.length;
  const { included_count, excluded_count, uncertain_count } = computeCounts(decisions);
  const needsReviewCount = decisions.filter(needsReview).length;
  const humanVerifiedCount = decisions.filter((d) => d.human_decision).length;

  // Pipeline: index → search → filter → sort → visible slice.
  // The original index travels with each record so overrides land correctly.
  const indexed = decisions.map((d, idx) => ({ d, idx }));
  const q = query.trim().toLowerCase();
  const searched = q
    ? indexed.filter(({ d }) =>
        d.title.toLowerCase().includes(q) || (d.journal ?? "").toLowerCase().includes(q))
    : indexed;
  const filtered =
    filter === "all" ? searched
    : filter === "needs_review" ? searched.filter(({ d }) => needsReview(d))
    : searched.filter(({ d }) => effectiveDecision(d) === filter);
  const sorted = sortDecisions(filtered, sortMode);
  const visible = sorted.slice(0, visibleCount);

  // Reset paging + active row whenever the working set changes shape.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setActiveIdx(-1);
  }, [filter, q, sortMode]);

  // Clamp the active row if an override removed it from the current filter.
  useEffect(() => {
    if (activeIdx >= visible.length) setActiveIdx(visible.length - 1);
  }, [activeIdx, visible.length]);

  // Keyboard speed mode (Covidence-style): j/k navigate, y/n/u verdict, r reasoning.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Never hijack typing in form fields.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, visible.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (activeIdx >= 0 && activeIdx < visible.length) {
        const { d, idx } = visible[activeIdx];
        if (e.key === "y") onOverride(idx, d.human_decision === "include" ? null : "include");
        else if (e.key === "n") onOverride(idx, d.human_decision === "exclude" ? null : "exclude");
        else if (e.key === "u") onOverride(idx, d.human_decision === "uncertain" ? null : "uncertain");
        else if (e.key === "r") setExpandedIndex((cur) => (cur === idx ? null : idx));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, activeIdx, onOverride]);

  // Keep the active row in view while navigating with the keyboard.
  useEffect(() => {
    if (activeIdx < 0 || activeIdx >= visible.length) return;
    document
      .getElementById(`screening-row-${visible[activeIdx].idx}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  function handleDownloadCsv() {
    const csv = buildCsv(decisions, criteria);
    const slug = criteria.topic_title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    downloadTextFile(csv, `screening-${slug}.csv`, "text/csv");
  }

  function handleDownloadRis() {
    // Export final-included studies in RIS for reference managers (Zotero,
    // EndNote) — the input to the full-text review stage.
    const included: ExistingReview[] = decisions
      .filter((d) => effectiveDecision(d) === "include")
      .map((d) => ({
        title: d.title,
        year: d.year,
        journal: d.journal,
        abstract_snippet: "",
        doi: d.doi,
        pmid: d.pmid,
      }));
    if (included.length === 0) return;
    const slug = criteria.topic_title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    downloadTextFile(toRis(included), `included-${slug}.ris`, "application/x-research-info-systems");
  }

  return (
    <div className="space-y-4">
      {/* Summary counts + exports */}
      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            {
              key: "all" as FilterMode,
              label: `All (${total})`,
              style: { color: "var(--foreground)", background: "var(--surface-2)", border: "1px solid var(--border)" },
            },
            { key: "include" as FilterMode,   label: `✓ Include (${included_count})`,    style: toneBadgeStyle("include") },
            { key: "exclude" as FilterMode,   label: `✕ Exclude (${excluded_count})`,    style: toneBadgeStyle("exclude") },
            { key: "uncertain" as FilterMode, label: `? Uncertain (${uncertain_count})`, style: toneBadgeStyle("uncertain") },
            ...(needsReviewCount > 0
              ? [{
                  key: "needs_review" as FilterMode,
                  label: `Needs review (${needsReviewCount})`,
                  style: { color: "var(--warning)", background: "var(--warning-bg)", border: "2px solid var(--warning)" },
                }]
              : []),
          ] as { key: FilterMode; label: string; style: React.CSSProperties }[]
        ).map(({ key, label, style }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-opacity ${filter === key ? "ring-2 ring-offset-1 ring-current" : "hover:opacity-80"}`}
            style={style}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadRis}
            disabled={included_count === 0}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: "var(--foreground)", border: "1px solid var(--border)", background: "var(--surface-2)" }}
            title="Download included studies as RIS for Zotero / EndNote (full-text stage)"
          >
            ↓ RIS (included)
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-opacity hover:opacity-80"
            style={{ color: "var(--foreground)", border: "1px solid var(--border)", background: "var(--surface-2)" }}
            title="Download all decisions as CSV (audit trail)"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Search + sort toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${total.toLocaleString()} records by title or journal…`}
          className="flex-1 min-w-[180px] text-xs px-2.5 py-1.5 rounded-md focus:outline-none focus:ring-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}
          aria-label="Search screened records"
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="text-xs px-2 py-1.5 rounded-md focus:outline-none"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}
          aria-label="Sort records"
        >
          <option value="default">Screening order</option>
          <option value="needs_review">Needs review first</option>
          <option value="confidence">Lowest confidence first</option>
          <option value="year">Newest first</option>
        </select>
      </div>

      {/* Keyboard speed mode hint */}
      <p className="hidden sm:block text-[10px]" style={{ color: "var(--muted)" }}>
        Keyboard: <kbd>j</kbd>/<kbd>k</kbd> navigate · <kbd>y</kbd> include · <kbd>n</kbd> exclude · <kbd>u</kbd> uncertain · <kbd>r</kbd> reasoning
      </p>

      {/* Human-review progress + active-learning refine */}
      {needsReviewCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: "var(--warning)" }} />
            {needsReviewCount} decision{needsReviewCount !== 1 ? "s" : ""} need{needsReviewCount === 1 ? "s" : ""} a human verdict (uncertain or low-confidence). Use the &ldquo;Needs review&rdquo; filter to work through them.
          </p>
          {humanVerifiedCount >= 3 && (
            <button
              type="button"
              onClick={onRefine}
              disabled={refining}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
              style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "var(--surface)" }}
              title="Re-screen the flagged records using your verified decisions as calibration examples"
            >
              {refining
                ? "Re-screening with your feedback…"
                : `↻ Re-screen ${needsReviewCount} with your feedback (${humanVerifiedCount} verdicts learned)`}
            </button>
          )}
        </div>
      ) : humanVerifiedCount > 0 ? (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: "var(--success)" }} />
          All flagged decisions reviewed — {humanVerifiedCount} human verdict{humanVerifiedCount !== 1 ? "s" : ""} recorded.
        </p>
      ) : null}

      {/* Criteria reminder */}
      <details className="text-xs" style={{ color: "var(--muted)" }}>
        <summary className="cursor-pointer select-none hover:opacity-80 transition-opacity" style={{ color: "var(--accent)" }}>
          View screening criteria used ↓
        </summary>
        <div className="mt-2 p-3 rounded-md space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <p className="font-medium" style={{ color: "var(--foreground)" }}>Gap focus: {criteria.focus_gap}</p>
          <div>
            <p className="font-semibold mb-0.5" style={{ color: "var(--success)" }}>Inclusion</p>
            <ul className="list-disc list-inside space-y-0.5">
              {criteria.inclusion.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-0.5" style={{ color: "var(--danger)" }}>Exclusion</p>
            <ul className="list-disc list-inside space-y-0.5">
              {criteria.exclusion.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </div>
      </details>

      {/* Results list */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
            {q
              ? `No records match “${query.trim()}”${filter !== "all" ? " in this filter" : ""}.`
              : `No ${result.screen_type === "reviews" ? "reviews" : "studies"} match this filter.`}
          </p>
        ) : (
          visible.map(({ d, idx }, pos) => {
            const verdict = effectiveDecision(d);
            const tone = DECISION_TONES[verdict];
            const isExpanded = expandedIndex === idx;
            const isActive = pos === activeIdx;
            const linkUrl = d.pmid
              ? `https://pubmed.ncbi.nlm.nih.gov/${d.pmid}/`
              : d.doi
              ? `https://doi.org/${d.doi}`
              : null;

            return (
              <div
                key={idx}
                id={`screening-row-${idx}`}
                onClick={() => setActiveIdx(pos)}
                className="rounded-md px-3 py-2.5"
                style={{
                  background: "var(--surface)",
                  borderLeft: `2px solid ${tone.color}`,
                  outline: isActive ? "2px solid var(--accent)" : "none",
                  outlineOffset: "1px",
                }}
              >
                <div className="flex items-start gap-2">
                  {/* Decision badge */}
                  <span
                    className="shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
                    style={toneBadgeStyle(verdict)}
                    aria-label={tone.label}
                  >
                    {tone.icon}
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    {linkUrl ? (
                      <a
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium underline transition-opacity hover:opacity-70 break-words"
                        style={{ color: "var(--foreground)" }}
                      >
                        {d.title}
                      </a>
                    ) : (
                      <p className="text-sm font-medium break-words" style={{ color: "var(--foreground)" }}>
                        {d.title}
                      </p>
                    )}

                    {/* Year · Journal · Reason code */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                        {d.journal && <>{d.journal} · </>}{d.year || "Year unknown"}
                      </p>
                      {d.reason_code && <ReasonCodeBadge code={d.reason_code} />}
                      {d.refined && (
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: "var(--accent)" }}
                          title="Re-screened with your verified decisions as calibration"
                        >
                          ↻ re-screened
                        </span>
                      )}
                    </div>

                    {/* Reasoning toggle + one-click human verdict (RAISE: every
                        AI decision stays reviewable — without expanding the row) */}
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                        className="text-[11px] transition-opacity hover:opacity-70 text-left"
                        style={{ color: "var(--accent)" }}
                      >
                        {isExpanded ? "Hide reasoning ↑" : "Why? ↓"}
                      </button>
                      <div className="inline-flex items-center gap-1" role="group" aria-label="Your verdict">
                        {(["include", "exclude", "uncertain"] as Verdict[]).map((v) => {
                          const isActive = d.human_decision === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => onOverride(idx, isActive ? null : v)}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-opacity ${isActive ? "ring-2 ring-offset-1 ring-current" : "opacity-50 hover:opacity-100"}`}
                              style={toneBadgeStyle(v)}
                              title={isActive ? "Click to revert to the AI decision" : `Set your verdict: ${DECISION_TONES[v].label}`}
                              aria-pressed={isActive}
                            >
                              {DECISION_TONES[v].icon}
                            </button>
                          );
                        })}
                      </div>
                      {d.human_decision && (
                        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                          AI said: {d.decision}
                        </span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-1.5 space-y-2">
                        <p className="text-xs leading-relaxed italic" style={{ color: "var(--muted)" }}>
                          {d.reason}
                        </p>
                        {d.criterion_results && d.criterion_results.length > 0 && (
                          <div className="overflow-x-auto rounded-md" style={{ border: "1px solid var(--border)" }}>
                            <table className="text-[10px] w-full border-collapse">
                              <thead>
                                <tr style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                                  <th className="text-left px-2 py-1 font-medium">Criterion</th>
                                  <th className="text-left px-2 py-1 font-medium w-16">Type</th>
                                  <th className="text-center px-2 py-1 font-medium w-8">Met</th>
                                  <th className="text-left px-2 py-1 font-medium">Note</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.criterion_results.map((cr, ci) => (
                                  <tr key={ci} style={{ borderTop: "1px solid var(--border)" }}>
                                    <td className="px-2 py-1 align-top" style={{ color: "var(--foreground)" }}>{cr.criterion}</td>
                                    <td className="px-2 py-1 align-top">
                                      <span
                                        className="px-1 py-0.5 rounded text-[10px] font-medium"
                                        style={
                                          cr.type === "inclusion"
                                            ? { color: "var(--success)", background: "var(--success-bg)" }
                                            : { color: "var(--danger)", background: "var(--danger-bg)" }
                                        }
                                      >
                                        {cr.type}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 text-center align-top font-bold">
                                      <span style={{ color: cr.met ? "var(--success)" : "var(--danger)" }}>
                                        {cr.met ? "✓" : "✕"}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 align-top italic" style={{ color: "var(--muted)" }}>{cr.note}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confidence dot + decision label */}
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    {d.confidence && <ConfidenceDot level={d.confidence} />}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={toneBadgeStyle(verdict)}>
                      {tone.label}
                    </span>
                    {d.human_decision && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ color: "var(--accent)", border: "1px solid var(--border)", background: "var(--surface-2)" }}
                        title={`Human verdict (AI said: ${d.decision})`}
                      >
                        ✓ Human
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Incremental rendering: load the next page of rows */}
        {sorted.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="w-full text-xs py-2 rounded-md transition-opacity hover:opacity-80"
            style={{ color: "var(--accent)", border: "1px dashed var(--border)", background: "var(--surface)" }}
          >
            Show {Math.min(PAGE_SIZE, sorted.length - visibleCount).toLocaleString()} more of {(sorted.length - visibleCount).toLocaleString()} remaining ↓
          </button>
        )}
      </div>

      <p className="text-[10px]" style={{ color: "var(--muted)" }}>
        AI-based title/abstract screening. Always verify final inclusion decisions with full-text review and a second reviewer.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ScreeningPanel
// ---------------------------------------------------------------------------

type PanelStep = "idle" | "suggesting" | "approve" | "running" | "results";

interface Props {
  resultId: string;
  topicIndex: number;
  topicTitle: string;
  /** Count shown in the button label. Pass primaryStudyCount for primary screening. */
  recordCount: number;
  /** What to screen: "primary" = primary studies from OpenAlex; "reviews" = stored existing reviews. */
  screenType?: "primary" | "reviews";
  /** Pre-loaded result from the database (if any). Shows results directly. */
  initialResult?: ScreeningResult | null;
  isOwner: boolean;
}

export function ScreeningPanel({
  resultId,
  topicIndex,
  topicTitle,
  recordCount,
  screenType = "primary",
  initialResult = null,
  isOwner,
}: Props) {
  const [step, setStep] = useState<PanelStep>(initialResult ? "results" : "idle");
  const [criteria, setCriteria] = useState<ScreeningCriteria | null>(null);
  const [screeningResult, setScreeningResult] = useState<ScreeningResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);
  // Real progress for the chunked screening pipeline. null until the total is known.
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  /**
   * Partial-run checkpoint for resume-on-failure. When a chunk fails (network
   * blip, AI hiccup) we keep the fetched records and the decisions completed
   * so far; "Resume" continues from the next chunk instead of refetching and
   * re-screening everything. Cleared on success or when a fresh run starts.
   * Criteria are snapshotted so a mid-failure edit can't mix criteria across
   * chunks of one run.
   */
  const [checkpoint, setCheckpoint] = useState<{
    records: ExistingReview[];
    decisions: ScreeningDecision[];
    criteria: ScreeningCriteria;
  } | null>(null);
  // True while a refine pass (calibrated re-screen) is in flight.
  const [refining, setRefining] = useState(false);
  const recordLabel = screenType === "primary" ? "primary studies" : "reviews";

  // ---------------------------------------------------------------------------
  // Step 1: Suggest criteria
  // ---------------------------------------------------------------------------
  async function handleSuggest() {
    setStep("suggesting");
    setError(null);
    try {
      const res = await fetch("/api/screening/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, topicIndex }),
      });
      const data = (await res.json()) as ScreeningCriteria & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to generate criteria. Please try again.");
        setStep("idle");
        return;
      }
      setCriteria(data);
      setStep("approve");
    } catch {
      setError("Network error. Please try again.");
      setStep("idle");
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: Run screening with approved criteria.
  //
  // Chunked pipeline so an unlimited number of articles can be screened without
  // hitting a serverless timeout:
  //   1. /api/screening/fetch → gather ALL records (paginated across sources)
  //   2. /api/screening/run   → screen one CHUNK_SIZE slice at a time (looped)
  //   3. /api/screening/save  → persist the assembled result once at the end
  // ---------------------------------------------------------------------------
  const CHUNK_SIZE = 300;

  async function handleRun(opts?: { resume?: boolean }) {
    const cp = opts?.resume ? checkpoint : null;
    const activeCriteria = cp?.criteria ?? criteria;
    if (!activeCriteria) return;

    setStep("running");
    setError(null);

    try {
      let records: ExistingReview[];
      let allDecisions: ScreeningDecision[];

      if (cp) {
        // ── Resume: reuse fetched records + completed decisions ──────────────
        records = cp.records;
        allDecisions = [...cp.decisions];
      } else {
        // ── Phase 1: fetch every available record ────────────────────────────
        setCheckpoint(null);
        setProgress(null);

        const fetchRes = await fetch("/api/screening/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultId, screenType }),
        });
        const fetchData = (await fetchRes.json()) as {
          records?: ExistingReview[];
          total?: number;
          error?: string;
        };
        if (!fetchRes.ok || fetchData.error || !fetchData.records) {
          setError(fetchData.error ?? `No ${recordLabel} found to screen.`);
          setStep("approve");
          return;
        }

        records = fetchData.records;
        if (records.length === 0) {
          setError(`No ${recordLabel} found to screen.`);
          setStep("approve");
          return;
        }
        allDecisions = [];
      }

      const total = records.length;

      // ── Phase 2: screen in chunks, accumulating decisions ──────────────────
      setProgress({ processed: allDecisions.length, total });

      for (let start = allDecisions.length; start < total; start += CHUNK_SIZE) {
        const chunk = records.slice(start, start + CHUNK_SIZE);
        let failureMessage: string | null = null;

        try {
          const runRes = await fetch("/api/screening/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ criteria: activeCriteria, records: chunk }),
          });
          const runData = (await runRes.json()) as { decisions?: ScreeningDecision[]; error?: string };
          if (!runRes.ok || runData.error || !runData.decisions) {
            failureMessage = runData.error ?? "AI screening failed on a batch.";
          } else {
            allDecisions.push(...runData.decisions);
            setProgress({ processed: Math.min(start + CHUNK_SIZE, total), total });
          }
        } catch {
          failureMessage = "Network error during screening.";
        }

        if (failureMessage) {
          // Checkpoint the partial run so the user can resume without losing progress.
          setCheckpoint({ records, decisions: allDecisions, criteria: activeCriteria });
          setError(
            `${failureMessage} Stopped at ${allDecisions.length.toLocaleString()} of ${total.toLocaleString()} — your progress is saved, use Resume below.`
          );
          setStep("approve");
          setProgress(null);
          return;
        }
      }

      // ── Phase 3: assemble + persist the final result ───────────────────────
      // Re-screens iterate on the same records, so verdicts the reviewer
      // already recorded carry over (matched by PMID → DOI → title) instead
      // of being silently discarded with the old result.
      const finalDecisions = screeningResult
        ? carryOverHumanVerdicts(screeningResult.decisions, allDecisions)
        : allDecisions;

      const assembled: ScreeningResult = {
        criteria: activeCriteria,
        decisions: finalDecisions,
        ...computeCounts(finalDecisions),
        screen_type: screenType,
        run_at: new Date().toISOString(),
      };

      // Persist (best-effort — results still display even if the save fails).
      try {
        await fetch("/api/screening/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resultId, screeningResult: assembled }),
        });
      } catch {
        // Non-fatal: the user still sees the results for this session.
      }

      setCheckpoint(null);
      setScreeningResult(assembled);
      setProgress(null);
      setStep("results");
    } catch {
      setError("Network error. Please try again.");
      setStep("approve");
      setProgress(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Refine: re-screen the still-flagged records (uncertain / low-confidence,
  // not yet human-verified) using the reviewer's verified decisions as
  // calibration examples — the active-learning loop. Verified decisions are
  // never touched; refined records keep appearing in "Needs review" if the
  // calibrated AI still can't decide.
  // ---------------------------------------------------------------------------
  async function handleRefine() {
    if (!screeningResult || refining) return;
    const sr = screeningResult;

    const targets = sr.decisions
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => needsReview(d));
    const verified = sr.decisions.filter((d) => d.human_decision);
    if (targets.length === 0 || verified.length === 0) return;

    // Corrections (human ≠ AI) are the strongest calibration signal — put
    // them first, then confirmations, capped to keep the prompt bounded.
    const examples: CalibrationExample[] = [...verified]
      .sort(
        (a, b) =>
          Number(b.human_decision !== b.decision) - Number(a.human_decision !== a.decision)
      )
      .slice(0, 25)
      .map((d) => ({
        title: d.title,
        year: d.year,
        human_decision: d.human_decision!,
        ai_decision: d.decision,
      }));

    setRefining(true);
    setError(null);

    const newDecisions = [...sr.decisions];
    let refineError: string | null = null;

    try {
      for (let start = 0; start < targets.length; start += CHUNK_SIZE) {
        const chunk = targets.slice(start, start + CHUNK_SIZE);
        const records: ExistingReview[] = chunk.map(({ d }) => ({
          title: d.title,
          year: d.year,
          journal: d.journal,
          abstract_snippet: d.abstract_snippet ?? "",
          pmid: d.pmid,
          doi: d.doi,
        }));

        const res = await fetch("/api/screening/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ criteria: sr.criteria, records, examples }),
        });
        const data = (await res.json()) as { decisions?: ScreeningDecision[]; error?: string };
        if (!res.ok || data.error || !data.decisions) {
          refineError = data.error ?? "Re-screening failed partway — earlier batches were kept.";
          break;
        }

        data.decisions.forEach((nd, j) => {
          const orig = chunk[j].i;
          newDecisions[orig] = {
            ...nd,
            abstract_snippet: newDecisions[orig].abstract_snippet ?? nd.abstract_snippet,
            refined: true,
          };
        });
      }
    } catch {
      refineError = "Network error during re-screening — earlier batches were kept.";
    }

    const updated: ScreeningResult = {
      ...sr,
      decisions: newDecisions,
      ...computeCounts(newDecisions),
    };
    setScreeningResult(updated);
    if (refineError) setError(refineError);

    fetch("/api/screening/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId, screeningResult: updated }),
    }).catch(() => {
      // Non-fatal: refreshed decisions still apply in this session.
    });

    setRefining(false);
  }

  // ---------------------------------------------------------------------------
  // Human override: supersede the AI verdict on one decision, recompute counts,
  // and persist the updated result (best-effort, fire-and-forget).
  // ---------------------------------------------------------------------------
  function handleOverride(index: number, verdict: Verdict | null) {
    setScreeningResult((prev) => {
      if (!prev || !prev.decisions[index]) return prev;

      const decisions = prev.decisions.map((d, i) => {
        if (i !== index) return d;
        const next = { ...d };
        if (verdict === null) {
          delete next.human_decision;
          delete next.human_decided_at;
        } else {
          next.human_decision = verdict;
          next.human_decided_at = new Date().toISOString();
        }
        return next;
      });

      const updated: ScreeningResult = { ...prev, decisions, ...computeCounts(decisions) };

      fetch("/api/screening/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, screeningResult: updated }),
      }).catch(() => {
        // Non-fatal: the override still applies in this session.
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOwner) return null;

  // ── Idle: CTA button ──────────────────────────────────────────────────────
  if (step === "idle") {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
        <button
          type="button"
          onClick={handleSuggest}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-all hover:opacity-90"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          {/* Filter icon */}
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591L15.75 12.75V21a.75.75 0 0 1-.75.75h-6a.75.75 0 0 1-.75-.75V12.75L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
          </svg>
          Screen ~{recordCount.toLocaleString()} {recordLabel} for this gap
        </button>
        {error && (
          <p className="mt-1.5 text-xs" style={{ color: "var(--danger)" }}>{error}</p>
        )}
      </div>
    );
  }

  // ── Suggesting: loading state ──────────────────────────────────────────────
  if (step === "suggesting") {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating inclusion/exclusion criteria for this gap…
        </div>
      </div>
    );
  }

  // ── Approve: show editable criteria ──────────────────────────────────────
  if (step === "approve" && criteria) {
    return (
      <div
        className="mt-3 rounded-lg p-4 space-y-4"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-serif text-base" style={{ color: "var(--foreground)" }}>
            Screening criteria for: <span style={{ color: "var(--accent)" }}>{topicTitle}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              // Return to previous results if a run exists; otherwise back to idle.
              setCriteria(null);
              setStep(screeningResult ? "results" : "idle");
            }}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            Cancel
          </button>
        </div>

        {criteria.focus_gap && (
          <p className="text-xs italic leading-relaxed" style={{ color: "var(--muted)" }}>
            Gap focus: {criteria.focus_gap}
          </p>
        )}

        <CriteriaList
          title="Inclusion"
          items={criteria.inclusion}
          tone="include"
          onChange={(next) => setCriteria({ ...criteria, inclusion: next })}
        />

        <CriteriaList
          title="Exclusion"
          items={criteria.exclusion}
          tone="exclude"
          onChange={(next) => setCriteria({ ...criteria, exclusion: next })}
        />

        {error && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {checkpoint && (
            <button
              type="button"
              onClick={() => handleRun({ resume: true })}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md transition-all"
              style={{ background: "var(--brand-surface)", color: "#f4f1ea" }}
            >
              Resume screening ({checkpoint.decisions.length.toLocaleString()}/{checkpoint.records.length.toLocaleString()} done)
            </button>
          )}
          <button
            type="button"
            onClick={() => handleRun()}
            disabled={criteria.inclusion.filter(Boolean).length === 0}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={checkpoint
              ? { background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)" }
              : { background: "var(--brand-surface)", color: "#f4f1ea" }}
          >
            {checkpoint ? "Restart from scratch" : `Approve & Screen ~${recordCount.toLocaleString()} ${recordLabel}`}
          </button>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            {checkpoint ? "Editing criteria requires a full restart" : "Edit criteria above before screening"}
          </p>
        </div>
      </div>
    );
  }

  // ── Running: loading state with real chunked progress ─────────────────────
  if (step === "running") {
    const pct = progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : null;

    return (
      <div
        className="mt-3 rounded-lg p-4 space-y-3"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--foreground)" }}>
          <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progress
            ? `Screening ${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} ${recordLabel}…`
            : `Gathering all available ${recordLabel}…`}
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--surface)" }}>
          {pct !== null ? (
            // Real, data-driven progress once the total is known.
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ background: "var(--accent)", width: `${pct}%` }}
            />
          ) : (
            // Indeterminate sweep during the fetch phase (total not yet known).
            <div
              className="h-full rounded-full"
              style={{ background: "var(--accent)", width: "35%", animation: "progress-fill 2s ease-in-out infinite" }}
            />
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {progress
            ? `${pct}% — screening in batches; large evidence bases may take a few minutes.`
            : "Paginating every match from PubMed, OpenAlex & Scopus — this can take a moment."}
        </p>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (step === "results" && screeningResult) {
    return (
      <div
        className="mt-3 rounded-lg p-4 space-y-4"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-serif text-base" style={{ color: "var(--foreground)" }}>
              Screening results
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {screeningResult.screen_type === "reviews" ? "Existing reviews" : "Primary studies"} · Gap: {screeningResult.criteria.topic_title}
              {" · "}
              {new Date(screeningResult.run_at).toLocaleDateString("en-US", {
                year: "numeric", month: "short", day: "numeric",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // Pre-fill the criteria editor with the last run's criteria so
              // the user can tweak and re-screen instead of starting over.
              // screeningResult stays loaded so Cancel can return to it.
              setCriteria(screeningResult.criteria);
              setStep("approve");
            }}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            Adjust criteria & re-screen ↺
          </button>
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        <ScreeningResultsTable
          result={screeningResult}
          onOverride={handleOverride}
          onRefine={handleRefine}
          refining={refining}
        />
      </div>
    );
  }

  return null;
}
