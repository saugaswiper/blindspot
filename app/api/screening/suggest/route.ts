/**
 * POST /api/screening/suggest
 *
 * Given a result ID and a topic index (into gapAnalysis.suggested_topics),
 * generates AI-powered inclusion/exclusion criteria for that specific gap topic.
 *
 * Returns the ScreeningCriteria JSON — the client presents it to the user
 * for editing before calling /api/screening/run.
 */

import { createClient } from "@/lib/supabase/server";
import { suggestScreeningCriteria } from "@/lib/screening";
import { toApiError } from "@/lib/errors";
import type { GapAnalysis, GapDimension } from "@/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Please sign in to use screening." }, { status: 401 });
    }

    const body = (await request.json()) as { resultId?: string; topicIndex?: number };
    if (!body.resultId || body.topicIndex === undefined) {
      return Response.json({ error: "resultId and topicIndex are required." }, { status: 400 });
    }

    // Fetch the search result (RLS ensures it belongs to the user)
    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select(`
        id,
        gap_analysis,
        searches (query_text)
      `)
      .eq("id", body.resultId)
      .single();

    if (fetchError || !result) {
      return Response.json({ error: "Result not found." }, { status: 404 });
    }

    const gapAnalysis = result.gap_analysis as GapAnalysis | null;
    if (!gapAnalysis || !gapAnalysis.suggested_topics?.length) {
      return Response.json(
        { error: "Gap analysis not found. Please run gap analysis first." },
        { status: 400 }
      );
    }

    const topic = gapAnalysis.suggested_topics[body.topicIndex];
    if (!topic) {
      return Response.json({ error: "Topic index out of range." }, { status: 400 });
    }

    const query =
      (result.searches as unknown as { query_text: string } | null)?.query_text ?? "";

    const criteria = await suggestScreeningCriteria(
      query,
      topic.title,
      topic.gap_type as GapDimension,
      topic.rationale,
      gapAnalysis.overall_assessment
    );

    return Response.json(criteria);
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[screening/suggest]", apiError.message);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
