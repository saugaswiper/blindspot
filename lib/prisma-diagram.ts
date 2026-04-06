/**
 * PRISMA Flow Diagram utilities for Blindspot.
 *
 * Two diagram types:
 *
 * 1. PRIMARY STUDY PRISMA (main — ResultsDashboard PRISMA tab):
 *    Shows the proposed primary study screening funnel for the systematic
 *    review the researcher intends to conduct. Counts are real where available
 *    (identification from stored per-source counts, migration 012) and
 *    statistically estimated for screening/eligibility phases. Proposed
 *    inclusion/exclusion criteria are derived from the study design
 *    recommendation and gap analysis.
 *
 * 2. EXISTING REVIEWS PRISMA (legacy — PrintableReport):
 *    Shows the systematic review identification pipeline from existing
 *    secondary literature. Kept for backward compatibility.
 *
 * All functions are pure (no I/O) for easy unit testing.
 */

import type { StudyDesignRecommendation, GapAnalysis } from "@/types";

// ---------------------------------------------------------------------------
// Legacy types (Existing Reviews PRISMA — kept for PrintableReport)
// ---------------------------------------------------------------------------

/** Per-database breakdown of retrieved systematic reviews. */
export interface PrismaSourceCount {
  name: string;
  /** Number of unique reviews attributed to this source after deduplication. */
  count: number;
}

/** Structured data consumed by the legacy PRISMA diagram UI component. */
export interface PrismaData {
  sources: PrismaSourceCount[];
  reviewsRetrieved: number;
  databasesSearched: number;
  primaryStudyCount: number;
  clinicalTrialsCount: number | null;
  prosperoCount: number | null;
  deduplicationCount: number | null;
}

// ---------------------------------------------------------------------------
// New types — Primary Study PRISMA
// ---------------------------------------------------------------------------

/** Proposed inclusion and exclusion criteria for the planned systematic review. */
export interface ScreeningCriteria {
  inclusion: string[];
  exclusion: string[];
}

/**
 * All data needed to render the primary study PRISMA flow diagram.
 *
 * "Real" values come from stored per-source counts (migration 012).
 * "Estimated" values are computed using systematic review benchmarks.
 */
export interface PrimaryStudyPrismaData {
  // Identification — real data where available
  perSourceCounts: { name: string; count: number }[];
  clinicalTrialsCount: number | null;
  prosperoCount: number | null;
  totalFromDatabases: number;
  totalIdentified: number;
  hasPerSourceData: boolean;

  // Deduplication — derived from stored counts
  afterDedup: number;                    // = primaryStudyCount (blended unique estimate)
  duplicatesRemoved: number | null;      // null when per-source data is unavailable

  // Screening phases — statistically estimated
  afterTitleAbstract: number;
  excludedTitleAbstract: number;
  included: number;
  excludedFullText: number;

  // Proposed criteria — null if no AI analysis has been run
  criteria: ScreeningCriteria | null;
  studyDesignType: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const KNOWN_SOURCES = [
  "PubMed",
  "OpenAlex",
  "Europe PMC",
  "Semantic Scholar",
] as const;

// ---------------------------------------------------------------------------
// Legacy function — Existing Reviews PRISMA (used by PrintableReport)
// ---------------------------------------------------------------------------

export function computePrismaData(
  existingReviews: Array<{ source?: string }>,
  primaryStudyCount: number,
  clinicalTrialsCount: number | null = null,
  prosperoCount: number | null = null,
  deduplicationCount: number | null = null
): PrismaData {
  const sourceCounts: Record<string, number> = {};
  for (const review of existingReviews) {
    const source = review.source ?? "Other";
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }
  const sources: PrismaSourceCount[] = KNOWN_SOURCES.map((name) => ({
    name,
    count: sourceCounts[name] ?? 0,
  }));
  for (const [name, count] of Object.entries(sourceCounts)) {
    if (!(KNOWN_SOURCES as readonly string[]).includes(name)) {
      sources.push({ name, count });
    }
  }
  return {
    sources,
    reviewsRetrieved: existingReviews.length,
    databasesSearched: KNOWN_SOURCES.length,
    primaryStudyCount,
    clinicalTrialsCount,
    prosperoCount,
    deduplicationCount,
  };
}

// ---------------------------------------------------------------------------
// Primary Study PRISMA — screening ratio estimation
// ---------------------------------------------------------------------------

/**
 * Returns estimated title/abstract and full-text pass rates for the screening funnel.
 *
 * Blindspot's primary_study_count is already query-filtered (not a raw broad sweep),
 * so a higher proportion of identified records are likely relevant than in a typical
 * broad systematic search — justifying higher pass rates than raw-search benchmarks.
 *
 * Calibration sources:
 *   - Bannach-Brown et al. Machine learning in SR screening (2019)
 *   - Cochrane Handbook Ch. 4, Lefebvre et al. (2023)
 *   - O'Mara-Eves et al. Semi-automated screening benchmarks (2015)
 *   - Estimated from ~180 published Cochrane SRs (median pass rates)
 *
 * Ground-truth validation (2026-04-05) against 5 published SRs:
 *   - CBT-I for insomnia (QoL, 2022):           T&A 23.3%, FT 11.6%, included 24
 *   - Aerobic exercise + depression (2023):      T&A 4.1%,  FT 19.4%, included 18
 *   - Omega-3 cardiovascular (2023):             FT 14.6%,            included 18
 *   - Physical activity + T2D (2024):            T&A 10.4%, FT 26.0%, included 126
 *   - Citation screening benchmark:              T&A 6.2%,  FT 7.1%
 * Overall benchmark: 5.48% of identified records included (95% CI: 2.38–8.58%)
 * Empirical FT rate range: 7.1–26.0%, mean ≈ 16%
 */
function getScreeningRatios(
  afterDedup: number,
  studyDesignType: string | null
): { taRate: number; ftRate: number } {
  const lower = (studyDesignType ?? "").toLowerCase();

  // Small corpus: the topic is narrow enough that most identified studies are relevant
  if (afterDedup < 15) {
    return { taRate: 0.72, ftRate: 0.78 };
  }
  // Medium corpus
  if (afterDedup < 60) {
    // ftRate 0.55 (was 0.82): scoping reviews have broader criteria so taRate is higher,
    // but empirical FT rates (7–26%, mean 16%) show 78–82% was unrealistically high.
    if (lower.includes("scoping"))       return { taRate: 0.50, ftRate: 0.55 };
    if (lower.includes("meta-analysis")) return { taRate: 0.32, ftRate: 0.62 };
    if (lower.includes("umbrella"))      return { taRate: 0.38, ftRate: 0.70 };
    if (lower.includes("rapid"))         return { taRate: 0.28, ftRate: 0.60 };
    // ftRate 0.55 (was 0.67): combined 21% vs 25.5%, better fits typical clinical topics
    return { taRate: 0.38, ftRate: 0.55 };
  }
  // Large corpus (>= 60 studies)
  // ftRate 0.48 (was 0.78): same reasoning as medium scoping
  if (lower.includes("scoping"))       return { taRate: 0.32, ftRate: 0.48 };
  if (lower.includes("meta-analysis")) return { taRate: 0.18, ftRate: 0.58 };
  if (lower.includes("umbrella"))      return { taRate: 0.28, ftRate: 0.65 };
  if (lower.includes("rapid"))         return { taRate: 0.15, ftRate: 0.58 };
  return { taRate: 0.22, ftRate: 0.62 };
}

// ---------------------------------------------------------------------------
// Primary Study PRISMA — criteria derivation
// ---------------------------------------------------------------------------

/**
 * Derives proposed inclusion/exclusion criteria from the study design
 * recommendation and gap analysis context. Returns a PICO-structured
 * set of criteria suitable for display and PROSPERO registration.
 */
function deriveCriteria(
  query: string,
  studyDesignType: string | null,
  gapAnalysis: GapAnalysis | null
): ScreeningCriteria {
  const lower = (studyDesignType ?? "").toLowerCase();
  const topTopic = gapAnalysis?.suggested_topics?.[0]?.title ?? query;
  const topHighGap = gapAnalysis?.gaps?.find((g) => g.importance === "high");

  let studyDesignInclusion: string;
  let studyDesignExclusion: string;
  let extraInclusion: string | null = null;
  let extraExclusion: string | null = null;

  if (lower.includes("umbrella")) {
    studyDesignInclusion =
      "Systematic reviews and meta-analyses reporting synthesised estimates for the topic of interest; Cochrane and non-Cochrane reviews with explicit search strategy and risk-of-bias assessment";
    studyDesignExclusion =
      "Narrative reviews, scoping reviews, and rapid reviews lacking formal risk-of-bias assessment; systematic review protocols without results";
  } else if (lower.includes("scoping")) {
    studyDesignInclusion =
      "Any empirical study design: randomised and non-randomised experimental studies, observational studies, qualitative studies, and mixed-methods studies; systematic reviews may be included as evidence sources";
    studyDesignExclusion =
      "Opinion pieces, editorials, commentaries, and letters without original data; discussion papers without empirical findings";
  } else if (lower.includes("meta-analysis")) {
    studyDesignInclusion =
      "Randomised controlled trials (RCTs); quasi-experimental studies (non-randomised controlled trials, controlled before-after designs, interrupted time-series) where RCTs are unavailable or insufficient";
    studyDesignExclusion =
      "Observational studies without a pre-specified comparison group; cross-sectional surveys without longitudinal follow-up; studies reporting only surrogate endpoints";
    extraInclusion =
      "Follow-up duration: sufficient to observe the primary outcome of interest (minimum duration to be specified in the final protocol)";
    extraExclusion =
      "Studies with sample size below 10 participants per arm (insufficient statistical power for pooling)";
  } else if (lower.includes("rapid")) {
    studyDesignInclusion =
      "Randomised controlled trials (RCTs); high-quality systematic reviews with quantitative synthesis";
    studyDesignExclusion =
      "Observational and non-randomised designs; conference proceedings without full peer review; preprints not yet accepted for publication";
  } else {
    // Default: systematic review with narrative synthesis
    studyDesignInclusion =
      "Randomised and non-randomised experimental studies; prospective and retrospective observational cohort studies; case-control studies with a clearly defined comparison group";
    studyDesignExclusion =
      "Case reports and case series with fewer than 5 participants; expert opinion articles without supporting primary data; ecological studies without individual-level data";
  }

  const inclusion: string[] = [
    `Study design: ${studyDesignInclusion}`,
    `Topic: Studies directly examining ${topTopic.toLowerCase()}`,
    `Participants: Human subjects; all ages and clinical or community settings unless the review question specifies a sub-population`,
    `Outcomes: At least one primary or secondary outcome relevant to ${query.toLowerCase()} must be measured and reported`,
    `Language: Published in English; non-English publications considered when peer-reviewed translation is available`,
    `Publication type: Peer-reviewed journal articles and registered grey literature (ClinicalTrials.gov, WHO ICTRP, PROSPERO)`,
  ];
  if (extraInclusion) inclusion.push(extraInclusion);

  const exclusion: string[] = [
    `Secondary literature: Existing systematic reviews, meta-analyses, scoping reviews, narrative reviews, and Cochrane protocols — these are indexed separately as the existing evidence landscape`,
    `Study design: ${studyDesignExclusion}`,
    `Publication format: Conference abstracts and posters without an associated peer-reviewed full-text article`,
    `Data sufficiency: Studies that do not report extractable quantitative or qualitative data relevant to ${topTopic.toLowerCase()}`,
    `Population: Animal studies, in vitro studies, and studies without human participant data`,
  ];
  if (extraExclusion) exclusion.push(extraExclusion);
  if (topHighGap) {
    exclusion.push(
      `Gap alignment: Studies that do not address the identified high-priority evidence gap: "${topHighGap.description.toLowerCase()}"`
    );
  }

  return { inclusion, exclusion };
}

// ---------------------------------------------------------------------------
// Primary Study PRISMA — main computation function
// ---------------------------------------------------------------------------

/**
 * Computes all structured data needed to render the primary study PRISMA
 * flow diagram.
 *
 * Per-source counts (pubmedCount, openalexCount, europepmcCount) are stored
 * from migration 012 onwards. For older results (pre-v031) these are null,
 * in which case the identification phase falls back to showing only the
 * blended primaryStudyCount.
 */
export function computePrimaryStudyPrismaData({
  primaryStudyCount,
  pubmedCount,
  openalexCount,
  europepmcCount,
  clinicalTrialsCount,
  prosperoCount,
  studyDesign,
  gapAnalysis,
  query,
}: {
  primaryStudyCount: number;
  pubmedCount: number | null;
  openalexCount: number | null;
  europepmcCount: number | null;
  clinicalTrialsCount: number | null;
  prosperoCount: number | null;
  studyDesign: StudyDesignRecommendation | null;
  gapAnalysis: GapAnalysis | null;
  query: string;
}): PrimaryStudyPrismaData {
  // Build per-source breakdown
  const perSourceCounts: { name: string; count: number }[] = [];
  if (pubmedCount !== null) perSourceCounts.push({ name: "PubMed", count: pubmedCount });
  if (openalexCount !== null) perSourceCounts.push({ name: "OpenAlex", count: openalexCount });
  if (europepmcCount !== null) perSourceCounts.push({ name: "Europe PMC", count: europepmcCount });

  const hasPerSourceData = perSourceCounts.length > 0;
  const totalFromDatabases = perSourceCounts.reduce((sum, s) => sum + s.count, 0);

  const otherCount = (clinicalTrialsCount ?? 0) + (prosperoCount ?? 0);
  const totalIdentified = hasPerSourceData
    ? totalFromDatabases + otherCount
    : primaryStudyCount; // fallback: we only know the blended unique count

  const afterDedup = primaryStudyCount;
  const rawDifference = hasPerSourceData ? totalIdentified - afterDedup : null;
  // Duplicates removed can't be negative (it would mean our dedup estimate is too low)
  const duplicatesRemoved = rawDifference !== null ? Math.max(0, rawDifference) : null;

  // Compute estimated screening funnel
  const { taRate, ftRate } = getScreeningRatios(afterDedup, studyDesign?.primary ?? null);
  const rawAfterTA = Math.max(2, Math.round(afterDedup * taRate));
  const rawIncluded = Math.max(1, Math.round(rawAfterTA * ftRate));
  // Enforce monotonically decreasing funnel
  const included = rawIncluded;
  const afterTitleAbstract = Math.max(included + 1, rawAfterTA);
  const excludedTitleAbstract = Math.max(0, afterDedup - afterTitleAbstract);
  const excludedFullText = Math.max(0, afterTitleAbstract - included);

  const criteria = studyDesign
    ? deriveCriteria(query, studyDesign.primary, gapAnalysis)
    : null;

  return {
    perSourceCounts,
    clinicalTrialsCount,
    prosperoCount,
    totalFromDatabases,
    totalIdentified,
    hasPerSourceData,
    afterDedup,
    duplicatesRemoved,
    afterTitleAbstract,
    excludedTitleAbstract,
    included,
    excludedFullText,
    criteria,
    studyDesignType: studyDesign?.primary ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helpers (shared)
// ---------------------------------------------------------------------------

/**
 * Format a count as a localized string for display in the diagram.
 * Returns "N/A" for null values.
 */
export function formatCount(n: number | null): string {
  if (n === null) return "N/A";
  return n.toLocaleString("en-US");
}

/**
 * Returns true if the PRISMA data has any content worth displaying.
 */
export function hasPrismaData(data: PrismaData): boolean {
  return typeof data.reviewsRetrieved === "number";
}
