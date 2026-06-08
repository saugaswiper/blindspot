import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// PICO-1: Pure helper — build the `searches` row insert payload
// ---------------------------------------------------------------------------

/**
 * Structured PICO elements from a search form submission.
 * All fields are optional/nullable — callers may provide any subset.
 */
export interface PicoFields {
  population?: string | null;
  intervention?: string | null;
  comparison?: string | null;
  outcome?: string | null;
}

/**
 * Build the payload object for a `searches` table INSERT.
 *
 * When `pico` is provided, the four PICO columns are included in the returned
 * object (only non-empty string values are written — nulls and empty strings
 * are omitted so the DB retains its column default of NULL).
 *
 * Extracted as a pure function so it can be unit-tested without a Supabase
 * connection. Used by both `saveSearchResult` and `saveGuestSearchResult`.
 *
 * @param base    - Required fields that are always present (user_id or null, query_text, etc.)
 * @param pico    - Optional PICO elements; omit entirely for simple-text searches
 */
export function buildSearchInsertPayload(
  base: Record<string, unknown>,
  pico?: PicoFields
): Record<string, unknown> {
  const payload = { ...base };
  if (pico?.population)   payload.pico_population   = pico.population;
  if (pico?.intervention) payload.pico_intervention = pico.intervention;
  if (pico?.comparison)   payload.pico_comparison   = pico.comparison;
  if (pico?.outcome)      payload.pico_outcome      = pico.outcome;
  return payload;
}

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
    /** ACC-6: OSF Registries count. Pass null when the OSF API was unavailable. */
    osf_registrations_count: number | null;
    /** ACC-11: INPLASY registry count. Pass null when the INPLASY API was unavailable. */
    inplasy_count?: number | null;
    /** Scopus primary study count. Pass null when the Elsevier API was unavailable. */
    scopus_count: number | null;
    /** Cochrane Library systematic review count. Pass null when the Cochrane API was unavailable. */
    cochrane_count?: number | null;
    /** Number of cross-database duplicate records removed during deduplication. */
    deduplication_count: number;
    /** Pass null when the PubMed recent-count API was unavailable. */
    recent_primary_study_count: number | null;
    /** UI-1: Per-source primary study counts. Pass null when a source API was unavailable. */
    pubmed_count: number | null;
    openalex_count: number | null;
    europepmc_count: number | null;
    /** NEW-8: Living systematic review count. Pass null when PubMed was unavailable. */
    living_review_count?: number | null;
    /** NEW-8 Enhancement: Array of living review details (titles, sources, years). Pass null or empty array when unavailable. */
    living_reviews?: Array<{ title: string; year: number; source: string; pmid?: string; doi?: string }> | null;
  },
  /**
   * PICO-1: Structured PICO elements from the search form.
   * When provided, stored in the searches row so PROSPERO export and protocol
   * generation can produce pre-filled, field-specific output instead of
   * falling back to generic query-derived text.
   */
  pico?: {
    population?: string | null;
    intervention?: string | null;
    comparison?: string | null;
    outcome?: string | null;
  }
): Promise<string> {
  const supabase = await createClient();

  // PICO-1: Build the search row payload, including PICO fields when present.
  const searchInsert = buildSearchInsertPayload(
    { user_id: userId, query_text: query },
    pico
  );

  // Create the search row
  const { data: search, error: searchError } = await supabase
    .from("searches")
    .insert(searchInsert)
    .select("id")
    .single();

  if (searchError || !search) {
    console.error("[cache] searches INSERT failed:", searchError?.code, searchError?.message, searchError?.details, searchError?.hint);
    throw new Error(`Failed to save search: ${searchError?.message}`);
  }

  // Try inserting with all columns (migrations 012 + 015 + 016 + 017 + 018 + 021 + 022).
  // Falls back progressively if a column introduced by a newer migration is missing
  // (Postgres error code 42703 = undefined_column).
  let { data: result, error: resultError } = await supabase
    .from("search_results")
    .insert({
      search_id: search.id,
      existing_reviews: data.existing_reviews,
      primary_study_count: data.primary_study_count,
      clinical_trials_count: data.clinical_trials_count,
      prospero_registrations_count: data.prospero_registrations_count,
      osf_registrations_count: data.osf_registrations_count,
      inplasy_count: data.inplasy_count ?? null,
      scopus_count: data.scopus_count,
      cochrane_count: data.cochrane_count ?? null,
      deduplication_count: data.deduplication_count,
      recent_primary_study_count: data.recent_primary_study_count,
      pubmed_count: data.pubmed_count,
      openalex_count: data.openalex_count,
      europepmc_count: data.europepmc_count,
      living_review_count: data.living_review_count ?? null,
      living_reviews: data.living_reviews ?? null,
    })
    .select("id")
    .single();

  // If insertion fails due to missing columns, try older schemas in order.
  // Migrations 017 (inplasy_count) and 018 (living_review_count) are the newest;
  // strip both first before falling back to the migration 016 schema.
  if (resultError?.code === "42703") {
    const fallbackNewest = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        osf_registrations_count: data.osf_registrations_count,
        scopus_count: data.scopus_count,
        cochrane_count: data.cochrane_count ?? null,
        deduplication_count: data.deduplication_count,
        recent_primary_study_count: data.recent_primary_study_count,
        pubmed_count: data.pubmed_count,
        openalex_count: data.openalex_count,
        europepmc_count: data.europepmc_count,
      })
      .select("id")
      .single();
    result = fallbackNewest.data;
    resultError = fallbackNewest.error;
  }

  if (resultError?.code === "42703") {
    // scopus_count or osf_registrations_count columns don't exist yet — try without them
    const fallbackScopus = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        cochrane_count: data.cochrane_count ?? null,
        deduplication_count: data.deduplication_count,
        recent_primary_study_count: data.recent_primary_study_count,
        pubmed_count: data.pubmed_count,
        openalex_count: data.openalex_count,
        europepmc_count: data.europepmc_count,
      })
      .select("id")
      .single();
    result = fallbackScopus.data;
    resultError = fallbackScopus.error;
  }

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
    /** ACC-6: OSF Registries count. Pass null when the OSF API was unavailable. */
    osf_registrations_count: number | null;
    /** ACC-11: INPLASY registry count. Pass null when the INPLASY API was unavailable. */
    inplasy_count?: number | null;
    /** Scopus primary study count. Pass null when the Elsevier API was unavailable. */
    scopus_count: number | null;
    /** Cochrane Library systematic review count. Pass null when the Cochrane API was unavailable. */
    cochrane_count?: number | null;
    deduplication_count: number;
    recent_primary_study_count: number | null;
    /** UI-1: Per-source primary study counts. Pass null when a source API was unavailable. */
    pubmed_count: number | null;
    openalex_count: number | null;
    europepmc_count: number | null;
    /** NEW-8: Living systematic review count. Pass null when PubMed was unavailable. */
    living_review_count?: number | null;
    /** NEW-8 Enhancement: Array of living review details (titles, sources, years). Pass null or empty array when unavailable. */
    living_reviews?: Array<{ title: string; year: number; source: string; pmid?: string; doi?: string }> | null;
  },
  /**
   * SHA-256 hash of the client IP address (truncated to 32 hex chars).
   * Stored for server-side guest rate limiting (migration 013).
   * Pass undefined to omit — the column is nullable so older callers continue to work.
   */
  guestIpHash?: string,
  /**
   * PICO-1: Structured PICO elements from the search form.
   * Stored so that if the guest later signs up and runs analysis, PROSPERO export
   * and protocol generation receive properly typed fields.
   */
  pico?: {
    population?: string | null;
    intervention?: string | null;
    comparison?: string | null;
    outcome?: string | null;
  }
): Promise<string> {
  const supabase = createServiceRoleClient();

  // PICO-1: Build the search row payload, including PICO fields when present.
  const searchInsert = buildSearchInsertPayload(
    { user_id: null, query_text: query, guest_ip_hash: guestIpHash ?? null },
    pico
  );

  const { data: search, error: searchError } = await supabase
    .from("searches")
    .insert(searchInsert)
    .select("id")
    .single();

  if (searchError || !search) {
    console.error("[cache] guest searches INSERT failed:", searchError?.message);
    throw new Error(`Failed to save guest search: ${searchError?.message}`);
  }

  // Try with all columns (migrations 012 + 015 + 016 + 017 + 018 + 021 + 022);
  // fall back progressively if columns don't exist.
  let { data: result, error: resultError } = await supabase
    .from("search_results")
    .insert({
      search_id: search.id,
      existing_reviews: data.existing_reviews,
      primary_study_count: data.primary_study_count,
      clinical_trials_count: data.clinical_trials_count,
      prospero_registrations_count: data.prospero_registrations_count,
      osf_registrations_count: data.osf_registrations_count,
      inplasy_count: data.inplasy_count ?? null,
      scopus_count: data.scopus_count,
      cochrane_count: data.cochrane_count ?? null,
      deduplication_count: data.deduplication_count,
      recent_primary_study_count: data.recent_primary_study_count,
      pubmed_count: data.pubmed_count,
      openalex_count: data.openalex_count,
      europepmc_count: data.europepmc_count,
      living_review_count: data.living_review_count ?? null,
      living_reviews: data.living_reviews ?? null,
      is_public: true,
    })
    .select("id")
    .single();

  // Strip migrations 017 + 018 columns first if missing
  if (resultError?.code === "42703") {
    const fallbackNewest = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        osf_registrations_count: data.osf_registrations_count,
        scopus_count: data.scopus_count,
        cochrane_count: data.cochrane_count ?? null,
        deduplication_count: data.deduplication_count,
        recent_primary_study_count: data.recent_primary_study_count,
        pubmed_count: data.pubmed_count,
        openalex_count: data.openalex_count,
        europepmc_count: data.europepmc_count,
        is_public: true,
      })
      .select("id")
      .single();
    result = fallbackNewest.data;
    resultError = fallbackNewest.error;
  }

  if (resultError?.code === "42703") {
    // scopus_count or osf_registrations_count not yet added — try without them
    const fallbackScopus = await supabase
      .from("search_results")
      .insert({
        search_id: search.id,
        existing_reviews: data.existing_reviews,
        primary_study_count: data.primary_study_count,
        clinical_trials_count: data.clinical_trials_count,
        prospero_registrations_count: data.prospero_registrations_count,
        cochrane_count: data.cochrane_count ?? null,
        deduplication_count: data.deduplication_count,
        recent_primary_study_count: data.recent_primary_study_count,
        pubmed_count: data.pubmed_count,
        openalex_count: data.openalex_count,
        europepmc_count: data.europepmc_count,
        is_public: true,
      })
      .select("id")
      .single();
    result = fallbackScopus.data;
    resultError = fallbackScopus.error;
  }

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

// ---------------------------------------------------------------------------
// NEW-12: Topic Search Cache — cache countPrimaryStudies results per-topic
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Normalize and hash a query for deterministic cache lookups
 * Removes extra whitespace, lowercases, and computes SHA-256
 */
function getQueryHash(query: string): string {
  const normalized = query.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Check if a cache entry is still valid (< 7 days old)
 */
function isCacheValid(updatedAt: string): boolean {
  const lastUpdate = new Date(updatedAt).getTime();
  const now = Date.now();
  return now - lastUpdate < CACHE_TTL_MS;
}

/**
 * Fetch cached counts for a topic query, if valid
 * Returns { pubmed_count, openalex_count, cached: true } or null
 * Used by countPrimaryStudies in pubmed.ts and openalex.ts to avoid redundant API calls
 */
export async function getCachedTopicCounts(query: string): Promise<{
  pubmed_count: number | null;
  openalex_count: number | null;
  cached: true;
} | null> {
  try {
    const supabase = await createClient();
    const queryHash = getQueryHash(query);

    const { data, error } = await supabase
      .from("topic_search_cache")
      .select("pubmed_count, openalex_count, updated_at")
      .eq("query_hash", queryHash)
      .single();

    if (error || !data) {
      return null; // Cache miss
    }

    // Check TTL: if older than 7 days, treat as miss
    if (!isCacheValid(data.updated_at)) {
      return null;
    }

    return {
      pubmed_count: data.pubmed_count,
      openalex_count: data.openalex_count,
      cached: true,
    };
  } catch (error) {
    // Fail open: if cache lookup fails, return null and proceed with API calls
    console.warn("[topic-cache] getCachedTopicCounts error:", error);
    return null;
  }
}

/**
 * Store or update cached counts for a topic query
 * Call this after fetching fresh counts from PubMed/OpenAlex
 */
export async function setCachedTopicCounts(
  query: string,
  pubmedCount: number | null,
  openalexCount: number | null
): Promise<void> {
  try {
    const supabase = await createClient();
    const queryHash = getQueryHash(query);

    // Upsert: insert or update if already exists (via UNIQUE constraint on query_hash)
    const { error } = await supabase.from("topic_search_cache").upsert(
      {
        query_hash: queryHash,
        pubmed_count: pubmedCount,
        openalex_count: openalexCount,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "query_hash",
      }
    );

    if (error) {
      console.warn("[topic-cache] setCachedTopicCounts error:", error.message);
    }
  } catch (error) {
    // Fail open: if cache write fails, continue normally
    console.warn("[topic-cache] setCachedTopicCounts exception:", error);
  }
}

/**
 * Invalidate cache entry for a topic query (force refresh on next request)
 * Used when manually triggering a gap analysis refresh
 */
export async function invalidateTopicCache(query: string): Promise<void> {
  try {
    const supabase = await createClient();
    const queryHash = getQueryHash(query);

    const { error } = await supabase
      .from("topic_search_cache")
      .delete()
      .eq("query_hash", queryHash);

    if (error) {
      console.warn("[topic-cache] invalidateTopicCache error:", error.message);
    }
  } catch (error) {
    console.warn("[topic-cache] invalidateTopicCache exception:", error);
  }
}
