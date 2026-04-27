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
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
}

export type ApiResponse<T> = T | ApiError;
