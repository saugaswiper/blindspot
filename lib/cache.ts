import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
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
  /**
   * Number of primary studies published in the last 3 years (PubMed).
   * Null for results created before migration 011 was applied, or when the
   * PubMed API was unavailable during the search.
   */
  recent_primary_study_count: number | null;
  /**
   * UI-1: Per-source primary study counts (reviews excluded).
   * Null for results created before migration 012, or when a source API failed.
   */
  pubmed_count: number | null;
  openalex_count: number | null;
  europepmc_count: number | null;
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
    .select("id, existing_reviews, primary_study_count, clinical_trials_count, prospero_registrations_count, deduplication_count, recent_primary_study_count, pubmed_count, openalex_count, europepmc_count, expires_at")
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
    recent_primary_study_count: (result.recent_primary_study_count as number | null) ?? null,
    pubmed_count: (result.pubmed_count as number | null) ?? null,
    openalex_count: (result.openalex_count as number | null) ?? null,
    europepmc_count: (result.europepmc_count as number | null) ?? null,
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
    /** Pass null when the PubMed recent-count API was unavailable. */
    recent_primary_study_count: number | null;
    /** UI-1: Per-source primary study counts. Pass null when a source API was unavailable. */
    pubmed_count: number | null;
    openalex_count: number | null;
    europepmc_count: number | null;
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

  // Try inserting with all columns (including per-source counts from migration 012).
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
      recent_primary_study_count: data.recent_primary_study_count,
      pubmed_count: data.pubmed_count,
      openalex_count: data.openalex_count,
      europepmc_count: data.europepmc_count,
    })
    .select("id")
    .single();

  // If insertion fails due to missing columns, try older schemas in order
  if (resultError?.code === "42703") {
    // per-source count columns don't exist yet (migration 012 not applied) — try without them
    const fallbackPerSource = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        deduplication_count: data.deduplication_count,
        recent_primary_study_count: data.recent_primary_study_count,
      })
      .select("id")
      .single();
    result = fallbackPerSource.data;
    resultError = fallbackPerSource.error;
  }

  if (resultError?.code === "42703") {
    // recent_primary_study_count column doesn't exist yet — try without it
    const fallbackRecent = await supabase
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
    result = fallbackRecent.data;
    resultError = fallbackRecent.error;
  }

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

/**
 * Saves a search result for an unauthenticated guest user.
 *
 * Uses the service-role client (bypasses RLS) so the row can be inserted
 * with user_id = NULL (requires migration 010). The result is always saved
 * as public so the /results/[id] page is viewable without authentication.
 *
 * No cache check is performed for guests — every guest search runs fresh.
 */
export async function saveGuestSearchResult(
  query: string,
  data: {
    existing_reviews: ExistingReview[];
    primary_study_count: number;
    clinical_trials_count: number | null;
    prospero_registrations_count: number | null;
    deduplication_count: number;
    recent_primary_study_count: number | null;
    /** UI-1: Per-source primary study counts. Pass null when a source API was unavailable. */
    pubmed_count: number | null;
    openalex_count: number | null;
    europepmc_count: number | null;
  },
  /**
   * SHA-256 hash of the client IP address (truncated to 32 hex chars).
   * Stored for server-side guest rate limiting (migration 013).
   * Pass undefined to omit — the column is nullable so older callers continue to work.
   */
  guestIpHash?: string
): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data: search, error: searchError } = await supabase
    .from("searches")
    .insert({ user_id: null, query_text: query, guest_ip_hash: guestIpHash ?? null })
    .select("id")
    .single();

  if (searchError || !search) {
    console.error("[cache] guest searches INSERT failed:", searchError?.message);
    throw new Error(`Failed to save guest search: ${searchError?.message}`);
  }

  // Try with all columns including per-source counts (migration 012); fall back if columns don't exist
  let { data: result, error: resultError } = await supabase
    .from("search_results")
    .insert({
      search_id: search.id,
      existing_reviews: data.existing_reviews,
      primary_study_count: data.primary_study_count,
      clinical_trials_count: data.clinical_trials_count,
      prospero_registrations_count: data.prospero_registrations_count,
      deduplication_count: data.deduplication_count,
      recent_primary_study_count: data.recent_primary_study_count,
      pubmed_count: data.pubmed_count,
      openalex_count: data.openalex_count,
      europepmc_count: data.europepmc_count,
      is_public: true,
    })
    .select("id")
    .single();

  if (resultError?.code === "42703") {
    // per-source count columns don't exist yet (migration 012 not applied) — try without them
    const fallbackPerSource = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        deduplication_count: data.deduplication_count,
        recent_primary_study_count: data.recent_primary_study_count,
        is_public: true,
      })
      .select("id")
      .single();
    result = fallbackPerSource.data;
    resultError = fallbackPerSource.error;
  }

  if (resultError?.code === "42703") {
    // recent_primary_study_count column doesn't exist yet — try without it
    const fallback = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        deduplication_count: data.deduplication_count,
        is_public: true,
      })
      .select("id")
      .single();
    result = fallback.data;
    resultError = fallback.error;
  }

  if (resultError || !result) {
    console.error("[cache] guest search_results INSERT failed:", resultError?.message);
    throw new Error(`Failed to save guest search result: ${resultError?.message}`);
  }

  return result.id;
}
