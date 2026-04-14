import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { isUserBooleanQuery } from "@/lib/boolean-search";
import type { FeasibilityScore } from "@/types";

const FEASIBILITY_STYLES: Record<FeasibilityScore, string> = {
  High: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Low: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  Insufficient: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

/** Numeric rank used for feasibility-descending sort (High = 4, null = 0). */
const FEASIBILITY_RANK: Partial<Record<FeasibilityScore, number>> = {
  High: 4,
  Moderate: 3,
  Low: 2,
  Insufficient: 1,
};

/** Accepted values for the ?sort= URL parameter. */
type SortMode = "newest" | "oldest" | "feasibility";

function parseSortMode(raw: string | undefined): SortMode {
  if (raw === "oldest" || raw === "feasibility") return raw;
  return "newest"; // safe default
}

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
        prospero_registrations_count
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
  const sortMode = parseSortMode(rawSort);

  const searches = await getSearches(user.id);

  // Dashboard summary counts
  const booleanCount = searches.filter((s) => isUserBooleanQuery(s.query_text)).length;

  // Sort client-side after fetching. Supabase fetch is always newest-first; for
  // "oldest" and "feasibility" we re-order the already-fetched array in memory.
  const sortedSearches = [...searches].sort((a, b) => {
    if (sortMode === "oldest") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    if (sortMode === "feasibility") {
      const aResult = Array.isArray(a.search_results) ? a.search_results[0] : a.search_results;
      const bResult = Array.isArray(b.search_results) ? b.search_results[0] : b.search_results;
      const aScore = aResult?.feasibility_score as FeasibilityScore | null;
      const bScore = bResult?.feasibility_score as FeasibilityScore | null;
      const aRank = (aScore && FEASIBILITY_RANK[aScore]) ?? 0;
      const bRank = (bScore && FEASIBILITY_RANK[bScore]) ?? 0;
      if (bRank !== aRank) return bRank - aRank; // High first
      // Stable tiebreak: newest first within the same feasibility tier
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // Default: newest first (already sorted by DB)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

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
              {booleanCount > 0 && (
                <span> · {booleanCount} Boolean</span>
              )}
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
          <>
            {/* Sort controls — only shown when there is more than one search to sort */}
            {searches.length > 1 && (
              <div
                className="flex items-center gap-1 mb-4 text-xs"
                role="group"
                aria-label="Sort searches by"
              >
                <span style={{ color: "var(--muted)" }} className="mr-1">Sort:</span>
                {(
                  [
                    { mode: "newest", label: "Newest" },
                    { mode: "oldest", label: "Oldest" },
                    { mode: "feasibility", label: "High feasibility first" },
                  ] as { mode: SortMode; label: string }[]
                ).map(({ mode, label }) => {
                  const isActive = sortMode === mode;
                  return (
                    <Link
                      key={mode}
                      href={mode === "newest" ? "/dashboard" : `/dashboard?sort=${mode}`}
                      className="px-2.5 py-1 rounded-md transition-colors"
                      style={
                        isActive
                          ? {
                              background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                              color: "var(--accent)",
                              border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                              fontWeight: 500,
                            }
                          : {
                              background: "var(--surface-2, var(--background))",
                              color: "var(--muted)",
                              border: "1px solid var(--border)",
                            }
                      }
                      aria-current={isActive ? "page" : undefined}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="space-y-3">
              {sortedSearches.map((search) => {
                const result = Array.isArray(search.search_results)
                  ? search.search_results[0]
                  : search.search_results;
                const alertRow = Array.isArray(search.search_alerts)
                  ? search.search_alerts[0]
                  : search.search_alerts;
                const feasibility = result?.feasibility_score as FeasibilityScore | null;
                const hasAnalysis = !!(result?.gap_analysis);
                const hasActiveAlert = !!(alertRow?.is_enabled);
                // PROSPERO badge: show warning when one or more registered reviews exist for this query.
                // Indicates a gap may already be under review — important context for researchers.
                const prosperoCount = (result as { prospero_registrations_count?: number | null } | null)?.prospero_registrations_count ?? null;
                const hasProsperoMatches = typeof prosperoCount === "number" && prosperoCount > 0;
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
                        {/* PROSPERO badge — shown when registry matches exist, signalling a review may already be in progress */}
                        {hasProsperoMatches && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700 flex items-center gap-1"
                            title={`${prosperoCount} PROSPERO registration${prosperoCount === 1 ? "" : "s"} found — a review may already be in progress on this topic`}
                            aria-label={`PROSPERO: ${prosperoCount} registration${prosperoCount === 1 ? "" : "s"} found`}
                          >
                            <span aria-hidden="true">⚠</span>
                            <span>PROSPERO</span>
                          </span>
                        )}
                        {/* Boolean query badge — shown when the search used PubMed Boolean syntax */}
                        {isUserBooleanQuery(search.query_text) && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                              color: "var(--accent)",
                            }}
                            title="Boolean query — passed to PubMed as-is (AND, OR, NOT, field tags)"
                            aria-label="Boolean query"
                          >
                            Boolean
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
          </>
        )}
      </div>
    </main>
  );
}
