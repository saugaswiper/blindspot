"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PICOForm } from "@/components/PICOForm";
import { validateSearchInput } from "@/lib/validators";
import { isUserBooleanQuery } from "@/lib/boolean-search";
import type { PICOInput, SearchMode } from "@/types";

const EMPTY_PICO: PICOInput = {
  population: "",
  intervention: "",
  comparison: "",
  outcome: "",
};

/**
 * ACC-8: Publication year filter options shown in the search form.
 * "All time" (undefined) is the default — matches existing behaviour.
 */
const YEAR_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "All time", value: undefined },
  { label: "Since 2010", value: 2010 },
  { label: "Since 2015", value: 2015 },
  { label: "Since 2018", value: 2018 },
  { label: "Since 2020", value: 2020 },
  { label: "Since 2022", value: 2022 },
];

export function TopicInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<SearchMode>("simple");
  const [queryText, setQueryText] = useState(searchParams.get("q") ?? "");
  const [pico, setPico] = useState<PICOInput>(EMPTY_PICO);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showBooleanHints, setShowBooleanHints] = useState(false);
  /** ACC-8: Selected minimum publication year (undefined = all time) */
  const [minYear, setMinYear] = useState<number | undefined>(undefined);

  function handleModeToggle(next: SearchMode) {
    setMode(next);
    setErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const input =
      mode === "simple"
        ? { mode: "simple" as const, queryText }
        : { mode: "pico" as const, pico };

    const validation = validateSearchInput(input);
    if (!validation.success) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);

    const body = mode === "simple"
      ? { mode: "simple", queryText, ...(minYear !== undefined && { minYear }) }
      : { mode: "pico", pico, ...(minYear !== undefined && { minYear }) };

    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { resultId?: string; error?: string; guestLimitReached?: boolean };

    if (!res.ok || !data.resultId) {
      if (data.guestLimitReached) {
        router.push("/signup");
        return;
      }
      setErrors({ root: data.error ?? "Search failed. Please try again." });
      setLoading(false);
      return;
    }

    router.push(`/results/${data.resultId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Top control bar — mode toggle + year filter */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        <span className="text-xs mr-2" style={{ color: "var(--muted)" }}>
          Search mode:
        </span>
        {(["simple", "pico"] as SearchMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeToggle(m)}
            className="px-3 py-1.5 text-sm font-medium rounded transition-all"
            style={{
              color: mode === m ? "var(--foreground)" : "var(--muted)",
              background: mode === m ? "var(--surface-2)" : "transparent",
              borderBottom: mode === m ? `2px solid var(--accent)` : "2px solid transparent",
            }}
          >
            {m === "simple" ? "Simple" : "PICO"}
          </button>
        ))}

        {/* ACC-8: Publication year filter */}
        <div className="ml-auto flex items-center gap-1.5">
          <label
            htmlFor="year-filter"
            className="text-xs"
            style={{ color: "var(--muted)" }}
          >
            Period:
          </label>
          <select
            id="year-filter"
            value={minYear ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setMinYear(v === "" ? undefined : parseInt(v, 10));
            }}
            className="text-xs rounded px-2 py-1 transition-colors cursor-pointer"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: minYear ? "var(--foreground)" : "var(--muted)",
            }}
            aria-label="Filter studies by publication period"
          >
            {YEAR_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value ?? ""}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Input area */}
      {mode === "simple" ? (
        <div>
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="e.g. cognitive behavioral therapy for insomnia in elderly patients"
            className="w-full px-0 py-3 text-sm bg-transparent outline-none transition-colors"
            style={{
              color: "var(--foreground)",
              borderBottom: errors.queryText
                ? "2px solid #dc2626"
                : "2px solid var(--border)",
              caretColor: "var(--accent)",
            }}
            onFocus={(e) => {
              if (!errors.queryText) {
                e.target.style.borderBottomColor = "var(--accent)";
              }
            }}
            onBlur={(e) => {
              if (!errors.queryText) {
                e.target.style.borderBottomColor = "var(--border)";
              }
            }}
          />
          {errors.queryText && (
            <p className="text-xs mt-1.5" style={{ color: "#dc2626" }}>
              {errors.queryText}
            </p>
          )}
          {!errors.queryText && isUserBooleanQuery(queryText) && (
            <div className="mt-1.5">
              <p className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: "var(--muted)" }}>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--accent)",
                  }}
                >
                  Boolean
                </span>
                <span>Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.</span>
                <button
                  type="button"
                  onClick={() => setShowBooleanHints((v) => !v)}
                  className="underline underline-offset-2 transition-opacity hover:opacity-70 text-[11px] ml-auto"
                  style={{ color: "var(--accent)" }}
                  aria-expanded={showBooleanHints}
                  aria-controls="boolean-hints-panel"
                >
                  {showBooleanHints ? "Hide syntax ▴" : "Show syntax ▾"}
                </button>
              </p>

              {showBooleanHints && (
                <div
                  id="boolean-hints-panel"
                  className="mt-2 rounded-md p-3 text-[11px] leading-relaxed"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--muted)",
                  }}
                >
                  <p className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>
                    Common PubMed syntax
                  </p>
                  <table className="w-full border-collapse">
                    <tbody>
                      {[
                        { tag: "AND", desc: "Both terms required — CBT AND insomnia" },
                        { tag: "OR", desc: "Either term — CBT OR \"cognitive therapy\"" },
                        { tag: "NOT", desc: "Exclude — insomnia NOT pediatric" },
                        { tag: "[tiab]", desc: "Title/abstract field — \"CBT\"[tiab]" },
                        { tag: "[MeSH Terms]", desc: "MeSH controlled vocabulary — \"Sleep Initiation and Maintenance Disorders\"[MeSH Terms]" },
                        { tag: "[pt]", desc: "Publication type — \"Systematic Review\"[pt]" },
                        { tag: "[dp]", desc: "Date published — 2020:2024[dp]" },
                        { tag: "[au]", desc: "Author name — \"Smith J\"[au]" },
                      ].map(({ tag, desc }) => (
                        <tr key={tag} className="align-top">
                          <td
                            className="pr-3 pb-1 font-mono whitespace-nowrap"
                            style={{ color: "var(--accent)" }}
                          >
                            {tag}
                          </td>
                          <td className="pb-1">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <a
                    href="https://pubmed.ncbi.nlm.nih.gov/help/#search-tags"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block underline underline-offset-2 hover:opacity-70 transition-opacity"
                    style={{ color: "var(--accent)" }}
                  >
                    Full PubMed search tag reference →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <PICOForm
          value={pico}
          onChange={setPico}
          errors={errors as Partial<Record<keyof PICOInput, string>>}
        />
      )}

      {errors.root && (
        <p className="text-sm mt-2" style={{ color: "#dc2626" }}>
          {errors.root}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full py-3 px-6 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: loading ? "var(--muted)" : "var(--brand-surface)",
          color: "#f4f1ea",
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching…
          </span>
        ) : (
          "Find Research Gaps"
        )}
      </button>
    </form>
  );
}
