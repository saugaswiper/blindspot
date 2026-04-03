/**
 * /api/prospero-export
 *
 * Generates a PROSPERO registration draft from a completed Blindspot analysis.
 *
 * POST /api/prospero-export
 * - Requires authentication (owner of the result)
 * - Request body: { resultId: string }
 * - Returns: { registration: ProsperoRegistration }
 *
 * The returned registration object contains all PROSPERO fields pre-populated
 * from the gap analysis, study design, and protocol, allowing researchers to
 * quickly register their systematic review.
 */

import { createClient } from "@/lib/supabase/server";
import { generateProsperoRegistration } from "@/lib/prospero-export";
import { toApiError } from "@/lib/errors";
import { sanitizeBooleanString, looksLikeBooleanString } from "@/lib/boolean-search";
import type { GapAnalysis, StudyDesignRecommendation } from "@/types";
import { z } from "zod";

const RequestSchema = z.object({
  resultId: z.string().uuid("resultId must be a valid UUID"),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Auth check — only authenticated users can export
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: "Please sign in to export a PROSPERO registration." },
        { status: 401 }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "unknown error";
      return Response.json(
        { error: `Invalid request: ${firstError}` },
        { status: 400 }
      );
    }

    const { resultId } = parsed.data;

    // Fetch the result and associated search
    // RLS on search_results ensures users can only access their own results
    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select(`
        id,
        gap_analysis,
        study_design_recommendation,
        protocol_draft,
        searches (
          query_text,
          user_id,
          pico_population,
          pico_intervention,
          pico_comparison,
          pico_outcome
        )
      `)
      .eq("id", resultId)
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
    const studyDesign = result.study_design_recommendation as StudyDesignRecommendation | null;
    const protocolDraft = result.protocol_draft as string | null;

    if (!gapAnalysis) {
      return Response.json(
        { error: "Please run the AI gap analysis first before exporting a PROSPERO registration." },
        { status: 400 }
      );
    }

    // Extract clean Boolean search string if available
    const rawBoolean = gapAnalysis.boolean_search_string ?? null;
    const booleanString =
      rawBoolean && looksLikeBooleanString(rawBoolean)
        ? sanitizeBooleanString(rawBoolean)
        : null;

    // Build PICO object from search data
    const pico = {
      population: searchData.pico_population,
      intervention: searchData.pico_intervention,
      comparison: searchData.pico_comparison,
      outcome: searchData.pico_outcome,
    };

    // Generate the PROSPERO registration
    const registration = generateProsperoRegistration(
      searchData.query_text,
      gapAnalysis,
      studyDesign,
      protocolDraft,
      pico,
      booleanString
    );

    return Response.json({ registration });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[prospero-export] error:", apiError.message);
    return Response.json(
      { error: apiError.userMessage },
      { status: apiError.statusCode }
    );
  }
}
