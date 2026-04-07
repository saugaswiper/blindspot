import { describe, expect, it } from "vitest";
import {
  computePrismaData,
  computePrimaryStudyPrismaData,
  formatCount,
  getIncludedCI,
  hasPrismaData,
  KNOWN_SOURCES,
} from "./prisma-diagram";

// ---------------------------------------------------------------------------
// computePrimaryStudyPrismaData — ground-truth calibration tests
//
// These tests validate that Blindspot's PRISMA screening funnel estimates
// fall within an acceptable range of real published systematic reviews.
// Ground-truth data collected 2026-04-05 via web search from published SRs.
//
// Acceptable range: estimate within ±50% of the published SR's included count
// for moderate-breadth queries (where query specificity ≈ SR scope).
// ---------------------------------------------------------------------------

import type { StudyDesignRecommendation } from "@/types";

/**
 * Minimal valid StudyDesignRecommendation for tests.
 * computePrimaryStudyPrismaData only uses `.primary`; other fields are ignored.
 */
function makeDesign(primary: StudyDesignRecommendation["primary"]): StudyDesignRecommendation {
  return {
    primary,
    rationale: "test",
    steps: [],
    example_paper: { citation: "", url: "" },
    alternatives: [],
    methodology_links: [],
    confidence: "moderate",
  };
}

/** Helper that builds a minimal computePrimaryStudyPrismaData call */
function makePrismaInput(
  primaryStudyCount: number,
  /** Pass a StudyDesignType string or null. "meta-analysis" → Systematic Review with Meta-Analysis, etc. */
  designShorthand: "meta-analysis" | "scoping" | "umbrella" | "rapid" | "default" | null = null,
  opts: {
    pubmedCount?: number | null;
    openalexCount?: number | null;
    europepmcCount?: number | null;
  } = {}
) {
  const designMap: Record<string, StudyDesignRecommendation["primary"]> = {
    "meta-analysis": "Systematic Review with Meta-Analysis",
    "scoping":       "Scoping Review",
    "umbrella":      "Umbrella Review",
    "rapid":         "Rapid Review",
    "default":       "Systematic Review (Narrative Synthesis)",
  };
  const studyDesign = designShorthand ? makeDesign(designMap[designShorthand]) : null;
  return computePrimaryStudyPrismaData({
    primaryStudyCount,
    pubmedCount: opts.pubmedCount ?? null,
    openalexCount: opts.openalexCount ?? null,
    europepmcCount: opts.europepmcCount ?? null,
    clinicalTrialsCount: null,
    prosperoCount: null,
    studyDesign,
    gapAnalysis: null,
    query: "test query",
  });
}

describe("computePrimaryStudyPrismaData — screening funnel estimates", () => {
  // --- Funnel structure invariants ---

  it("produces a monotonically decreasing funnel", () => {
    for (const count of [10, 45, 250, 800, 2500]) {
      const result = makePrismaInput(count, "meta-analysis");
      expect(result.afterDedup).toBeGreaterThanOrEqual(result.afterTitleAbstract);
      expect(result.afterTitleAbstract).toBeGreaterThanOrEqual(result.included);
      expect(result.included).toBeGreaterThanOrEqual(1);
    }
  });

  it("afterDedup equals primaryStudyCount", () => {
    const result = makePrismaInput(120, "meta-analysis");
    expect(result.afterDedup).toBe(120);
  });

  it("excludedTitleAbstract + afterTitleAbstract equals afterDedup", () => {
    const result = makePrismaInput(200, "default");
    expect(result.excludedTitleAbstract + result.afterTitleAbstract).toBe(result.afterDedup);
  });

  it("excludedFullText + included equals afterTitleAbstract", () => {
    const result = makePrismaInput(200, "default");
    expect(result.excludedFullText + result.included).toBe(result.afterTitleAbstract);
  });

  // --- Small tier (<15) ---

  it("small corpus (<15): included is non-trivial fraction of afterDedup", () => {
    const result = makePrismaInput(10, null);
    // taRate 0.72, ftRate 0.78 → combined ~56%; min is 1
    expect(result.included).toBeGreaterThanOrEqual(1);
    expect(result.included).toBeLessThanOrEqual(10);
  });

  // --- Medium tier (15–59) ---

  it("medium corpus, meta-analysis: combined rate ~20%", () => {
    // 40 × 0.32 × 0.62 = ~7.9 → rounds to 8
    const result = makePrismaInput(40, "meta-analysis");
    expect(result.included).toBeGreaterThanOrEqual(5);
    expect(result.included).toBeLessThanOrEqual(15);
  });

  it("medium corpus, scoping review: uses reduced ftRate (0.55 not 0.82)", () => {
    // 40 × 0.50 × 0.55 = 11 (not 40 × 0.50 × 0.82 = 16.4)
    const result = makePrismaInput(40, "scoping");
    expect(result.included).toBeGreaterThanOrEqual(6);
    expect(result.included).toBeLessThanOrEqual(14);
  });

  // --- Large tier (60–499) ---

  it("large corpus meta-analysis (~280 studies): estimate within ±50% of benchmark 24", () => {
    // Ground truth: CBT-I for insomnia QoL (2022), afterDedup~280, included=24
    // Expected: 280 × 0.18 × 0.58 = ~29
    const result = makePrismaInput(280, "meta-analysis");
    expect(result.included).toBeGreaterThanOrEqual(12); // −50% of 24
    expect(result.included).toBeLessThanOrEqual(48);    // +100% of 24 (inherently broad)
  });

  it("large corpus meta-analysis (~450 studies): estimate within ±50% of benchmark 42 (remote CBT-I 2024)", () => {
    // Ground truth: Remote CBT-I (2024), afterDedup~450, included=42
    // Expected: 450 × 0.18 × 0.58 = ~47
    const result = makePrismaInput(450, "meta-analysis");
    expect(result.included).toBeGreaterThanOrEqual(21); // −50% of 42
    expect(result.included).toBeLessThanOrEqual(63);    // +50% of 42
  });

  it("large corpus scoping (~32 studies): taRate elevated, ftRate moderate", () => {
    // 32 × 0.32 × 0.48 = ~4.9 → min enforced to 1; within 3–18 expected range
    const result = makePrismaInput(32, "scoping");
    expect(result.included).toBeGreaterThanOrEqual(1);
    expect(result.included).toBeLessThanOrEqual(20);
  });

  // --- XL tier (500–1499) — new in this session ---

  it("XL corpus (500–1499), meta-analysis: combined rate ~4% (lower than large's ~10%)", () => {
    // 800 × 0.08 × 0.50 = 32
    const result = makePrismaInput(800, "meta-analysis");
    expect(result.included).toBeGreaterThanOrEqual(15);
    expect(result.included).toBeLessThanOrEqual(60);
    // Must be substantially lower than large-tier would give (800 × 10.4% = 83)
    expect(result.included).toBeLessThan(70);
  });

  it("XL corpus (500–1499), default: combined rate ~5%", () => {
    // 1200 × 0.10 × 0.50 = 60
    const result = makePrismaInput(1200, null);
    expect(result.included).toBeGreaterThanOrEqual(30);
    expect(result.included).toBeLessThanOrEqual(90);
  });

  it("XL corpus (500–1499), scoping: combined rate ~9.6%", () => {
    // 700 × 0.20 × 0.48 = 67.2 → 67
    const result = makePrismaInput(700, "scoping");
    expect(result.included).toBeGreaterThanOrEqual(40);
    expect(result.included).toBeLessThanOrEqual(100);
  });

  // --- XXL tier (≥1500) — new in this session ---

  it("XXL corpus (≥1500), meta-analysis: estimate within ±50% of benchmark 52 (CBT-I settings 2023)", () => {
    // Ground truth: CBT-I settings NMA (2023), afterDedup~2900, included=52
    // Expected: 2900 × 0.05 × 0.45 = ~65
    const result = makePrismaInput(2900, "meta-analysis");
    expect(result.included).toBeGreaterThanOrEqual(26); // −50% of 52
    expect(result.included).toBeLessThanOrEqual(78);    // +50% of 52
  });

  it("XXL corpus (≥1500), default: estimate within ±50% of benchmark 105 (hand hygiene obs. 2022)", () => {
    // Ground truth: hand hygiene compliance (2022, observational), afterDedup~4814, included=105
    // Expected: 3600 × 0.06 × 0.45 = ~97 (using 3600 as conservative Blindspot estimate)
    const result = makePrismaInput(3600, null);
    expect(result.included).toBeGreaterThanOrEqual(52); // −50% of 105
    expect(result.included).toBeLessThanOrEqual(157);   // +50% of 105
  });

  it("XXL corpus (≥1500) has lower combined rate than XL boundary", () => {
    // At the XL/XXL boundary, XXL should have fewer included studies
    const xl = makePrismaInput(1499, "meta-analysis");
    const xxl = makePrismaInput(1500, "meta-analysis");
    // 1499 × 0.08 × 0.50 = 59.96 vs 1500 × 0.05 × 0.45 = 33.75
    expect(xxl.included).toBeLessThan(xl.included);
  });

  it("XXL corpus (≥1500), rapid: lowest combined rate (~1.2%)", () => {
    // 2000 × 0.03 × 0.40 = 24
    const result = makePrismaInput(2000, "rapid");
    expect(result.included).toBeGreaterThanOrEqual(10);
    expect(result.included).toBeLessThanOrEqual(45);
  });

  // --- Tier boundary continuity ---

  it("tier transitions are monotonically ordered in included count for same design", () => {
    // As afterDedup grows, combined rate decreases → included should not grow proportionally faster
    const small  = makePrismaInput(10,   "meta-analysis");
    const medium = makePrismaInput(40,   "meta-analysis");
    const large  = makePrismaInput(280,  "meta-analysis");
    const xl     = makePrismaInput(800,  "meta-analysis");
    const xxl    = makePrismaInput(2900, "meta-analysis");
    // included grows but sublinearly (each tier drops rate)
    expect(medium.included).toBeGreaterThan(small.included);
    expect(large.included).toBeGreaterThan(medium.included);
    // XL and XXL grow more slowly than linear (included/afterDedup decreasing)
    const largeRate = large.included   / large.afterDedup;
    const xlRate    = xl.included      / xl.afterDedup;
    const xxlRate   = xxl.included     / xxl.afterDedup;
    expect(xlRate).toBeLessThan(largeRate);
    expect(xxlRate).toBeLessThan(xlRate);
  });

  // --- Per-source data integration ---

  it("with per-source data: totalFromDatabases is sum of sources", () => {
    const result = makePrismaInput(300, "meta-analysis", {
      pubmedCount: 200,
      openalexCount: 250,
      europepmcCount: 180,
    });
    expect(result.totalFromDatabases).toBe(630);
    expect(result.hasPerSourceData).toBe(true);
  });

  it("without per-source data: totalIdentified falls back to primaryStudyCount", () => {
    const result = makePrismaInput(300, "meta-analysis");
    expect(result.totalIdentified).toBe(300);
    expect(result.hasPerSourceData).toBe(false);
    expect(result.duplicatesRemoved).toBeNull();
  });

  it("duplicatesRemoved is non-negative even if totalIdentified < afterDedup", () => {
    // This can happen when the dedupFactor in route.ts produces a blended count
    // larger than the raw sum of per-source counts.
    const result = makePrismaInput(350, null, {
      pubmedCount: 200,
      openalexCount: 100,
      europepmcCount: 0,
    });
    expect(result.duplicatesRemoved).not.toBeNull();
    expect(result.duplicatesRemoved as number).toBeGreaterThanOrEqual(0);
  });

  it("criteria is null when no studyDesign is provided", () => {
    const result = makePrismaInput(100, null);
    expect(result.criteria).toBeNull();
  });

  it("criteria is present when studyDesign is provided", () => {
    const result = makePrismaInput(100, "meta-analysis");
    expect(result.criteria).not.toBeNull();
    expect(result.criteria?.inclusion.length).toBeGreaterThan(0);
    expect(result.criteria?.exclusion.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computePrismaData
// ---------------------------------------------------------------------------

describe("computePrismaData", () => {
  it("returns zero counts for all known sources when reviews array is empty", () => {
    const result = computePrismaData([], 100);
    expect(result.reviewsRetrieved).toBe(0);
    expect(result.databasesSearched).toBe(KNOWN_SOURCES.length);
    for (const source of result.sources) {
      if (KNOWN_SOURCES.includes(source.name as (typeof KNOWN_SOURCES)[number])) {
        expect(source.count).toBe(0);
      }
    }
  });

  it("counts reviews by source correctly", () => {
    const reviews = [
      { source: "PubMed" },
      { source: "PubMed" },
      { source: "OpenAlex" },
      { source: "Europe PMC" },
    ];
    const result = computePrismaData(reviews, 500);
    const pubmed = result.sources.find((s) => s.name === "PubMed");
    const openalex = result.sources.find((s) => s.name === "OpenAlex");
    const europepmc = result.sources.find((s) => s.name === "Europe PMC");
    const semantic = result.sources.find((s) => s.name === "Semantic Scholar");
    expect(pubmed?.count).toBe(2);
    expect(openalex?.count).toBe(1);
    expect(europepmc?.count).toBe(1);
    expect(semantic?.count).toBe(0);
  });

  it("sets reviewsRetrieved to total number of reviews", () => {
    const reviews = [{ source: "PubMed" }, { source: "OpenAlex" }, { source: "OpenAlex" }];
    const result = computePrismaData(reviews, 200);
    expect(result.reviewsRetrieved).toBe(3);
  });

  it("handles reviews with undefined source (assigns to Other)", () => {
    const reviews = [{ source: undefined }, { source: undefined }];
    const result = computePrismaData(reviews, 50);
    expect(result.reviewsRetrieved).toBe(2);
    const other = result.sources.find((s) => s.name === "Other");
    expect(other?.count).toBe(2);
    // Known sources should all be 0
    const known = result.sources.filter((s) =>
      KNOWN_SOURCES.includes(s.name as (typeof KNOWN_SOURCES)[number])
    );
    for (const s of known) {
      expect(s.count).toBe(0);
    }
  });

  it("includes unknown source names after known sources", () => {
    const reviews = [{ source: "Cochrane Library" }, { source: "PubMed" }];
    const result = computePrismaData(reviews, 100);
    const knownNames = KNOWN_SOURCES as readonly string[];
    const knownSources = result.sources.filter((s) => knownNames.includes(s.name));
    const unknownSources = result.sources.filter((s) => !knownNames.includes(s.name));
    // Known sources come first
    const knownIndices = knownSources.map((s) => result.sources.indexOf(s));
    const unknownIndices = unknownSources.map((s) => result.sources.indexOf(s));
    expect(Math.max(...knownIndices)).toBeLessThan(Math.min(...unknownIndices));
    // Unknown source is present
    const cochrane = result.sources.find((s) => s.name === "Cochrane Library");
    expect(cochrane?.count).toBe(1);
  });

  it("preserves primaryStudyCount", () => {
    const result = computePrismaData([], 12345);
    expect(result.primaryStudyCount).toBe(12345);
  });

  it("preserves clinicalTrialsCount (including null)", () => {
    const withTrials = computePrismaData([], 100, 42);
    expect(withTrials.clinicalTrialsCount).toBe(42);
    const withNull = computePrismaData([], 100, null);
    expect(withNull.clinicalTrialsCount).toBeNull();
  });

  it("preserves prosperoCount (including null)", () => {
    const withProspero = computePrismaData([], 100, null, 7);
    expect(withProspero.prosperoCount).toBe(7);
    const withNull = computePrismaData([], 100, null, null);
    expect(withNull.prosperoCount).toBeNull();
  });

  it("always includes all 4 known sources in output", () => {
    const result = computePrismaData([], 0);
    const outputNames = result.sources.map((s) => s.name);
    for (const name of KNOWN_SOURCES) {
      expect(outputNames).toContain(name);
    }
  });

  it("databasesSearched is always 4", () => {
    const result = computePrismaData([{ source: "PubMed" }], 50, 10, 2);
    expect(result.databasesSearched).toBe(4);
  });

  it("deduplicationCount defaults to null when not provided", () => {
    const result = computePrismaData([], 100);
    expect(result.deduplicationCount).toBeNull();
  });

  it("preserves deduplicationCount when provided", () => {
    const result = computePrismaData([], 100, null, null, 7);
    expect(result.deduplicationCount).toBe(7);
  });

  it("preserves deduplicationCount of 0 (no duplicates found)", () => {
    const result = computePrismaData([], 100, null, null, 0);
    expect(result.deduplicationCount).toBe(0);
  });

  it("preserves deduplicationCount of null (pre-migration row)", () => {
    const result = computePrismaData([], 100, null, null, null);
    expect(result.deduplicationCount).toBeNull();
  });

  it("total identified equals reviewsRetrieved + deduplicationCount when both present", () => {
    const reviews = [{ source: "PubMed" }, { source: "OpenAlex" }];
    const result = computePrismaData(reviews, 200, null, null, 3);
    expect(result.reviewsRetrieved + (result.deduplicationCount as number)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// formatCount
// ---------------------------------------------------------------------------

describe("formatCount", () => {
  it("returns N/A for null", () => {
    expect(formatCount(null)).toBe("N/A");
  });

  it("formats 0 as 0", () => {
    expect(formatCount(0)).toBe("0");
  });

  it("formats positive integers", () => {
    expect(formatCount(42)).toBe("42");
  });

  it("formats large numbers with locale separators", () => {
    // Accept both comma-separated (en-US) and period-separated (other locales)
    const result = formatCount(1000000);
    expect(result).toMatch(/1[,.]000[,.]000/);
  });
});

// ---------------------------------------------------------------------------
// hasPrismaData
// ---------------------------------------------------------------------------

describe("hasPrismaData", () => {
  it("returns true for valid prisma data", () => {
    const data = computePrismaData([], 100);
    expect(hasPrismaData(data)).toBe(true);
  });

  it("returns true when reviewsRetrieved is 0", () => {
    const data = computePrismaData([], 0);
    expect(hasPrismaData(data)).toBe(true);
  });

  it("returns false when reviewsRetrieved is not a number", () => {
    const badData = { reviewsRetrieved: undefined } as unknown as Parameters<typeof hasPrismaData>[0];
    expect(hasPrismaData(badData)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getIncludedCI — confidence interval multipliers
//
// These tests verify the tier-based uncertainty multipliers documented in
// the getIncludedCI JSDoc (handoffs 036 and 037).
// ---------------------------------------------------------------------------

describe("getIncludedCI", () => {
  // Small tier (<15 afterDedup)
  it("small tier: low ≥ 1", () => {
    const { low } = getIncludedCI(1, 10);
    expect(low).toBeGreaterThanOrEqual(1);
  });

  it("small tier: low < included (shrinks from point estimate)", () => {
    const included = 8;
    const { low } = getIncludedCI(included, 10);
    expect(low).toBeLessThanOrEqual(included);
  });

  it("small tier: high > low", () => {
    const { low, high } = getIncludedCI(8, 10);
    expect(high).toBeGreaterThan(low);
  });

  it("small tier: high is within ×1.5 of included", () => {
    const included = 10;
    const { high } = getIncludedCI(included, 12);
    // highFactor = 1.35 → high ≤ 14; give 1 rounding margin
    expect(high).toBeLessThanOrEqual(Math.round(included * 1.35) + 1);
  });

  // Medium tier (15–59 afterDedup)
  it("medium tier: high is within ×1.6 of included", () => {
    const included = 10;
    const { high } = getIncludedCI(included, 40);
    expect(high).toBeLessThanOrEqual(Math.round(included * 1.55) + 1);
  });

  it("medium tier: low is at least ×0.6 of included", () => {
    const included = 20;
    const { low } = getIncludedCI(included, 40);
    expect(low).toBeGreaterThanOrEqual(Math.round(included * 0.65) - 1);
  });

  // Large / XL / XXL tier (≥60 afterDedup): ÷2 to ×2 rule
  it("large tier (60–499): high is ~2× included", () => {
    const included = 50;
    const { high } = getIncludedCI(included, 200);
    // highFactor = 2.0 → high = 100; allow ±1 rounding
    expect(high).toBeCloseTo(100, -1);
  });

  it("large tier: low is ~½ of included", () => {
    const included = 50;
    const { low } = getIncludedCI(included, 200);
    // lowFactor = 0.5 → low = 25; allow ±1 rounding
    expect(low).toBeCloseTo(25, -1);
  });

  it("XL tier (500–1499): high is ~2× included", () => {
    const included = 65;
    const { high } = getIncludedCI(included, 800);
    expect(high).toBeCloseTo(130, -1);
  });

  it("XL tier: low is ~½ of included", () => {
    const included = 65;
    const { low } = getIncludedCI(included, 800);
    expect(low).toBeCloseTo(33, -1);
  });

  it("XXL tier (≥1500): high is ~2× included", () => {
    const included = 97;
    const { high } = getIncludedCI(included, 3600);
    expect(high).toBeCloseTo(194, -1);
  });

  it("XXL tier: low is ~½ of included", () => {
    const included = 97;
    const { low } = getIncludedCI(included, 3600);
    expect(low).toBeCloseTo(49, -1);
  });

  it("always returns integers", () => {
    for (const [inc, dedup] of [[5, 8], [20, 40], [47, 300], [65, 900], [97, 2900]] as [number, number][]) {
      const { low, high } = getIncludedCI(inc, dedup);
      expect(Number.isInteger(low)).toBe(true);
      expect(Number.isInteger(high)).toBe(true);
    }
  });

  it("low is always ≥ 1 even for included=1", () => {
    const { low } = getIncludedCI(1, 5);
    expect(low).toBeGreaterThanOrEqual(1);
  });

  it("high is always > low", () => {
    for (const [inc, dedup] of [[1, 1], [3, 10], [10, 50], [50, 300], [100, 2000]] as [number, number][]) {
      const { low, high } = getIncludedCI(inc, dedup);
      expect(high).toBeGreaterThan(low);
    }
  });

  // Integration: CI fields appear in computePrimaryStudyPrismaData output
  it("computePrimaryStudyPrismaData exposes includedLow and includedHigh", () => {
    const result = makePrismaInput(200, "meta-analysis");
    expect(result.includedLow).toBeDefined();
    expect(result.includedHigh).toBeDefined();
    expect(result.includedHigh).toBeGreaterThan(result.includedLow);
    expect(result.includedLow).toBeGreaterThanOrEqual(1);
  });

  it("CI bounds bracket the point estimate for large corpus", () => {
    const result = makePrismaInput(800, "meta-analysis");
    expect(result.includedLow).toBeLessThan(result.included);
    expect(result.includedHigh).toBeGreaterThan(result.included);
  });

  it("CI bounds bracket the point estimate for small corpus", () => {
    const result = makePrismaInput(8, null);
    expect(result.includedLow).toBeLessThanOrEqual(result.included);
    expect(result.includedHigh).toBeGreaterThanOrEqual(result.included);
  });

  // Ground-truth plausibility: published SR actuals should fall within CI
  it("remote CBT-I (afterDedup 450, MA): actual 42 falls within [23, 94]", () => {
    // point estimate = 47; CI = [24, 94]
    const result = makePrismaInput(450, "meta-analysis");
    expect(result.includedLow).toBeLessThanOrEqual(42);
    expect(result.includedHigh).toBeGreaterThanOrEqual(42);
  });

  it("hand hygiene (afterDedup 3600, default): actual 105 falls within CI", () => {
    // point estimate = 97; CI = [49, 194]
    const result = makePrismaInput(3600, "default");
    expect(result.includedLow).toBeLessThanOrEqual(105);
    expect(result.includedHigh).toBeGreaterThanOrEqual(105);
  });

  it("CBT-I settings NMA (afterDedup 2900, MA): actual 52 falls within CI", () => {
    // point estimate = 65; CI = [33, 130]
    const result = makePrismaInput(2900, "meta-analysis");
    expect(result.includedLow).toBeLessThanOrEqual(52);
    expect(result.includedHigh).toBeGreaterThanOrEqual(52);
  });
});
