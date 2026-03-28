import { createClient } from "@/lib/supabase/server";
import type { ExistingReview } from "@/types";

export interface CachedSearchResult {
  id: string;
  existing_reviews: ExistingReview[];
  primary_study_count: number;
  /** Null when the ClinicalTrials.gov count was unavailable at search time. */
  clinical_trials_count: number | null;
}

// Normalize query for cache key comparison
function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function getCachedResult(
  userId: string,
  query: string
): Promise<CachedSearchResult | null> {
  const supabase = await createClient();
  const normalized = normalizeQuery(query);

  const { data: searches } = await supabase
    .from("searches")
    .select("id, query_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!searches) return null;

  const match = searches.find(
    (s) => normalizeQuery(s.query_text) === normalized
  );
  if (!match) return null;

  const { data: result } = await supabase
    .from("search_results")
    .select("id, existing_reviews, primary_study_count, clinical_trials_count, expires_at")
    .eq("search_id", match.id)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!result) return null;

  return {
    id: result.id,
    existing_reviews: result.existing_reviews as ExistingReview[],
    primary_study_count: result.primary_study_count,
    clinical_trials_count: (result.clinical_trials_count as number | null) ?? null,
  };
}

export async function saveSearchResult(
  userId: string,
  query: string,
  data: {
    existing_reviews: ExistingReview[];
    primary_study_count: number;
    /** Pass null when the ClinicalTrials.gov API was unavailable. */
    clinical_trials_count: number | null;
  }
): Promise<string> {
  const supabase = await createClient();

  // Create the search row
  const { data: search, error: searchError } = await supabase
    .from("searches")
    .insert({ user_id: userId, query_text: query })
    .select("id")
    .single();

  if (searchError || !search) {
    console.error("[cache] searches INSERT failed:", searchError?.code, searchError?.message, searchError?.details, searchError?.hint);
    throw new Error(`Failed to save search: ${searchError?.message}`);
  }

  // Try inserting with clinical_trials_count; fall back without it if migration 004
  // hasn't been applied yet (column won't exist — Postgres returns a 42703 error).
  let { data: result, error: resultError } = await supabase
    .from("search_results")
    .insert({
      search_id: search.id,
      existing_reviews: data.existing_reviews,
      primary_study_count: data.primary_study_count,
      clinical_trials_count: data.clinical_trials_count,
    })
    .select("id")
    .single();

  if (resultError?.code === "42703") {
    // Column does not exist — insert without it
    const fallback = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
      })
      .select("id")
      .single();
    result = fallback.data;
    resultError = fallback.error;
  }

  if (resultError || !result) {
    console.error("[cache] search_results INSERT failed:", resultError?.code, resultError?.message, resultError?.details, resultError?.hint);
    throw new Error(`Failed to save search result: ${resultError?.message}`);
  }

  return result.id;
}
