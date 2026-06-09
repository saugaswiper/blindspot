/**
 * POST /api/screening/save
 *
 * Phase 3 of the chunked screening pipeline: persist the fully-assembled
 * ScreeningResult after the client has screened every chunk via
 * /api/screening/run. Stored on search_results.screening_result so the user
 * can re-open the results later without re-running screening.
 *
 * Body: { resultId: string; screeningResult: ScreeningResult }
 * Returns: { ok: true }
 */

import { createClient } from "@/lib/supabase/server";
import { toApiError } from "@/lib/errors";
import type { ScreeningResult } from "@/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Please sign in to use screening." }, { status: 401 });
    }

    const body = (await request.json()) as {
      resultId?: string;
      screeningResult?: ScreeningResult;
    };

    if (!body.resultId || !body.screeningResult) {
      return Response.json({ error: "resultId and screeningResult are required." }, { status: 400 });
    }

    const sr = body.screeningResult;
    if (!sr.criteria || !Array.isArray(sr.decisions)) {
      return Response.json({ error: "screeningResult is malformed." }, { status: 400 });
    }

    // RLS ensures the user can only update their own result row.
    const { error: updateError } = await supabase
      .from("search_results")
      .update({ screening_result: sr })
      .eq("id", body.resultId);

    if (updateError) {
      console.error("[screening/save] Failed to save screening result:", updateError.message);
      return Response.json({ error: "Failed to save screening result." }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[screening/save]", apiError.message);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
