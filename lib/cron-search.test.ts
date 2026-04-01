import { describe, it, expect } from "vitest";
import { normalizeDoi, mergeReviews } from "./cron-search";
import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeReview(overrides: Partial<ExistingReview> = {}): ExistingReview {
  return {
    title: "Default Title",
    year: 2024,
    journal: "Journal",
    abstract_snippet: "",
    source: "PubMed",
    doi: undefined,
    pmid: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeDoi
// ---------------------------------------------------------------------------

describe("normalizeDoi", () => {
  it("returns bare DOI unchanged", () => {
    expect(normalizeDoi("10.1234/test")).toBe("10.1234/test");
  });

  it("strips https://doi.org/ prefix", () => {
    expect(normalizeDoi("https://doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("strips http://doi.org/ prefix", () => {
    expect(normalizeDoi("http://doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("strips https://dx.doi.org/ prefix", () => {
    expect(normalizeDoi("https://dx.doi.org/10.1234/test")).toBe("10.1234/test");
  });

  it("lowercases the result", () => {
    expect(normalizeDoi("10.1234/TEST")).toBe("10.1234/test");
  });

  it("trims whitespace", () => {
    expect(normalizeDoi("  10.1234/test  ")).toBe("10.1234/test");
  });
});

// ---------------------------------------------------------------------------
// mergeReviews — basic cases
// ---------------------------------------------------------------------------

describe("mergeReviews — basic", () => {
  it("returns existing reviews when incoming is empty", () => {
    const existing = [makeReview({ title: "Old Review", doi: "10.1/old" })];
    expect(mergeReviews(existing, [])).toEqual(existing);
  });

  it("returns empty when both lists are empty", () => {
    expect(mergeReviews([], [])).toEqual([]);
  });

  it("appends entirely new reviews when existing is empty", () => {
    const incoming = [makeReview({ title: "New", doi: "10.1/new" })];
    expect(mergeReviews([], incoming)).toHaveLength(1);
  });

  it("appends new reviews not already in existing", () => {
    const existing = [makeReview({ title: "Old", doi: "10.1/old" })];
    const incoming = [makeReview({ title: "New", doi: "10.1/new" })];
    const result = mergeReviews(existing, incoming);
    expect(result).toHaveLength(2);
    expect(result[0].doi).toBe("10.1/old");
    expect(result[1].doi).toBe("10.1/new");
  });

  it("preserves order: existing reviews come first, new reviews appended", () => {
    const existing = [
      makeReview({ title: "A", doi: "10.1/a" }),
      makeReview({ title: "B", doi: "10.1/b" }),
    ];
    const incoming = [
      makeReview({ title: "C", doi: "10.1/c" }),
      makeReview({ title: "A", doi: "10.1/a" }), // duplicate
    ];
    const result = mergeReviews(existing, incoming);
    expect(result).toHaveLength(3);
    expect(result[0].title).toBe("A");
    expect(result[1].title).toBe("B");
    expect(result[2].title).toBe("C");
  });

  it("adds multiple new unique reviews at once", () => {
    const existing = [makeReview({ title: "Old", doi: "10.1/old" })];
    const incoming = [
      makeReview({ title: "New1", doi: "10.1/n1" }),
      makeReview({ title: "New2", doi: "10.1/n2" }),
      makeReview({ title: "New3", doi: "10.1/n3" }),
    ];
    expect(mergeReviews(existing, incoming)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// mergeReviews — DOI deduplication
// ---------------------------------------------------------------------------

describe("mergeReviews — DOI deduplication", () => {
  it("skips incoming review whose DOI matches an existing review", () => {
    const existing = [makeReview({ doi: "10.1/same" })];
    const incoming = [makeReview({ title: "Duplicate", doi: "10.1/same" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("normalises DOI URLs before comparing (https://doi.org/ prefix)", () => {
    const existing = [makeReview({ doi: "10.1234/test" })];
    const incoming = [makeReview({ doi: "https://doi.org/10.1234/test" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("normalises DOI case before comparing", () => {
    const existing = [makeReview({ doi: "10.1234/Test" })];
    const incoming = [makeReview({ doi: "10.1234/TEST" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("allows review whose DOI is different despite matching title", () => {
    const existing = [makeReview({ title: "Same Title", doi: "10.1/first" })];
    const incoming = [makeReview({ title: "Same Title", doi: "10.1/second" })];
    // DOI wins: different DOIs → not a duplicate
    expect(mergeReviews(existing, incoming)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// mergeReviews — PMID deduplication
// ---------------------------------------------------------------------------

describe("mergeReviews — PMID deduplication", () => {
  it("skips incoming review whose PMID matches an existing review", () => {
    const existing = [makeReview({ pmid: "12345678" })];
    const incoming = [makeReview({ title: "Duplicate", pmid: "12345678" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("trims whitespace from PMIDs before comparing", () => {
    const existing = [makeReview({ pmid: "12345678" })];
    const incoming = [makeReview({ pmid: " 12345678 " })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("adds review whose PMID is different", () => {
    const existing = [makeReview({ pmid: "11111111" })];
    const incoming = [makeReview({ pmid: "22222222" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// mergeReviews — title-only deduplication (no DOI / PMID)
// ---------------------------------------------------------------------------

describe("mergeReviews — title deduplication (no identifiers)", () => {
  it("skips incoming review with identical title when no DOI or PMID", () => {
    const existing = [makeReview({ title: "A Review" })];
    const incoming = [makeReview({ title: "A Review" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("deduplicates title case-insensitively", () => {
    const existing = [makeReview({ title: "a review" })];
    const incoming = [makeReview({ title: "A REVIEW" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("deduplicates title with leading/trailing whitespace", () => {
    const existing = [makeReview({ title: "  A Review  " })];
    const incoming = [makeReview({ title: "A Review" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(1);
  });

  it("adds review with different title and no identifiers", () => {
    const existing = [makeReview({ title: "Review A" })];
    const incoming = [makeReview({ title: "Review B" })];
    expect(mergeReviews(existing, incoming)).toHaveLength(2);
  });

  it("does NOT deduplicate by title when the incoming review has a DOI (DOI takes precedence)", () => {
    // Same title but incoming has a DOI that's unique → should be added
    const existing = [makeReview({ title: "A Review" })];
    const incoming = [makeReview({ title: "A Review", doi: "10.1/new" })];
    // Different DOI (existing has no DOI) → not a duplicate by DOI
    // Has DOI → title fallback is not used
    expect(mergeReviews(existing, incoming)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// mergeReviews — mixed deduplication scenarios
// ---------------------------------------------------------------------------

describe("mergeReviews — mixed deduplication", () => {
  it("handles a list where some incoming are new and some are duplicates", () => {
    const existing: ExistingReview[] = [
      makeReview({ doi: "10.1/a" }),
      makeReview({ pmid: "99999" }),
      makeReview({ title: "Titleonly review" }),
    ];
    const incoming: ExistingReview[] = [
      makeReview({ doi: "10.1/a" }),           // duplicate by DOI
      makeReview({ pmid: "99999" }),            // duplicate by PMID
      makeReview({ title: "Titleonly review" }), // duplicate by title
      makeReview({ doi: "10.1/brand-new" }),    // NEW
    ];
    const result = mergeReviews(existing, incoming);
    expect(result).toHaveLength(4);
    expect(result[3].doi).toBe("10.1/brand-new");
  });

  it("does not add within-incoming duplicates twice", () => {
    const incoming: ExistingReview[] = [
      makeReview({ doi: "10.1/same" }),
      makeReview({ doi: "10.1/same" }), // same DOI, should appear only once
    ];
    expect(mergeReviews([], incoming)).toHaveLength(1);
  });
});
