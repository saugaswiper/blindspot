/**
 * POST /api/screening/run
 *
 * Screens a chunk of records against user-approved inclusion/exclusion criteria.
 *
 * This endpoint is part of a chunked pipeline that supports screening an
 * unlimited number of articles without hitting serverless timeouts:
 *
 *   1. /api/screening/fetch  → gathers ALL records (paginated across sources)
 *   2. /api/screening/run    → screens ONE chunk of those records (this route),
 *                              called repeatedly by the client
 *   3. /api/screening/save   → persists the assembled ScreeningResult
 *
 * Two request shapes are accepted:
 *
 *   CHUNK MODE (preferred):
 *     Body: { criteria: ScreeningCriteria; records: ExistingReview[] }
 *     Returns: { decisions: ScreeningDecision[] }
 *     Screens exactly the provided records and returns the decisions. The
 *     client accumulates decisions across chunks and saves once at the end.
 *
 *   LEGACY MODE (single-shot, kept for backward compatibility):
 *     Body: { resultId: string; criteria: ScreeningCriteria; screenType?: "primary" | "reviews" }
 *     Returns: ScreeningResult
 *     Fetches + screens + persists in one request. Only safe for small record
 *     sets; large jobs should use the chunked pipeline above.
 */

import { createClient } from "@/lib/supabase/server";
import {
  runTitleAbstractScreening,
  fetchAllPrimaryStudiesForScreening,
} from "@/lib/screening";
import { toApiError } from "@/lib/errors";
import type { ExistingReview, ScreeningCriteria, ScreeningResult } from "@/types";

export const maxDuration = 300;

// Upper bound on records accepted in a single chunk request — keeps each
// Gemini round-trip well within the function timeout and bounds per-call cost.
const MAX_CHUNK_RECORDS = 500;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Please sign in to use screening." }, { status: 401 });
    }

    const body = (await request.json()) as {
      resultId?: string;
      criteria?: ScreeningCriteria;
      records?: ExistingReview[];
      screenType?: "primary" | "reviews";
    };

    if (!body.criteria) {
      return Response.json({ error: "criteria is required." }, { status: 400 });
    }

    const { criteria } = body;

    // Basic criteria validation
    if (!Array.isArray(criteria.inclusion) || !Array.isArray(criteria.exclusion)) {
      return Response.json({ error: "criteria must have inclusion and exclusion arrays." }, { status: 400 });
    }

    // ── CHUNK MODE ──────────────────────────────────────────────────────────
    if (Array.isArray(body.records)) {
      const records = body.records;
      if (records.length === 0) {
        return Response.json({ decisions: [] });
      }
      if (records.length > MAX_CHUNK_RECORDS) {
        return Response.json(
          { error: `Too many records in one chunk (max ${MAX_CHUNK_RECORDS}).` },
          { status: 400 },
        );
      }

      const decisions = await runTitleAbstractScreening(records, criteria);
      return Response.json({ decisions });
    }

    // ── LEGACY MODE (single-shot) ───────────────────────────────────────────
    if (!body.resultId) {
      return Response.json({ error: "resultId or records is required." }, { status: 400 });
    }

    const screenType = body.screenType ?? "primary";

    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select("id, existing_reviews, searches(query_text)")
      .eq("id", body.resultId)
      .single();

    if (fetchError || !result) {
      return Response.json({ error: "Result not found." }, { status: 404 });
    }

    let records: ExistingReview[];

    if (screenType === "primary") {
      const query = (result.searches as unknown as { query_text: string } | null)?.query_text ?? "";
      if (!query) {
        return Response.json({ error: "Search query not found — cannot fetch primary studies." }, { status: 400 });
      }
      records = await fetchAllPrimaryStudiesForScreening(query);
      if (records.length === 0) {
        return Response.json({ error: "No primary studies found for this search query." }, { status: 400 });
      }
    } else {
      records = (result.existing_reviews ?? []) as ExistingReview[];
      if (records.length === 0) {
        return Response.json({ error: "No existing reviews to screen." }, { status: 400 });
      }
    }

    const decisions = await runTitleAbstractScreening(records, criteria);

    const included = decisions.filter((d) => d.decision === "include").length;
    const excluded = decisions.filter((d) => d.decision === "exclude").length;
    const uncertain = decisions.filter((d) => d.decision === "uncertain").length;

    const screeningResult: ScreeningResult = {
      criteria,
      decisions,
      included_count: included,
      excluded_count: excluded,
      uncertain_count: uncertain,
      screen_type: screenType,
      run_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("search_results")
      .update({ screening_result: screeningResult })
      .eq("id", body.resultId);

    if (updateError) {
      console.error("[screening/run] Failed to save screening result:", updateError.message);
    }

    return Response.json(screeningResult);
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[screening/run]", apiError.message);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
