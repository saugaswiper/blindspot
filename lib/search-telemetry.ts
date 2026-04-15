/**
 * Search telemetry utilities for Blindspot.
 *
 * Logs per-search PRISMA rate data to the `search_telemetry` table
 * (migration 014) for retrospective calibration of the PRISMA screening
 * funnel estimates against published systematic review included counts.
 *
 * Design goals:
 *  - Never fail the main search request (all inserts are best-effort)
 *  - Pure helper functions (buildTelemetryPayload) are testable without a DB
 *  - Uses the service-role client so RLS does not block the insert
 *
 * Usage (in app/api/search/route.ts):
 *   void insertSearchTelemetry(resultId, primaryStudyCount, isGuest);
 */

import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  computePrimaryStudyPrismaData,
  getCorpusTier,
  type CorpusTier,
} from "@/lib/prisma-diagram";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row shape for the search_telemetry table (migration 014). */
export interface TelemetryPayload {
  search_result_id: string;
  /** Blended unique primary study count (= primaryStudyCount from search). */
  after_dedup: number;
  /** Corpus tier derived from after_dedup (matches getScreeningRatios boundaries). */
  tier: CorpusTier;
  /**
   * PRISMA estimated included count using generic (null study-design) rates.
   * Study design is not known at search time; the null-design estimate provides
   * a consistent baseline across all rows for tier-level calibration.
   */
  included_estimate: number;
  /** Confidence interval lower bound around included_estimate. */
  included_low: number;
  /** Confidence interval upper bound around included_estimate. */
  included_high: number;
  /** True when the search was run by an unauthenticated guest. */
  is_guest: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Build the telemetry payload for a completed search.
 *
 * Uses generic (study-design-agnostic) PRISMA rates because study design is
 * only determined when the user later clicks "Run AI Analysis". Using null
 * study design ensures all telemetry rows use the same rate basis, making
 * tier-level calibration analysis consistent.
 *
 * @param searchResultId UUID of the search_results row just saved.
 * @param primaryStudyCount Blended unique primary study count from the search.
 * @param isGuest Whether the search was run by an unauthenticated guest.
 */
export function buildTelemetryPayload(
  searchResultId: string,
  primaryStudyCount: number,
  isGuest: boolean,
): TelemetryPayload {
  // Compute PRISMA estimates with no study design context (null).
  // We pass empty/null values for all optional fields — only primaryStudyCount
  // matters for the tier-level rate selection.
  const { included, includedLow, includedHigh } = computePrimaryStudyPrismaData({
    primaryStudyCount,
    pubmedCount: null,
    openalexCount: null,
    europepmcCount: null,
    clinicalTrialsCount: null,
    prosperoCount: null,
    studyDesign: null,
    gapAnalysis: null,
    query: "",
  });

  return {
    search_result_id: searchResultId,
    after_dedup: primaryStudyCount,
    tier: getCorpusTier(primaryStudyCount),
    included_estimate: included,
    included_low: includedLow,
    included_high: includedHigh,
    is_guest: isGuest,
  };
}

// ---------------------------------------------------------------------------
// DB insert (server-only)
// ---------------------------------------------------------------------------

/**
 * Insert a telemetry row into `search_telemetry`. Best-effort: errors are
 * logged to the server console but never rethrown, so a telemetry failure
 * cannot surface to the user or fail the search request.
 *
 * Uses the service-role client to bypass RLS (regular users have no INSERT
 * permission on search_telemetry per migration 014).
 *
 * @param searchResultId UUID of the search_results row just saved.
 * @param primaryStudyCount Blended unique primary study count.
 * @param isGuest Whether this was a guest search.
 */
export async function insertSearchTelemetry(
  searchResultId: string,
  primaryStudyCount: number,
  isGuest: boolean,
): Promise<void> {
  try {
    const payload = buildTelemetryPayload(searchResultId, primaryStudyCount, isGuest);
    const svc = createServiceRoleClient();
    const { error } = await svc.from("search_telemetry").insert(payload);
    if (error) {
      // Non-fatal: log and continue. Common causes: DB constraint violations on
      // duplicate inserts (cached results), or transient DB connectivity issues.
      console.warn("[telemetry] search_telemetry insert failed:", error.message);
    }
  } catch (err) {
    // Catches createServiceRoleClient() throwing for missing env vars in tests
    console.warn("[telemetry] insertSearchTelemetry error (non-fatal):", err);
  }
}
