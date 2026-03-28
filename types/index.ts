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
}

export interface GapAnalysis {
  gaps: Gap[];
  suggested_topics: SuggestedTopic[];
  overall_assessment: string;
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
}

export interface SearchResult {
  id: string;
  search_id: string;
  existing_reviews: ExistingReview[];
  primary_study_count: number;
  feasibility_score: FeasibilityScore;
  feasibility_explanation: string;
  gap_analysis: GapAnalysis | null;
  study_design_recommendation: StudyDesignRecommendation | null;
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
