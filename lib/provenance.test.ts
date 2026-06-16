import { describe, it, expect } from "vitest";
import { dedupeReviewsWithProvenance, type NamedSource } from "@/lib/provenance";
import type { ExistingReview } from "@/types";

/**
 * Tests for provenance-aware deduplication. These assert two things:
 *   1. dedup behaviour matches the original route dedup (title/DOI/PMID, merge order),
 *   2. each unique record carries every source that found it.
 */

function review(overrides: Partial<ExistingReview> = {}): ExistingReview {
  return {
    title: "Effects of X on Y",
    year: 2022,
    journal: "J",
    abstract_snippet: "",
    ...overrides,
  };
}

function src(name: string, reviews: ExistingReview[]): NamedSource {
  return { name, reviews };
}

describe("dedupeReviewsWithProvenance", () => {
  it("keeps distinct records and attributes each to its single source", () => {
    const result = dedupeReviewsWithProvenance([
      src("PubMed", [review({ title: "A", pmid: "1" })]),
      src("Scopus", [review({ title: "B", doi: "10.1/b" })]),
    ]);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews[0].sources).toEqual(["PubMed"]);
    expect(result.reviews[1].sources).toEqual(["Scopus"]);
    expect(result.deduplicationCount).toBe(0);
  });

  it("merges a cross-source duplicate (by PMID) and lists both sources", () => {
    const result = dedupeReviewsWithProvenance([
      src("PubMed", [review({ title: "A", pmid: "1" })]),
      src("Europe PMC", [review({ title: "A different title", pmid: "1" })]),
    ]);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].sources).toEqual(["PubMed", "Europe PMC"]);
    expect(result.totalIdentified).toBe(2);
    expect(result.deduplicationCount).toBe(1);
  });

  it("matches duplicates by normalized DOI (URL/case-insensitive)", () => {
    const result = dedupeReviewsWithProvenance([
      src("OpenAlex", [review({ title: "T1", doi: "https://doi.org/10.1/X" })]),
      src("Scopus", [review({ title: "T2", doi: "10.1/x" })]),
    ]);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].sources).toEqual(["OpenAlex", "Scopus"]);
  });

  it("matches duplicates by normalized title", () => {
    const result = dedupeReviewsWithProvenance([
      src("PubMed", [review({ title: "  Effects of X  ", pmid: "1" })]),
      src("Scopus", [review({ title: "effects of x", pmid: "2" })]),
    ]);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].sources).toEqual(["PubMed", "Scopus"]);
  });

  it("keeps the first source as the canonical record (merge order)", () => {
    const result = dedupeReviewsWithProvenance([
      src("PubMed", [review({ title: "A", pmid: "1", journal: "PM Journal" })]),
      src("Scopus", [review({ title: "A", pmid: "1", journal: "Scopus Journal" })]),
    ]);
    expect(result.reviews[0].journal).toBe("PM Journal");
    expect(result.reviews[0].sources).toEqual(["PubMed", "Scopus"]);
  });

  it("does not list the same source twice when it returns a record twice", () => {
    const result = dedupeReviewsWithProvenance([
      src("PubMed", [review({ title: "A", pmid: "1" }), review({ title: "A", pmid: "1" })]),
    ]);
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0].sources).toEqual(["PubMed"]);
    expect(result.deduplicationCount).toBe(1);
  });

  it("attributes a record matching by DOI before PMID (lookup order: title→DOI→PMID)", () => {
    // PubMed has only PMID; OpenAlex has only DOI; Europe PMC carries both.
    // DOI is checked before PMID, so Europe PMC merges into the OpenAlex record.
    // This preserves the legacy dedup's title→DOI→PMID precedence.
    const result = dedupeReviewsWithProvenance([
      src("PubMed", [review({ title: "Unique-a", pmid: "1" })]),
      src("OpenAlex", [review({ title: "Unique-b", doi: "10.1/x" })]),
      src("Europe PMC", [review({ title: "Unique-c", pmid: "1", doi: "10.1/x" })]),
    ]);
    expect(result.reviews).toHaveLength(2);
    expect(result.deduplicationCount).toBe(1);
    const withEpmc = result.reviews.find((r) => r.sources?.includes("Europe PMC"));
    expect(withEpmc?.sources).toEqual(["OpenAlex", "Europe PMC"]);
    const pubmed = result.reviews.find((r) => r.title === "Unique-a");
    expect(pubmed?.sources).toEqual(["PubMed"]);
  });

  it("handles empty sources", () => {
    const result = dedupeReviewsWithProvenance([src("PubMed", []), src("Scopus", [])]);
    expect(result.reviews).toEqual([]);
    expect(result.totalIdentified).toBe(0);
    expect(result.deduplicationCount).toBe(0);
  });
});
