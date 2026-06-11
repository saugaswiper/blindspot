import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExistingReview } from "@/types";

/**
 * Unit tests for fetchAllPrimaryStudiesForScreening — the multi-source fetch
 * with cross-source deduplication that feeds the screening pipeline.
 *
 * The three literature sources are mocked; tests verify dedup precedence
 * (PMID first, then normalized DOI), source priority (PubMed → OpenAlex →
 * Scopus), the maxTotal cap, and graceful degradation when a source fails.
 */

const pubmedFetch = vi.fn();
const openalexFetch = vi.fn();
const scopusFetch = vi.fn();

vi.mock("@/lib/pubmed", () => ({
  fetchPrimaryStudiesForScreening: (...args: unknown[]) => pubmedFetch(...args),
}));
vi.mock("@/lib/openalex", () => ({
  fetchPrimaryStudiesForScreening: (...args: unknown[]) => openalexFetch(...args),
}));
vi.mock("@/lib/scopus", () => ({
  fetchPrimaryStudiesForScreening: (...args: unknown[]) => scopusFetch(...args),
}));

import { fetchAllPrimaryStudiesForScreening } from "@/lib/screening";

function record(overrides: Partial<ExistingReview> = {}): ExistingReview {
  return {
    title: "Some primary study",
    year: 2023,
    journal: "Journal of Testing",
    abstract_snippet: "Background: …",
    ...overrides,
  };
}

beforeEach(() => {
  pubmedFetch.mockReset().mockResolvedValue([]);
  openalexFetch.mockReset().mockResolvedValue([]);
  scopusFetch.mockReset().mockResolvedValue([]);
});

describe("fetchAllPrimaryStudiesForScreening", () => {
  it("merges records from all three sources", async () => {
    pubmedFetch.mockResolvedValue([record({ title: "P1", pmid: "1" })]);
    openalexFetch.mockResolvedValue([record({ title: "O1", doi: "10.1/o1" })]);
    scopusFetch.mockResolvedValue([record({ title: "S1", doi: "10.1/s1" })]);

    const result = await fetchAllPrimaryStudiesForScreening("cbt insomnia");
    expect(result.map((r) => r.title).sort()).toEqual(["O1", "P1", "S1"]);
  });

  it("dedupes by PMID across sources, keeping the PubMed copy", async () => {
    pubmedFetch.mockResolvedValue([record({ title: "PubMed copy", pmid: "42" })]);
    openalexFetch.mockResolvedValue([record({ title: "OpenAlex copy", pmid: "42" })]);

    const result = await fetchAllPrimaryStudiesForScreening("q");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("PubMed copy");
  });

  it("dedupes by DOI case-insensitively and ignoring the doi.org prefix", async () => {
    pubmedFetch.mockResolvedValue([record({ title: "First", doi: "10.1000/ABC" })]);
    scopusFetch.mockResolvedValue([record({ title: "Dup", doi: "https://doi.org/10.1000/abc" })]);

    const result = await fetchAllPrimaryStudiesForScreening("q");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("keeps records that share no identifiers, even with similar titles", async () => {
    pubmedFetch.mockResolvedValue([record({ title: "No IDs at all" })]);
    openalexFetch.mockResolvedValue([record({ title: "No IDs at all" })]);

    // Without PMID/DOI there is nothing safe to dedup on — both are kept.
    const result = await fetchAllPrimaryStudiesForScreening("q");
    expect(result).toHaveLength(2);
  });

  it("caps the combined list at maxTotal", async () => {
    pubmedFetch.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => record({ title: `P${i}`, pmid: String(i) }))
    );
    openalexFetch.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => record({ title: `O${i}`, doi: `10.1/o${i}` }))
    );

    const result = await fetchAllPrimaryStudiesForScreening("q", 5, 7);
    expect(result).toHaveLength(7);
    // PubMed records take priority in insertion order
    expect(result.slice(0, 5).every((r) => r.title.startsWith("P"))).toBe(true);
  });

  it("passes limitPerSource to every source", async () => {
    await fetchAllPrimaryStudiesForScreening("q", 123, 400);
    expect(pubmedFetch).toHaveBeenCalledWith("q", 123);
    expect(openalexFetch).toHaveBeenCalledWith("q", 123);
    expect(scopusFetch).toHaveBeenCalledWith("q", 123);
  });

  it("degrades gracefully when one source rejects", async () => {
    pubmedFetch.mockRejectedValue(new Error("PubMed down"));
    openalexFetch.mockResolvedValue([record({ title: "O1", doi: "10.1/o1" })]);
    scopusFetch.mockResolvedValue([record({ title: "S1", doi: "10.1/s1" })]);

    const result = await fetchAllPrimaryStudiesForScreening("q");
    expect(result.map((r) => r.title).sort()).toEqual(["O1", "S1"]);
  });

  it("returns an empty list when every source fails", async () => {
    pubmedFetch.mockRejectedValue(new Error("down"));
    openalexFetch.mockRejectedValue(new Error("down"));
    scopusFetch.mockRejectedValue(new Error("down"));

    const result = await fetchAllPrimaryStudiesForScreening("q");
    expect(result).toEqual([]);
  });
});
