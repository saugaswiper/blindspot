import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import type { FeasibilityScore } from "@/types";

const FEASIBILITY_STYLES: Record<FeasibilityScore, string> = {
  High: "bg-green-100 text-green-800",
  Moderate: "bg-amber-100 text-amber-800",
  Low: "bg-orange-100 text-orange-800",
  Insufficient: "bg-red-100 text-red-800",
};

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
        gap_analysis
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const searches = await getSearches(user.id);

  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#1e3a5f]">My Searches</h1>
            <p className="text-sm text-gray-500 mt-1">{searches.length} search{searches.length !== 1 ? "es" : ""} saved</p>
          </div>
          <Link
            href="/"
            className="text-sm bg-[#1e3a5f] text-white px-4 py-2 rounded-md hover:bg-[#2d5a8e] transition-colors"
          >
            New Search
          </Link>
        </div>

        {searches.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-sm mb-4">No searches yet.</p>
            <Link href="/" className="text-[#4a90d9] hover:underline text-sm font-medium">
              Run your first search →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((search) => {
              const result = Array.isArray(search.search_results)
                ? search.search_results[0]
                : search.search_results;
              const feasibility = result?.feasibility_score as FeasibilityScore | null;
              const hasAnalysis = !!(result?.gap_analysis);
              const date = new Date(search.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <Link
                  key={search.id}
                  href={result ? `/results/${result.id}` : "#"}
                  className="block bg-white rounded-lg border border-gray-200 hover:border-[#4a90d9] hover:shadow-sm transition-all p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {search.query_text}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{date}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {feasibility && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FEASIBILITY_STYLES[feasibility]}`}>
                          {feasibility}
                        </span>
                      )}
                      {hasAnalysis ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          Analyzed
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          No analysis
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
