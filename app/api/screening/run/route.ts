/**
 * POST /api/screening/run
 *
 * Runs title + abstract screening of all existing_reviews in a result
 * against a user-approved set of inclusion/exclusion criteria.
 *
 * Persists the ScreeningResult to search_results.screening_result so the
 * user can re-open the results page later without re-running screening.
 *
 * Body: { resultId: string; criteria: ScreeningCriteria }
 * Returns: ScreeningResult
 */

import { createClient } from "@/lib/supabase/server";
import { runTitleAbstractScreening } from "@/lib/screening";
import { toApiError } from "@/lib/errors";
import type { ExistingReview, ScreeningCriteria, ScreeningResult } from "@/types";

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
    };

    if (!body.resultId || !body.criteria) {
      return Response.json({ error: "resultId and criteria are required." }, { status: 400 });
    }

    // Basic criteria validation
    const { criteria } = body;
    if (!Array.isArray(criteria.inclusion) || !Array.isArray(criteria.exclusion)) {
      return Response.json({ error: "criteria must have inclusion and exclusion arrays." }, { status: 400 });
    }

    // Fetch the result (RLS ensures ownership)
    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select("id, existing_reviews")
      .eq("id", body.resultId)
      .single();

    if (fetchError || !result) {
      return Response.json({ error: "Result not found." }, { status: 404 });
    }

    const reviews = (result.existing_reviews ?? []) as ExistingReview[];
    if (reviews.length === 0) {
      return Response.json({ error: "No existing reviews to screen." }, { status: 400 });
    }

    console.log(`[screening/run] Screening ${reviews.length} reviews for resultId=${body.resultId}`);

    const decisions = await runTitleAbstractScreening(reviews, criteria);

    const included = decisions.filter((d) => d.decision === "include").length;
    const excluded = decisions.filter((d) => d.decision === "exclude").length;
    const uncertain = decisions.filter((d) => d.decision === "uncertain").length;

    const screeningResult: ScreeningResult = {
      criteria,
      decisions,
      included_count: included,
      excluded_count: excluded,
      uncertain_count: uncertain,
      run_at: new Date().toISOString(),
    };

    // Persist to database
    const { error: updateError } = await supabase
      .from("search_results")
      .update({ screening_result: screeningResult })
      .eq("id", body.resultId);

    if (updateError) {
      console.error("[screening/run] Failed to save screening result:", updateError.message);
      // Return the result anyway — the user sees it even if save failed
    }

    console.log(
      `[screening/run] Done — included: ${included}, excluded: ${excluded}, uncertain: ${uncertain}`
    );

    return Response.json(screeningResult);
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[screening/run]", apiError.message);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
