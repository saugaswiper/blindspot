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

import { useState } from "react";
import type { ExistingReview, ScreeningCriteria, ScreeningDecision, ScreeningReasonCode, ScreeningResult } from "@/types";
import { downloadTextFile } from "@/lib/citation-export";

// ---------------------------------------------------------------------------
// Decision badge helpers
// ---------------------------------------------------------------------------

const DECISION_STYLES = {
  include: {
    badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600",
    row: "border-l-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20",
    icon: "✓",
    label: "Include",
  },
  exclude: {
    badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600",
    row: "border-l-2 border-red-400 dark:border-red-600 bg-red-50/40 dark:bg-red-950/20",
    icon: "✕",
    label: "Exclude",
  },
  uncertain: {
    badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600",
    row: "border-l-2 border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/20",
    icon: "?",
    label: "Uncertain",
  },
};

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
      className="inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0"
      style={{
        background: "rgba(239,68,68,0.08)",
        color: "#b91c1c",
        border: "1px solid rgba(239,68,68,0.25)",
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
  high:   { dot: "#10b981", label: "High confidence" },
  medium: { dot: "#f59e0b", label: "Medium confidence" },
  low:    { dot: "#ef4444", label: "Low confidence — review recommended" },
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

function buildCsv(decisions: ScreeningDecision[], criteria: ScreeningResult["criteria"]): string {
  const header = ["Title", "Year", "Journal", "Decision", "Confidence", "Reason Code", "Reason"].join(",");
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
      escape(d.confidence ?? ""),
      escape(d.reason_code ?? ""),
      escape(d.reason),
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
// Criteria editor helpers
// ---------------------------------------------------------------------------

function CriteriaList({
  title,
  items,
  colorClass,
  onChange,
}: {
  title: string;
  items: string[];
  colorClass: string;
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
            <span className={`mt-2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold border shrink-0 ${colorClass}`}>
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

type FilterMode = "all" | "include" | "exclude" | "uncertain";

function ScreeningResultsTable({ result }: { result: ScreeningResult }) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const { decisions, included_count, excluded_count, uncertain_count, criteria } = result;
  const total = decisions.length;
  const lowConfidenceCount = decisions.filter((d) => d.confidence === "low").length;

  const filtered = filter === "all" ? decisions : decisions.filter((d) => d.decision === filter);

  function handleDownloadCsv() {
    const csv = buildCsv(decisions, criteria);
    const slug = criteria.topic_title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    downloadTextFile(csv, `screening-${slug}.csv`, "text/csv");
  }

  return (
    <div className="space-y-4">
      {/* Summary counts + CSV download */}
      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            { key: "all",       label: `All (${total})`,                 cls: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700" },
            { key: "include",   label: `✓ Include (${included_count})`,   cls: DECISION_STYLES.include.badge },
            { key: "exclude",   label: `✕ Exclude (${excluded_count})`,   cls: DECISION_STYLES.exclude.badge },
            { key: "uncertain", label: `? Uncertain (${uncertain_count})`, cls: DECISION_STYLES.uncertain.badge },
          ] as { key: FilterMode; label: string; cls: string }[]
        ).map(({ key, label, cls }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-opacity ${cls} ${filter === key ? "ring-2 ring-offset-1 ring-current" : "hover:opacity-80"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={handleDownloadCsv}
          className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-opacity hover:opacity-80"
          style={{ color: "var(--foreground)", border: "1px solid var(--border)", background: "var(--surface-2)" }}
          title="Download decisions as CSV"
        >
          ↓ CSV
        </button>
      </div>

      {/* Low-confidence warning */}
      {lowConfidenceCount > 0 && (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
          {lowConfidenceCount} decision{lowConfidenceCount !== 1 ? "s" : ""} flagged as low confidence — verify these with full-text review.
        </p>
      )}

      {/* Criteria reminder */}
      <details className="text-xs" style={{ color: "var(--muted)" }}>
        <summary className="cursor-pointer select-none hover:opacity-80 transition-opacity" style={{ color: "var(--accent)" }}>
          View screening criteria used ↓
        </summary>
        <div className="mt-2 p-3 rounded-md space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <p className="font-medium" style={{ color: "var(--foreground)" }}>Gap focus: {criteria.focus_gap}</p>
          <div>
            <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">Inclusion</p>
            <ul className="list-disc list-inside space-y-0.5">
              {criteria.inclusion.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-red-600 dark:text-red-400 mb-0.5">Exclusion</p>
            <ul className="list-disc list-inside space-y-0.5">
              {criteria.exclusion.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        </div>
      </details>

      {/* Results list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
            No reviews match this filter.
          </p>
        ) : (
          filtered.map((d, i) => {
            const style = DECISION_STYLES[d.decision];
            const isExpanded = expandedIndex === i;
            const linkUrl = d.pmid
              ? `https://pubmed.ncbi.nlm.nih.gov/${d.pmid}/`
              : d.doi
              ? `https://doi.org/${d.doi}`
              : null;

            return (
              <div
                key={i}
                className={`rounded-md px-3 py-2.5 ${style.row}`}
                style={{ background: "var(--surface)" }}
              >
                <div className="flex items-start gap-2">
                  {/* Decision badge */}
                  <span
                    className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border ${style.badge}`}
                    aria-label={style.label}
                  >
                    {style.icon}
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
                    </div>

                    {/* Reason — toggle on click */}
                    <button
                      type="button"
                      onClick={() => setExpandedIndex(isExpanded ? null : i)}
                      className="text-[11px] mt-1 transition-opacity hover:opacity-70 text-left"
                      style={{ color: "var(--accent)" }}
                    >
                      {isExpanded ? "Hide reasoning ↑" : "Why? ↓"}
                    </button>
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
                                      <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${cr.type === "inclusion" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400"}`}>
                                        {cr.type}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1 text-center align-top font-bold">
                                      <span className={cr.met ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
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
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
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

  async function handleRun() {
    if (!criteria) return;
    setStep("running");
    setError(null);
    setProgress(null);

    try {
      // ── Phase 1: fetch every available record ──────────────────────────────
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

      const records = fetchData.records;
      const total = records.length;
      if (total === 0) {
        setError(`No ${recordLabel} found to screen.`);
        setStep("approve");
        return;
      }

      // ── Phase 2: screen in chunks, accumulating decisions ──────────────────
      setProgress({ processed: 0, total });
      const allDecisions: ScreeningDecision[] = [];

      for (let start = 0; start < total; start += CHUNK_SIZE) {
        const chunk = records.slice(start, start + CHUNK_SIZE);
        const runRes = await fetch("/api/screening/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ criteria, records: chunk }),
        });
        const runData = (await runRes.json()) as { decisions?: ScreeningDecision[]; error?: string };
        if (!runRes.ok || runData.error || !runData.decisions) {
          setError(runData.error ?? "Screening failed partway through. Please try again.");
          setStep("approve");
          setProgress(null);
          return;
        }
        allDecisions.push(...runData.decisions);
        setProgress({ processed: Math.min(start + CHUNK_SIZE, total), total });
      }

      // ── Phase 3: assemble + persist the final result ───────────────────────
      const assembled: ScreeningResult = {
        criteria,
        decisions: allDecisions,
        included_count: allDecisions.filter((d) => d.decision === "include").length,
        excluded_count: allDecisions.filter((d) => d.decision === "exclude").length,
        uncertain_count: allDecisions.filter((d) => d.decision === "uncertain").length,
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
          Screen {recordCount.toLocaleString()} {recordLabel} for this gap
        </button>
        {error && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
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
          <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Screening criteria for: <span style={{ color: "var(--accent)" }}>{topicTitle}</span>
          </p>
          <button
            type="button"
            onClick={() => { setStep("idle"); setCriteria(null); }}
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
          colorClass="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-600"
          onChange={(next) => setCriteria({ ...criteria, inclusion: next })}
        />

        <CriteriaList
          title="Exclusion"
          items={criteria.exclusion}
          colorClass="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600"
          onChange={(next) => setCriteria({ ...criteria, exclusion: next })}
        />

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleRun}
            disabled={criteria.inclusion.filter(Boolean).length === 0}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--brand-surface)", color: "#f4f1ea" }}
          >
            Approve & Screen {recordCount.toLocaleString()} {recordLabel}
          </button>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            Edit criteria above before screening
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
            <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
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
              setStep("idle");
              setScreeningResult(null);
              setCriteria(null);
            }}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            Re-screen ↺
          </button>
        </div>

        <ScreeningResultsTable result={screeningResult} />
      </div>
    );
  }

  return null;
}
