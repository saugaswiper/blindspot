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
  // Pre-populate the query from the ?q= URL param (used by Related Searches links).
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

    const data = (await res.json()) as { resultId?: string; error?: string };

    if (!res.ok || !data.resultId) {
      setErrors({ root: data.error ?? "Search failed. Please try again." });
      setLoading(false);
      return;
    }

    router.push(`/results/${data.resultId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Mode toggle */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-gray-500">Search mode:</span>
        <div className="flex rounded-md border border-gray-200 p-0.5 bg-gray-50">
          <button
            type="button"
            onClick={() => handleModeToggle("simple")}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              mode === "simple"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => handleModeToggle("pico")}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              mode === "pico"
                ? "bg-[#1e3a5f] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            PICO
          </button>
        </div>
      </div>

      {/* Input area */}
      {mode === "simple" ? (
        <div>
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Enter a research area, e.g. 'cognitive behavioral therapy for insomnia in elderly patients'"
            className={`w-full px-4 py-3 border rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent ${
              errors.queryText ? "border-red-400" : "border-gray-300"
            }`}
          />
          {errors.queryText && (
            <p className="text-xs text-red-600 mt-1">{errors.queryText}</p>
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
        <p className="text-sm text-red-600 mt-2">{errors.root}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full py-3 px-6 bg-[#1e3a5f] text-white font-medium rounded-lg hover:bg-[#2d5a8e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Searching..." : "Find Research Gaps"}
      </button>
    </form>
  );
}
