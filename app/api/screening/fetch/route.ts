/**
 * POST /api/screening/fetch
 *
 * Phase 1 of the chunked screening pipeline: gather the full set of records to
 * be screened and return them to the client. The client then screens them in
 * chunks via /api/screening/run (so no single request risks a serverless
 * timeout), and persists the assembled result via /api/screening/save.
 *
 * screenType:
 *   "primary"  (default) — paginates ALL available primary studies from
 *                          PubMed + OpenAlex + Scopus (deduplicated). This is
 *                          effectively unlimited — bounded only by each
 *                          provider's own pagination ceiling.
 *   "reviews"            — returns existing_reviews stored on the result row.
 *
 * Body: { resultId: string; screenType?: "primary" | "reviews" }
 * Returns: { records: ExistingReview[]; total: number }
 */

import { createClient } from "@/lib/supabase/server";
import { fetchAllPrimaryStudiesForScreening } from "@/lib/screening";
import { toApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

// Paginating thousands of records across three providers can take a while.
// Request the maximum the platform allows (Vercel clamps to the plan limit).
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Please sign in to use screening." }, { status: 401 });
    }

    const body = (await request.json()) as {
      resultId?: string;
      screenType?: "primary" | "reviews";
    };

    if (!body.resultId) {
      return Response.json({ error: "resultId is required." }, { status: 400 });
    }

    const screenType = body.screenType ?? "primary";

    // Fetch the result row (RLS ensures ownership)
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

      console.log(`[screening/fetch] Paginating all primary studies from PubMed + OpenAlex + Scopus for query: "${query}"`);
      records = await fetchAllPrimaryStudiesForScreening(query);
    } else {
      records = (result.existing_reviews ?? []) as ExistingReview[];
    }

    console.log(`[screening/fetch] Returning ${records.length} ${screenType} records for resultId=${body.resultId}`);

    return Response.json({ records, total: records.length });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[screening/fetch]", apiError.message);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
