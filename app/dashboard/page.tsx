import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import type { FeasibilityScore } from "@/types";

const FEASIBILITY_STYLES: Record<FeasibilityScore, string> = {
  High: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Low: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  Insufficient: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const searches = await getSearches(user.id);

  return (
    <main className="min-h-screen" style={{ background: "var(--background)" }}>
      <NavBar />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-bold font-serif"
              style={{ color: "var(--brand)" }}
            >
              My Searches
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              {searches.length} search{searches.length !== 1 ? "es" : ""} saved
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-white px-4 py-2 rounded-md transition-opacity hover:opacity-90"
            style={{ background: "var(--brand-surface)" }}
          >
            New Search
          </Link>
        </div>

        {searches.length === 0 ? (
          <div
            className="rounded-lg p-12 text-center"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
              No searches yet.
            </p>
            <Link
              href="/"
              className="text-sm font-medium hover:opacity-70 transition-opacity underline underline-offset-2"
              style={{ color: "var(--accent)" }}
            >
              Run your first search →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((search) => {
              const result = Array.isArray(search.search_results)
                ? search.search_results[0]
                : search.search_results;
              const alertRow = Array.isArray(search.search_alerts)
                ? search.search_alerts[0]
                : search.search_alerts;
              const feasibility = result?.feasibility_score as FeasibilityScore | null;
              const hasAnalysis = !!(result?.gap_analysis);
              const hasActiveAlert = !!(alertRow?.is_enabled);
              const date = new Date(search.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <Link
                  key={search.id}
                  href={result ? `/results/${result.id}` : "#"}
                  className="block rounded-lg hover:shadow-sm transition-all p-5"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {search.query_text}
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        {date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hasActiveAlert && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 flex items-center gap-1"
                          title="Weekly email alerts active"
                        >
                          <span aria-hidden="true">🔔</span>
                          <span>Monitoring</span>
                        </span>
                      )}
                      {feasibility && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${FEASIBILITY_STYLES[feasibility]}`}
                        >
                          {feasibility}
                        </span>
                      )}
                      {hasAnalysis ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                            color: "var(--accent)",
                            border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                          }}
                        >
                          Analyzed
                        </span>
                      ) : (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: "var(--surface-2, var(--background))",
                            color: "var(--muted)",
                            border: "1px solid var(--border)",
                          }}
                        >
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
