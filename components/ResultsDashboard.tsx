"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import type {
  ExistingReview,
  FeasibilityScore,
  GapAnalysis,
  StudyDesignRecommendation,
  GapDimension,
} from "@/types";
import { PrintableReport } from "@/components/PrintableReport";
import { toRis, toBibtex, downloadTextFile } from "@/lib/citation-export";
import { sanitizeBooleanString, looksLikeBooleanString, buildPubMedUrl } from "@/lib/boolean-search";
import { formatProsperoWarning } from "@/lib/prospero";
import { computePrismaData, formatCount } from "@/lib/prisma-diagram";
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
import { deriveRelatedSearches } from "@/lib/related-searches";
import type { RelatedSearch } from "@/lib/related-searches";
import { shouldIgnoreKeyEvent } from "@/lib/keyboard-shortcuts";
import { KeyboardShortcutsHelp, ShortcutsButton, ShortcutsDiscoveryTooltip } from "@/components/KeyboardShortcutsHelp";
import { deriveProtocolFilename, hasStoredProtocol } from "@/lib/protocol-storage";

const FEASIBILITY_STYLES: Record<FeasibilityScore, string> = {
  High: "bg-green-100 text-green-800 border-green-200",
  Moderate: "bg-amber-100 text-amber-800 border-amber-200",
  Low: "bg-orange-100 text-orange-800 border-orange-200",
  Insufficient: "bg-red-100 text-red-800 border-red-200",
};

const FEASIBILITY_ICONS: Record<FeasibilityScore, string> = {
  High: "✓",
  Moderate: "~",
  Low: "!",
  Insufficient: "✕",
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
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-gray-50 text-gray-600 border-gray-200",
};

const SOURCE_STYLES: Record<string, string> = {
  PubMed: "bg-blue-50 text-blue-700 border-blue-200",
  OpenAlex: "bg-purple-50 text-purple-700 border-purple-200",
  "Europe PMC": "bg-teal-50 text-teal-700 border-teal-200",
  "Semantic Scholar": "bg-orange-50 text-orange-700 border-orange-200",
};

type Tab = "reviews" | "gaps" | "design" | "prisma";

interface Props {
  resultId: string;
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
   * Previously-generated protocol draft text (from `search_results.protocol_draft`).
   * When non-null, ProtocolBlock skips the generate-prompt CTA and shows the
   * stored draft immediately. Null means no protocol has been generated yet.
   */
  protocolDraft?: string | null;
}

export function ResultsDashboard({
  resultId,
  query,
  existingReviews,
  primaryStudyCount,
  clinicalTrialsCount = null,
  prosperoRegistrationsCount = null,
  deduplicationCount = null,
  feasibilityScore,
  feasibilityExplanation,
  gapAnalysis,
  studyDesign,
  isOwner = false,
  isPublic = false,
  protocolDraft = null,
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
      const data = (await res.json()) as { error?: string };

      if (!res.ok || data.error) {
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
        <div className="mb-5 bg-[#1e3a5f] text-white rounded-lg px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">You&apos;re viewing a shared Blindspot report.</p>
            <p className="text-xs text-white/70 mt-0.5">
              Sign up free to run your own systematic review gap analysis.
            </p>
          </div>
          <a
            href="/signup"
            className="shrink-0 bg-white text-[#1e3a5f] text-sm font-semibold px-4 py-2 rounded-md hover:bg-gray-100 transition-colors whitespace-nowrap"
          >
            Sign up free →
          </a>
        </div>
      )}

    <div data-screen-content>
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Topic searched</p>

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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${
                  localIsPublic
                    ? "bg-blue-50 border-[#4a90d9] text-[#4a90d9] hover:bg-blue-100"
                    : "border-gray-300 text-gray-600 hover:border-[#4a90d9] hover:text-[#4a90d9]"
                }`}
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
                <p className="text-xs text-gray-500 max-w-[220px] text-right leading-tight">
                  {shareToast}
                </p>
              )}
            </div>
          )}
          </div>{/* end flex items-center gap-2 wrapper */}
        </div>
        <h1 className="text-lg sm:text-xl font-semibold text-[#1e3a5f] break-words">{query}</h1>

        {/* Key metrics row */}
        <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap items-start gap-4 sm:gap-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Primary studies</p>
            <p className="text-2xl font-bold text-gray-800">{primaryStudyCount.toLocaleString("en-US")}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Existing reviews</p>
            <p className="text-2xl font-bold text-gray-800">{existingReviews.length}</p>
          </div>
          {/* ClinicalTrials.gov count — only shown when data is available (non-null) */}
          {clinicalTrialsCount !== null && clinicalTrialsCount !== undefined && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                Registered trials
              </p>
              <a
                href={`https://clinicaltrials.gov/search?term=${encodeURIComponent(query)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 group"
                title="View on ClinicalTrials.gov"
              >
                <p className="text-2xl font-bold text-gray-800 group-hover:text-[#4a90d9] transition-colors">
                  {clinicalTrialsCount.toLocaleString("en-US")}
                </p>
                {/* External link icon */}
                <svg
                  className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#4a90d9] transition-colors mt-1 shrink-0"
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
              <p className="text-xs text-gray-400 mt-0.5">
                via ClinicalTrials.gov
              </p>
            </div>
          )}
          {localFeasibilityScore && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Feasibility</p>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${FEASIBILITY_STYLES[localFeasibilityScore]}`}>
                <span className="text-xs">{FEASIBILITY_ICONS[localFeasibilityScore]}</span>
                {localFeasibilityScore}
              </span>
            </div>
          )}
        </div>

        {localFeasibilityExplanation && (
          <p className="mt-3 text-sm text-gray-600 leading-relaxed">{localFeasibilityExplanation}</p>
        )}

        {/* PROSPERO warning banner */}
        {prosperoRegistrationsCount !== null && prosperoRegistrationsCount !== undefined && prosperoRegistrationsCount > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800 font-medium">
              {formatProsperoWarning(prosperoRegistrationsCount)}
            </p>
            <a
              href="https://www.crd.york.ac.uk/prospero/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-yellow-700 hover:text-yellow-900 underline mt-1.5 inline-flex items-center gap-1"
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

        {/* Top gaps quick summary */}
        {topGaps.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">Key gaps identified</p>
            <div className="flex flex-wrap gap-2">
              {topGaps.map((gap, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-0.5">
                  {GAP_LABELS[gap.dimension]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Analyze / Download buttons */}
        <div className="mt-4">
          {isOwner && !hasAnalysis && !isPending && (
            <button
              onClick={runAnalysis}
              className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] transition-colors"
            >
              Run AI Gap Analysis
            </button>
          )}
          {!isOwner && !hasAnalysis && (
            <a
              href="/signup"
              className="inline-block px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] transition-colors"
            >
              Sign up free to run AI analysis
            </a>
          )}
          {isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Analyzing with AI…</span>
                <span>~20 seconds</span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1e3a5f] rounded-full"
                  style={{
                    animation: "progress-fill 22s cubic-bezier(0.1, 0, 0.4, 1) forwards",
                  }}
                />
              </div>
            </div>
          )}
          {hasAnalysis && (
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-[#1e3a5f] text-[#1e3a5f] text-sm font-medium rounded-md hover:bg-[#1e3a5f] hover:text-white transition-colors"
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
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`shrink-0 px-3 sm:px-5 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === key
                  ? "border-[#1e3a5f] text-[#1e3a5f]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
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
            <GapsTab gapAnalysis={localGapAnalysis} isPending={isPending} onAnalyze={runAnalysis} error={analysisError} resultId={resultId} isOwner={isOwner} protocolDraft={protocolDraft} />
          )}
          {activeTab === "design" && (
            <DesignTab studyDesign={localStudyDesign} gapAnalysis={localGapAnalysis} feasibilityScore={localFeasibilityScore} isPending={isPending} onAnalyze={runAnalysis} error={analysisError} />
          )}
          {activeTab === "prisma" && (
            <PrismaFlowTab
              existingReviews={existingReviews}
              primaryStudyCount={primaryStudyCount}
              clinicalTrialsCount={clinicalTrialsCount}
              prosperoRegistrationsCount={prosperoRegistrationsCount}
              deduplicationCount={deduplicationCount}
              query={query}
            />
          )}
        </div>
      </div>

      {/* Related Searches — shown when gap analysis has suggestions */}
      {localGapAnalysis && localGapAnalysis.suggested_topics.length > 0 && (
        <RelatedSearchesSection gapAnalysis={localGapAnalysis} />
      )}

      <p className="text-xs text-gray-400 text-center mt-6">
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
  return <div className={`h-3 ${width} bg-gray-200 rounded animate-pulse`} />;
}

function SkeletonCard() {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 animate-pulse">
      <div className="h-4 w-3/4 bg-gray-200 rounded" />
      <div className="h-3 w-1/2 bg-gray-100 rounded" />
      <div className="space-y-2">
        <div className="h-3 w-full bg-gray-100 rounded" />
        <div className="h-3 w-5/6 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="py-4 border-b border-gray-100 last:border-0 animate-pulse">
          <div className="h-4 w-4/5 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-1/3 bg-gray-100 rounded mb-2" />
          <div className="space-y-1.5">
            <div className="h-3 w-full bg-gray-100 rounded" />
            <div className="h-3 w-3/4 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GapsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-blue-50 border border-blue-100 rounded-md p-4 space-y-2">
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
  population:  "bg-violet-50 text-violet-700 border-violet-200",
  methodology: "bg-blue-50 text-blue-700 border-blue-200",
  outcome:     "bg-green-50 text-green-700 border-green-200",
  geographic:  "bg-amber-50 text-amber-700 border-amber-200",
  temporal:    "bg-pink-50 text-pink-700 border-pink-200",
  theoretical: "bg-teal-50 text-teal-700 border-teal-200",
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
  high:     "bg-green-50 text-green-700",
  moderate: "bg-amber-50 text-amber-700",
  low:      "bg-gray-50 text-gray-500",
};

function RelatedSearchCard({ search }: { search: RelatedSearch }) {
  const href = `/?q=${encodeURIComponent(search.query)}`;
  const dimColor = GAP_TYPE_COLORS[search.gapType] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const dimLabel = GAP_TYPE_LABELS[search.gapType] ?? search.gapType;
  const feasBadge = RELATED_FEASIBILITY_BADGE[search.feasibility] ?? "bg-gray-50 text-gray-500";

  return (
    <a
      href={href}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-[#4a90d9] hover:shadow-sm transition-all group"
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
          className="w-4 h-4 text-gray-300 group-hover:text-[#4a90d9] transition-colors shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-gray-800 group-hover:text-[#1e3a5f] leading-snug mb-1.5">
        {search.label}
      </p>
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
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
        <h2 className="text-sm font-semibold text-gray-700">Explore Related Topics</h2>
        <span className="text-xs text-gray-400">Click to search on Blindspot</span>
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
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
          <span className="text-xl text-gray-400">0</span>
        </div>
        <p className="text-sm text-gray-500">
          No existing systematic reviews found on this exact topic — this may indicate a genuine research gap.
        </p>
        <p className="text-xs text-gray-400 mt-1">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-md hover:border-[#4a90d9] hover:text-[#4a90d9] transition-colors"
            aria-label="Export references"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export references
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1">
              <button
                onClick={handleExportRis}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                RIS (.ris)
                <span className="block text-[10px] text-gray-400">Zotero, Mendeley, EndNote</span>
              </button>
              <button
                onClick={handleExportBibtex}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                BibTeX (.bib)
                <span className="block text-[10px] text-gray-400">LaTeX, Overleaf, JabRef</span>
              </button>
            </div>
          )}
        </div>
      </div>

    <div className="divide-y divide-gray-100">
      {reviews.map((review, i) => (
        <div
          key={i}
          className="py-4 first:pt-0 last:pb-0 group transition-colors hover:bg-gray-50 -mx-4 sm:-mx-6 px-4 sm:px-6"
        >
          <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
            <p className="text-sm font-medium text-gray-800 leading-snug flex-1 min-w-0">
              {review.pmid ? (
                <a
                  href={`https://pubmed.ncbi.nlm.nih.gov/${review.pmid}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#4a90d9] hover:underline transition-colors"
                >
                  {review.title}
                </a>
              ) : review.doi ? (
                <a
                  href={`https://doi.org/${review.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#4a90d9] hover:underline transition-colors"
                >
                  {review.title}
                </a>
              ) : (
                review.title
              )}
            </p>
            <SourceBadge source={review.source} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {review.journal} &middot; {review.year || "Year unknown"}
            {review.doi && (
              <> &middot; <span className="text-gray-300">DOI: {review.doi.replace("https://doi.org/", "")}</span></>
            )}
          </p>
          {review.abstract_snippet && (
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed line-clamp-3">
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
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {/* Search icon */}
          <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">PubMed Boolean Search String</span>
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
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1 rounded border border-gray-200 hover:border-gray-400 bg-white"
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
      <pre className="px-4 py-3 text-xs text-gray-800 font-mono whitespace-pre-wrap break-all leading-relaxed bg-white overflow-x-auto">
        {sanitized}
      </pre>
      <p className="px-4 py-2 text-[10px] text-gray-400 border-t border-gray-100 bg-gray-50">
        AI-generated draft — verify MeSH terms and adapt for your target database (e.g. Embase, CINAHL) before use in a formal review protocol.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gap dimension filter chip strip                                           */
/* -------------------------------------------------------------------------- */

const DIMENSION_CHIP_COLORS: Record<GapDimension, { active: string; inactive: string }> = {
  population:  { active: "bg-violet-100 text-violet-800 border-violet-300", inactive: "text-gray-500 border-gray-200 hover:border-violet-300 hover:text-violet-700" },
  methodology: { active: "bg-blue-100 text-blue-800 border-blue-300",       inactive: "text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-700" },
  outcome:     { active: "bg-green-100 text-green-800 border-green-300",    inactive: "text-gray-500 border-gray-200 hover:border-green-300 hover:text-green-700" },
  geographic:  { active: "bg-amber-100 text-amber-800 border-amber-300",    inactive: "text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-700" },
  temporal:    { active: "bg-pink-100 text-pink-800 border-pink-300",       inactive: "text-gray-500 border-gray-200 hover:border-pink-300 hover:text-pink-700" },
  theoretical: { active: "bg-teal-100 text-teal-800 border-teal-300",      inactive: "text-gray-500 border-gray-200 hover:border-teal-300 hover:text-teal-700" },
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
      <span className="text-xs text-gray-400 mr-0.5 shrink-0">Filter:</span>
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
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors ml-1 underline underline-offset-2"
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

function GapsTab({ gapAnalysis, isPending, onAnalyze, error, resultId, isOwner, protocolDraft }: {
  gapAnalysis: GapAnalysis | null;
  isPending: boolean;
  onAnalyze: () => void;
  error: string | null;
  resultId: string;
  isOwner: boolean;
  protocolDraft?: string | null;
}) {
  const [activeDimensions, setActiveDimensions] = useState<Set<GapDimension>>(resetFilter);

  if (isPending) {
    return <GapsSkeleton />;
  }

  if (!gapAnalysis) {
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
      {gapAnalysis.overall_assessment && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800 leading-relaxed">{gapAnalysis.overall_assessment}</p>
          <p className="text-xs text-blue-500 mt-1">AI-generated assessment — verify with domain expertise</p>
        </div>
      )}

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-700 shrink-0">
            Identified Gaps
            {isFiltered && (
              <span className="ml-2 text-xs font-normal text-gray-400">
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
          <div className="text-center py-6 text-sm text-gray-400">
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
                      ? "bg-red-100 text-red-600 border-red-200"
                      : gap.importance === "medium"
                      ? "bg-amber-100 text-amber-600 border-amber-200"
                      : "bg-gray-100 text-gray-500 border-gray-200"
                  }`}>
                    {gap.importance}
                  </span>
                </div>
                <p className="text-sm">{gap.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Suggested Review Topics
          {isFiltered && visibleTopics.length !== gapAnalysis.suggested_topics.length && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({visibleTopics.length} of {gapAnalysis.suggested_topics.length} shown)
            </span>
          )}
        </h3>

        {visibleTopics.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">
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
            {visibleTopics.map((topic, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-medium text-[#1e3a5f] break-words min-w-0">{i + 1}. {topic.title}</p>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                    topic.feasibility === "high"
                      ? "bg-green-100 text-green-700 border-green-200"
                      : topic.feasibility === "moderate"
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}>
                    {topic.feasibility} feasibility
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
                  <span>Gap: {GAP_LABELS[topic.gap_type]}</span>
                  <span>~{topic.estimated_studies.toLocaleString("en-US")} primary studies</span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{topic.rationale}</p>
              </div>
            ))}
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
  high: "bg-green-100 text-green-800 border-green-200",
  moderate: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-orange-100 text-orange-800 border-orange-200",
};

function DesignTab({ studyDesign, gapAnalysis, feasibilityScore, isPending, onAnalyze, error }: {
  studyDesign: StudyDesignRecommendation | null;
  gapAnalysis: GapAnalysis | null;
  feasibilityScore: FeasibilityScore | null;
  isPending: boolean;
  onAnalyze: () => void;
  error: string | null;
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
          <div className="p-4 sm:p-5 space-y-4">
            <p className="text-base font-semibold text-[#1e3a5f] leading-snug break-words">{topTopic.title}</p>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected outcomes</p>
              <p className="text-sm text-gray-700 leading-relaxed">{topTopic.expected_outcomes}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Why this review?</p>
              <p className="text-sm text-gray-600 leading-relaxed">{topTopic.rationale}</p>
            </div>
          </div>
        </div>
      )}

      {/* Study design method */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 sm:p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Recommended study design</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-lg font-bold text-gray-800">{studyDesign.primary}</p>
            {studyDesign.confidence && (
              <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                studyDesign.confidence === "high"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : studyDesign.confidence === "moderate"
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}>
                {studyDesign.confidence} confidence
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">{studyDesign.rationale}</p>
        </div>

        {studyDesign.steps && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How to conduct it</p>
            <ol className="space-y-2">
              {studyDesign.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-700">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-[#1e3a5f] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {studyDesign.example_paper && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Example published paper</p>
            <p className="text-sm text-gray-700 leading-relaxed mb-1">{studyDesign.example_paper.citation}</p>
            <a
              href={studyDesign.example_paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#4a90d9] hover:underline transition-colors"
            >
              View paper →
            </a>
          </div>
        )}
      </div>

      {studyDesign.alternatives.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Alternative Designs</h3>
          <div className="space-y-2">
            {studyDesign.alternatives.map((alt, i) => (
              <div key={i} className="border border-gray-200 rounded-md p-4 transition-shadow hover:shadow-sm">
                <p className="text-sm font-medium text-gray-800 mb-1">{alt.type}</p>
                <p className="text-sm text-gray-500">{alt.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Methodology Resources</h3>
        <div className="flex flex-wrap gap-2">
          {studyDesign.methodology_links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[#4a90d9] hover:underline border border-[#4a90d9] rounded px-3 py-1 transition-colors hover:bg-blue-50"
            >
              {link.label} →
            </a>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 italic">AI-generated — verify all recommendations with domain expertise.</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PRISMA Flow tab                                                            */
/* -------------------------------------------------------------------------- */

function PrismaFlowTab({
  existingReviews,
  primaryStudyCount,
  clinicalTrialsCount,
  prosperoRegistrationsCount,
  deduplicationCount,
  query,
}: {
  existingReviews: ExistingReview[];
  primaryStudyCount: number;
  clinicalTrialsCount?: number | null;
  prosperoRegistrationsCount?: number | null;
  /** Number of cross-database duplicates removed. Null for pre-migration results. */
  deduplicationCount?: number | null;
  query: string;
}) {
  const data = computePrismaData(
    existingReviews,
    primaryStudyCount,
    clinicalTrialsCount ?? null,
    prosperoRegistrationsCount ?? null,
    deduplicationCount ?? null
  );

  const prosperoUrl = `https://www.crd.york.ac.uk/prospero/display_record.php?RecordID=&SearchKeyword=${encodeURIComponent(query)}`;

  // When we have a deduplication count, we can show the full PRISMA 2020 flow:
  // Records identified → Duplicates removed (side box) → Records screened → Included
  const hasDedupData = data.deduplicationCount !== null && data.deduplicationCount >= 0;
  const totalIdentified = hasDedupData
    ? data.reviewsRetrieved + (data.deduplicationCount as number)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700">PRISMA 2020 Flow Diagram</h3>
        <p className="text-xs text-gray-500 mt-1">
          Based on Blindspot&apos;s initial scoping search. Use this as the starting point for your
          systematic review protocol.{hasDedupData
            ? " Identification counts show unique records attributed to each source. Duplicate removal reflects cross-database overlap by title, DOI, and PMID."
            : " Counts are post-deduplication (cross-database duplicates removed by title, DOI, and PMID)."}
        </p>
      </div>

      {/* Flow diagram */}
      <div className="prisma-flow-diagram" aria-label="PRISMA 2020 flow diagram">

        {/* Phase label: Identification */}
        <div className="prisma-phase-label">
          <span>IDENTIFICATION</span>
        </div>

        {/* Database boxes row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
          {data.sources
            .filter((s) => ["PubMed", "OpenAlex", "Europe PMC", "Semantic Scholar"].includes(s.name))
            .map((source) => (
              <div key={source.name} className="prisma-box prisma-box-source">
                <span className="prisma-box-label">{source.name}</span>
                <span className="prisma-box-count">n&nbsp;=&nbsp;{source.count.toLocaleString("en-US")}</span>
              </div>
            ))}
        </div>
        <p className="text-[10px] text-gray-400 text-center mb-3">
          {hasDedupData
            ? "Records attributed to first source that found them (post-deduplication)."
            : "Counts reflect unique records attributed to each database after cross-database deduplication."}
        </p>

        {/* Total identified box — shown only when deduplication data is available */}
        {hasDedupData && totalIdentified !== null && (
          <div className="flex justify-center mb-1">
            <div className="prisma-box prisma-box-process w-full sm:w-2/3">
              <span className="prisma-box-label">Records identified</span>
              <span className="prisma-box-sublabel">Across all databases (before deduplication)</span>
              <span className="prisma-box-count">n&nbsp;=&nbsp;{totalIdentified.toLocaleString("en-US")}</span>
            </div>
          </div>
        )}

        {/* Arrow down */}
        <div className="flex justify-center mb-1">
          <div className="prisma-arrow" aria-hidden="true">↓</div>
        </div>

        {/* Phase label: Screening */}
        <div className="prisma-phase-label">
          <span>SCREENING</span>
        </div>

        {/* Screening row: main box + duplicates-removed side box (when data available) */}
        <div className={`flex gap-2 items-start mb-1 ${hasDedupData ? "flex-col sm:flex-row" : "justify-center"}`}>
          <div className={`prisma-box prisma-box-process ${hasDedupData ? "flex-1" : "w-full sm:w-2/3"}`}>
            <span className="prisma-box-label">After deduplication</span>
            <span className="prisma-box-sublabel">Records screened (title &amp; abstract)</span>
            <span className="prisma-box-count">n&nbsp;=&nbsp;{data.reviewsRetrieved.toLocaleString("en-US")}</span>
            {!hasDedupData && (
              <span className="prisma-box-note">
                (Blindspot deduplicates by title, DOI &amp; PMID before storing results)
              </span>
            )}
          </div>
          {hasDedupData && (
            <div className="prisma-box prisma-box-excluded sm:w-48 shrink-0">
              <span className="prisma-box-label">Duplicates removed</span>
              <span className="prisma-box-sublabel">Title, DOI &amp; PMID match</span>
              <span className="prisma-box-count text-red-700">n&nbsp;=&nbsp;{(data.deduplicationCount as number).toLocaleString("en-US")}</span>
            </div>
          )}
        </div>

        {/* Arrow down */}
        <div className="flex justify-center mb-1">
          <div className="prisma-arrow" aria-hidden="true">↓</div>
        </div>

        {/* Phase label: Included */}
        <div className="prisma-phase-label">
          <span>INCLUDED</span>
        </div>

        {/* Included box */}
        <div className="flex justify-center mb-4">
          <div className="prisma-box prisma-box-included w-full sm:w-2/3">
            <span className="prisma-box-label">Systematic reviews retrieved</span>
            <span className="prisma-box-sublabel">Available for full-text review</span>
            <span className="prisma-box-count prisma-box-count-large">
              n&nbsp;=&nbsp;{data.reviewsRetrieved.toLocaleString("en-US")}
            </span>
          </div>
        </div>

        {/* Context row */}
        {(data.primaryStudyCount > 0 || data.clinicalTrialsCount !== null || data.prosperoCount !== null) && (
          <div className="border-t border-dashed border-gray-200 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Background Evidence Context</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="prisma-box prisma-box-context">
                <span className="prisma-box-label">Primary studies</span>
                <span className="prisma-box-sublabel">PubMed + OpenAlex + Europe PMC</span>
                <span className="prisma-box-count">{data.primaryStudyCount.toLocaleString("en-US")}</span>
              </div>
              {data.clinicalTrialsCount !== null && (
                <div className="prisma-box prisma-box-context">
                  <span className="prisma-box-label">Registered trials</span>
                  <span className="prisma-box-sublabel">ClinicalTrials.gov</span>
                  <span className="prisma-box-count">{formatCount(data.clinicalTrialsCount)}</span>
                </div>
              )}
              {data.prosperoCount !== null && (
                <div className="prisma-box prisma-box-context">
                  <span className="prisma-box-label">PROSPERO registrations</span>
                  <span className="prisma-box-sublabel">Reviews in progress</span>
                  <span className="prisma-box-count">
                    {data.prosperoCount > 0 ? (
                      <a
                        href={prosperoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-700 underline hover:text-amber-900"
                      >
                        {formatCount(data.prosperoCount)} ⚠
                      </a>
                    ) : (
                      formatCount(data.prosperoCount)
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reference + disclaimer */}
      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-500 space-y-1">
        <p>
          <strong>Reference:</strong> Page MJ, et al. The PRISMA 2020 statement: an updated
          guideline for reporting systematic reviews.{" "}
          <a
            href="https://doi.org/10.1136/bmj.n71"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#4a90d9] underline"
          >
            BMJ 2021;372:n71
          </a>
          .
        </p>
        <p>
          This is a scoping search summary. Complete your full systematic review search strategy
          before submitting your PRISMA flow to a journal. Counts above reflect Blindspot&apos;s
          initial database search — your formal review may identify additional records.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Analysis prompt (empty state)                                              */
/* -------------------------------------------------------------------------- */

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
      <p className="text-gray-700 text-sm font-medium mb-1">AI analysis not yet run</p>
      <p className="text-gray-400 text-xs mb-4">
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

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {/* Document icon */}
          <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Protocol Draft</span>
        </div>
        {status === "done" && protocol && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
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
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Download protocol as Markdown file"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              <span>Download .md</span>
            </button>
            {/* Regenerate button — lets users replace the stored draft */}
            <button
              onClick={() => { setStatus("idle"); setProtocol(null); setErrorMsg(null); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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
              <p className="text-sm font-medium text-gray-700">Generate a Review Protocol Draft</p>
              <p className="text-xs text-gray-500 mt-0.5">
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
            <div className="w-4 h-4 border-2 border-[#1e3a5f] border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
            <p className="text-sm text-gray-500">Generating protocol draft… (~20 seconds)</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-red-600 flex-1">{errorMsg}</p>
            <button
              onClick={handleGenerate}
              className="shrink-0 px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {status === "done" && protocol && (
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[480px] overflow-y-auto">
            {protocol}
          </pre>
        )}
      </div>

      {status === "done" && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-gray-400">
            AI-generated draft — review and adapt before PROSPERO registration. Verify eligibility criteria and search strategy with a medical librarian or domain expert.
          </p>
        </div>
      )}
    </div>
  );
}
