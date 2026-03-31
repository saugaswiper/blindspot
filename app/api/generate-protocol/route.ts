import { createClient } from "@/lib/supabase/server";
import { generateProtocol } from "@/lib/gemini";
import { buildProtocolPrompt } from "@/lib/prompts";
import { toApiError } from "@/lib/errors";
import { sanitizeBooleanString, looksLikeBooleanString } from "@/lib/boolean-search";
import type { GapAnalysis, StudyDesignRecommendation } from "@/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Auth check — only the result owner can generate a protocol
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: "Please sign in to generate a protocol." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { resultId?: string };
    if (!body.resultId || typeof body.resultId !== "string") {
      return Response.json({ error: "resultId is required." }, { status: 400 });
    }

    // Fetch the result and the associated search (for query + PICO)
    // RLS on search_results ensures users can only access their own results
    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select(`
        id,
        gap_analysis,
        study_design_recommendation,
        searches (
          query_text,
          user_id,
          pico_population,
          pico_intervention,
          pico_comparison,
          pico_outcome
        )
      `)
      .eq("id", body.resultId)
      .single();

    if (fetchError || !result) {
      return Response.json({ error: "Result not found." }, { status: 404 });
    }

    const searchData = result.searches as unknown as {
      query_text: string;
      user_id: string;
      pico_population: string | null;
      pico_intervention: string | null;
      pico_comparison: string | null;
      pico_outcome: string | null;
    } | null;

    // Verify the requesting user owns the underlying search
    if (!searchData || searchData.user_id !== user.id) {
      return Response.json({ error: "Not authorised." }, { status: 403 });
    }

    const gapAnalysis = result.gap_analysis as GapAnalysis | null;
    if (!gapAnalysis) {
      return Response.json(
        { error: "Please run the AI gap analysis first before generating a protocol." },
        { status: 400 }
      );
    }

    const studyDesign = result.study_design_recommendation as StudyDesignRecommendation | null;

    // Extract a clean boolean search string if present
    const rawBoolean = gapAnalysis.boolean_search_string ?? null;
    const booleanString =
      rawBoolean && looksLikeBooleanString(rawBoolean)
        ? sanitizeBooleanString(rawBoolean)
        : null;

    // Build PICO object (null if none of the fields were provided)
    const picoPopulation = searchData.pico_population;
    const picoIntervention = searchData.pico_intervention;
    const picoComparison = searchData.pico_comparison;
    const picoOutcome = searchData.pico_outcome;
    const hasPico =
      picoPopulation || picoIntervention || picoComparison || picoOutcome;
    const pico = hasPico
      ? {
          population: picoPopulation,
          intervention: picoIntervention,
          comparison: picoComparison,
          outcome: picoOutcome,
        }
      : null;

    const prompt = buildProtocolPrompt({
      query: searchData.query_text,
      gapAnalysis,
      studyDesign,
      pico,
      booleanSearchString: booleanString,
    });

    console.log(
      "[generate-protocol] query:",
      searchData.query_text,
      "| topics:",
      gapAnalysis.suggested_topics.length
    );

    const protocol = await generateProtocol(prompt);

    console.log(
      "[generate-protocol] Protocol generated, length:",
      protocol.length
    );

    // Persist the draft so the user doesn't lose it on page refresh.
    // This is best-effort: a storage failure does not prevent returning the
    // protocol to the client.
    const { error: updateError } = await supabase
      .from("search_results")
      .update({ protocol_draft: protocol })
      .eq("id", body.resultId);

    if (updateError) {
      console.warn(
        "[generate-protocol] Failed to persist protocol_draft:",
        updateError.message
      );
    }

    return Response.json({ protocol });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("generate-protocol error:", apiError.message);
    return Response.json(
      { error: apiError.userMessage },
      { status: apiError.statusCode }
    );
  }
}
