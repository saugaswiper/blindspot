"use client";

import type {
  ExistingReview,
  FeasibilityScore,
  GapAnalysis,
  StudyDesignRecommendation,
  GapDimension,
} from "@/types";

const GAP_LABELS: Record<GapDimension, string> = {
  population: "Population",
  methodology: "Methodological",
  outcome: "Outcome",
  geographic: "Geographic",
  temporal: "Temporal",
  theoretical: "Theoretical",
};

interface Props {
  query: string;
  existingReviews: ExistingReview[];
  primaryStudyCount: number;
  feasibilityScore: FeasibilityScore | null;
  feasibilityExplanation: string | null;
  gapAnalysis: GapAnalysis;
  studyDesign: StudyDesignRecommendation;
  generatedAt: string;
}

export function PrintableReport({
  query,
  existingReviews,
  primaryStudyCount,
  feasibilityScore,
  feasibilityExplanation,
  gapAnalysis,
  studyDesign,
  generatedAt,
}: Props) {
  return (
    <div id="printable-report" style={{ display: "none" }}>
      {/* Header */}
      <div className="report-header">
        <h1>Blindspot Research Gap Report</h1>
        <p className="report-meta">Generated {generatedAt} &middot; blindspot.app</p>
        <p className="report-disclaimer">
          AI-generated analysis — verify all findings with domain expertise before use.
        </p>
      </div>

      {/* Topic + Summary */}
      <section className="report-section">
        <h2>Topic Searched</h2>
        <p className="report-query">{query}</p>

        <div className="report-stats">
          <div>
            <span className="stat-label">Primary studies found</span>
            <span className="stat-value">{primaryStudyCount.toLocaleString("en-US")}</span>
          </div>
          <div>
            <span className="stat-label">Existing reviews found</span>
            <span className="stat-value">{existingReviews.length}</span>
          </div>
          {feasibilityScore && (
            <div>
              <span className="stat-label">Feasibility</span>
              <span className="stat-value">{feasibilityScore}</span>
            </div>
          )}
        </div>

        {feasibilityExplanation && (
          <p className="report-explanation">{feasibilityExplanation}</p>
        )}
      </section>

      {/* Gap Analysis */}
      <section className="report-section">
        <h2>Gap Analysis</h2>
        <p className="report-ai-note">AI-generated &mdash; verify with domain expertise</p>

        {gapAnalysis.overall_assessment && (
          <p className="report-assessment">{gapAnalysis.overall_assessment}</p>
        )}

        <h3>Identified Gaps</h3>
        <ul className="report-gaps">
          {gapAnalysis.gaps.map((gap, i) => (
            <li key={i}>
              <strong>{GAP_LABELS[gap.dimension]} ({gap.importance} importance):</strong>{" "}
              {gap.description}
            </li>
          ))}
        </ul>

        <h3>Suggested Review Topics</h3>
        {gapAnalysis.suggested_topics.map((topic, i) => (
          <div key={i} className="report-topic">
            <p className="report-topic-title">{i + 1}. {topic.title}</p>
            <p className="report-topic-meta">
              Gap type: {GAP_LABELS[topic.gap_type]} &middot;
              Feasibility: {topic.feasibility} &middot;
              ~{topic.estimated_studies.toLocaleString("en-US")} primary studies
            </p>
            <p>{topic.rationale}</p>
          </div>
        ))}
      </section>

      {/* Study Design */}
      <section className="report-section">
        <h2>Recommended Study Design</h2>
        <p className="report-design-primary">{studyDesign.primary}</p>
        <p>{studyDesign.rationale}</p>

        {studyDesign.steps && (
          <>
            <h3>How to Conduct It</h3>
            <ol className="report-gaps">
              {studyDesign.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        )}

        {studyDesign.example_paper && (
          <>
            <h3>Example Published Paper</h3>
            <p className="report-topic-meta">{studyDesign.example_paper.citation}</p>
            <p className="report-topic-meta">{studyDesign.example_paper.url}</p>
          </>
        )}

        {studyDesign.alternatives.length > 0 && (
          <>
            <h3>Alternative Designs</h3>
            <ul className="report-gaps">
              {studyDesign.alternatives.map((alt, i) => (
                <li key={i}><strong>{alt.type}:</strong> {alt.rationale}</li>
              ))}
            </ul>
          </>
        )}

        <h3>Methodology Resources</h3>
        <ul className="report-gaps">
          {studyDesign.methodology_links.map((link) => (
            <li key={link.url}>{link.label}: {link.url}</li>
          ))}
        </ul>
      </section>

      {/* Existing Reviews */}
      {existingReviews.length > 0 && (
        <section className="report-section">
          <h2>Existing Systematic Reviews</h2>
          {existingReviews.map((review, i) => (
            <div key={i} className="report-review">
              <p className="report-review-title">{review.title}</p>
              <p className="report-review-meta">
                {review.journal} &middot; {review.year || "Year unknown"}
                {review.pmid && ` · PMID: ${review.pmid}`}
                {review.doi && ` · DOI: ${review.doi}`}
              </p>
              {review.abstract_snippet && (
                <p className="report-review-abstract">{review.abstract_snippet}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Footer */}
      <div className="report-footer">
        <p>
          Results sourced from PubMed and OpenAlex. AI-generated analysis (gap analysis section)
          may contain errors — verify all findings with domain expertise before use in academic work.
        </p>
        <p>Generated by Blindspot &middot; {generatedAt}</p>
      </div>
    </div>
  );
}
