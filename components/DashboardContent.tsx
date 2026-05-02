"use client";

/**
 * DashboardContent — client component for the My Searches dashboard.
 *
 * Handles:
 *  - Sort controls (newest / oldest / high feasibility first)
 *  - Per-card checkboxes for multi-topic comparison (NEW-7)
 *  - Floating "Compare selected" action bar
 *  - Side-by-side comparison modal (max 4 topics)
 *
 * The parent server component (app/dashboard/page.tsx) handles auth + data
 * fetching and passes the results as props.
 */

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { isUserBooleanQuery } from "@/lib/boolean-search";
import { deriveStudyTrend } from "@/types";
import type { FeasibilityScore, StudyTrend } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of each row returned by the dashboard Supabase query. */
export interface DashboardSearch {
  id: string;
  query_text: string;
  created_at: string;
  search_results:
    | {
        id: string;
        feasibility_score: string | null;
        gap_analysis: unknown | null;
        prospero_registrations_count: number | null;
        primary_study_count: number | null;
        recent_primary_study_count: number | null;
      }
    | Array<{
        id: string;
        feasibility_score: string | null;
        gap_analysis: unknown | null;
        prospero_registrations_count: number | null;
        primary_study_count: number | null;
        recent_primary_study_count: number | null;
      }>
    | null;
  search_alerts:
    | { is_enabled: boolean }
    | Array<{ is_enabled: boolean }>
    | null;
}

type SortMode = "newest" | "oldest" | "feasibility";

const FEASIBILITY_STYLES: Record<FeasibilityScore, string> = {
  High: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Moderate:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Low: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  Insufficient:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const FEASIBILITY_RANK: Partial<Record<FeasibilityScore, number>> = {
  High: 4,
  Moderate: 3,
  Low: 2,
  Insufficient: 1,
};

const TREND_ICONS: Record<StudyTrend, string> = {
  growing: "↑",
  stable: "→",
  declining: "↓",
};

const TREND_STYLES: Record<StudyTrend, string> = {
  growing: "text-green-600 dark:text-green-400",
  stable: "text-amber-600 dark:text-amber-400",
  declining: "text-red-600 dark:text-red-400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSortMode(raw: string | undefined): SortMode {
  if (raw === "oldest" || raw === "feasibility") return raw;
  return "newest";
}

// ---------------------------------------------------------------------------
// PREF-1: Cookie-based sort preference persistence
// ---------------------------------------------------------------------------

const SORT_COOKIE = "dashboard_sort";

/**
 * Read the stored sort preference from document.cookie.
 * Returns undefined when running server-side or when no cookie is set.
 */
function getStoredSortMode(): SortMode | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)dashboard_sort=([^;]+)/);
  return match ? parseSortMode(match[1]) : undefined;
}

/**
 * Persist the chosen sort mode in a long-lived first-party cookie.
 * 1-year TTL; SameSite=Lax for CSRF safety; no HttpOnly (client-read needed).
 */
function storeSort(mode: SortMode): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SORT_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
}

function getResult(search: DashboardSearch) {
  return Array.isArray(search.search_results)
    ? search.search_results[0]
    : search.search_results;
}

function getAlert(search: DashboardSearch) {
  return Array.isArray(search.search_alerts)
    ? search.search_alerts[0]
    : search.search_alerts;
}

function isFeasibilityScore(v: string | null | undefined): v is FeasibilityScore {
  return v === "High" || v === "Moderate" || v === "Low" || v === "Insufficient";
}

// ---------------------------------------------------------------------------
// Comparison Panel
// ---------------------------------------------------------------------------

interface ComparisonRow {
  id: string;
  query: string;
  resultId: string | null;
  feasibility: FeasibilityScore | null;
  studyCount: number | null;
  trend: StudyTrend | null;
  prosperoCount: number | null;
  date: string;
}

function buildComparisonRows(
  searches: DashboardSearch[],
  selectedIds: Set<string>
): ComparisonRow[] {
  return searches
    .filter((s) => selectedIds.has(s.id))
    .map((s) => {
      const result = getResult(s);
      const fs = result?.feasibility_score ?? null;
      const primary = result?.primary_study_count ?? null;
      const recent = result?.recent_primary_study_count ?? null;
      return {
        id: s.id,
        query: s.query_text,
        resultId: result?.id ?? null,
        feasibility: isFeasibilityScore(fs) ? fs : null,
        studyCount: primary,
        trend: primary !== null ? deriveStudyTrend(primary, recent ?? null) : null,
        prosperoCount: result?.prospero_registrations_count ?? null,
        date: new Date(s.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      };
    });
}

function ComparisonModal({
  rows,
  onClose,
}: {
  rows: ComparisonRow[];
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // PRINT-1: Mark <body> while the modal is open so print CSS targets only
  // the comparison table (everything else carries [data-screen-only]).
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("comparison-modal-open");
    return () => document.body.classList.remove("comparison-modal-open");
  }, []);

  // PRINT-1: Generated-on label shown only in the printed output.
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    /* Backdrop */
    <div
      id="comparison-modal-print-root"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Topic comparison"
    >
      <div
        className="w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden comparison-modal-card"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <h2
              className="text-lg font-bold font-serif"
              style={{ color: "var(--brand)" }}
            >
              Topic Comparison
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {rows.length} topic{rows.length !== 1 ? "s" : ""} selected
            </p>
            {/* Print-only generated-on line. Hidden on screen via .print-only. */}
            <p className="print-only text-xs mt-0.5" style={{ color: "#444" }}>
              Generated {generatedAt} · blindspot.app
            </p>
          </div>
          <div className="flex items-center gap-1" data-screen-only>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md transition-opacity hover:opacity-80"
              style={{
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                color: "var(--accent)",
                border:
                  "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                fontWeight: 500,
              }}
              aria-label="Print comparison"
              title="Print or save as PDF"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
                />
              </svg>
              Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:opacity-70 transition-opacity"
              style={{ color: "var(--muted)" }}
              aria-label="Close comparison"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Table — scrollable horizontally on mobile */}
        <div className="overflow-x-auto p-4 sm:p-6">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: "0 6px" }}>
            <thead>
              <tr>
                <th
                  className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted)" }}
                >
                  Topic
                </th>
                <th
                  className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted)" }}
                >
                  Feasibility
                </th>
                <th
                  className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted)" }}
                >
                  Studies
                </th>
                <th
                  className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted)" }}
                >
                  Trend
                </th>
                <th
                  className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted)" }}
                >
                  PROSPERO
                </th>
                <th
                  className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--muted)" }}
                >
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                return (
                  <tr
                    key={row.id}
                    className="group"
                    style={{
                      background: "var(--surface-2)",
                      borderRadius: "8px",
                    }}
                  >
                    {/* Topic */}
                    <td className="px-3 py-3 rounded-l-lg" style={{ maxWidth: "280px" }}>
                      {row.resultId ? (
                        <Link
                          href={`/results/${row.resultId}`}
                          className="font-medium hover:underline underline-offset-2 line-clamp-2"
                          style={{ color: "var(--foreground)" }}
                          onClick={onClose}
                        >
                          {row.query}
                        </Link>
                      ) : (
                        <span
                          className="font-medium line-clamp-2"
                          style={{ color: "var(--foreground)" }}
                        >
                          {row.query}
                        </span>
                      )}
                    </td>

                    {/* Feasibility */}
                    <td className="px-3 py-3 text-center">
                      {row.feasibility ? (
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${FEASIBILITY_STYLES[row.feasibility]}`}
                        >
                          {row.feasibility}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>

                    {/* Study count */}
                    <td className="px-3 py-3 text-center">
                      {row.studyCount !== null ? (
                        <span
                          className="font-medium tabular-nums"
                          style={{ color: "var(--foreground)" }}
                        >
                          {row.studyCount.toLocaleString()}
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>

                    {/* Trend */}
                    <td className="px-3 py-3 text-center">
                      {row.trend ? (
                        <span
                          className={`font-medium text-sm ${TREND_STYLES[row.trend]}`}
                          title={`${row.trend.charAt(0).toUpperCase()}${row.trend.slice(1)} — based on last 3 years vs. all-time studies`}
                        >
                          {TREND_ICONS[row.trend]}{" "}
                          <span className="text-xs capitalize">{row.trend}</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>

                    {/* PROSPERO */}
                    <td className="px-3 py-3 text-center">
                      {typeof row.prosperoCount === "number" &&
                      row.prosperoCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700"
                          title={`${row.prosperoCount} PROSPERO registration${row.prosperoCount === 1 ? "" : "s"} found`}
                        >
                          <span aria-hidden="true">⚠</span>
                          {row.prosperoCount}
                        </span>
                      ) : (
                        <span
                          className="text-xs"
                          style={{ color: "var(--muted)" }}
                          title="No PROSPERO registrations found"
                        >
                          None
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td
                      className="px-3 py-3 text-right text-xs rounded-r-lg"
                      style={{ color: "var(--muted)", whiteSpace: "nowrap" }}
                    >
                      {row.date}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer tip */}
        <div
          className="px-6 py-3 text-xs"
          style={{
            color: "var(--muted)",
            borderTop: "1px solid var(--border)",
          }}
        >
          Click a topic title to open its full results. Trend is based on studies from the last 3 years vs. total.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating action bar (shown when ≥ 2 searches are selected)
// ---------------------------------------------------------------------------

function CompareActionBar({
  count,
  onCompare,
  onClear,
}: {
  count: number;
  onCompare: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
      style={{
        background: "var(--brand-surface)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "white",
        minWidth: "280px",
      }}
      role="status"
      aria-live="polite"
      aria-label={`${count} topic${count !== 1 ? "s" : ""} selected for comparison`}
    >
      <span className="text-sm font-medium flex-1 text-white">
        {count} topic{count !== 1 ? "s" : ""} selected
      </span>
      <button
        onClick={onClear}
        className="text-xs px-2 py-1 rounded-md transition-opacity hover:opacity-70 text-white/70 hover:text-white"
        aria-label="Clear selection"
      >
        Clear
      </button>
      <button
        onClick={onCompare}
        disabled={count < 2}
        className="text-xs font-semibold px-4 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: "var(--accent)",
          color: "white",
        }}
        aria-label={`Compare ${count} selected topics`}
      >
        Compare{count >= 2 ? ` (${count})` : ""}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DashboardContent component
// ---------------------------------------------------------------------------

export interface DashboardContentProps {
  searches: DashboardSearch[];
  initialSortMode?: string;
  booleanCount: number;
}

export function DashboardContent({
  searches,
  initialSortMode,
  booleanCount,
}: DashboardContentProps) {
  // PREF-1: Initialise sort from URL param → cookie fallback → default "newest"
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    // URL param (initialSortMode) takes precedence — allows deep-linking
    if (initialSortMode === "oldest" || initialSortMode === "feasibility") {
      return initialSortMode;
    }
    // Fall back to last-used preference stored in cookie
    return getStoredSortMode() ?? "newest";
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  const MAX_SELECTIONS = 4;

  // Sort searches
  const sortedSearches = [...searches].sort((a, b) => {
    if (sortMode === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortMode === "feasibility") {
      const aResult = getResult(a);
      const bResult = getResult(b);
      const aScore = aResult?.feasibility_score as FeasibilityScore | null;
      const bScore = bResult?.feasibility_score as FeasibilityScore | null;
      const aRank = (aScore && FEASIBILITY_RANK[aScore]) ?? 0;
      const bRank = (bScore && FEASIBILITY_RANK[bScore]) ?? 0;
      if (bRank !== aRank) return bRank - aRank;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });

  const toggleSelect = useCallback(
    (searchId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(searchId)) {
          next.delete(searchId);
        } else if (next.size < MAX_SELECTIONS) {
          next.add(searchId);
        }
        // If nothing selected, close the comparison panel
        if (next.size === 0) setShowComparison(false);
        return next;
      });
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setShowComparison(false);
  }, []);

  const comparisonRows = buildComparisonRows(searches, selectedIds);

  if (searches.length === 0) {
    return (
      <div
        className="rounded-lg p-12 text-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          No searches yet.
        </p>
        <Link
          href="/"
          className="text-sm font-medium hover:opacity-70 transition-opacity underline underline-offset-2"
          style={{ color: "var(--accent)" }}
        >
          Run your first search →
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* PRINT-1: Wrapper marks the dashboard as screen-only so window.print()
          from the ComparisonModal renders only the comparison table, not the
          full dashboard underneath. */}
      <div data-screen-only>
      {/* Header row */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold font-serif"
            style={{ color: "var(--brand)" }}
          >
            My Searches
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {searches.length} search{searches.length !== 1 ? "es" : ""} saved
            {booleanCount > 0 && <span> · {booleanCount} Boolean</span>}
            {searches.length >= 2 && (
              <span className="ml-1">
                ·{" "}
                <span
                  className="italic"
                  style={{ color: "var(--accent)", opacity: 0.85 }}
                >
                  select up to {MAX_SELECTIONS} to compare
                </span>
              </span>
            )}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-white px-4 py-2 rounded-md transition-opacity hover:opacity-90"
          style={{ background: "var(--brand-surface)" }}
        >
          New Search
        </Link>
      </div>

      {/* Sort controls */}
      {searches.length > 1 && (
        <div
          className="flex items-center gap-1 mb-4 text-xs"
          role="group"
          aria-label="Sort searches by"
        >
          <span style={{ color: "var(--muted)" }} className="mr-1">
            Sort:
          </span>
          {(
            [
              { mode: "newest" as SortMode, label: "Newest" },
              { mode: "oldest" as SortMode, label: "Oldest" },
              {
                mode: "feasibility" as SortMode,
                label: "High feasibility first",
              },
            ] as { mode: SortMode; label: string }[]
          ).map(({ mode, label }) => {
            const isActive = sortMode === mode;
            return (
              <button
                key={mode}
                onClick={() => { setSortMode(mode); storeSort(mode); }}
                className="px-2.5 py-1 rounded-md transition-colors"
                style={
                  isActive
                    ? {
                        background:
                          "color-mix(in srgb, var(--accent) 15%, transparent)",
                        color: "var(--accent)",
                        border:
                          "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                        fontWeight: 500,
                      }
                    : {
                        background: "var(--surface-2, var(--background))",
                        color: "var(--muted)",
                        border: "1px solid var(--border)",
                      }
                }
                aria-pressed={isActive}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Search cards */}
      <div className="space-y-3">
        {sortedSearches.map((search) => {
          const result = getResult(search);
          const alertRow = getAlert(search);
          const feasibility = result?.feasibility_score as FeasibilityScore | null;
          const hasAnalysis = !!(result?.gap_analysis);
          const hasActiveAlert = !!(alertRow?.is_enabled);
          const prosperoCount =
            result?.prospero_registrations_count ?? null;
          const hasProsperoMatches =
            typeof prosperoCount === "number" && prosperoCount > 0;
          const isSelected = selectedIds.has(search.id);
          const isAtMax =
            selectedIds.size >= MAX_SELECTIONS && !isSelected;
          const date = new Date(search.created_at).toLocaleDateString(
            "en-US",
            {
              month: "short",
              day: "numeric",
              year: "numeric",
            }
          );

          return (
            <div
              key={search.id}
              className="rounded-lg transition-all"
              style={{
                background: "var(--surface)",
                border: isSelected
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border)",
                boxShadow: isSelected
                  ? "0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent)"
                  : undefined,
              }}
            >
              <div className="flex items-start p-5 gap-3">
                {/* Checkbox */}
                {searches.length >= 2 && (
                  <div className="flex-shrink-0 pt-0.5">
                    <label
                      className="flex items-center cursor-pointer"
                      aria-label={`Select "${search.query_text}" for comparison`}
                      title={
                        isAtMax
                          ? `Maximum ${MAX_SELECTIONS} topics can be compared at once`
                          : isSelected
                          ? "Deselect this topic"
                          : "Select to compare"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(search.id)}
                        disabled={isAtMax}
                        className="sr-only"
                        aria-checked={isSelected}
                      />
                      <span
                        className="w-4.5 h-4.5 rounded border flex items-center justify-center transition-all flex-shrink-0"
                        style={{
                          width: "18px",
                          height: "18px",
                          background: isSelected
                            ? "var(--accent)"
                            : "var(--surface-2)",
                          border: isSelected
                            ? "2px solid var(--accent)"
                            : "2px solid var(--border)",
                          opacity: isAtMax ? 0.35 : 1,
                          cursor: isAtMax ? "not-allowed" : "pointer",
                        }}
                        aria-hidden="true"
                      >
                        {isSelected && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={3}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </span>
                    </label>
                  </div>
                )}

                {/* Card content */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={result ? `/results/${result.id}` : "#"}
                    className="block hover:opacity-80 transition-opacity"
                    aria-label={`Open results for: ${search.query_text}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--foreground)" }}
                        >
                          {search.query_text}
                        </p>
                        <p
                          className="text-xs mt-1"
                          style={{ color: "var(--muted)" }}
                        >
                          {date}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {hasActiveAlert && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 flex items-center gap-1"
                            title="Weekly email alerts active"
                          >
                            <span aria-hidden="true">🔔</span>
                            <span>Monitoring</span>
                          </span>
                        )}
                        {hasProsperoMatches && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700 flex items-center gap-1"
                            title={`${prosperoCount} PROSPERO registration${prosperoCount === 1 ? "" : "s"} found`}
                            aria-label={`PROSPERO: ${prosperoCount} registration${prosperoCount === 1 ? "" : "s"} found`}
                          >
                            <span aria-hidden="true">⚠</span>
                            <span>PROSPERO</span>
                          </span>
                        )}
                        {isUserBooleanQuery(search.query_text) && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                              color: "var(--accent)",
                            }}
                            title="Boolean query"
                            aria-label="Boolean query"
                          >
                            Boolean
                          </span>
                        )}
                        {isFeasibilityScore(feasibility) && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${FEASIBILITY_STYLES[feasibility]}`}
                          >
                            {feasibility}
                          </span>
                        )}
                        {hasAnalysis ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background:
                                "color-mix(in srgb, var(--accent) 15%, transparent)",
                              color: "var(--accent)",
                              border:
                                "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                            }}
                          >
                            Analyzed
                          </span>
                        ) : (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background:
                                "var(--surface-2, var(--background))",
                              color: "var(--muted)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            No analysis
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating compare bar — visible when 1+ selected */}
      {selectedIds.size > 0 && (
        <CompareActionBar
          count={selectedIds.size}
          onCompare={() => setShowComparison(true)}
          onClear={clearSelection}
        />
      )}
      </div>{/* /data-screen-only wrapper */}

      {/* Comparison modal — kept OUTSIDE the data-screen-only wrapper so
          window.print() from inside the modal renders the comparison table. */}
      {showComparison && comparisonRows.length >= 2 && (
        <ComparisonModal
          rows={comparisonRows}
          onClose={() => setShowComparison(false)}
        />
      )}
    </>
  );
}
