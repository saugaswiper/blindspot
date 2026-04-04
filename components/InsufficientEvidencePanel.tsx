"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InsufficientEvidencePanelProps {
  primaryStudyCount: number;
}

export function InsufficientEvidencePanel({
  primaryStudyCount,
}: InsufficientEvidencePanelProps) {
  const [showClinicalTrials, setShowClinicalTrials] = useState(false);
  const [broaderQuery, setBroaderQuery] = useState("");
  const router = useRouter();

  const studyText =
    primaryStudyCount === 0
      ? "No primary studies were found"
      : primaryStudyCount === 1
      ? "Only 1 primary study was found"
      : `Only ${primaryStudyCount} primary studies were found`;

  function handleBroaderSearch(e: React.FormEvent) {
    e.preventDefault();
    if (broaderQuery.trim()) {
      router.push(`/?q=${encodeURIComponent(broaderQuery.trim())}`);
    }
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
    >
      {/* Header band */}
      <div
        className="px-6 py-5 flex gap-4"
        style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca" }}
      >
        <div
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mt-0.5"
          style={{ background: "#fee2e2", color: "#991b1b" }}
        >
          !
        </div>
        <div>
          {/* Unified label — consistent with the "Insufficient" feasibility badge */}
          <h3 className="font-semibold text-base mb-1" style={{ color: "#7f1d1d" }}>
            Insufficient Evidence
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "#991b1b" }}>
            {studyText}. A systematic review is not feasible on this exact topic.
          </p>
          <p className="text-xs mt-2 leading-relaxed" style={{ color: "#b91c1c", opacity: 0.8 }}>
            Per the Cochrane Handbook, gap analysis from fewer than 3 primary studies
            is methodologically invalid — AI analysis has been disabled to prevent
            speculative recommendations.
          </p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5" style={{ background: "var(--surface)" }}>
        <p className="text-xs font-semibold tracking-[0.15em] uppercase" style={{ color: "var(--muted)" }}>
          Paths forward
        </p>

        {/* Option 1: Broaden the topic — ACTIONABLE with inline search */}
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
            Try a broader topic
          </p>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--muted)" }}>
            Widen your population, outcome, or intervention. Instead of
            &ldquo;CBT for insomnia in elderly with comorbid anxiety,&rdquo; try
            &ldquo;CBT for insomnia in elderly&rdquo; or &ldquo;Psychological
            interventions for insomnia.&rdquo;
          </p>
          <form onSubmit={handleBroaderSearch} className="flex gap-2">
            <input
              type="text"
              value={broaderQuery}
              onChange={(e) => setBroaderQuery(e.target.value)}
              placeholder="Enter a broader topic…"
              className="flex-1 text-xs px-3 py-2 rounded outline-none transition-colors"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
            <button
              type="submit"
              disabled={!broaderQuery.trim()}
              className="text-xs font-medium px-3 py-2 rounded transition-opacity disabled:opacity-40"
              style={{ background: "var(--brand)", color: "#f4f1ea" }}
            >
              Search
            </button>
          </form>
        </div>

        {/* Option 2: Scoping review — link to JBI Manual (not a Google search) */}
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
            Consider a scoping review first
          </p>
          <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--muted)" }}>
            A scoping review can map whether primary research exists on your
            question — and may reveal a broader topic with sufficient evidence
            for a systematic review.
          </p>
          <a
            href="https://jbi.global/sites/default/files/2021-05/JBI_Manual_for_Evidence_Synthesis_2024.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--accent)" }}
          >
            JBI Manual for Evidence Synthesis — Chapter 11: Scoping Reviews
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        {/* Option 3: Register a primary study — accessible, keyboard navigable */}
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <button
            type="button"
            role="button"
            aria-expanded={showClinicalTrials}
            onClick={() => setShowClinicalTrials(!showClinicalTrials)}
            onKeyDown={(e) => e.key === "Enter" && setShowClinicalTrials(!showClinicalTrials)}
            className="w-full text-left flex items-start justify-between gap-3 cursor-pointer"
          >
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Register a primary research study
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                No evidence exists — this gap is an open research opportunity.
                Consider designing and registering a primary study instead.
              </p>
            </div>
            <span
              className="shrink-0 mt-0.5 text-base transition-transform"
              style={{
                color: "var(--muted)",
                transform: showClinicalTrials ? "rotate(180deg)" : "rotate(0deg)",
                display: "inline-block",
              }}
              aria-hidden="true"
            >
              ↓
            </span>
          </button>
          {showClinicalTrials && (
            <a
              href="https://clinicaltrials.gov/study-record/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium mt-3 transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Register on ClinicalTrials.gov
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Methodology footnote */}
      <div
        className="px-6 py-4"
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          <strong style={{ color: "var(--foreground)" }}>Why 3 studies?</strong>{" "}
          Blindspot searched PubMed, OpenAlex, Europe PMC, Semantic Scholar, and
          ClinicalTrials.gov. A minimum of 3 primary studies is required for even
          a scoping review. AI-generated recommendations on fewer studies are
          speculative, not evidence-based.
        </p>
      </div>
    </div>
  );
}
