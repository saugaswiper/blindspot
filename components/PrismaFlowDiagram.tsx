"use client";

/**
 * PrismaFlowDiagram — PRISMA 2020 visual flow diagram for primary study screening.
 *
 * Renders the structured data from computePrimaryStudyPrismaData as an
 * interactive PRISMA 2020 flow diagram. Real counts (identification phase) are
 * distinguished from statistically-estimated counts (screening/eligibility/
 * included phases) with a visual "Estimated" badge.
 *
 * Used exclusively as the "PRISMA" tab in ResultsDashboard.
 */

import { useState } from "react";
import type { PrimaryStudyPrismaData } from "@/lib/prisma-diagram";
import { buildEmbaseUrl, buildCINAHLUrl } from "@/lib/boolean-search";
import { generateBooleanSearchStrings } from "@/lib/boolean-search-builder";

/* -------------------------------------------------------------------------- */
/* Sub-components                                                               */
/* -------------------------------------------------------------------------- */

/** A labelled box in the PRISMA flow. */
function FlowBox({
  children,
  highlighted = false,
  dimmed = false,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className="rounded-lg px-4 py-3 text-sm"
      style={{
        background: highlighted
          ? "var(--brand-surface, #1e3a5f)"
          : dimmed
          ? "var(--surface)"
          : "var(--surface)",
        border: highlighted
          ? "1px solid var(--brand, #1e3a5f)"
          : "1px solid var(--border)",
        color: highlighted ? "var(--background, #f4f1ea)" : "var(--foreground)",
        opacity: dimmed ? 0.65 : 1,
      }}
    >
      {children}
    </div>
  );
}

/** Pill badge shown next to a count to indicate real vs estimated data. */
function EstimatedBadge() {
  return (
    <span
      className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{
        background: "rgba(251,191,36,0.15)",
        color: "#92400e",
        border: "1px solid rgba(251,191,36,0.4)",
      }}
    >
      est.
    </span>
  );
}

/** Vertical arrow connector between flow boxes. */
function VerticalArrow() {
  return (
    <div className="flex justify-center my-1" aria-hidden="true">
      <div className="flex flex-col items-center">
        <div className="w-px h-4" style={{ background: "var(--border)" }} />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "6px solid var(--border)",
          }}
        />
      </div>
    </div>
  );
}

/** Exclusion side-box connected from the main flow by a horizontal arm. */
function ExclusionBox({ label, count }: { label: string; count: number }) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-sm flex-1 min-w-0"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--foreground)",
      }}
    >
      <p className="font-medium text-xs" style={{ color: "var(--muted)" }}>
        Excluded
      </p>
      <p className="font-semibold text-base mt-0.5">
        {count.toLocaleString("en-US")}
        <EstimatedBadge />
      </p>
      <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
        {label}
      </p>
    </div>
  );
}

/** A row with a main flow box on the left and an optional exclusion box on the right. */
function FlowRow({
  main,
  exclusion,
}: {
  main: React.ReactNode;
  exclusion?: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch gap-3">
      <div className="flex-1 min-w-0">{main}</div>
      {exclusion ? (
        <div className="flex items-center gap-2 shrink-0" style={{ maxWidth: "38%" }}>
          {/* Horizontal arm */}
          <div className="flex items-center" aria-hidden="true">
            <div className="h-px w-4" style={{ background: "var(--border)" }} />
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
                borderLeft: "6px solid var(--border)",
              }}
            />
          </div>
          {exclusion}
        </div>
      ) : (
        /* Keep layout stable when no exclusion box */
        <div style={{ maxWidth: "38%" }} />
      )}
    </div>
  );
}

/** Left-side phase label. */
function PhaseLabel({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-2 mb-2 mt-4 first:mt-0"
    >
      <div
        className="h-px flex-1"
        style={{ background: "var(--border)" }}
      />
      <span
        className="text-[11px] font-semibold uppercase tracking-widest px-2 whitespace-nowrap"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </span>
      <div
        className="h-px flex-1"
        style={{ background: "var(--border)" }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Identification phase                                                         */
/* -------------------------------------------------------------------------- */

function IdentificationPhase({
  data,
  query
}: {
  data: PrimaryStudyPrismaData;
  query?: string;
}) {
  const hasRegisters =
    (data.clinicalTrialsCount !== null && data.clinicalTrialsCount !== undefined) ||
    (data.prosperoCount !== null && data.prosperoCount !== undefined);

  // Generate Embase/CINAHL search strings for clickable links
  let embaseString = "";
  let centralString = "";
  if (query) {
    try {
      const searches = generateBooleanSearchStrings(query);
      embaseString = searches.embase;
      centralString = searches.central;
    } catch {
      // Silently fail if string generation errors
    }
  }

  if (!data.hasPerSourceData) {
    /* Fallback: no per-source breakdown stored (pre-migration 012 result) */
    return (
      <FlowBox>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
          Records identified
        </p>
        <p className="text-2xl font-bold">{data.afterDedup.toLocaleString("en-US")}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          Blended unique estimate (per-source breakdown unavailable for this result)
        </p>
      </FlowBox>
    );
  }

  return (
    <div className="flex gap-3 flex-wrap sm:flex-nowrap">
      {/* Databases */}
      <FlowBox>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
          Databases searched (N = {data.totalFromDatabases.toLocaleString("en-US")})
        </p>
        <ul className="space-y-1">
          {data.perSourceCounts.map((src) => (
            <li key={src.name} className="flex items-center justify-between gap-4 text-xs">
              <span style={{ color: "var(--muted)" }}>{src.name}</span>
              <span className="font-semibold tabular-nums">{src.count.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      </FlowBox>

      {/* Registers — only shown when data is available */}
      {hasRegisters && (
        <FlowBox>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
            Registers &amp; trial databases
          </p>
          <ul className="space-y-1">
            {data.clinicalTrialsCount !== null && data.clinicalTrialsCount !== undefined && (
              <li className="flex items-center justify-between gap-4 text-xs">
                <span style={{ color: "var(--muted)" }}>ClinicalTrials.gov</span>
                <span className="font-semibold tabular-nums">{data.clinicalTrialsCount.toLocaleString("en-US")}</span>
              </li>
            )}
            {data.prosperoCount !== null && data.prosperoCount !== undefined && (
              <li className="flex items-center justify-between gap-4 text-xs">
                <span style={{ color: "var(--muted)" }}>PROSPERO</span>
                <span className="font-semibold tabular-nums">{data.prosperoCount.toLocaleString("en-US")}</span>
              </li>
            )}
          </ul>
          <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
            Trial registrations are not included in the screening funnel — they are tracked separately.
          </p>
        </FlowBox>
      )}

      {/* Additional databases (Embase, CINAHL) with clickable search links */}
      {query && (embaseString || centralString) && (
        <FlowBox>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>
            Search additional databases
          </p>
          <div className="space-y-1.5">
            {embaseString && (
              <a
                href={buildEmbaseUrl(embaseString)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-75"
                style={{
                  background: "rgba(99,102,241,0.1)",
                  color: "var(--brand, #1e3a5f)",
                  textDecoration: "none",
                }}
                title={`Search Embase: ${embaseString}`}
              >
                <span>Embase →</span>
              </a>
            )}
            {centralString && (
              <a
                href={buildCINAHLUrl(centralString)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-medium transition-opacity hover:opacity-75"
                style={{
                  background: "rgba(34,197,94,0.1)",
                  color: "var(--brand, #1e3a5f)",
                  textDecoration: "none",
                }}
                title={`Search CINAHL: ${centralString}`}
              >
                <span>CINAHL →</span>
              </a>
            )}
          </div>
          <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "var(--muted)" }}>
            Note: Most institutions require subscriptions to access these databases. Contact your library for access.
          </p>
        </FlowBox>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Criteria section                                                             */
/* -------------------------------------------------------------------------- */

function CriteriaSection({ data }: { data: PrimaryStudyPrismaData }) {
  const [showInclusion, setShowInclusion] = useState(true);

  if (!data.criteria) return null;

  return (
    <div className="mt-4 space-y-3">
      <h3
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--muted)" }}
      >
        Proposed screening criteria
      </h3>

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setShowInclusion(true)}
          className="px-3 py-1 rounded-full font-medium transition-colors"
          style={
            showInclusion
              ? { background: "var(--brand, #1e3a5f)", color: "var(--background, #f4f1ea)" }
              : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }
          }
        >
          Inclusion ({data.criteria.inclusion.length})
        </button>
        <button
          onClick={() => setShowInclusion(false)}
          className="px-3 py-1 rounded-full font-medium transition-colors"
          style={
            !showInclusion
              ? { background: "var(--brand, #1e3a5f)", color: "var(--background, #f4f1ea)" }
              : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }
          }
        >
          Exclusion ({data.criteria.exclusion.length})
        </button>
      </div>

      <ul className="space-y-2">
        {(showInclusion ? data.criteria.inclusion : data.criteria.exclusion).map((c, i) => (
          <li key={i} className="flex gap-2 text-xs" style={{ color: "var(--foreground)" }}>
            <span
              className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={
                showInclusion
                  ? { background: "rgba(16,185,129,0.15)", color: "#065f46", border: "1px solid rgba(16,185,129,0.3)" }
                  : { background: "rgba(239,68,68,0.12)", color: "#7f1d1d", border: "1px solid rgba(239,68,68,0.25)" }
              }
            >
              {showInclusion ? "+" : "−"}
            </span>
            <span className="leading-relaxed" style={{ color: "var(--foreground)" }}>{c}</span>
          </li>
        ))}
      </ul>

      <p className="text-[10px] leading-relaxed" style={{ color: "var(--muted)" }}>
        AI-generated criteria based on the recommended study design
        {data.studyDesignType ? ` (${data.studyDesignType})` : ""}. Refine before use in your protocol.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main export                                                                  */
/* -------------------------------------------------------------------------- */

export function PrismaFlowDiagram({
  data,
  query,
}: {
  data: PrimaryStudyPrismaData;
  query?: string;
}) {
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <div className="space-y-1">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm border"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          />
          Real count (from live database search)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)" }}
          />
          <span
            className="font-medium"
            style={{ color: "#92400e" }}
          >
            est.
          </span>{" "}
          Statistically estimated from screening benchmarks
        </span>
      </div>

      {/* Phase: IDENTIFICATION */}
      <PhaseLabel label="Identification" />
      <FlowRow main={<IdentificationPhase data={data} query={query} />} />

      {/* Databases not covered — shown always; critical for NMA/large MA topics */}
      <div
        className="mt-2 mb-1 rounded-md px-3 py-2.5 text-xs leading-relaxed"
        style={{
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.3)",
          color: "var(--foreground)",
        }}
      >
        <span className="font-semibold" style={{ color: "#92400e" }}>
          Databases not searched by Blindspot:
        </span>{" "}
        <span style={{ color: "var(--muted)" }}>
          Cochrane CENTRAL, PsycINFO, Embase, CINAHL. For clinical trials and mental health topics,
          these can add 30–60% more eligible studies. Search them manually before finalising your
          protocol.
        </span>
      </div>

      {/* Deduplication */}
      <VerticalArrow />
      <FlowRow
        main={
          <FlowBox>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--muted)" }}>
                  After duplicates removed
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {data.afterDedup.toLocaleString("en-US")}
                </p>
              </div>
              {data.duplicatesRemoved !== null && (
                <div className="text-right">
                  <p className="text-xs" style={{ color: "var(--muted)" }}>Duplicates removed</p>
                  <p className="text-lg font-semibold tabular-nums">{data.duplicatesRemoved.toLocaleString("en-US")}</p>
                  <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                    ({Math.round((data.duplicatesRemoved / Math.max(1, data.totalIdentified)) * 100)}% of total)
                  </p>
                </div>
              )}
            </div>
          </FlowBox>
        }
      />

      {/* Phase: SCREENING */}
      <PhaseLabel label="Screening" />
      <VerticalArrow />
      <FlowRow
        main={
          <FlowBox>
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--muted)" }}>
              Records screened (title &amp; abstract)
              <EstimatedBadge />
            </p>
            <p className="text-2xl font-bold tabular-nums">{data.afterDedup.toLocaleString("en-US")}</p>
          </FlowBox>
        }
        exclusion={
          <ExclusionBox
            label="Did not meet title/abstract criteria"
            count={data.excludedTitleAbstract}
          />
        }
      />

      {/* Phase: ELIGIBILITY */}
      <PhaseLabel label="Eligibility" />
      <VerticalArrow />
      <FlowRow
        main={
          <FlowBox>
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--muted)" }}>
              Full-text articles assessed for eligibility
              <EstimatedBadge />
            </p>
            <p className="text-2xl font-bold tabular-nums">{data.afterTitleAbstract.toLocaleString("en-US")}</p>
          </FlowBox>
        }
        exclusion={
          <ExclusionBox
            label="Did not meet full-text eligibility criteria"
            count={data.excludedFullText}
          />
        }
      />

      {/* Phase: INCLUDED */}
      <PhaseLabel label="Included" />
      <VerticalArrow />
      <FlowRow
        main={
          <FlowBox highlighted>
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-0.5"
              style={{ color: "rgba(244,241,234,0.65)" }}
            >
              Studies included in review
              <EstimatedBadge />
            </p>
            <p className="text-3xl font-bold tabular-nums">
              {data.included.toLocaleString("en-US")}
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(244,241,234,0.7)" }}>
              Estimated 95% CI: {data.includedLow.toLocaleString("en-US")}–{data.includedHigh.toLocaleString("en-US")} studies
            </p>
            {data.studyDesignType && (
              <p className="text-xs mt-0.5" style={{ color: "rgba(244,241,234,0.55)" }}>
                Design: {data.studyDesignType}
              </p>
            )}
          </FlowBox>
        }
      />

      {/* Calibration note */}
      <div
        className="mt-4 rounded-md px-4 py-3 text-xs leading-relaxed"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
          About these estimates
        </p>
        <p>
          Identification counts are real data from live database searches. Screening and included counts are
          statistically estimated using benchmarks from published systematic reviews, calibrated against{" "}
          {data.afterDedup < 15
            ? "small-corpus patterns"
            : data.afterDedup < 60
            ? "medium-corpus patterns (15–59 studies)"
            : data.afterDedup < 500
            ? "large-corpus patterns (60–499 studies)"
            : data.afterDedup < 1500
            ? "XL-corpus patterns (500–1499 studies)"
            : "XXL-corpus patterns (≥1500 studies)"}.
          The 95% CI reflects typical ±
          {data.afterDedup < 15 ? "30" : data.afterDedup < 60 ? "50" : "100"}% error across published SRs.
          Estimates improve when your query closely matches your planned eligibility criteria.
        </p>
        {data.afterDedup >= 1500 && (
          <p className="mt-2 text-amber-700 dark:text-amber-400">
            Large evidence base: if your review targets a specific subpopulation or intervention,
            the actual included count may be substantially lower than estimated.
          </p>
        )}
      </div>

      {/* Proposed criteria (collapsible) */}
      {data.criteria && (
        <div className="mt-4">
          <button
            onClick={() => setShowCriteria((v) => !v)}
            className="flex items-center gap-2 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: "var(--foreground)" }}
          >
            <span
              className="w-4 h-4 flex items-center justify-center rounded"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              {showCriteria ? "−" : "+"}
            </span>
            {showCriteria ? "Hide" : "Show"} proposed screening criteria
          </button>

          {showCriteria && (
            <div
              className="mt-3 rounded-lg p-4"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <CriteriaSection data={data} />
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] mt-4 leading-relaxed" style={{ color: "var(--muted)" }}>
        Generated per PRISMA 2020 guidelines (Page et al., BMJ 2021). Identification counts are from
        live searches of PubMed, OpenAlex, Europe PMC, and Scopus. Screening/eligibility/included
        counts are estimates — verify with domain expertise before use in a protocol.
      </p>
    </div>
  );
}
