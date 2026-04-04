import { createClient } from "@/lib/supabase/server";
import { scoreFeasibility } from "@/lib/feasibility";
import { generateGapAnalysis } from "@/lib/gemini";
import { recommendStudyDesign } from "@/lib/study-design";
import { buildGapAnalysisPrompt } from "@/lib/prompts";
import { toApiError } from "@/lib/errors";
import { countPrimaryStudies, countSystematicReviews as pubmedCountSRs } from "@/lib/pubmed";
import { getFeasibilityScore } from "@/lib/feasibility";
import { countSystematicReviews as europepmcCountSRs } from "@/lib/europepmc";
import type { ExistingReview } from "@/types";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Please sign in to run analysis." }, { status: 401 });
    }

    const { resultId } = (await request.json()) as { resultId?: string };
    if (!resultId) {
      return Response.json({ error: "resultId is required." }, { status: 400 });
    }

    // Fetch the search result (RLS ensures it belongs to this user)
    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select(`
        id,
        existing_reviews,
        primary_study_count,
        gap_analysis,
        searches (query_text)
      `)
      .eq("id", resultId)
      .single();

    if (fetchError || !result) {
      return Response.json({ error: "Result not found." }, { status: 404 });
    }

    // Return early if analysis already exists
    if (result.gap_analysis) {
      return Response.json({ resultId, cached: true });
    }

    const existingReviews = (result.existing_reviews ?? []) as ExistingReview[];
    const primaryStudyCount = result.primary_study_count as number;
    const query = (result.searches as unknown as { query_text: string } | null)?.query_text ?? "";

    console.log("[analyze] query:", query, "| reviews:", existingReviews.length, "| studies:", primaryStudyCount);

    // Step 1: Feasibility scoring (pure logic — no AI)
    const feasibility = scoreFeasibility(primaryStudyCount, existingReviews);

    // ACC-1: Hard gate — block AI analysis when evidence is insufficient
    if (primaryStudyCount < 3) {
      console.log("[analyze] Blocking AI analysis due to insufficient evidence (< 3 studies)");
      return Response.json(
        {
          error: "insufficient_evidence",
          primaryStudyCount,
          feasibilityScore: feasibility.score,
          message: "Not enough primary studies to identify meaningful gaps. A systematic review is not feasible on this exact topic.",
        },
        { status: 400 }
      );
    }

    // Step 2: Study design recommendation (pure logic — no AI)
    const studyDesign = recommendStudyDesign(feasibility);

    // Step 2b: If umbrella review recommended, look up actual SR count and enrich rationale
    if (studyDesign.primary === "Umbrella Review") {
      const [pubmedSRCount, europepmcSRCount] = await Promise.allSettled([
        pubmedCountSRs(query),
        europepmcCountSRs(query),
      ]);
      const srCount = Math.max(
        pubmedSRCount.status === "fulfilled" ? pubmedSRCount.value : 0,
        europepmcSRCount.status === "fulfilled" ? europepmcSRCount.value : 0,
      );
      if (srCount > 0) {
        studyDesign.rationale = `We estimate approximately ${srCount} systematic reviews are currently indexed on this topic across PubMed and Europe PMC. An umbrella review synthesizing these existing systematic reviews would provide a higher-level evidence summary.`;
      }
    }

    // Step 3: Gemini gap analysis
    // ACC-3: Count how many reviews we actually send to Gemini (capped at 20 by the prompt builder)
    const reviewsAnalyzedCount = Math.min(existingReviews.length, 20);
    const prompt = buildGapAnalysisPrompt(query, existingReviews, primaryStudyCount);
    console.log("[analyze] Sending prompt to Gemini, length:", prompt.length, "| reviews analyzed:", reviewsAnalyzedCount);
    const gapAnalysis = await generateGapAnalysis(prompt);
    console.log("[analyze] Gemini response received successfully");

    // ACC-3: Attach the reviews_analyzed_count to the gap analysis before storing
    gapAnalysis.reviews_analyzed_count = reviewsAnalyzedCount;

    // Step 4: Fetch real PubMed study counts for each suggested topic — two-pass strategy
    //
    // Pass 1: use the AI-generated pubmed_query (specific keyword phrase).
    //   Gemini generates 3-5 MeSH-style keywords — specific but can be too narrow.
    //
    // Pass 2 (fallback): for any topic where pass 1 returned 0 or failed, retry
    //   with the topic title as a natural-language fallback. Titles are broader
    //   and less likely to return 0 due to keyword mismatch.
    //
    // This prevents a narrow pubmed_query from producing a false "Insufficient"
    // verdict on a topic that actually has primary studies.
    //
    // ACC-4: Set verified_feasibility only when at least one count call succeeded;
    //   leave it undefined when all API calls failed (avoids false Insufficient
    //   labels when PubMed is temporarily down).
    const pass1Results = await Promise.allSettled(
      gapAnalysis.suggested_topics.map((topic) => countPrimaryStudies(topic.pubmed_query ?? topic.title))
    );

    // Identify topics that need a broader fallback query (returned 0 or API error)
    const needsFallback = pass1Results.map(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value === 0)
    );
    const hasFallbacks = needsFallback.some(Boolean);

    const pass2Results: PromiseSettledResult<number>[] = hasFallbacks
      ? await Promise.allSettled(
          gapAnalysis.suggested_topics.map((topic, i) =>
            needsFallback[i]
              ? countPrimaryStudies(topic.title)
              : Promise.resolve(-1) // sentinel — pass1 already succeeded
          )
        )
      : gapAnalysis.suggested_topics.map(() => ({ status: "fulfilled" as const, value: -1 }));

    gapAnalysis.suggested_topics = gapAnalysis.suggested_topics.map((topic, i) => {
      const p1 = pass1Results[i];
      const p2 = pass2Results[i];

      const count1 = p1.status === "fulfilled" ? p1.value : 0;
      const count2 = needsFallback[i] && p2.status === "fulfilled" && p2.value !== -1
        ? p2.value
        : 0;
      const bestCount = Math.max(count1, count2);

      // Only set verified_feasibility when at least one API call returned data.
      // If both p1 and the fallback p2 failed, leave it undefined so the UI
      // falls back to the AI estimate rather than falsely showing "Insufficient".
      const p1Succeeded = p1.status === "fulfilled";
      const p2Succeeded = needsFallback[i] && p2.status === "fulfilled" && p2.value !== -1;
      const anySucceeded = p1Succeeded || p2Succeeded;

      return {
        ...topic,
        estimated_studies: bestCount,
        verified_feasibility: anySucceeded ? getFeasibilityScore(bestCount) : undefined,
      };
    });

    const fallbackCount = needsFallback.filter(Boolean).length;
    console.log(
      "[analyze] PubMed counts computed for", gapAnalysis.suggested_topics.length, "topics",
      fallbackCount > 0 ? `(${fallbackCount} used title fallback)` : ""
    );

    // Save all three back to the result row
    const { error: updateError } = await supabase
      .from("search_results")
      .update({
        feasibility_score: feasibility.score,
        feasibility_explanation: feasibility.explanation,
        gap_analysis: gapAnalysis,
        study_design_recommendation: studyDesign,
      })
      .eq("id", resultId);

    if (updateError) {
      console.error("Failed to save analysis:", updateError.message);
      return Response.json({ error: "Failed to save analysis results." }, { status: 500 });
    }

    return Response.json({ resultId, cached: false });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("Analyze error:", apiError.message);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}
