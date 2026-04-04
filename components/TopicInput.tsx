"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PICOForm } from "@/components/PICOForm";
import { validateSearchInput } from "@/lib/validators";
import type { PICOInput, SearchMode } from "@/types";

const EMPTY_PICO: PICOInput = {
  population: "",
  intervention: "",
  comparison: "",
  outcome: "",
};

export function TopicInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<SearchMode>("simple");
  const [queryText, setQueryText] = useState(searchParams.get("q") ?? "");
  const [pico, setPico] = useState<PICOInput>(EMPTY_PICO);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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
      ? { mode: "simple", queryText }
      : { mode: "pico", pico };

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
      {/* Mode toggle — underline style */}
      <div className="flex items-center gap-1 mb-5">
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
