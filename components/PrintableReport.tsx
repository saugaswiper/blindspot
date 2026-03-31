"use client";

import type {
  ExistingReview,
  FeasibilityScore,
  GapAnalysis,
  StudyDesignRecommendation,
  GapDimension,
} from "@/types";
import { computePrismaData } from "@/lib/prisma-diagram";

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
  /** Null means the ClinicalTrials.gov count was unavailable; omit the stat. */
  clinicalTrialsCount?: number | null;
  /** Null means the PROSPERO count was unavailable; omit the stat. */
  prosperoRegistrationsCount?: number | null;
  /**
   * Number of cross-database duplicate records removed during deduplication.
   * Null for results stored before migration 007 — diagram falls back to
   * the previous "after deduplication" single-box display.
   */
  deduplicationCount?: number | null;
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
  clinicalTrialsCount = null,
  prosperoRegistrationsCount = null,
  deduplicationCount = null,
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
          {clinicalTrialsCount !== null && clinicalTrialsCount !== undefined && (
            <div>
              <span className="stat-label">Registered trials (ClinicalTrials.gov)</span>
              <span className="stat-value">{clinicalTrialsCount.toLocaleString("en-US")}</span>
            </div>
          )}
          {prosperoRegistrationsCount !== null && prosperoRegistrationsCount !== undefined && (
            <div>
              <span className="stat-label">PROSPERO registrations</span>
              <span className="stat-value">{prosperoRegistrationsCount.toLocaleString("en-US")}</span>
            </div>
          )}
          {feasibilityScore && (
            <div>
              <span className="stat-label">Feasibility</span>
              <span className="stat-value">{feasibilityScore}</span>
            </div>
          )}
        </div>

        {prosperoRegistrationsCount !== null && prosperoRegistrationsCount !== undefined && prosperoRegistrationsCount > 0 && (
          <div className="report-prospero-warning">
            <p style={{ marginBottom: "4pt" }}>
              <strong>PROSPERO Alert:</strong> {prosperoRegistrationsCount} systematic review{prosperoRegistrationsCount !== 1 ? "s" : ""} may already be registered on PROSPERO for this topic. Check the{" "}
              <a href="https://www.crd.york.ac.uk/prospero/">PROSPERO registry</a> before proceeding.
            </p>
          </div>
        )}

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

        {gapAnalysis.boolean_search_string && (
          <>
            <h3>Draft PubMed Boolean Search String</h3>
            <p className="report-topic-meta">
              AI-generated draft — verify MeSH terms and adapt for your target database before use in a formal review protocol.
            </p>
            <pre className="report-boolean-string">{gapAnalysis.boolean_search_string.trim()}</pre>
          </>
        )}
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

      {/* PRISMA Flow Diagram */}
      <section className="report-prisma-section">
        <h2>PRISMA 2020 Flow Diagram (Scoping Search)</h2>
        {(() => {
          const prismaData = computePrismaData(
            existingReviews,
            primaryStudyCount,
            clinicalTrialsCount ?? null,
            prosperoRegistrationsCount ?? null,
            deduplicationCount ?? null
          );
          const knownSources = prismaData.sources.filter((s) =>
            ["PubMed", "OpenAlex", "Europe PMC", "Semantic Scholar"].includes(s.name)
          );
          const hasDedupData = prismaData.deduplicationCount !== null && prismaData.deduplicationCount >= 0;
          const totalIdentified = hasDedupData
            ? prismaData.reviewsRetrieved + (prismaData.deduplicationCount as number)
            : null;
          return (
            <>
              {/* Identification phase */}
              <div className="report-prisma-phase">Identification</div>
              <div className="report-prisma-sources-row">
                {knownSources.map((source) => (
                  <div key={source.name} className="report-prisma-source-box">
                    <span className="report-prisma-source-name">{source.name}</span>
                    <span className="report-prisma-source-count">n = {source.count.toLocaleString("en-US")}</span>
                  </div>
                ))}
              </div>
              <p className="report-prisma-dedup-note">
                {hasDedupData
                  ? "Records attributed to first source that found them (post-deduplication)."
                  : "Counts reflect unique records attributed to each database after cross-database deduplication (by title, DOI, PMID)."}
              </p>

              {/* Total identified box — only when dedup data is available */}
              {hasDedupData && totalIdentified !== null && (
                <div className="report-prisma-box" style={{ width: "60%", margin: "0 auto 4pt" }}>
                  <span className="report-prisma-box-label">Records identified</span>
                  <span className="report-prisma-box-sublabel">Across all databases (before deduplication)</span>
                  <span className="report-prisma-box-count">n = {totalIdentified.toLocaleString("en-US")}</span>
                </div>
              )}

              {/* Arrow */}
              <div className="report-prisma-arrow">↓</div>

              {/* Screening phase */}
              <div className="report-prisma-phase">Screening</div>
              <div className="report-prisma-box" style={{ width: "60%", margin: "0 auto 4pt" }}>
                <span className="report-prisma-box-label">After deduplication</span>
                <span className="report-prisma-box-sublabel">Records screened (title &amp; abstract)</span>
                <span className="report-prisma-box-count">n = {prismaData.reviewsRetrieved.toLocaleString("en-US")}</span>
              </div>
              {/* Duplicates removed note — only when dedup data is available */}
              {hasDedupData && (
                <p className="report-prisma-dedup-note" style={{ textAlign: "center", marginBottom: "4pt" }}>
                  Duplicates removed (title, DOI &amp; PMID match): n = {(prismaData.deduplicationCount as number).toLocaleString("en-US")}
                </p>
              )}

              {/* Arrow */}
              <div className="report-prisma-arrow">↓</div>

              {/* Included phase */}
              <div className="report-prisma-phase">Included</div>
              <div className="report-prisma-box report-prisma-box-included" style={{ width: "60%", margin: "0 auto 8pt" }}>
                <span className="report-prisma-box-label">Systematic reviews retrieved</span>
                <span className="report-prisma-box-sublabel">Available for full-text review</span>
                <span className="report-prisma-box-count">n = {prismaData.reviewsRetrieved.toLocaleString("en-US")}</span>
              </div>

              {/* Context */}
              <div className="report-prisma-context">
                <span className="report-prisma-context-label">Background Evidence Context</span>
                <div className="report-prisma-context-row">
                  <div className="report-prisma-context-box">
                    <span className="report-prisma-source-name">Primary studies</span>
                    <span className="report-prisma-source-count">{prismaData.primaryStudyCount.toLocaleString("en-US")}</span>
                  </div>
                  {prismaData.clinicalTrialsCount !== null && (
                    <div className="report-prisma-context-box">
                      <span className="report-prisma-source-name">Registered trials</span>
                      <span className="report-prisma-source-count">{prismaData.clinicalTrialsCount.toLocaleString("en-US")}</span>
                    </div>
                  )}
                  {prismaData.prosperoCount !== null && (
                    <div className="report-prisma-context-box">
                      <span className="report-prisma-source-name">PROSPERO registrations</span>
                      <span className="report-prisma-source-count">{prismaData.prosperoCount.toLocaleString("en-US")}</span>
                    </div>
                  )}
                </div>
              </div>

              <p className="report-prisma-reference">
                Reference: Page MJ, et al. The PRISMA 2020 statement: an updated guideline for
                reporting systematic reviews. BMJ 2021;372:n71. doi:10.1136/bmj.n71
              </p>
            </>
          );
        })()}
      </section>

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
