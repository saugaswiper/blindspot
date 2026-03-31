import { createClient } from "@/lib/supabase/server";
import type { ExistingReview } from "@/types";

export interface CachedSearchResult {
  id: string;
  existing_reviews: ExistingReview[];
  primary_study_count: number;
  /** Null when the ClinicalTrials.gov count was unavailable at search time. */
  clinical_trials_count: number | null;
  /** Null when the PROSPERO count was unavailable at search time. */
  prospero_registrations_count: number | null;
  /**
   * Number of duplicate records removed during cross-database deduplication.
   * Null for results created before migration 007 was applied.
   */
  deduplication_count: number | null;
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
    .select("id, existing_reviews, primary_study_count, clinical_trials_count, prospero_registrations_count, deduplication_count, expires_at")
    .eq("search_id", match.id)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!result) return null;

  return {
    id: result.id,
    existing_reviews: result.existing_reviews as ExistingReview[],
    primary_study_count: result.primary_study_count,
    clinical_trials_count: (result.clinical_trials_count as number | null) ?? null,
    prospero_registrations_count: (result.prospero_registrations_count as number | null) ?? null,
    deduplication_count: (result.deduplication_count as number | null) ?? null,
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
    /** Pass null when the PROSPERO API was unavailable. */
    prospero_registrations_count: number | null;
    /** Number of cross-database duplicate records removed during deduplication. */
    deduplication_count: number;
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

  // Try inserting with all columns (including deduplication_count from migration 007).
  // Fall back without newer columns if older migrations haven't been applied yet.
  let { data: result, error: resultError } = await supabase
    .from("search_results")
    .insert({
      search_id: search.id,
      existing_reviews: data.existing_reviews,
      primary_study_count: data.primary_study_count,
      clinical_trials_count: data.clinical_trials_count,
      prospero_registrations_count: data.prospero_registrations_count,
      deduplication_count: data.deduplication_count,
    })
    .select("id")
    .single();

  // If insertion fails due to missing columns, try older schemas in order
  if (resultError?.code === "42703") {
    // deduplication_count column doesn't exist yet — try without it
    const fallback0 = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
      })
      .select("id")
      .single();

    if (fallback0.error?.code === "42703") {
      // prospero_registrations_count also missing — try without it
      const fallback1 = await supabase
        .from("search_results")
        .insert({
          search_id: search.id,
          existing_reviews: data.existing_reviews,
          primary_study_count: data.primary_study_count,
          clinical_trials_count: data.clinical_trials_count,
        })
        .select("id")
        .single();

      if (fallback1.error?.code === "42703") {
        // clinical_trials_count also doesn't exist — try the oldest schema
        const fallback2 = await supabase
          .from("search_results")
          .insert({
            search_id: search.id,
            existing_reviews: data.existing_reviews,
            primary_study_count: data.primary_study_count,
          })
          .select("id")
          .single();
        result = fallback2.data;
        resultError = fallback2.error;
      } else {
        result = fallback1.data;
        resultError = fallback1.error;
      }
    } else {
      result = fallback0.data;
      resultError = fallback0.error;
    }
  }

  if (resultError || !result) {
    console.error("[cache] search_results INSERT failed:", resultError?.code, resultError?.message, resultError?.details, resultError?.hint);
    throw new Error(`Failed to save search result: ${resultError?.message}`);
  }

  return result.id;
}
