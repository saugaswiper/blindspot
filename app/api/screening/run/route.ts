/**
 * POST /api/screening/run
 *
 * Runs title + abstract screening against a user-approved set of
 * inclusion/exclusion criteria.
 *
 * screenType controls which records are screened:
 *   "primary"  (default) — fetches primary studies fresh from PubMed, OpenAlex & Scopus
 *                           using the search query (up to 500/source, 1000 total)
 *   "reviews"            — uses existing_reviews stored on the result row
 *
 * Persists the ScreeningResult to search_results.screening_result so the
 * user can re-open the results page later without re-running screening.
 *
 * Body: { resultId: string; criteria: ScreeningCriteria; screenType?: "primary" | "reviews" }
 * Returns: ScreeningResult
 */

import { createClient } from "@/lib/supabase/server";
import { runTitleAbstractScreening, fetchAllPrimaryStudiesForScreening } from "@/lib/screening";
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
      screenType?: "primary" | "reviews";
    };

    if (!body.resultId || !body.criteria) {
      return Response.json({ error: "resultId and criteria are required." }, { status: 400 });
    }

    const { criteria, screenType = "primary" } = body;

    // Basic criteria validation
    if (!Array.isArray(criteria.inclusion) || !Array.isArray(criteria.exclusion)) {
      return Response.json({ error: "criteria must have inclusion and exclusion arrays." }, { status: 400 });
    }

    // Fetch the result (RLS ensures ownership)
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
      // Fetch primary study records fresh from OpenAlex (title + abstract)
      const query = (result.searches as unknown as { query_text: string } | null)?.query_text ?? "";
      if (!query) {
        return Response.json({ error: "Search query not found — cannot fetch primary studies." }, { status: 400 });
      }

      console.log(`[screening/run] Fetching primary studies from PubMed + OpenAlex + Scopus for query: "${query}"`);
      records = await fetchAllPrimaryStudiesForScreening(query, 500, 1000);

      if (records.length === 0) {
        return Response.json({ error: "No primary studies found for this search query." }, { status: 400 });
      }
    } else {
      // Use stored existing reviews (systematic reviews)
      records = (result.existing_reviews ?? []) as ExistingReview[];
      if (records.length === 0) {
        return Response.json({ error: "No existing reviews to screen." }, { status: 400 });
      }
    }

    console.log(`[screening/run] Screening ${records.length} ${screenType === "primary" ? "primary studies" : "reviews"} for resultId=${body.resultId}`);

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

    // Persist to database
    const { error: updateError } = await supabase
      .from("search_results")
      .update({ screening_result: screeningResult })
      .eq("id", body.resultId);

    if (updateError) {
      console.error("[screening/run] Failed to save screening result:", updateError.message);
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
