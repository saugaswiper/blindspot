import { describe, expect, it } from "vitest";
import {
  computePrismaData,
  formatCount,
  hasPrismaData,
  KNOWN_SOURCES,
} from "./prisma-diagram";

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
