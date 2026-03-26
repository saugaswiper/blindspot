import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { NavBar } from "@/components/NavBar";
import type { ExistingReview, FeasibilityScore, GapAnalysis, StudyDesignRecommendation } from "@/types";

async function getResult(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("search_results")
    .select(`
      id,
      primary_study_count,
      existing_reviews,
      feasibility_score,
      feasibility_explanation,
      gap_analysis,
      study_design_recommendation,
      searches (query_text)
    `)
    .eq("id", id)
    .single();
  return data;
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getResult(id);
  if (!result) notFound();

  const query = (result.searches as unknown as { query_text: string } | null)?.query_text ?? "";

  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />

      <ResultsDashboard
        resultId={id}
        query={query}
        existingReviews={(result.existing_reviews ?? []) as ExistingReview[]}
        primaryStudyCount={result.primary_study_count as number}
        feasibilityScore={result.feasibility_score as FeasibilityScore | null}
        feasibilityExplanation={result.feasibility_explanation as string | null}
        gapAnalysis={result.gap_analysis as GapAnalysis | null}
        studyDesign={result.study_design_recommendation as StudyDesignRecommendation | null}
      />
    </main>
  );
}
