// ---------------------------------------------------------------------------
// Search input types
// ---------------------------------------------------------------------------

export interface PICOInput {
  population: string;
  intervention: string;
  comparison?: string;
  outcome: string;
}

export type SearchMode = "simple" | "pico";

export interface SearchInput {
  mode: SearchMode;
  queryText?: string; // simple mode
  pico?: PICOInput;  // pico mode
  /**
   * ACC-8: Optional minimum publication year filter for primary study counts.
   * When set, only studies published on or after this year are counted toward
   * feasibility scoring. Prevents inflated High scores on topics where most
   * evidence is old (e.g., "telemedicine for chronic disease" → mostly pre-2015).
   * Valid range: 1990–current year.
   */
  minYear?: number;
}

// ---------------------------------------------------------------------------
// Database row types (mirror Supabase schema)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  institution: string | null;
  created_at: string;
  updated_at: string;
}

export interface Search {
  id: string;
  user_id: string;
  query_text: string;
  pico_population: string | null;
  pico_intervention: string | null;
  pico_comparison: string | null;
  pico_outcome: string | null;
  created_at: string;
}

export interface ExistingReview {
  title: string;
  year: number;
  journal: string;
  abstract_snippet: string;
  pmid?: string;
  doi?: string;
  source?: string;
  /**
   * Per-record provenance: every source that returned this record after
   * cross-source deduplication (e.g. ["PubMed", "Europe PMC"]). `source` is the
   * first/canonical source; `sources` is the full auditable set. Populated by
   * lib/provenance.ts; absent on records saved before provenance was added.
   */
  sources?: string[];
  /**
   * Retraction/withdrawal status when flagged by lib/retractions.ts. Advisory,
   * for display/export only — never auto-removes the record.
   */
  retraction?: { type: string; label: string; noticeDoi?: string };
  /**
   * NEW-7: Whether this review is a living systematic review (continuously updated).
   * Set when title or abstract mentions "living systematic review" or "living review".
   * Helps researchers prioritize continuously-updated reviews over one-time snapshots.
   */
  isLivingReview?: boolean;
}

export type FeasibilityScore = "High" | "Moderate" | "Low" | "Insufficient";
export type ExistingReviewStatus = "novel" | "update_opportunity" | "recent_exists";

export interface FeasibilityResult {
  score: FeasibilityScore;
  primary_study_count: number;
  existing_review_status: ExistingReviewStatus;
  explanation: string;
  flags: string[];
}

export type GapDimension =
  | "population"
  | "methodology"
  | "outcome"
  | "geographic"
  | "temporal"
  | "theoretical";

export interface Gap {
  dimension: GapDimension;
  description: string;
  importance: "high" | "medium" | "low";
}

export interface SuggestedTopic {
  title: string;
  gap_type: GapDimension;
  pubmed_query: string;
  estimated_studies: number;
  rationale: string;
  feasibility: "high" | "moderate" | "low";
  expected_outcomes: string;
  /**
   * ACC-4: Actual PubMed-verified feasibility score, overriding the AI estimate.
   * Absent on results that predate this field (before v028).
   * When present, use this for badge color and labeling; show AI estimate as
   * secondary context only.
   */
  verified_feasibility?: FeasibilityScore;
  /**
   * ACC-14: Whether the topic's pubmed_query terms were found in PubMed's MeSH vocabulary.
   * false = none of the key terms are recognized MeSH concepts → ⚠ Non-standard term badge.
   * undefined = check not yet run (pre-feature results).
   * true = at least one term matched MeSH → standard vocabulary.
   */
  mesh_validated?: boolean;
}

export interface GapAnalysis {
  gaps: Gap[];
  suggested_topics: SuggestedTopic[];
  overall_assessment: string;
  /**
   * AI-generated PubMed Boolean search string for the topic.
   * Optional: absent on results that predate this field (before v008).
   * Uses MeSH terms and [tiab] qualifiers in standard PubMed syntax.
   */
  boolean_search_string?: string;
  /**
   * AI-generated Embase Boolean search string for the topic.
   * Optional: absent on results generated before multi-database support (handoff 068+).
   * Uses Embase-specific syntax: EMTREE terms with / qualifier, free-text with :ti,ab/
   */
  embase_string?: string;
  /**
   * AI-generated Cochrane CENTRAL Boolean search string for the topic.
   * Optional: absent on results generated before multi-database support (handoff 068+).
   * Uses CENTRAL/Cochrane syntax similar to PubMed with MeSH compatibility.
   */
  central_string?: string;
  /**
   * ACC-3: Number of existing reviews actually sent to Gemini for analysis
   * (capped at 20 by the prompt builder). Absent on pre-v028 results.
   * Used to display an AI confidence badge:
   *   ≥ 20 → "High Confidence"
   *   10–19 → "Moderate Confidence"
   *   5–9  → "Low Confidence"
   *   < 5  → "Very Low Confidence"
   */
  reviews_analyzed_count?: number;
}

export type StudyDesignType =
  | "Systematic Review with Meta-Analysis"
  | "Systematic Review (Narrative Synthesis)"
  | "Scoping Review"
  | "Rapid Review"
  | "Umbrella Review"
  | "Primary Research Needed";

export interface StudyDesignRecommendation {
  primary: StudyDesignType;
  rationale: string;
  steps: string[];
  example_paper: { citation: string; url: string };
  alternatives: { type: StudyDesignType; rationale: string }[];
  methodology_links: { label: string; url: string }[];
  /** Confidence in the recommendation: high = strong evidence match, moderate = borderline, low = alignment correction applied */
  confidence?: "high" | "moderate" | "low";
}

export type StudyTrend = "growing" | "stable" | "declining";

/**
 * Derives a study field trend from total vs recent primary study counts.
 *
 * Heuristic (NEW-2):
 *   ≥ 35% of studies published in the last 3 years → "growing"
 *   15–34% of studies in the last 3 years          → "stable"
 *   < 15% in the last 3 years                      → "declining"
 *
 * Returns null when:
 *   - recentCount is null (data unavailable or pre-v030 result)
 *   - totalCount < 5 (too few studies for a meaningful trend)
 */
export function deriveStudyTrend(
  totalCount: number,
  recentCount: number | null
): StudyTrend | null {
  if (recentCount === null) return null;
  if (totalCount < 5) return null;
  const ratio = recentCount / totalCount;
  if (ratio >= 0.35) return "growing";
  if (ratio >= 0.15) return "stable";
  return "declining";
}

export interface SearchResult {
  id: string;
  search_id: string;
  existing_reviews: ExistingReview[];
  primary_study_count: number;
  /**
   * Number of primary studies published in the last 3 years.
   * Null if unavailable (API failure, or pre-v030 result).
   * Used with primary_study_count to derive a StudyTrend indicator.
   */
  recent_primary_study_count: number | null;
  /**
   * UI-1: Individual source counts (primary studies only, reviews excluded).
   * Null when the source API was unavailable or the result predates migration 012.
   * Displayed as an expandable breakdown under the blended primary_study_count.
   */
  pubmed_count: number | null;
  openalex_count: number | null;
  europepmc_count: number | null;
  /**
   * Number of studies registered on ClinicalTrials.gov for this query.
   * Null if the count was not available when the search was run (e.g. the
   * API was down, or the result predates migration 004).
   */
  clinical_trials_count: number | null;
  /**
   * Number of systematic reviews registered on PROSPERO for this query.
   * Null if the count was not available when the search was run (e.g. the
   * PROSPERO API was down, or the result predates PROSPERO integration).
   */
  prospero_registrations_count: number | null;
  /**
   * Number of systematic review protocols registered on OSF Registries for this query.
   * Null if the count was not available when the search was run (e.g. the
   * OSF API was down, or the result predates migration 015).
   */
  osf_registrations_count: number | null;
  feasibility_score: FeasibilityScore;
  feasibility_explanation: string;
  gap_analysis: GapAnalysis | null;
  study_design_recommendation: StudyDesignRecommendation | null;
  /** Whether this result is publicly accessible without authentication. */
  is_public: boolean;
  created_at: string;
  expires_at: string;
  /**
   * Most recent screening run result for this search.
   * Null when the owner hasn't run screening yet (migration 023+).
   */
  screening_result?: ScreeningResult | null;
}

// ---------------------------------------------------------------------------
// Screening types
// ---------------------------------------------------------------------------

/**
 * Inclusion/exclusion criteria generated by AI for a specific research gap topic.
 * Used to screen the existing_reviews list for relevance to that gap.
 */
export interface ScreeningCriteria {
  /** Criterion strings a study must satisfy to be included (e.g. "RCT design"). */
  inclusion: string[];
  /** Criterion strings that disqualify a study (e.g. "animal studies only"). */
  exclusion: string[];
  /** One-sentence description of the specific gap this screening targets. */
  focus_gap: string;
  /** Gap dimension these criteria target. */
  gap_type: GapDimension;
  /** Title of the suggested review topic these criteria were generated for. */
  topic_title: string;
}

/**
 * PRISMA-aligned exclusion reason codes for the "exclude" decision.
 * Maps to the standard reason categories required by PRISMA 2020 flow diagrams.
 * Only present on "exclude" decisions; undefined on "include" / "uncertain".
 */
export type ScreeningReasonCode =
  | "wrong_population"      // participants do not match the target population
  | "wrong_intervention"    // intervention/exposure differs from the gap focus
  | "wrong_outcome"         // does not measure relevant outcomes
  | "wrong_design"          // study design does not meet inclusion criteria
  | "wrong_timeframe"       // publication or follow-up period outside scope
  | "duplicate"             // duplicate of another included record
  | "not_systematic_review" // not a systematic review (e.g. primary study, editorial)
  | "insufficient_data"     // too little information in title/abstract to assess
  | "off_topic";            // topic does not address the identified gap

/**
 * A human-verified decision used to calibrate AI re-screening.
 * Sent with refine requests so the model can learn how this reviewer
 * interprets the criteria (active-learning loop).
 */
export interface CalibrationExample {
  title: string;
  year?: number;
  abstract_snippet?: string;
  /** The reviewer's final verdict for this record. */
  human_decision: "include" | "exclude" | "uncertain";
  /** What the AI originally said — a mismatch marks a correction. */
  ai_decision?: "include" | "exclude" | "uncertain";
}

/** AI screening verdict for a single existing review. */
export interface ScreeningDecision {
  title: string;
  year: number;
  journal: string;
  pmid?: string;
  doi?: string;
  /**
   * Abstract snippet captured at screening time. Stored so refine runs
   * (re-screening with reviewer feedback) can re-evaluate the record without
   * refetching from the literature sources. Absent on results saved before
   * this field was added — those refine on title alone.
   */
  abstract_snippet?: string;
  /**
   * include  → meets all inclusion criteria and no exclusion criteria
   * exclude  → violates at least one exclusion criterion or fails inclusion
   * uncertain → cannot be reliably decided from title/abstract alone
   */
  decision: "include" | "exclude" | "uncertain";
  /** One-sentence reason for the decision. */
  reason: string;
  /**
   * PRISMA-aligned reason code for excluded decisions.
   * Undefined for "include" and "uncertain" decisions.
   */
  reason_code?: ScreeningReasonCode;
  /**
   * Retraction/withdrawal status when flagged by lib/retractions.ts (via search route).
   * Advisory, for display/export only — never auto-removes the record.
   * Helps researchers identify studies that have been withdrawn or retracted after
   * initial publication. Important for systematic review integrity.
   */
  retraction?: { type: string; label: string; noticeDoi?: string };
  /**
   * AI confidence in the decision. High = clear-cut; low = borderline.
   * Used to flag which decisions most need human review.
   */
  confidence?: "high" | "medium" | "low";
  /**
   * Per-criterion chain-of-thought breakdown from Gemini.
   * Optional: absent on results generated before chain-of-thought support.
   * One entry per inclusion and exclusion criterion evaluated.
   */
  criterion_results?: Array<{
    criterion: string;
    type: "inclusion" | "exclusion";
    met: boolean;
    note: string;
  }>;
  /**
   * Human override of the AI verdict (RAISE guidance: all AI screening
   * decisions must remain subject to human review). When set, this — not
   * `decision` — is the effective verdict used for counts, filters, and
   * exports. The original AI `decision` is preserved as the audit trail.
   */
  human_decision?: "include" | "exclude" | "uncertain";
  /** ISO timestamp of when the human override was made. */
  human_decided_at?: string;
  /**
   * True when this decision was produced by a refine pass — a re-screen of
   * flagged records using the reviewer's verified decisions as calibration
   * examples (active-learning loop).
   */
  refined?: boolean;
  /**
   * Resolved open-access full-text URL for an included study (Brief 001).
   * Populated on demand via /api/fulltext; absent until the reviewer fetches it.
   */
  fulltext_url?: string;
  /** Which source in the OA chain returned `fulltext_url` (provenance). */
  fulltext_source?: FulltextSource;
  /** ISO timestamp of when the full text was resolved. */
  fulltext_fetched_at?: string;
}

// ---------------------------------------------------------------------------
// Full-text retrieval (Brief 001)
// ---------------------------------------------------------------------------

/** Which source in the open-access resolution chain returned the full text. */
export type FulltextSource =
  | "unpaywall"
  | "openalex"
  | "europepmc"
  | "pmc"
  | "user_upload";

/**
 * Open-access colour status (Unpaywall taxonomy). `closed` URLs are never
 * returned — the resolution chain gates them out before producing a result.
 */
export type FulltextOaStatus = "gold" | "green" | "hybrid" | "bronze" | "closed";

/** Whether the resolved URL points at a PDF or an HTML/XML full-text page. */
export type FulltextContentType = "pdf" | "html";

/**
 * Reason a full-text resolution produced no URL. `paywalled` means a record
 * was found but is closed-access; `source_error` means a source threw;
 * `all_sources_failed` means every applicable source returned nothing.
 * `no_doi` / `no_pmid` are reserved for callers that key on a single id.
 */
export type FulltextFailureReason =
  | "no_doi"
  | "no_pmid"
  | "paywalled"
  | "all_sources_failed"
  | "source_error";

/** A successfully resolved open-access full-text location with provenance. */
export interface FulltextResult {
  /** The resolved open-access URL (PDF or HTML/XML). Never paywalled. */
  url: string;
  /** Which source in the chain returned it (the audit trail Otto-SR lacks). */
  source: FulltextSource;
  /** OA colour status; guaranteed `!== "closed"`. */
  oa_status: FulltextOaStatus;
  /** PDF vs HTML/XML — lets the UI choose the right viewer affordance. */
  content_type: FulltextContentType;
}

/** Full screening run result stored on the search_result row. */
export interface ScreeningResult {
  /** The approved criteria used for this screening run. */
  criteria: ScreeningCriteria;
  /** Per-record decision list (same order as screened records). */
  decisions: ScreeningDecision[];
  included_count: number;
  excluded_count: number;
  uncertain_count: number;
  /**
   * What was screened:
   *   "primary" — primary studies fetched from OpenAlex at run time
   *   "reviews" — existing systematic reviews stored on the result row
   * Defaults to "primary" for results generated after 2026-06-09.
   * Absent on results saved before this field was added.
   */
  screen_type?: "primary" | "reviews";
  /** ISO timestamp of when the screening ran. */
  run_at: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
}

export type ApiResponse<T> = T | ApiError;
