"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ExploreSubtopic } from "@/lib/explore";

// ---------------------------------------------------------------------------
// Feasibility badge
// ---------------------------------------------------------------------------

function FeasibilityDot({ score }: { score: string }) {
  const map: Record<string, { color: string; label: string }> = {
    High:         { color: "#22c55e", label: "High feasibility" },
    Moderate:     { color: "#f59e0b", label: "Moderate feasibility" },
    Low:          { color: "#ef4444", label: "Low feasibility" },
    Insufficient: { color: "#6b7280", label: "Insufficient evidence" },
  };
  const { color, label } = map[score] ?? map.Insufficient;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        color,
      }}
      title={label}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: color }}
        aria-hidden="true"
      />
      {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Subtopic card
// ---------------------------------------------------------------------------

function SubtopicCard({
  subtopic,
  onSearch,
}: {
  subtopic: ExploreSubtopic;
  onSearch: (query: string) => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-5 transition-shadow hover:shadow-md"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug flex-1" style={{ color: "var(--foreground)" }}>
          {subtopic.title}
        </h3>
        <FeasibilityDot score={subtopic.feasibility} />
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
        {subtopic.rationale}
      </p>

      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
          ~{subtopic.studyCount.toLocaleString("en-US")} primary studies
        </span>
        <button
          onClick={() => onSearch(subtopic.title)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{
            background: "var(--brand)",
            color: "#fff",
          }}
        >
          Search this topic →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5 animate-pulse"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="h-4 rounded mb-3" style={{ background: "var(--surface-2)", width: "75%" }} />
      <div className="h-3 rounded mb-1.5" style={{ background: "var(--surface-2)" }} />
      <div className="h-3 rounded" style={{ background: "var(--surface-2)", width: "60%" }} />
      <div className="mt-4 flex justify-between items-center">
        <div className="h-3 rounded" style={{ background: "var(--surface-2)", width: "35%" }} />
        <div className="h-7 w-28 rounded-lg" style={{ background: "var(--surface-2)" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ExploreResponse {
  field: string;
  subtopics: ExploreSubtopic[];
  error?: string;
}

export function FieldExplorer() {
  const [field, setField] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExploreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleExplore(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = field.trim();
    if (!trimmed || trimmed.length < 2) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/explore?field=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as ExploreResponse;

      if (!res.ok || data.error) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(query: string) {
    router.push(`/?q=${encodeURIComponent(query)}`);
  }

  return (
    <div className="space-y-6">
      {/* Input */}
      <form onSubmit={handleExplore} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="e.g. bipolar disorder, long COVID, childhood obesity…"
          maxLength={200}
          disabled={loading}
          className="flex-1 text-sm rounded-lg px-4 py-2.5 outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          aria-label="Research field to explore"
        />
        <button
          type="submit"
          disabled={loading || field.trim().length < 2}
          className="text-sm font-medium px-4 py-2.5 rounded-lg transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {loading ? "Exploring…" : "Explore"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <p className="text-sm" style={{ color: "#ef4444" }}>{error}</p>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div>
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            Finding review opportunities in <strong style={{ color: "var(--foreground)" }}>{field}</strong>…
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <p className="text-xs font-medium tracking-[0.12em] uppercase" style={{ color: "var(--muted)" }}>
              {result.subtopics.length} review opportunities in{" "}
              <span style={{ color: "var(--foreground)" }}>{result.field}</span>
            </p>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          {result.subtopics.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No verifiable subtopics found. Try a more specific field name.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.subtopics.map((sub, i) => (
                <SubtopicCard key={i} subtopic={sub} onSearch={handleSearch} />
              ))}
            </div>
          )}

          <p className="text-[10px] mt-4 text-center" style={{ color: "var(--muted)" }}>
            Study counts from PubMed · Sorted by evidence volume · Click any topic to run a full feasibility analysis
          </p>
        </div>
      )}
    </div>
  );
}
