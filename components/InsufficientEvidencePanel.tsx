"use client";

import { useState } from "react";

interface InsufficientEvidencePanelProps {
  primaryStudyCount: number;
}

export function InsufficientEvidencePanel({
  primaryStudyCount,
}: InsufficientEvidencePanelProps) {
  const [showSecondaryMessage, setShowSecondaryMessage] = useState(false);

  const studyText =
    primaryStudyCount === 0
      ? "No primary studies were found"
      : primaryStudyCount === 1
      ? "Only 1 primary study was found"
      : `Only ${primaryStudyCount} primary studies were found`;

  const scopeReviewUrl = `https://www.google.com/search?q=how+to+conduct+scoping+review+systematic+review`;

  return (
    <div className="space-y-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
      {/* Main warning callout */}
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-5">
        <div className="flex gap-3">
          <span className="text-2xl shrink-0 pt-0.5">⚠️</span>
          <div>
            <h3 className="font-semibold text-red-900 dark:text-red-300 mb-1">
              Not Enough Primary Studies
            </h3>
            <p className="text-sm text-red-800 dark:text-red-200 leading-relaxed">
              {studyText}. <strong>A systematic review is not feasible on this exact topic.</strong>
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-2 italic">
              The Cochrane Handbook notes that a systematic review with fewer than 3 studies cannot produce meaningful gap analysis. Gap identification requires sufficient evidence to analyze.
            </p>
          </div>
        </div>
      </div>

      {/* Next steps section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-3">
          What You Can Do
        </h4>

        <div className="space-y-3">
          {/* Option 1: Scoping review */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md p-3">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-1">
              Consider a Scoping Review First
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
              A scoping review can map whether primary research even exists on your question. This may reveal a broader topic with sufficient evidence for a systematic review.
            </p>
            <a
              href={scopeReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
            >
              Learn about scoping reviews →
            </a>
          </div>

          {/* Option 2: Broaden the topic */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-3">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-300 mb-1">
              Try a Broader Topic
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              Widen your population, outcome, or intervention criteria. For example, instead of &ldquo;CBT for insomnia in elderly with comorbid anxiety,&rdquo; try &ldquo;CBT for insomnia in elderly&rdquo; or &ldquo;Psychological interventions for insomnia.&rdquo;
            </p>
          </div>

          {/* Option 3: Primary research */}
          <div
            className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-md p-3 cursor-pointer hover:shadow-sm transition-shadow"
            onClick={() => setShowSecondaryMessage(!showSecondaryMessage)}
          >
            <p className="text-xs font-medium text-purple-900 dark:text-purple-300 mb-1">
              Register a Primary Research Study
            </p>
            <p className="text-xs text-purple-800 dark:text-purple-200 leading-relaxed">
              If no evidence exists, this gap represents an important research opportunity. Consider designing and registering a primary research study instead.
            </p>
            {showSecondaryMessage && (
              <a
                href="https://clinicaltrials.gov/study-record/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-purple-600 dark:text-purple-400 hover:underline mt-2"
              >
                Register on ClinicalTrials.gov →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Methodology note */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 border border-gray-200 dark:border-gray-700">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <strong>Why this matters:</strong> Blindspot searched PubMed, OpenAlex, Europe PMC, Semantic Scholar, and ClinicalTrials.gov.{" "}
          <strong>A minimum of 3 primary studies</strong> is needed for even a scoping review. Running AI analysis on insufficient evidence would produce speculative—not evidence-based—recommendations.
        </p>
      </div>
    </div>
  );
}
