import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { NavBar } from "@/components/NavBar";
import type {
  ExistingReview,
  FeasibilityScore,
  GapAnalysis,
  StudyDesignRecommendation,
} from "@/types";

async function getResult(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("search_results")
    .select(`
      id,
      primary_study_count,
      clinical_trials_count,
      prospero_registrations_count,
      deduplication_count,
      existing_reviews,
      feasibility_score,
      feasibility_explanation,
      gap_analysis,
      study_design_recommendation,
      protocol_draft,
      is_public,
      searches (id, query_text, user_id)
    `)
    .eq("id", id)
    .single();
  return data;
}

async function getAlertStatus(searchId: string, userId: string | undefined) {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("search_alerts")
    .select("is_enabled")
    .eq("search_id", searchId)
    .eq("user_id", userId)
    .single();
  return data?.is_enabled ?? false;
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch user and result in parallel
  const supabase = await createClient();
  const [{ data: { user } }, result] = await Promise.all([
    supabase.auth.getUser(),
    getResult(id),
  ]);

  if (!result) notFound();

  const searchData = (
    result.searches as unknown as { id: string; query_text: string; user_id: string } | null
  );
  const query = searchData?.query_text ?? "";
  const searchId = searchData?.id ?? "";

  // The viewer is the owner if they are logged in and the search belongs to them
  const isOwner = !!(user && searchData?.user_id === user.id);

  // is_public may be absent on older DB rows before the migration (treat as false)
  const isPublic = (result.is_public as boolean | undefined) ?? false;

  // Fetch alert subscription status (only relevant for owner)
  let isAlertSubscribed = false;
  if (isOwner && searchId) {
    isAlertSubscribed = await getAlertStatus(searchId, user?.id);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />

      <ResultsDashboard
        resultId={id}
        searchId={searchId}
        query={query}
        existingReviews={(result.existing_reviews ?? []) as ExistingReview[]}
        primaryStudyCount={result.primary_study_count as number}
        clinicalTrialsCount={
          (result.clinical_trials_count as number | null | undefined) ?? null
        }
        prosperoRegistrationsCount={
          (result.prospero_registrations_count as number | null | undefined) ?? null
        }
        deduplicationCount={
          (result.deduplication_count as number | null | undefined) ?? null
        }
        feasibilityScore={result.feasibility_score as FeasibilityScore | null}
        feasibilityExplanation={
          result.feasibility_explanation as string | null
        }
        gapAnalysis={result.gap_analysis as GapAnalysis | null}
        studyDesign={
          result.study_design_recommendation as StudyDesignRecommendation | null
        }
        isOwner={isOwner}
        isPublic={isPublic}
        protocolDraft={(result.protocol_draft as string | null | undefined) ?? null}
        isAlertSubscribed={isAlertSubscribed}
      />
    </main>
  );
}
