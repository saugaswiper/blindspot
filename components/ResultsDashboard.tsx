"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import type {
  ExistingReview,
  FeasibilityScore,
  GapAnalysis,
  StudyDesignRecommendation,
  GapDimension,
  StudyTrend,
} from "@/types";
import { PrintableReport } from "@/components/PrintableReport";
import { AlertSubscription } from "@/components/AlertSubscription";
import { toRis, toBibtex, downloadTextFile } from "@/lib/citation-export";
import { sanitizeBooleanString, looksLikeBooleanString, buildPubMedUrl } from "@/lib/boolean-search";
import { formatProsperoWarning, formatProsperoStatus } from "@/lib/prospero";
import { getPerGapBadgeConfig } from "@/lib/gap-badge";
import { getCacheFreshnessStatus, formatResultAge } from "@/lib/cache-freshness";
import { computePrimaryStudyPrismaData, type PrimaryStudyPrismaData, type ScreeningCriteria } from "@/lib/prisma-diagram";
import {
  ALL_DIMENSIONS,
  DIMENSION_LABELS,
  toggleDimension,
  resetFilter,
  filterGapsByDimensions,
  filterTopicsByDimensions,
  countByDimension,
  isUnfiltered,
} from "@/lib/gap-filter";
import { deriveRelatedSearches, cleanPubMedQuery } from "@/lib/related-searches";
import type { RelatedSearch } from "@/lib/related-searches";
import { shouldIgnoreKeyEvent } from "@/lib/keyboard-shortcuts";
import { KeyboardShortcutsHelp, ShortcutsButton, ShortcutsDiscoveryTooltip } from "@/components/KeyboardShortcutsHelp";
import { deriveProtocolFilename, hasStoredProtocol } from "@/lib/protocol-storage";
import { downloadProsperoRegistration, type ProsperoRegistration } from "@/lib/prospero-export";
import { InsufficientEvidencePanel } from "@/components/InsufficientEvidencePanel";

const FEASIBILITY_STYLES: Record<FeasibilityScore, string> = {
  High: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-medium",
  Moderate: "bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-medium",
  Low: "bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-700 font-medium",
  Insufficient: "bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700 font-medium",
};

const FEASIBILITY_ICONS: Record<FeasibilityScore, string> = {
  High: "●",
  Moderate: "◑",
  Low: "◔",
  Insufficient: "○",
};

const GAP_LABELS: Record<GapDimension, string> = {
  population: "Population",
  methodology: "Methodological",
  outcome: "Outcome",
  geographic: "Geographic",
  temporal: "Temporal",
  theoretical: "Theoretical",
};

const IMPORTANCE_STYLES = {
  high: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800 font-medium",
  medium: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
  low: "bg-stone-50 dark:bg-stone-800/60 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-700",
};

/**
 * ACC-3: Derives an AI confidence label and color scheme from the number of
 * existing reviews Gemini analyzed (capped at 20 by the prompt builder).
 *
 * Tiers (from market research spec/026-market-research.md):
 *   ≥ 20 → High Confidence
 *   10–19 → Moderate Confidence
 *   5–9  → Low Confidence
 *   < 5  → Very Low Confidence
 */
function getAnalysisConfidence(reviewsAnalyzedCount: number): {
  label: string;
  badgeClass: string;
  tooltip: string;
} {
  if (reviewsAnalyzedCount >= 20) {
    return {
      label: "High Confidence",
      badgeClass: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-600",
      tooltip: `Based on ${reviewsAnalyzedCount} existing reviews analyzed by AI.`,
    };
  }
  if (reviewsAnalyzedCount >= 10) {
    return {
      label: "Moderate Confidence",
      badgeClass: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600",
      tooltip: `Based on ${reviewsAnalyzedCount} existing reviews analyzed by AI. More reviews would increase confidence.`,
    };
  }
  if (reviewsAnalyzedCount >= 5) {
    return {
      label: "Low Confidence",
      badgeClass: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-600",
      tooltip: `Based on only ${reviewsAnalyzedCount} existing reviews analyzed by AI. Interpret gaps with caution.`,
    };
  }
  return {
    label: "Very Low Confidence",
    badgeClass: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-600",
    tooltip: `Based on only ${reviewsAnalyzedCount} existing review${reviewsAnalyzedCount === 1 ? "" : "s"} analyzed by AI. Results should be interpreted with significant caution.`,
  };
}

const SOURCE_STYLES: Record<string, string> = {
  PubMed: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  OpenAlex: "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  "Europe PMC": "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  "Semantic Scholar": "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
};

/**
 * NEW-2: Visual styles and labels for the study trend indicator.
 * "growing" = large share of recent publications → emerging field
 * "stable"  = typical publication rate
 * "declining" = few recent publications → mature or waning field
 */
const STUDY_TREND_CONFIG: Record<
  StudyTrend,
  { icon: string; label: string; colorClass: string; tooltip: string }
> = {
  growing: {
    icon: "↑",
    label: "Growing",
    colorClass: "text-emerald-700 dark:text-emerald-400",
    tooltip: "More than 35% of primary studies on this topic were published in the last 3 years — this is an actively expanding research field.",
  },
  stable: {
    icon: "→",
    label: "Stable",
    colorClass: "text-amber-700 dark:text-amber-400",
    tooltip: "15–34% of primary studies on this topic were published in the last 3 years — this field is publishing at a steady rate.",
  },
  declining: {
    icon: "↓",
    label: "Declining",
    colorClass: "text-slate-500 dark:text-slate-400",
    tooltip: "Fewer than 15% of primary studies on this topic were published in the last 3 years — publication in this field may be slowing.",
  },
};

/**
 * UI-1: Per-source study count breakdown.
 *
 * Shows an expandable inline detail below the "primary studies" metric:
 *   PubMed: 67 · OpenAlex: 81 · Europe PMC: 43
 *
 * Only rendered when at least one of the three source counts is non-null
 * (i.e. the result was created after migration 012 and all relevant APIs
 * responded successfully).
 */
function SourceBreakdown({
  pubmedCount,
  openalexCount,
  europepmcCount,
}: {
  pubmedCount: number | null | undefined;
  openalexCount: number | null | undefined;
  europepmcCount: number | null | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  // Only render when at least one source count is available
  const hasAny =
    pubmedCount !== null && pubmedCount !== undefined ||
    openalexCount !== null && openalexCount !== undefined ||
    europepmcCount !== null && europepmcCount !== undefined;

  if (!hasAny) return null;

  const entries: { label: string; count: number }[] = [];
  if (pubmedCount !== null && pubmedCount !== undefined) entries.push({ label: "PubMed", count: pubmedCount });
  if (openalexCount !== null && openalexCount !== undefined) entries.push({ label: "OpenAlex", count: openalexCount });
  if (europepmcCount !== null && europepmcCount !== undefined) entries.push({ label: "Europe PMC", count: europepmcCount });

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-1 text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--accent)" }}
        aria-label="Show per-database study counts"
      >
        Sources ↓
      </button>
    );
  }

  return (
    <div className="mt-1.5">
      <div
        className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs"
        aria-label="Study counts by database"
      >
        {entries.map(({ label, count }, i) => (
          <span key={label} style={{ color: "var(--muted)" }}>
            <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{label}:</span>{" "}
            {count.toLocaleString("en-US")}
            {i < entries.length - 1 && <span aria-hidden="true"> ·</span>}
          </span>
        ))}
      </div>
      <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--muted)" }}>
        Primary studies only (systematic reviews excluded). Counts may overlap across sources before deduplication.
      </p>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="mt-0.5 text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--accent)" }}
        aria-label="Hide per-database study counts"
      >
        Hide ↑
      </button>
    </div>
  );
}

/**
 * UI-2: "Why This Score?" Explainer
 *
 * A small "?" button that toggles an inline popover explaining the feasibility
 * scoring methodology. Rendered adjacent to the feasibility badge in the
 * metrics header.
 *
 * Uses a click-outside handler to dismiss the popover.
 */
function FeasibilityExplainer() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Why this score? Learn how feasibility is calculated"
        aria-expanded={open}
        className="ml-1.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors"
        style={{
          background: "var(--surface-2)",
          color: "var(--muted)",
          border: "1px solid var(--border)",
        }}
      >
        ?
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-6 z-50 w-72 rounded-lg p-4 shadow-lg text-xs leading-relaxed"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        >
          <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>
            How feasibility is calculated
          </p>
          <p className="mb-2" style={{ color: "var(--muted)" }}>
            Blindspot counts primary studies (excluding systematic reviews) across
            PubMed, OpenAlex, and Europe PMC. The score is based on real database
            queries — not AI estimation.
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th className="text-left pb-1 font-medium">Score</th>
                <th className="text-left pb-1 font-medium">Studies found</th>
                <th className="text-left pb-1 font-medium">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
              <tr>
                <td className="py-1 pr-2 font-medium text-emerald-700 dark:text-emerald-400">High</td>
                <td className="py-1 pr-2">11+</td>
                <td className="py-1">Systematic review or meta-analysis</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 font-medium text-amber-700 dark:text-amber-400">Moderate</td>
                <td className="py-1 pr-2">6–10</td>
                <td className="py-1">Systematic review with narrative synthesis</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 font-medium text-orange-700 dark:text-orange-400">Low</td>
                <td className="py-1 pr-2">3–5</td>
                <td className="py-1">Scoping review first</td>
              </tr>
              <tr>
                <td className="py-1 pr-2 font-medium text-red-700 dark:text-red-400">Insufficient</td>
                <td className="py-1 pr-2">&lt; 3</td>
                <td className="py-1">Primary research needed</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2" style={{ color: "var(--muted)", fontSize: "10px" }}>
            Thresholds are aligned with Cochrane Handbook recommendations for systematic review methodology.
          </p>
        </div>
      )}
    </div>
  );
}

type Tab = "reviews" | "gaps" | "design" | "prisma";

interface Props {
  resultId: string;
  searchId?: string;
  query: string;
  existingReviews: ExistingReview[];
  primaryStudyCount: number;
  /**
   * Number of registered trials on ClinicalTrials.gov for this query.
   * Null means the data was unavailable when the search ran (API down, or
   * pre-migration result). In that case the metric is hidden rather than
   * shown as 0.
   */
  clinicalTrialsCount?: number | null;
  /**
   * Number of systematic reviews registered on PROSPERO for this query.
   * Null means the data was unavailable when the search ran (API down, or
   * pre-migration result). In that case the metric is hidden.
   */
  prosperoRegistrationsCount?: number | null;
  feasibilityScore: FeasibilityScore | null;
  feasibilityExplanation: string | null;
  gapAnalysis: GapAnalysis | null;
  studyDesign: StudyDesignRecommendation | null;
  /** True when the logged-in user is the owner of this result. */
  isOwner?: boolean;
  /** Current public-sharing state (owner can toggle; public viewers see it as read-only). */
  isPublic?: boolean;
  /**
   * Number of cross-database duplicate records removed during deduplication.
   * Null for results stored before migration 007 (pre-existing rows). When
   * non-null, the PRISMA diagram shows a proper PRISMA 2020 "Duplicates removed"
   * side-box and a "Records identified" total.
   */
  deduplicationCount?: number | null;
  /**
   * NEW-2: Whether the research field is growing, stable, or declining.
   * Derived from primary_study_count vs recent_primary_study_count (last 3 yrs).
   * Null when the recent count is unavailable (pre-v030 result or API failure).
   */
  studyTrend?: StudyTrend | null;
  /**
   * UI-1: Individual per-source primary study counts.
   * Null when the source API was unavailable or the result predates migration 012.
   * Shown as an expandable breakdown below the main primary studies metric.
   */
  pubmedCount?: number | null;
  openalexCount?: number | null;
  europepmcCount?: number | null;
  /**
   * Previously-generated protocol draft text (from `search_results.protocol_draft`).
   * When non-null, ProtocolBlock skips the generate-prompt CTA and shows the
   * stored draft immediately. Null means no protocol has been generated yet.
   */
  protocolDraft?: string | null;
  /** Whether the owner is subscribed to email alerts for this search. */
  isAlertSubscribed?: boolean;
  /**
   * UI-3: ISO 8601 timestamp when this result was originally created.
   * When provided, the dashboard shows a "Last checked" indicator and a
   * prominent stale warning if the result is older than 30 days.
   * Absent for results loaded via the inline search flow (which are always fresh).
   */
  createdAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Public viewer banner with copy-link                                        */
/* -------------------------------------------------------------------------- */

function PublicViewerBanner({ query }: { query: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — silently skip */
    }
  }

  return (
    <div
      className="mb-5 rounded-lg px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      style={{ background: "var(--brand-surface)", color: "#f4f1ea" }}
    >
      <div>
        <p className="text-sm font-semibold">You&apos;re viewing a shared Blindspot report.</p>
        <p className="text-xs mt-0.5" style={{ opacity: 0.7 }}>
          Run your own gap analysis on <em>{query}</em> or any other topic.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleCopy}
          className="text-xs font-medium px-3 py-1.5 rounded-md transition-opacity hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.15)", color: "#f4f1ea" }}
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <a
          href="/signup"
          className="text-sm font-semibold px-4 py-2 rounded-md transition-opacity hover:opacity-90 whitespace-nowrap"
          style={{ background: "var(--surface)", color: "var(--brand)" }}
        >
          Sign up free →
        </a>
      </div>
    </div>
  );
}

export function ResultsDashboard({
  resultId,
  searchId = "",
  query,
  existingReviews,
  primaryStudyCount,
  clinicalTrialsCount = null,
  prosperoRegistrationsCount = null,
  deduplicationCount = null,
  studyTrend = null,
  pubmedCount = null,
  openalexCount = null,
  europepmcCount = null,
  feasibilityScore,
  feasibilityExplanation,
  gapAnalysis,
  studyDesign,
  isOwner = false,
  isPublic = false,
  protocolDraft = null,
  isAlertSubscribed = false,
  createdAt,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("reviews");
  const [isPending, startTransition] = useTransition();
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [localGapAnalysis] = useState(gapAnalysis);
  const [localStudyDesign] = useState(studyDesign);
  const [localFeasibilityScore] = useState(feasibilityScore);
  const [localFeasibilityExplanation] = useState(feasibilityExplanation);

  // Sharing state
  const [localIsPublic, setLocalIsPublic] = useState(isPublic);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Keyboard shortcuts help overlay
  const [showShortcuts, setShowShortcuts] = useState(false);

  async function handleToggleShare() {
    if (isSharing) return;
    setIsSharing(true);
    setShareToast(null);
    try {
      const res = await fetch(`/api/share/${resultId}`, { method: "POST" });
      const data = (await res.json()) as { is_public?: boolean; error?: string };
      if (!res.ok || data.error) {
        setShareToast(data.error ?? "Failed to update sharing. Please try again.");
        return;
      }
      const nowPublic = data.is_public ?? false;
      setLocalIsPublic(nowPublic);
      if (nowPublic) {
        // Copy the page URL to clipboard
        try {
          await navigator.clipboard.writeText(window.location.href);
          setShareToast("Link copied to clipboard! Anyone with the link can view this report.");
        } catch {
          setShareToast("Sharing enabled. Copy this page URL to share your report.");
        }
      } else {
        setShareToast("Link removed. This report is now private.");
      }
    } catch {
      setShareToast("Something went wrong. Please try again.");
    } finally {
      setIsSharing(false);
      // Auto-dismiss toast after 4 s
      setTimeout(() => setShareToast(null), 4000);
    }
  }

  async function runAnalysis() {
    setAnalysisError(null);
    startTransition(async () => {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId }),
      });
      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok || data.error) {
        // insufficient_evidence is a special error type that gets caught and displayed as InsufficientEvidencePanel
        setAnalysisError(data.error ?? "Analysis failed. Please try again.");
        return;
      }

      // Reload the page to get fresh data from Supabase
      window.location.reload();
    });
  }

  const hasAnalysis = !!(localGapAnalysis && localStudyDesign && localFeasibilityScore);

  // Keyboard shortcuts handler
  const handleKeyboardShortcut = useCallback(
    (e: KeyboardEvent) => {
      if (
        shouldIgnoreKeyEvent({
          target: e.target as HTMLElement | null,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
        })
      )
        return;

      switch (e.key) {
        case "1":
          e.preventDefault();
          setActiveTab("reviews");
          break;
        case "2":
          e.preventDefault();
          setActiveTab("gaps");
          break;
        case "3":
          e.preventDefault();
          setActiveTab("design");
          break;
        case "4":
          e.preventDefault();
          setActiveTab("prisma");
          break;
        case "r":
        case "R":
          if (isOwner && !hasAnalysis && !isPending) {
            e.preventDefault();
            void runAnalysis();
          }
          break;
        case "d":
        case "D":
          if (hasAnalysis) {
            e.preventDefault();
            window.print();
          }
          break;
        case "s":
        case "S":
          if (isOwner) {
            e.preventDefault();
            void handleToggleShare();
          }
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        case "Escape":
          if (showShortcuts) {
            e.preventDefault();
            setShowShortcuts(false);
          }
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOwner, hasAnalysis, isPending, showShortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyboardShortcut);
    return () => document.removeEventListener("keydown", handleKeyboardShortcut);
  }, [handleKeyboardShortcut]);

  // Extract top gaps for the summary header
  const topGaps = localGapAnalysis?.gaps
    .filter((g) => g.importance === "high")
    .slice(0, 3) ?? [];

  // NEW-1: Compute persistent PROSPERO badge status once, outside JSX
  const prosperoStatus =
    prosperoRegistrationsCount !== null && prosperoRegistrationsCount !== undefined
      ? formatProsperoStatus(prosperoRegistrationsCount)
      : null;

  // UI-3: Compute cache freshness when a createdAt timestamp is available.
  // null means the prop was not provided (inline search flow — always fresh).
  const freshness = createdAt ? getCacheFreshnessStatus(createdAt) : null;
  const resultAge = createdAt ? formatResultAge(createdAt) : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "reviews", label: `Existing Reviews (${existingReviews.length})` },
    { key: "gaps", label: "Gap Analysis" },
    { key: "design", label: "Study Design" },
    { key: "prisma", label: "PRISMA Flow" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">

      {/* Public viewer CTA banner — shown to non-owners viewing a shared result */}
      {!isOwner && localIsPublic && (
        <PublicViewerBanner query={query} />
      )}

    <div data-screen-content>
      {/* Header */}
      <div className="rounded-lg p-4 sm:p-6 mb-6" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-3">
          <p className="text-xs uppercase tracking-[0.15em]" style={{ color: "var(--muted)" }}>Topic searched</p>
          <a
            href={`/?q=${encodeURIComponent(query)}`}
            className="text-xs transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
            title="Start a new search with this query"
          >
            ← New search
          </a>
        </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Keyboard shortcuts button + one-time discovery tooltip */}
            <div className="relative">
              <ShortcutsButton onClick={() => setShowShortcuts((v) => !v)} />
              <ShortcutsDiscoveryTooltip onOpenShortcuts={() => setShowShortcuts(true)} />
            </div>

          {/* Share button — only visible to the owner */}
          {isOwner && (
            <div className="relative flex flex-col items-end gap-1 shrink-0">
              <button
                onClick={handleToggleShare}
                disabled={isSharing}
                aria-pressed={localIsPublic}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all disabled:opacity-50"
              style={{
                border: "1px solid var(--border)",
                color: localIsPublic ? "var(--accent)" : "var(--muted)",
                background: localIsPublic ? "var(--surface-2)" : "transparent",
              }}
              >
                {/* Share icon */}
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
                  />
                </svg>
                {isSharing ? "Updating…" : localIsPublic ? "Shared" : "Share"}
              </button>
              {/* Toast notification */}
              {shareToast && (
                <p className="text-xs max-w-[220px] text-right leading-tight" style={{ color: "var(--muted)" }}>
                  {shareToast}
                </p>
              )}
            </div>
          )}
          </div>{/* end flex items-center gap-2 wrapper */}
        </div>
        <h1 className="font-serif text-lg sm:text-xl break-words" style={{ color: "var(--foreground)" }}>{query}</h1>

        {/* Key metrics row */}
        <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap items-start gap-4 sm:gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.15em] mb-1" style={{ color: "var(--muted)" }}>Primary studies</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{primaryStudyCount.toLocaleString("en-US")}</p>
              {/* NEW-2: Study trend indicator */}
              {studyTrend !== null && studyTrend !== undefined && (
                <span
                  className={`text-xs font-semibold ${STUDY_TREND_CONFIG[studyTrend].colorClass}`}
                  title={STUDY_TREND_CONFIG[studyTrend].tooltip}
                  aria-label={`Field trend: ${STUDY_TREND_CONFIG[studyTrend].label}`}
                >
                  {STUDY_TREND_CONFIG[studyTrend].icon} {STUDY_TREND_CONFIG[studyTrend].label}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>primary studies</p>
            {/* UI-1: Per-source breakdown — only shown when at least one source count is available */}
            <SourceBreakdown pubmedCount={pubmedCount} openalexCount={openalexCount} europepmcCount={europepmcCount} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.15em] mb-1" style={{ color: "var(--muted)" }}>Existing reviews</p>
            <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{existingReviews.length}</p>
          </div>
          {/* ClinicalTrials.gov count — only shown when data is available (non-null) */}
          {clinicalTrialsCount !== null && clinicalTrialsCount !== undefined && (
            <div>
              <p className="text-xs uppercase tracking-[0.15em] mb-1" style={{ color: "var(--muted)" }}>
                Registered trials
              </p>
              <a
                href={`https://clinicaltrials.gov/search?term=${encodeURIComponent(query)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 group"
                title="View on ClinicalTrials.gov"
              >
                <p className="text-2xl font-bold transition-colors group-hover:opacity-70" style={{ color: "var(--foreground)" }}>
                  {clinicalTrialsCount.toLocaleString("en-US")}
                </p>
                {/* External link icon */}
                <svg
                  className="w-3.5 h-3.5 mt-1 shrink-0 transition-opacity group-hover:opacity-70"
                  style={{ color: "var(--muted)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
              </a>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                via ClinicalTrials.gov
              </p>
            </div>
          )}
          {/* NEW-1: Persistent PROSPERO indicator — always shown when count is non-null */}
          {prosperoStatus !== null && (
            <div>
              <p className="text-xs uppercase tracking-[0.15em] mb-1" style={{ color: "var(--muted)" }}>PROSPERO</p>
              <a
                href={`https://www.crd.york.ac.uk/prospero/display_record.php?RecordID=&SearchTerm=${encodeURIComponent(query)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${
                  prosperoStatus.hasMatch
                    ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700"
                    : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
                }`}
                title={
                  prosperoStatus.hasMatch
                    ? "Possible conflicts in PROSPERO — click to check the registry"
                    : "No registered systematic reviews found in PROSPERO for this topic"
                }
                aria-label={`PROSPERO registry check: ${prosperoStatus.label}`}
              >
                <span aria-hidden="true">{prosperoStatus.hasMatch ? "⚠" : "✓"}</span>
                {prosperoStatus.label}
              </a>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>registry check</p>
            </div>
          )}
          {localFeasibilityScore && (
            <div>
              {/* UI-2: Label row with "Why This Score?" explainer */}
              <div className="flex items-center gap-0.5 mb-1">
                <p className="text-xs uppercase tracking-[0.15em]" style={{ color: "var(--muted)" }}>Feasibility</p>
                <FeasibilityExplainer />
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${FEASIBILITY_STYLES[localFeasibilityScore]}`}>
                <span className="text-xs">{FEASIBILITY_ICONS[localFeasibilityScore]}</span>
                {localFeasibilityScore}
              </span>
            </div>
          )}
        </div>

        {localFeasibilityExplanation && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{localFeasibilityExplanation}</p>
        )}

        {/* PROSPERO detail banner — shown only when matches > 0, provides action context.
            The compact persistent badge in the metrics row above always shows
            the status (✓ No match or ⚠ N matches) regardless of count. */}
        {prosperoRegistrationsCount !== null && prosperoRegistrationsCount !== undefined && prosperoRegistrationsCount > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md">
            <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
              {formatProsperoWarning(prosperoRegistrationsCount)}
            </p>
            <a
              href="https://www.crd.york.ac.uk/prospero/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-yellow-700 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-200 underline mt-1.5 inline-flex items-center gap-1"
            >
              Check PROSPERO registry
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </a>
          </div>
        )}

        {/* UI-3: Cache freshness indicator
            - All results: subtle "Last checked N days ago" footer line
            - Stale (>30 days): amber warning banner with a "Re-run search" link
            - Aging (7–30 days): no banner, just the footer line
            - Fresh (<7 days) or createdAt absent: no indicator shown */}
        {resultAge && freshness && (
          <>
            {/* Stale warning banner — only shown when > 30 days old */}
            {freshness === "stale" && (
              <div
                className="mt-4 p-3 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
                role="status"
                aria-label="Stale search result warning"
              >
                <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>
                  <span className="font-medium" style={{ color: "var(--foreground)" }}>
                    ⚠ Results from {resultAge}
                  </span>
                  {" "}— study counts may have changed since this search was run.
                </p>
                <a
                  href={`/?q=${encodeURIComponent(query)}`}
                  className="shrink-0 text-xs font-medium px-3 py-1.5 rounded transition-opacity hover:opacity-80 whitespace-nowrap"
                  style={{
                    background: "var(--brand-surface)",
                    color: "#f4f1ea",
                  }}
                  title="Run a new search with this topic to get updated results"
                >
                  Re-run search
                </a>
              </div>
            )}

            {/* Subtle "last checked" footer — shown for aging and stale results only */}
            {(freshness === "aging" || freshness === "stale") && (
              <p
                className="mt-2 text-[10px]"
                style={{ color: "var(--muted)" }}
                aria-label={`Result last checked ${resultAge}`}
              >
                Last checked {resultAge}
              </p>
            )}
          </>
        )}

        {/* Top gaps quick summary */}
        {topGaps.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide mb-1.5">Key gaps identified</p>
            <div className="flex flex-wrap gap-2">
              {topGaps.map((gap, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-700 rounded-full px-2.5 py-0.5">
                  {GAP_LABELS[gap.dimension]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Analyze / Download buttons */}
        <div className="mt-4">
          {isOwner && !hasAnalysis && !isPending && (
            <>
              <button
                onClick={runAnalysis}
                disabled={localFeasibilityScore === "Insufficient"}
                className="px-4 py-2 text-sm font-medium rounded-md transition-all"
                style={
                  localFeasibilityScore === "Insufficient"
                    ? { background: "var(--surface-2)", color: "var(--muted)", cursor: "not-allowed", opacity: 0.6 }
                    : { background: "var(--brand-surface)", color: "#f4f1ea" }
                }
              >
                Run AI Gap Analysis
              </button>
              {localFeasibilityScore === "Insufficient" && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Analysis is not available for topics with insufficient evidence (fewer than 3 studies).
                </p>
              )}
            </>
          )}
          {!isOwner && !hasAnalysis && (
            <a
              href="/signup"
              className="inline-block px-4 py-2 text-sm font-medium rounded-md transition-opacity hover:opacity-90"
              style={{ background: "var(--brand-surface)", color: "#f4f1ea" }}
            >
              Sign up free to run AI analysis
            </a>
          )}
          {isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Analyzing with AI…</span>
                <span>~20 seconds</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    background: "var(--accent)",
                    animation: "progress-fill 22s cubic-bezier(0.1, 0, 0.4, 1) forwards",
                  }}
                />
              </div>
            </div>
          )}
          {hasAnalysis && (
            <button
              onClick={() => window.print()}
              className="px-4 py-2 text-sm font-medium rounded-md transition-all hover:opacity-90"
              style={{ border: "1px solid var(--border)", color: "var(--foreground)", background: "transparent" }}
            >
              Download PDF
            </button>
          )}
        </div>
        {analysisError && (
          <p className="mt-2 text-sm text-red-600">{analysisError}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
        <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }}>
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="shrink-0 px-3 sm:px-5 py-3 text-xs sm:text-sm transition-colors whitespace-nowrap"
              style={{
                fontWeight: activeTab === key ? 600 : 400,
                color: activeTab === key ? "var(--foreground)" : "var(--muted)",
                borderBottom: activeTab === key ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === "reviews" && (
            <ReviewsTab reviews={existingReviews} />
          )}
          {activeTab === "gaps" && (
            <GapsTab gapAnalysis={localGapAnalysis} isPending={isPending} onAnalyze={runAnalysis} error={analysisError} resultId={resultId} isOwner={isOwner} protocolDraft={protocolDraft} primaryStudyCount={primaryStudyCount} feasibilityScore={localFeasibilityScore} query={query} />
          )}
          {activeTab === "design" && (
            <DesignTab studyDesign={localStudyDesign} gapAnalysis={localGapAnalysis} feasibilityScore={localFeasibilityScore} isPending={isPending} onAnalyze={runAnalysis} error={analysisError} isOwner={isOwner} />
          )}
          {activeTab === "prisma" && (
            <PrismaFlowTab
              existingReviews={existingReviews}
              primaryStudyCount={primaryStudyCount}
              clinicalTrialsCount={clinicalTrialsCount}
              prosperoRegistrationsCount={prosperoRegistrationsCount}
              deduplicationCount={deduplicationCount}
              pubmedCount={pubmedCount}
              openalexCount={openalexCount}
              europepmcCount={europepmcCount}
              studyDesign={localStudyDesign}
              gapAnalysis={localGapAnalysis}
              query={query}
            />
          )}
        </div>
      </div>

      {/* Email alerts subscription — shown to owner */}
      {isOwner && searchId && (
        <AlertSubscription
          searchId={searchId}
          isSubscribed={isAlertSubscribed}
          isOwner={isOwner}
        />
      )}

      {/* Related Searches — shown when gap analysis has suggestions */}
      {localGapAnalysis && localGapAnalysis.suggested_topics.length > 0 && (
        <RelatedSearchesSection gapAnalysis={localGapAnalysis} />
      )}

      <p className="text-xs text-center mt-6 leading-relaxed" style={{ color: "var(--muted)" }}>
        Results sourced from PubMed, OpenAlex, Europe PMC (includes Cochrane abstracts), and Semantic Scholar. Trial counts via ClinicalTrials.gov. AI-generated analysis may contain errors — verify all findings with domain expertise.
      </p>
    </div>

      {/* Hidden print-only report — rendered when analysis is complete */}
      {hasAnalysis && localGapAnalysis && localStudyDesign && (
        <PrintableReport
          query={query}
          existingReviews={existingReviews}
          primaryStudyCount={primaryStudyCount}
          clinicalTrialsCount={clinicalTrialsCount}
          prosperoRegistrationsCount={prosperoRegistrationsCount}
          deduplicationCount={deduplicationCount}
          feasibilityScore={localFeasibilityScore}
          feasibilityExplanation={localFeasibilityExplanation}
          gapAnalysis={localGapAnalysis}
          studyDesign={localStudyDesign}
          generatedAt={new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        />
      )}

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton loaders                                                           */
/* -------------------------------------------------------------------------- */

function SkeletonLine({ width = "w-full" }: { width?: string }) {
  return <div className={`h-3 ${width} bg-gray-200 dark:bg-gray-700 rounded animate-pulse`} />;
}

function SkeletonCard() {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 animate-pulse">
      <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-800 rounded" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-3 w-5/6 bg-gray-100 dark:bg-gray-800 rounded" />
      </div>
    </div>
  );
}

function GapsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md p-4 space-y-2">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-3/4" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Related Searches section                                                  */
/* -------------------------------------------------------------------------- */

const GAP_TYPE_COLORS: Record<string, string> = {
  population:  "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  methodology: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  outcome:     "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  geographic:  "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  temporal:    "bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800",
  theoretical: "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
};

const GAP_TYPE_LABELS: Record<string, string> = {
  population:  "Population",
  methodology: "Methodology",
  outcome:     "Outcome",
  geographic:  "Geographic",
  temporal:    "Temporal",
  theoretical: "Theoretical",
};

const RELATED_FEASIBILITY_BADGE: Record<string, string> = {
  high:     "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  moderate: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  low:      "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

function RelatedSearchCard({ search }: { search: RelatedSearch }) {
  const href = `/?q=${encodeURIComponent(search.query)}`;
  const dimColor = GAP_TYPE_COLORS[search.gapType] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const dimLabel = GAP_TYPE_LABELS[search.gapType] ?? search.gapType;
  const feasBadge = RELATED_FEASIBILITY_BADGE[search.feasibility] ?? "bg-gray-50 text-gray-500";

  return (
    <a
      href={href}
      className="block rounded-lg p-4 hover:shadow-sm transition-all group"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${dimColor}`}>
            {dimLabel}
          </span>
          <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${feasBadge}`}>
            {search.feasibility.charAt(0).toUpperCase() + search.feasibility.slice(1)} feasibility
          </span>
        </div>
        {/* Chevron icon */}
        <svg
          className="w-4 h-4 shrink-0 mt-0.5 transition-opacity group-hover:opacity-60"
          style={{ color: "var(--border)" }}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>
      <p className="text-sm font-medium leading-snug mb-1.5 group-hover:opacity-80 transition-opacity" style={{ color: "var(--foreground)" }}>
        {search.label}
      </p>
      <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--muted)" }}>
        {search.snippet}
      </p>
    </a>
  );
}

function RelatedSearchesSection({ gapAnalysis }: { gapAnalysis: import("@/types").GapAnalysis }) {
  const suggestions = deriveRelatedSearches(gapAnalysis, 4);
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Explore Related Topics</h2>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Click to search on Blindspot</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {suggestions.map((s, i) => (
          <RelatedSearchCard key={i} search={s} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Source badge                                                               */
/* -------------------------------------------------------------------------- */

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  const style = SOURCE_STYLES[source] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${style}`}>
      {source}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Reviews tab                                                                */
/* -------------------------------------------------------------------------- */

function ReviewsTab({ reviews }: { reviews: ExistingReview[] }) {
  const [exportOpen, setExportOpen] = useState(false);

  function handleExportRis() {
    const content = toRis(reviews);
    downloadTextFile(content, "blindspot-reviews.ris", "application/x-research-info-systems");
    setExportOpen(false);
  }

  function handleExportBibtex() {
    const content = toBibtex(reviews);
    downloadTextFile(content, "blindspot-reviews.bib", "application/x-bibtex");
    setExportOpen(false);
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-10">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
          style={{ background: "var(--surface-2)" }}
        >
          <span className="text-xl" style={{ color: "var(--muted)" }}>0</span>
        </div>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No existing systematic reviews found on this exact topic — this may indicate a genuine research gap.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)", opacity: 0.7 }}>
          Try broadening your search terms if you expected to find reviews.
        </p>
      </div>
    );
  }
  return (
    <div>
      {/* Export toolbar */}
      <div className="flex items-center justify-end mb-3 relative">
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-md hover:border-[#4a90d9] dark:hover:border-blue-400 hover:text-[#4a90d9] dark:hover:text-blue-400 transition-colors"
            aria-label="Export references"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export references
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10 py-1">
              <button
                onClick={handleExportRis}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                RIS (.ris)
                <span className="block text-[10px] text-gray-600 dark:text-gray-400">Zotero, Mendeley, EndNote</span>
              </button>
              <button
                onClick={handleExportBibtex}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                BibTeX (.bib)
                <span className="block text-[10px] text-gray-600 dark:text-gray-400">LaTeX, Overleaf, JabRef</span>
              </button>
            </div>
          )}
        </div>
      </div>

    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {reviews.map((review, i) => (
        <div
          key={i}
          className="py-4 first:pt-0 last:pb-0 group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 -mx-4 sm:-mx-6 px-4 sm:px-6"
        >
          <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug flex-1 min-w-0">
              {review.pmid ? (
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${review.pmid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#4a90d9] dark:hover:text-blue-400 hover:underline transition-colors"
                >
                  {review.title}
                </a>
              ) : review.doi ? (
                <a
                  href={`https://doi.org/${review.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#4a90d9] dark:hover:text-blue-400 hover:underline transition-colors"
                >
                  {review.title}
                </a>
              ) : (
                review.title
              )}
            </p>
            <SourceBadge source={review.source} />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {review.journal} &middot; {review.year || "Year unknown"}
            {review.doi && (
              <> &middot; <span className="text-gray-300 dark:text-gray-600">DOI: {review.doi.replace("https://doi.org/", "")}</span></>
            )}
          </p>
          {review.abstract_snippet && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed line-clamp-3">
              {review.abstract_snippet}
            </p>
          )}
        </div>
      ))}
    </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gaps tab                                                                   */
/* -------------------------------------------------------------------------- */

function BooleanSearchBlock({ booleanString }: { booleanString: string }) {
  const [copied, setCopied] = useState(false);
  const sanitized = sanitizeBooleanString(booleanString);
  const pubmedUrl = buildPubMedUrl(sanitized);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sanitized);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS); do nothing silently
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {/* Search icon */}
          <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">PubMed Boolean Search String</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Open in PubMed */}
          <a
            href={pubmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#4a90d9] hover:underline"
            title="Open this search in PubMed"
          >
            Open in PubMed
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-900"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      {/* Query string */}
      <pre className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200 font-mono whitespace-pre-wrap break-all leading-relaxed bg-white dark:bg-gray-900 overflow-x-auto">
        {sanitized}
      </pre>
      <p className="px-4 py-2 text-[10px] text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        AI-generated draft — verify MeSH terms and adapt for your target database (e.g. Embase, CINAHL) before use in a formal review protocol.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gap dimension filter chip strip                                           */
/* -------------------------------------------------------------------------- */

const DIMENSION_CHIP_COLORS: Record<GapDimension, { active: string; inactive: string }> = {
  population:  { active: "bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 border-violet-300 dark:border-violet-600", inactive: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-700 dark:hover:text-violet-300" },
  methodology: { active: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-600",             inactive: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 hover:text-blue-700 dark:hover:text-blue-300" },
  outcome:     { active: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-300 dark:border-green-600",        inactive: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-500 hover:text-green-700 dark:hover:text-green-300" },
  geographic:  { active: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-600",        inactive: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-500 hover:text-amber-700 dark:hover:text-amber-300" },
  temporal:    { active: "bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 border-pink-300 dark:border-pink-600",              inactive: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-500 hover:text-pink-700 dark:hover:text-pink-300" },
  theoretical: { active: "bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-600",              inactive: "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300" },
};

function GapDimensionFilter({
  activeDimensions,
  gapCounts,
  onToggle,
  onReset,
}: {
  activeDimensions: ReadonlySet<GapDimension>;
  /** Per-dimension gap counts, used to badge each chip. */
  gapCounts: Record<GapDimension, number>;
  onToggle: (d: GapDimension) => void;
  onReset: () => void;
}) {
  const filtered = !isUnfiltered(activeDimensions);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-600 dark:text-gray-400 mr-0.5 shrink-0">Filter:</span>
      {ALL_DIMENSIONS.map((d) => {
        const isActive = activeDimensions.has(d);
        const count = gapCounts[d];
        // Hide dimensions with zero gaps — no point filtering by them
        if (count === 0) return null;
        const colors = DIMENSION_CHIP_COLORS[d];
        return (
          <button
            key={d}
            onClick={() => onToggle(d)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border font-medium transition-colors ${
              isActive ? colors.active : colors.inactive
            }`}
          >
            {DIMENSION_LABELS[d]}
            {count > 0 && (
              <span className={`text-[10px] font-semibold ${isActive ? "opacity-70" : "opacity-50"}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
      {filtered && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors ml-1 underline underline-offset-2"
          aria-label="Clear all gap dimension filters"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gaps tab                                                                   */
/* -------------------------------------------------------------------------- */

function GapsTab({ gapAnalysis, isPending, onAnalyze, error, resultId, isOwner, protocolDraft, primaryStudyCount, feasibilityScore, query }: {
  gapAnalysis: GapAnalysis | null;
  isPending: boolean;
  onAnalyze: () => void;
  error: string | null;
  resultId: string;
  isOwner: boolean;
  protocolDraft?: string | null;
  primaryStudyCount: number;
  feasibilityScore: FeasibilityScore | null;
  /** ACC-2: Original query text — passed to InsufficientEvidencePanel for alternatives fetch */
  query?: string;
}) {
  const [activeDimensions, setActiveDimensions] = useState<Set<GapDimension>>(resetFilter);

  if (isPending) {
    return <GapsSkeleton />;
  }

  // ACC-1: Show InsufficientEvidencePanel when evidence is insufficient
  // ACC-2: Pass query so the panel can fetch verified alternative topics
  if (feasibilityScore === "Insufficient" && !gapAnalysis) {
    return <InsufficientEvidencePanel primaryStudyCount={primaryStudyCount} query={query} />;
  }

  if (!gapAnalysis) {
    if (!isOwner) return <GuestAnalysisPrompt />;
    return <AnalysisPrompt isPending={isPending} onAnalyze={onAnalyze} error={error} />;
  }

  const booleanString =
    gapAnalysis.boolean_search_string &&
    looksLikeBooleanString(gapAnalysis.boolean_search_string)
      ? gapAnalysis.boolean_search_string
      : null;

  const gapCounts = countByDimension(gapAnalysis.gaps);
  const visibleGaps = filterGapsByDimensions(gapAnalysis.gaps, activeDimensions);
  const visibleTopics = filterTopicsByDimensions(gapAnalysis.suggested_topics, activeDimensions);
  const isFiltered = !isUnfiltered(activeDimensions);

  return (
    <div className="space-y-6">
      {/* ACC-1 follow-up: Low-evidence disclaimer — shown when feasibilityScore is "Low" (3–5 studies).
          The hard gate (ACC-1) already blocks AI for Insufficient (<3). For Low (3–5), AI runs but
          the evidence base is sparse. Researchers need a clear caution before interpreting gaps. */}
      {feasibilityScore === "Low" && (
        <div
          className="flex items-start gap-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/25 px-4 py-3"
          role="alert"
          aria-label="Limited evidence warning"
        >
          <svg
            className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Limited evidence base ({primaryStudyCount} primary {primaryStudyCount === 1 ? "study" : "studies"})
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
              Gap analysis results should be interpreted with caution. With fewer than 6 primary studies,
              AI-identified gaps may not reflect the full research landscape. Supplement with a hand search
              of grey literature and conference proceedings.
            </p>
          </div>
        </div>
      )}

      {gapAnalysis.overall_assessment && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">{gapAnalysis.overall_assessment}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <p className="text-xs text-blue-500 dark:text-blue-400">AI-generated assessment — verify with domain expertise</p>
            {/* ACC-3: Confidence badge — only rendered when reviews_analyzed_count is present */}
            {typeof gapAnalysis.reviews_analyzed_count === "number" && (() => {
              const confidence = getAnalysisConfidence(gapAnalysis.reviews_analyzed_count!);
              return (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${confidence.badgeClass}`}
                  title={confidence.tooltip}
                  aria-label={`Analysis confidence: ${confidence.label}. ${confidence.tooltip}`}
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {confidence.label} · {gapAnalysis.reviews_analyzed_count} reviews analyzed
                </span>
              );
            })()}
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
            Identified Gaps
            {isFiltered && (
              <span className="ml-2 text-xs font-normal text-gray-600 dark:text-gray-400">
                ({visibleGaps.length} of {gapAnalysis.gaps.length} shown)
              </span>
            )}
          </h3>
          {/* Dimension filter chips — only rendered when there are gaps to filter */}
          {gapAnalysis.gaps.length > 0 && (
            <GapDimensionFilter
              activeDimensions={activeDimensions}
              gapCounts={gapCounts}
              onToggle={(d) => setActiveDimensions((prev) => toggleDimension(prev, d))}
              onReset={() => setActiveDimensions(resetFilter())}
            />
          )}
        </div>

        {visibleGaps.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-600">
            No gaps match the selected dimensions.{" "}
            <button
              onClick={() => setActiveDimensions(resetFilter())}
              className="underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGaps.map((gap, i) => (
              <div key={i} className={`border rounded-md p-3 transition-shadow hover:shadow-sm ${IMPORTANCE_STYLES[gap.importance]}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide">{GAP_LABELS[gap.dimension]}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                    gap.importance === "high"
                      ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 border-red-200 dark:border-red-700"
                      : gap.importance === "medium"
                      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-700"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                  }`}>
                    {gap.importance}
                  </span>
                  {/* Per-gap evidence quality indicator.
                      Low feasibility  (3–5 studies)  → ◔ Low confidence   (gray, strong caution)
                      Moderate feasibility (6–10 studies) → ◑ Moderate evidence (stone, mild caution)
                      High / Insufficient               → no badge
                      The amber banner at the top of this tab already warns for Low feasibility overall;
                      this badge makes the caution persistent at the individual gap level. For Moderate
                      feasibility, no top-of-tab banner is shown — the badge is the sole indicator,
                      providing a lighter touch appropriate to the borderline evidence tier. */}
                  {(() => {
                    const badge = getPerGapBadgeConfig(feasibilityScore, primaryStudyCount);
                    if (!badge) return null;
                    return (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium inline-flex items-center gap-0.5 ${badge.className}`}
                        title={badge.tooltip}
                        aria-label={badge.ariaLabel}
                      >
                        {/* Partial circle SVG icon representing evidence completeness level:
                            ◔ (iconVariant "low")      — upper-right quadrant filled (one quarter)
                            ◑ (iconVariant "moderate") — right half filled */}
                        <svg
                          className="w-2.5 h-2.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          {/* Full circle outline shared by both variants */}
                          <circle cx="12" cy="12" r="9" />
                          {badge.iconVariant === "low" ? (
                            /* ◔ Upper-right quadrant: from center (12,12) to top (12,3),
                               arc clockwise to right (21,12), back to center */
                            <path d="M12 12 L12 3 A9 9 0 0 1 21 12 Z" fill="currentColor" stroke="none" />
                          ) : (
                            /* ◑ Right half: from top (12,3) arc clockwise to bottom (12,21),
                               straight line back to top — fills the right semicircle */
                            <path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor" stroke="none" />
                          )}
                        </svg>
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm">{gap.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--foreground)" }}>
          Suggested Review Topics
          {isFiltered && visibleTopics.length !== gapAnalysis.suggested_topics.length && (
            <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
              ({visibleTopics.length} of {gapAnalysis.suggested_topics.length} shown)
            </span>
          )}
        </h3>

        {visibleTopics.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-600">
            No suggested topics match the selected dimensions.{" "}
            <button
              onClick={() => setActiveDimensions(resetFilter())}
              className="underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleTopics.map((topic, i) => {
              // Effective verified score — priority order:
              // 1. verified_feasibility from API (v028+)
              // 2. estimated_studies === 0 → always Insufficient, regardless of AI estimate
              //    (client-side guard for pre-v028 results and API-failure fallbacks)
              // 3. null → fall back to AI estimate label only (no color override)
              const effectiveVerifiedScore: import("@/types").FeasibilityScore | undefined =
                topic.verified_feasibility ??
                (topic.estimated_studies === 0 ? "Insufficient" : undefined);

              const isDataBacked = !!effectiveVerifiedScore;
              const feasibilityBadgeClass = effectiveVerifiedScore === "High"
                ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
                : effectiveVerifiedScore === "Moderate"
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
                : effectiveVerifiedScore === "Low"
                ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700"
                : effectiveVerifiedScore === "Insufficient"
                ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
                // No verified data: fall back to AI estimate styling
                : topic.feasibility === "high"
                ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
                : topic.feasibility === "moderate"
                ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700";
              const feasibilityLabel = effectiveVerifiedScore
                ? `${effectiveVerifiedScore} feasibility`
                : `${topic.feasibility} feasibility`;
              const isInsufficient = effectiveVerifiedScore === "Insufficient";
              // Build a plain-language search query from this topic's pubmed_query
              const topicSearchQuery = cleanPubMedQuery(topic.pubmed_query || topic.title);
              return (
                <div
                  key={i}
                  className={`rounded-lg p-4 transition-shadow hover:shadow-sm ${isInsufficient ? "opacity-70" : ""}`}
                  style={{
                    border: isInsufficient
                      ? "1px solid #fca5a5"
                      : "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm font-medium break-words min-w-0" style={{ color: "var(--brand)" }}>{i + 1}. {topic.title}</p>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border font-medium ${feasibilityBadgeClass}`}
                        title={
                          topic.verified_feasibility
                            ? "Feasibility verified against real PubMed data"
                            : topic.estimated_studies === 0
                            ? "0 primary studies found — not feasible regardless of AI estimate"
                            : "AI-estimated feasibility — not yet verified against real data"
                        }
                      >
                        {feasibilityLabel}
                      </span>
                      {isDataBacked && (
                        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                          {topic.verified_feasibility ? "✓ PubMed-verified" : "✓ 0 studies found"}
                        </span>
                      )}
                    </div>
                  </div>
                  {isInsufficient && (
                    <p className="text-xs text-red-600 dark:text-red-400 mb-2 italic">
                      {topic.estimated_studies === 0
                        ? "No primary studies found for this topic — a systematic review is not yet feasible. Consider broadening the population, intervention, or outcome scope."
                        : "AI suggested this gap, but PubMed found fewer than 3 primary studies — a systematic review is not yet feasible on this exact topic."}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mb-2" style={{ color: "var(--muted)" }}>
                    <span>Gap: {GAP_LABELS[topic.gap_type]}</span>
                    <span>~{topic.estimated_studies.toLocaleString("en-US")} primary studies</span>
                  </div>
                  <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--muted)" }}>{topic.rationale}</p>
                  {!isInsufficient && (
                    <a
                      href={`/?q=${encodeURIComponent(topicSearchQuery)}`}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
                      style={{ color: "var(--accent)" }}
                    >
                      Search this topic →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Boolean search string — only shown when Gemini returns a valid one */}
      {booleanString && (
        <div>
          <BooleanSearchBlock booleanString={booleanString} />
        </div>
      )}

      {/* Protocol generator — only shown when the owner has run gap analysis */}
      {isOwner && (
        <ProtocolBlock resultId={resultId} initialProtocol={protocolDraft ?? null} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Design tab                                                                 */
/* -------------------------------------------------------------------------- */

const FEASIBILITY_BADGE: Record<string, string> = {
  high: "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700",
  moderate: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  low: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700",
};

function DesignTab({ studyDesign, gapAnalysis, feasibilityScore, isPending, onAnalyze, error, isOwner }: {
  studyDesign: StudyDesignRecommendation | null;
  gapAnalysis: GapAnalysis | null;
  feasibilityScore: FeasibilityScore | null;
  isPending: boolean;
  onAnalyze: () => void;
  error: string | null;
  isOwner: boolean;
}) {
  if (isPending) {
    return (
      <div className="space-y-6 animate-pulse">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!studyDesign || !gapAnalysis) {
    if (!isOwner) return <GuestAnalysisPrompt />;
    return <AnalysisPrompt isPending={isPending} onAnalyze={onAnalyze} error={error} />;
  }

  const topTopic = gapAnalysis.suggested_topics[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Recommended review idea */}
      {topTopic && (
        <div className="border border-[#1e3a5f] rounded-lg overflow-hidden">
          <div className="bg-[#1e3a5f] text-white px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs uppercase tracking-wide opacity-70">Recommended review</p>
            <div className="flex items-center gap-2 flex-wrap">
              {feasibilityScore && (
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${FEASIBILITY_STYLES[feasibilityScore]}`}>
                  {feasibilityScore} feasibility
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${FEASIBILITY_BADGE[topTopic.feasibility]}`}>
                ~{topTopic.estimated_studies.toLocaleString("en-US")} primary studies
              </span>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4 bg-white dark:bg-gray-900">
            <p className="text-base font-semibold text-[#1e3a5f] dark:text-blue-300 leading-snug break-words">{topTopic.title}</p>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Expected outcomes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{topTopic.expected_outcomes}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Why this review?</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{topTopic.rationale}</p>
            </div>
          </div>
        </div>
      )}

      {/* Study design method */}
      <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">Recommended study design</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{studyDesign.primary}</p>
            {studyDesign.confidence && (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                studyDesign.confidence === "high"
                  ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700"
                  : studyDesign.confidence === "moderate"
                  ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
              }`}>
                {studyDesign.confidence} confidence
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{studyDesign.rationale}</p>
        </div>

        {studyDesign.steps && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">How to conduct it</p>
            <ol className="space-y-2">
              {studyDesign.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#1e3a5f] dark:bg-blue-700 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {studyDesign.example_paper && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Example published paper</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-1">{studyDesign.example_paper.citation}</p>
            <a
              href={studyDesign.example_paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#4a90d9] dark:text-blue-400 hover:underline transition-colors"
            >
              View paper →
            </a>
          </div>
        )}
      </div>

      {studyDesign.alternatives.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Alternative Designs</h3>
          <div className="space-y-2">
            {studyDesign.alternatives.map((alt, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-md p-4 transition-shadow hover:shadow-sm">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{alt.type}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{alt.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Methodology Resources</h3>
        <div className="flex flex-wrap gap-2">
          {studyDesign.methodology_links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#4a90d9] dark:text-blue-400 hover:underline border border-[#4a90d9] dark:border-blue-500 rounded px-3 py-1 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              {link.label} →
            </a>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400 italic">AI-generated — verify all recommendations with domain expertise.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PRISMA Flow tab                                                            */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PRISMA Flow tab — Primary Study Screening Funnel                           */
/* -------------------------------------------------------------------------- */

/** Small badge used to mark statistically estimated values in the diagram. */
function EstBadge() {
  return (
    <span
      className="inline-block text-[9px] font-semibold px-1 py-px rounded leading-none ml-1 align-middle"
      style={{
        background: "color-mix(in srgb, var(--accent) 15%, transparent)",
        color: "var(--accent)",
        border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
      }}
      title="Statistically estimated based on published systematic review benchmarks"
    >
      est.
    </span>
  );
}

/** A single row in the PRISMA flow: main box on the left, exclusion side-box on the right. */
function PrismaFlowRow({
  mainBox,
  sideBox,
}: {
  mainBox: React.ReactNode;
  sideBox?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 items-start mb-1">
      <div className="flex-1 min-w-0">{mainBox}</div>
      {sideBox && (
        <div className="flex items-start gap-1 shrink-0 mt-1">
          <div
            className="text-xs mt-2 select-none"
            style={{ color: "var(--muted)" }}
            aria-hidden="true"
          >
            →
          </div>
          <div className="w-44 sm:w-52 shrink-0">{sideBox}</div>
        </div>
      )}
    </div>
  );
}

function PrismaFlowTab({
  existingReviews,
  primaryStudyCount,
  clinicalTrialsCount = null,
  prosperoRegistrationsCount = null,
  pubmedCount = null,
  openalexCount = null,
  europepmcCount = null,
  studyDesign = null,
  gapAnalysis = null,
  query,
}: {
  existingReviews: ExistingReview[];
  primaryStudyCount: number;
  clinicalTrialsCount?: number | null;
  prosperoRegistrationsCount?: number | null;
  deduplicationCount?: number | null;
  pubmedCount?: number | null;
  openalexCount?: number | null;
  europepmcCount?: number | null;
  studyDesign?: StudyDesignRecommendation | null;
  gapAnalysis?: GapAnalysis | null;
  query: string;
}) {
  const [criteriaExpanded, setCriteriaExpanded] = useState(true);
  const [reviewContextExpanded, setReviewContextExpanded] = useState(false);

  const data: PrimaryStudyPrismaData = computePrimaryStudyPrismaData({
    primaryStudyCount,
    pubmedCount,
    openalexCount,
    europepmcCount,
    clinicalTrialsCount,
    prosperoCount: prosperoRegistrationsCount,
    studyDesign,
    gapAnalysis,
    query,
  });

  const prosperoUrl = `https://www.crd.york.ac.uk/prospero/display_record.php?RecordID=&SearchKeyword=${encodeURIComponent(query)}`;
  const hasAnalysis = studyDesign !== null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
            Proposed Primary Study Screening Flow
          </h3>
          {data.studyDesignType && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                color: "var(--brand)",
                border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
              }}
            >
              {data.studyDesignType}
            </span>
          )}
        </div>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
          PRISMA 2020 flow for the systematic review you are proposing to conduct.
          Identification counts reflect primary studies found across databases (systematic reviews excluded).
          Screening and eligibility numbers are estimated using published SR benchmarks
          and are marked <EstBadge />.
        </p>
      </div>

      {/* Wide-query warning: shown when afterDedup ≥ 1,500 (XL/XXL tier) */}
      {data.afterDedup >= 1500 && (
        <div
          className="flex items-start gap-2 rounded-md px-3 py-2.5 text-xs"
          role="alert"
          style={{
            background: "color-mix(in srgb, #f59e0b 10%, transparent)",
            border: "1px solid color-mix(in srgb, #f59e0b 35%, transparent)",
            color: "var(--foreground)",
          }}
        >
          <span aria-hidden="true" className="shrink-0 mt-px">⚠️</span>
          <span>
            <strong>Wide query detected</strong> — your search matched{" "}
            <strong>{data.afterDedup.toLocaleString("en-US")}</strong> records after
            deduplication. The estimated included-studies count assumes a focused review
            question and may be higher than your actual eligibility criteria will yield.
            Consider <strong>narrowing your search query</strong> for a more accurate estimate,
            or treat the included count as an upper bound.
          </span>
        </div>
      )}

      {/* PRISMA flow diagram */}
      <div className="prisma-flow-diagram" aria-label="PRISMA 2020 primary study screening flow">

        {/* ── IDENTIFICATION ── */}
        <div className="prisma-phase-label">
          <span>Identification</span>
        </div>

        {/* Database source boxes */}
        {data.hasPerSourceData ? (
          <div className="flex gap-2 mb-2 flex-wrap">
            {data.perSourceCounts.map((s) => (
              <div key={s.name} className="prisma-box prisma-box-source flex-1 min-w-[100px]">
                <span className="prisma-box-label">{s.name}</span>
                <span className="prisma-box-sublabel">Primary studies (SRs excluded)</span>
                <span className="prisma-box-count">{s.count.toLocaleString("en-US")}</span>
              </div>
            ))}
            {(data.clinicalTrialsCount !== null || data.prosperoCount !== null) && (
              <div className="prisma-box prisma-box-source flex-1 min-w-[100px]">
                <span className="prisma-box-label">Other sources</span>
                {data.clinicalTrialsCount !== null && (
                  <span className="prisma-box-sublabel">ClinicalTrials.gov: {data.clinicalTrialsCount.toLocaleString("en-US")}</span>
                )}
                {data.prosperoCount !== null && (
                  <span className="prisma-box-sublabel">PROSPERO: {data.prosperoCount.toLocaleString("en-US")}</span>
                )}
                <span className="prisma-box-count">
                  {((data.clinicalTrialsCount ?? 0) + (data.prosperoCount ?? 0)).toLocaleString("en-US")}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <div className="prisma-box prisma-box-source w-full sm:w-2/3">
              <span className="prisma-box-label">Databases searched</span>
              <span className="prisma-box-sublabel">PubMed · OpenAlex · Europe PMC (primary studies, SRs excluded)</span>
              <span className="prisma-box-count">{primaryStudyCount.toLocaleString("en-US")}</span>
              {!data.hasPerSourceData && (
                <span className="prisma-box-note">Per-source breakdown available for searches run after April 2026</span>
              )}
            </div>
          </div>
        )}

        {/* Total identified + duplicates removed */}
        {data.hasPerSourceData && (
          <>
            <div className="flex justify-center mb-1">
              <div className="prisma-arrow" aria-hidden="true">↓</div>
            </div>
            <PrismaFlowRow
              mainBox={
                <div className="prisma-box prisma-box-process">
                  <span className="prisma-box-label">Records identified from all sources</span>
                  <span className="prisma-box-sublabel">Before deduplication</span>
                  <span className="prisma-box-count">{data.totalIdentified.toLocaleString("en-US")}</span>
                </div>
              }
              sideBox={
                data.duplicatesRemoved !== null && data.duplicatesRemoved > 0 ? (
                  <div className="prisma-box prisma-box-excluded">
                    <span className="prisma-box-label">Estimated duplicates</span>
                    <span className="prisma-box-sublabel">Cross-database overlap</span>
                    <span className="prisma-box-count" style={{ color: "#dc2626" }}>
                      {data.duplicatesRemoved.toLocaleString("en-US")}
                    </span>
                  </div>
                ) : undefined
              }
            />
          </>
        )}

        {/* Arrow to Screening */}
        <div className="flex justify-center my-1">
          <div className="prisma-arrow" aria-hidden="true">↓</div>
        </div>

        {/* ── SCREENING ── */}
        <div className="prisma-phase-label">
          <span>Screening</span>
        </div>

        <PrismaFlowRow
          mainBox={
            <div className="prisma-box prisma-box-process">
              <span className="prisma-box-label">Records screened</span>
              <span className="prisma-box-sublabel">Title &amp; abstract review (after deduplication)</span>
              <span className="prisma-box-count">{data.afterDedup.toLocaleString("en-US")}</span>
            </div>
          }
          sideBox={
            <div className="prisma-box prisma-box-excluded">
              <span className="prisma-box-label">
                Excluded <EstBadge />
              </span>
              <span className="prisma-box-sublabel">Title &amp; abstract</span>
              <span className="prisma-box-count" style={{ color: "#dc2626" }}>
                {data.excludedTitleAbstract.toLocaleString("en-US")}
              </span>
              <span className="prisma-box-note">Not relevant to review question; non-primary study type; non-human population</span>
            </div>
          }
        />

        {/* Arrow to Eligibility */}
        <div className="flex justify-center my-1">
          <div className="prisma-arrow" aria-hidden="true">↓</div>
        </div>

        {/* ── ELIGIBILITY ── */}
        <div className="prisma-phase-label">
          <span>Eligibility</span>
        </div>

        <PrismaFlowRow
          mainBox={
            <div className="prisma-box prisma-box-process">
              <span className="prisma-box-label">
                Full-text assessed for eligibility <EstBadge />
              </span>
              <span className="prisma-box-sublabel">Detailed review against inclusion criteria</span>
              <span className="prisma-box-count">~{data.afterTitleAbstract.toLocaleString("en-US")}</span>
            </div>
          }
          sideBox={
            <div className="prisma-box prisma-box-excluded">
              <span className="prisma-box-label">
                Excluded <EstBadge />
              </span>
              <span className="prisma-box-sublabel">Full-text review</span>
              <span className="prisma-box-count" style={{ color: "#dc2626" }}>
                ~{data.excludedFullText.toLocaleString("en-US")}
              </span>
              <span className="prisma-box-note">
                Intervention/population mismatch; insufficient outcome data; study design ineligible
                {data.studyDesignType ? ` for ${data.studyDesignType.toLowerCase()}` : ""}
              </span>
            </div>
          }
        />

        {/* Arrow to Included */}
        <div className="flex justify-center my-1">
          <div className="prisma-arrow" aria-hidden="true">↓</div>
        </div>

        {/* ── INCLUDED ── */}
        <div className="prisma-phase-label">
          <span>Included</span>
        </div>

        <div className="flex justify-center mb-2">
          <div className="prisma-box prisma-box-included w-full sm:w-2/3">
            <span className="prisma-box-label">
              Studies included in synthesis <EstBadge />
            </span>
            <span className="prisma-box-sublabel">
              {data.studyDesignType
                ? `Eligible for ${data.studyDesignType.toLowerCase()}`
                : "Meeting all inclusion criteria"}
            </span>
            <span className="prisma-box-count prisma-box-count-large">
              ~{data.includedLow.toLocaleString("en-US")}–{data.includedHigh.toLocaleString("en-US")}
            </span>
            <span className="prisma-box-note" style={{ marginTop: "2px" }}>
              Point estimate: ~{data.included.toLocaleString("en-US")} &middot; range reflects calibration uncertainty
            </span>
            {!hasAnalysis && (
              <span className="prisma-box-note">Run AI analysis to refine this estimate based on study design</span>
            )}
          </div>
        </div>

      </div>{/* end .prisma-flow-diagram */}

      {/* Proposed inclusion/exclusion criteria */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setCriteriaExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80"
          style={{ background: "var(--surface-2)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
            Proposed Inclusion &amp; Exclusion Criteria
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {criteriaExpanded ? "↑ Hide" : "↓ Show"}
          </span>
        </button>

        {criteriaExpanded && (
          <div className="p-4">
            {data.criteria ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Inclusion */}
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2"
                    style={{ color: "#16a34a" }}
                  >
                    ✓ Inclusion Criteria
                  </p>
                  <ol className="space-y-1.5">
                    {data.criteria.inclusion.map((criterion, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                        <span className="shrink-0 font-semibold" style={{ color: "var(--muted)" }}>{i + 1}.</span>
                        <span>{criterion}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {/* Exclusion */}
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2"
                    style={{ color: "#dc2626" }}
                  >
                    ✗ Exclusion Criteria
                  </p>
                  <ol className="space-y-1.5">
                    {data.criteria.exclusion.map((criterion, i) => (
                      <li key={i} className="flex gap-2 text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                        <span className="shrink-0 font-semibold" style={{ color: "var(--muted)" }}>{i + 1}.</span>
                        <span>{criterion}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  Run AI gap analysis to generate proposed inclusion and exclusion criteria
                  tailored to the study design and identified evidence gaps.
                </p>
              </div>
            )}
            <p className="text-[10px] mt-4 pt-3 leading-relaxed" style={{ color: "var(--muted)", borderTop: "1px dashed var(--border)" }}>
              These criteria are AI-derived from the study design recommendation and evidence gaps. Review and adapt them with your team before PROSPERO registration. Criteria are presented in PICO format aligned with Cochrane Handbook guidance.
            </p>
          </div>
        )}
      </div>

      {/* Collapsible: Existing systematic reviews context */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={() => setReviewContextExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:opacity-80"
          style={{ background: "var(--surface-2)" }}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--muted)" }}>
            Existing Systematic Reviews Found ({existingReviews.length})
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {reviewContextExpanded ? "↑ Hide" : "↓ Show"}
          </span>
        </button>
        {reviewContextExpanded && (
          <div className="px-4 pb-4 pt-2">
            <p className="text-xs mb-3 leading-relaxed" style={{ color: "var(--muted)" }}>
              These secondary studies (existing systematic reviews) were identified during Blindspot&apos;s
              scoping search and are <em>excluded</em> from the primary study funnel above.
              They inform the gap analysis and represent the current evidence landscape.
            </p>
            {existingReviews.length > 0 ? (
              <ul className="space-y-1.5">
                {existingReviews.slice(0, 8).map((r, i) => (
                  <li key={i} className="text-xs" style={{ color: "var(--foreground)" }}>
                    <span className="font-medium">{r.year}</span>{" "}
                    <span style={{ color: "var(--muted)" }}>— {r.title}</span>
                    {r.source && (
                      <span
                        className="ml-1.5 px-1 py-px rounded text-[9px] font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                      >
                        {r.source}
                      </span>
                    )}
                  </li>
                ))}
                {existingReviews.length > 8 && (
                  <li className="text-xs" style={{ color: "var(--muted)" }}>
                    + {existingReviews.length - 8} more — see the Reviews tab for full list
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted)" }}>No existing systematic reviews found for this topic.</p>
            )}
            {prosperoRegistrationsCount !== null && prosperoRegistrationsCount > 0 && (
              <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                Additionally, <a href={prosperoUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent)" }}>{prosperoRegistrationsCount} review{prosperoRegistrationsCount > 1 ? "s" : ""} registered on PROSPERO</a> may be in progress on this topic.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reference + disclaimer */}
      <div
        className="rounded-md p-3 text-xs space-y-1"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <p>
          <strong style={{ color: "var(--foreground)" }}>Reference:</strong>{" "}
          Page MJ, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews.{" "}
          <a
            href="https://doi.org/10.1136/bmj.n71"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
            className="underline"
          >
            BMJ 2021;372:n71
          </a>
          .
        </p>
        <p>
          Screening and eligibility numbers are statistical estimates based on published systematic review
          benchmarks (marked <EstBadge />) and will change as you conduct your formal review. Complete
          your full database search, apply inclusion criteria independently with a second reviewer, and
          update this diagram before journal submission.
        </p>
        <p>
          Identification counts reflect primary studies only — systematic reviews and meta-analyses are
          excluded from the count and shown separately in the context section above.
        </p>
      </div>

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Analysis prompt (empty state)                                              */
/* -------------------------------------------------------------------------- */

function GuestAnalysisPrompt() {
  return (
    <div className="text-center py-10">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1e3a5f]/10 dark:bg-blue-900/30 mb-3">
        <svg className="w-6 h-6 text-[#1e3a5f] dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
      </div>
      <p className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1">Create a free account to run AI gap analysis</p>
      <p className="text-gray-600 dark:text-gray-400 text-xs mb-4">
        Identify research gaps, get suggested review topics, and receive a study design recommendation.
      </p>
      <a
        href="/signup"
        className="inline-block px-4 py-2 bg-[#1e3a5f] dark:bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] dark:hover:bg-blue-600 transition-colors"
      >
        Sign up free
      </a>
    </div>
  );
}

function AnalysisPrompt({ isPending, onAnalyze, error }: {
  isPending: boolean;
  onAnalyze: () => void;
  error: string | null;
}) {
  return (
    <div className="text-center py-10">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1e3a5f]/10 mb-3">
        <svg className="w-6 h-6 text-[#1e3a5f]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
      </div>
      <p className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-1">AI analysis not yet run</p>
      <p className="text-gray-600 dark:text-gray-400 text-xs mb-4">
        Run the analysis to identify research gaps, suggested topics, and study design recommendations.
      </p>
      <button
        onClick={onAnalyze}
        disabled={isPending}
        className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] transition-colors disabled:opacity-50"
      >
        {isPending ? "Analyzing… (~20 seconds)" : "Run AI Gap Analysis"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Protocol generator block                                                    */
/* -------------------------------------------------------------------------- */

/**
 * ProtocolBlock — "Start My Protocol" section.
 *
 * Shows a button on the Gap Analysis tab that calls /api/generate-protocol
 * and renders the Gemini-generated Markdown protocol draft in a code block
 * with copy + download actions. Only shown to the result owner.
 *
 * If `initialProtocol` is provided (i.e. a draft was previously generated and
 * stored in `search_results.protocol_draft`), the block starts in "done" state
 * and displays the stored draft immediately — no re-generation needed.
 */
function ProtocolBlock({ resultId, initialProtocol = null }: { resultId: string; initialProtocol?: string | null }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    hasStoredProtocol(initialProtocol) ? "done" : "idle"
  );
  const [protocol, setProtocol] = useState<string | null>(
    hasStoredProtocol(initialProtocol) ? initialProtocol : null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isExportingProspero, setIsExportingProspero] = useState(false);
  const [prosperoError, setProsperoError] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/generate-protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId }),
      });
      const data = (await res.json()) as { protocol?: string; error?: string };
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? "Protocol generation failed. Please try again.");
        setStatus("error");
        return;
      }
      setProtocol(data.protocol ?? "");
      setStatus("done");
    } catch {
      setErrorMsg("Network error — please check your connection and try again.");
      setStatus("error");
    }
  }

  async function handleCopy() {
    if (!protocol) return;
    try {
      await navigator.clipboard.writeText(protocol);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (non-HTTPS dev env); silently ignore
    }
  }

  function handleDownload() {
    if (!protocol) return;
    downloadTextFile(deriveProtocolFilename(protocol), protocol, "text/markdown");
  }

  async function handleExportProspero() {
    setIsExportingProspero(true);
    setProsperoError(null);
    try {
      const res = await fetch("/api/prospero-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId }),
      });
      const data = (await res.json()) as { registration?: ProsperoRegistration; error?: string };
      if (!res.ok || data.error) {
        setProsperoError(data.error ?? "Export failed. Please try again.");
        return;
      }
      if (data.registration) {
        downloadProsperoRegistration(
          data.registration,
          `prospero-registration-draft-${new Date().toISOString().split("T")[0]}.txt`
        );
      }
    } catch {
      setProsperoError("Network error — please check your connection and try again.");
    } finally {
      setIsExportingProspero(false);
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {/* Document icon */}
          <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Protocol Draft</span>
        </div>
        {status === "done" && protocol && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Copy protocol to clipboard"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.375" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
            {/* Download button */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Download protocol as Markdown file"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download .md</span>
            </button>
            {/* PROSPERO export button */}
            <button
              onClick={handleExportProspero}
              disabled={isExportingProspero}
              className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors disabled:opacity-50"
              aria-label="Export PROSPERO registration draft"
              title="Generate a PROSPERO registration draft"
            >
              {isExportingProspero ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 0 1 8-8m0 0a8 8 0 0 1 8 8m-8-8v8m0-8a8 8 0 0 0-8 8m8-8v8" />
                  </svg>
                  <span>Exporting…</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.566.034-1.08.16-1.539.34m-5.4 0a2.25 2.25 0 0 0-2.25 2.25v12.75c0 1.24 1.01 2.25 2.25 2.25h15A2.25 2.25 0 0 0 21 18.75V6.108c0-1.135-.845-2.098-1.976-2.192a48.42 48.42 0 0 0-1.123-.08m-5.801 0c-.566.034-1.08.16-1.539.34" />
                  </svg>
                  <span>PROSPERO Export</span>
                </>
              )}
            </button>
            {/* Regenerate button — lets users replace the stored draft */}
            <button
              onClick={() => { setStatus("idle"); setProtocol(null); setErrorMsg(null); setProsperoError(null); }}
              className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              aria-label="Regenerate protocol draft"
              title="Discard this draft and generate a new one"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <span>Regenerate</span>
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {status === "idle" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Generate a Review Protocol Draft</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                AI-generates a structured PROSPERO-ready protocol outline from this gap analysis — eligibility criteria, search strategy, methods, and a next-steps checklist.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              className="shrink-0 px-3 py-1.5 bg-[#1e3a5f] text-white text-xs font-medium rounded-md hover:bg-[#2d5a8e] transition-colors"
            >
              Generate Protocol
            </button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex items-center gap-3 py-2">
            <div className="w-4 h-4 border-2 border-[#1e3a5f] dark:border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Generating protocol draft… (~20 seconds)</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-red-600 dark:text-red-400 flex-1">{errorMsg}</p>
            <button
              onClick={handleGenerate}
              className="shrink-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {status === "done" && protocol && (
          <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[480px] overflow-y-auto">
            {protocol}
          </pre>
        )}
      </div>

      {status === "done" && (
        <div className="px-4 pb-3 space-y-2">
          {prosperoError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              PROSPERO export error: {prosperoError}
            </p>
          )}
          <p className="text-[10px] text-gray-600 dark:text-gray-400">
            AI-generated draft — review and adapt before PROSPERO registration. Verify eligibility criteria and search strategy with a medical librarian or domain expert. Use the PROSPERO Export button to generate a pre-filled registration draft.
          </p>
        </div>
      )}
    </div>
  );
}
