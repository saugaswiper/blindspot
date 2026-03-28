"use client";

import { useState, useTransition } from "react";
import type {
  ExistingReview,
  FeasibilityScore,
  GapAnalysis,
  StudyDesignRecommendation,
  GapDimension,
} from "@/types";
import { PrintableReport } from "@/components/PrintableReport";
import { toRis, toBibtex, downloadTextFile } from "@/lib/citation-export";

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

type Tab = "reviews" | "gaps" | "design";

interface Props {
  resultId: string;
  query: string;
  existingReviews: ExistingReview[];
  primaryStudyCount: number;
  feasibilityScore: FeasibilityScore | null;
  feasibilityExplanation: string | null;
  gapAnalysis: GapAnalysis | null;
  studyDesign: StudyDesignRecommendation | null;
}

export function ResultsDashboard({
  resultId,
  query,
  existingReviews,
  primaryStudyCount,
  feasibilityScore,
  feasibilityExplanation,
  gapAnalysis,
  studyDesign,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("reviews");
  const [isPending, startTransition] = useTransition();
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [localGapAnalysis] = useState(gapAnalysis);
  const [localStudyDesign] = useState(studyDesign);
  const [localFeasibilityScore] = useState(feasibilityScore);
  const [localFeasibilityExplanation] = useState(feasibilityExplanation);

  // Email report state
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  async function sendReport() {
    setEmailError(null);
    setEmailSending(true);
    try {
      const res = await fetch("/api/email-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, email: emailInput }),
      });
      const data = (await res.json()) as { error?: string; success?: boolean };
      if (!res.ok || data.error) {
        setEmailError(data.error ?? "Failed to send email. Please try again.");
      } else {
        setEmailSent(true);
        setShowEmailForm(false);
        setEmailInput("");
      }
    } catch {
      setEmailError("Network error. Please check your connection and try again.");
    } finally {
      setEmailSending(false);
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

  // Extract top gaps for the summary header
  const topGaps = localGapAnalysis?.gaps
    .filter((g) => g.importance === "high")
    .slice(0, 3) ?? [];

  const tabs: { key: Tab; label: string }[] = [
    { key: "reviews", label: `Existing Reviews (${existingReviews.length})` },
    { key: "gaps", label: "Gap Analysis" },
    { key: "design", label: "Study Design" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
    <div data-screen-content>
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6 mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Topic searched</p>
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
          {!hasAnalysis && !isPending && (
            <button
              onClick={runAnalysis}
              className="px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] transition-colors"
            >
              Run AI Gap Analysis
            </button>
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 border border-[#1e3a5f] text-[#1e3a5f] text-sm font-medium rounded-md hover:bg-[#1e3a5f] hover:text-white transition-colors"
              >
                Download PDF
              </button>
              {!emailSent ? (
                <button
                  onClick={() => { setShowEmailForm((v) => !v); setEmailError(null); }}
                  className="px-4 py-2 border border-gray-300 text-gray-600 text-sm font-medium rounded-md hover:border-[#4a90d9] hover:text-[#4a90d9] transition-colors"
                >
                  Email report
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-700 font-medium">
                  <span className="text-xs">✓</span> Report sent!
                </span>
              )}
            </div>
          )}
        </div>

        {/* Email report inline form */}
        {hasAnalysis && showEmailForm && !emailSent && (
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
            <p className="text-xs text-gray-500 mb-2">
              We&apos;ll send a formatted report with your gap analysis and study design recommendation.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && emailInput) sendReport(); }}
                placeholder="you@institution.edu"
                className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent text-gray-800 placeholder-gray-400"
                disabled={emailSending}
              />
              <button
                onClick={sendReport}
                disabled={emailSending || !emailInput.trim()}
                className="px-3 py-1.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-md hover:bg-[#2d5a8e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {emailSending ? "Sending…" : "Send"}
              </button>
            </div>
            {emailError && (
              <p className="mt-2 text-xs text-red-600">{emailError}</p>
            )}
          </div>
        )}

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
            <GapsTab gapAnalysis={localGapAnalysis} isPending={isPending} onAnalyze={runAnalysis} error={analysisError} />
          )}
          {activeTab === "design" && (
            <DesignTab studyDesign={localStudyDesign} gapAnalysis={localGapAnalysis} feasibilityScore={localFeasibilityScore} isPending={isPending} onAnalyze={runAnalysis} error={analysisError} />
          )}
        </div>
      </div>

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
          feasibilityScore={localFeasibilityScore}
          feasibilityExplanation={localFeasibilityExplanation}
          gapAnalysis={localGapAnalysis}
          studyDesign={localStudyDesign}
          generatedAt={new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        />
      )}
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

function GapsTab({ gapAnalysis, isPending, onAnalyze, error }: {
  gapAnalysis: GapAnalysis | null;
  isPending: boolean;
  onAnalyze: () => void;
  error: string | null;
}) {
  if (isPending) {
    return <GapsSkeleton />;
  }

  if (!gapAnalysis) {
    return <AnalysisPrompt isPending={isPending} onAnalyze={onAnalyze} error={error} />;
  }

  return (
    <div className="space-y-6">
      {gapAnalysis.overall_assessment && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-sm text-blue-800 leading-relaxed">{gapAnalysis.overall_assessment}</p>
          <p className="text-xs text-blue-500 mt-1">AI-generated assessment — verify with domain expertise</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Identified Gaps</h3>
        <div className="space-y-2">
          {gapAnalysis.gaps.map((gap, i) => (
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
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Suggested Review Topics</h3>
        <div className="space-y-3">
          {gapAnalysis.suggested_topics.map((topic, i) => (
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
      </div>
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
