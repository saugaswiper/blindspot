import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { isUserBooleanQuery } from "@/lib/boolean-search";
import { DashboardContent } from "@/components/DashboardContent";

async function getSearches(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("searches")
    .select(`
      id,
      query_text,
      created_at,
      search_results (
        id,
        feasibility_score,
        gap_analysis,
        prospero_registrations_count,
        primary_study_count,
        recent_primary_study_count
      ),
      search_alerts (
        is_enabled
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

type PageProps = {
  searchParams: Promise<{ sort?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { sort: rawSort } = await searchParams;

  const searches = await getSearches(user.id);

  const booleanCount = searches.filter((s) => isUserBooleanQuery(s.query_text)).length;

  return (
    <main className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <DashboardContent
          searches={searches}
          initialSortMode={rawSort}
          booleanCount={booleanCount}
        />
      </div>
    </main>
  );
}
