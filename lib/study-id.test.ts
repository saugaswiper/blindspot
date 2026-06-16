import { describe, it, expect } from "vitest";
import { normalizeDoi, normalizePmid, dedupeStudyIds, StudyIdIndex } from "@/lib/study-id";

/**
 * Tests for the shared study-identifier primitives. These guarantee the
 * recall benchmark and the production search-route dedup share exactly one
 * definition of "same study".
 */

describe("normalizeDoi", () => {
  it("lowercases and trims", () => {
    expect(normalizeDoi("  10.1000/ABC  ")).toBe("10.1000/abc");
  });

  it("strips the doi.org URL prefix (http, https, dx)", () => {
    expect(normalizeDoi("https://doi.org/10.1/x")).toBe("10.1/x");
    expect(normalizeDoi("http://dx.doi.org/10.1/x")).toBe("10.1/x");
  });

  it("returns undefined for empty/missing input", () => {
    expect(normalizeDoi(undefined)).toBeUndefined();
    expect(normalizeDoi(null)).toBeUndefined();
    expect(normalizeDoi("")).toBeUndefined();
  });
});

describe("normalizePmid", () => {
  it("trims and drops empties", () => {
    expect(normalizePmid(" 123 ")).toBe("123");
    expect(normalizePmid("  ")).toBeUndefined();
    expect(normalizePmid(undefined)).toBeUndefined();
  });
});

describe("dedupeStudyIds", () => {
  it("dedupes by PMID across sources", () => {
    const r = dedupeStudyIds([[{ pmid: "1" }], [{ pmid: "1" }, { pmid: "2" }]]);
    expect(r.uniqueCount).toBe(2);
    expect(r.totalCount).toBe(3);
  });

  it("dedupes by normalized DOI regardless of prefix/case", () => {
    const r = dedupeStudyIds([
      [{ doi: "10.1/a" }],
      [{ doi: "https://doi.org/10.1/A" }],
    ]);
    expect(r.uniqueCount).toBe(1);
  });

  it("treats records with no shared identifier as distinct", () => {
    const r = dedupeStudyIds([[{ pmid: "1" }], [{ doi: "10.1/b" }]]);
    expect(r.uniqueCount).toBe(2);
  });

  it("returns dedupFraction = 1 for empty input (safe to multiply)", () => {
    expect(dedupeStudyIds([]).dedupFraction).toBe(1);
    expect(dedupeStudyIds([[]]).dedupFraction).toBe(1);
  });

  it("computes the uniqueness fraction", () => {
    const r = dedupeStudyIds([[{ pmid: "1" }, { pmid: "1" }, { pmid: "2" }, { pmid: "3" }]]);
    expect(r.uniqueCount).toBe(3);
    expect(r.totalCount).toBe(4);
    expect(r.dedupFraction).toBe(0.75);
  });
});

describe("StudyIdIndex", () => {
  it("matches by PMID or DOI", () => {
    const idx = new StudyIdIndex([{ pmid: "1" }, { doi: "https://doi.org/10.1/x" }]);
    expect(idx.has({ pmid: "1" })).toBe(true);
    expect(idx.has({ doi: "10.1/X" })).toBe(true);
    expect(idx.has({ pmid: "2" })).toBe(false);
    expect(idx.has({ doi: "10.1/y" })).toBe(false);
  });

  it("matches a record that shares only one of two identifiers", () => {
    const idx = new StudyIdIndex([{ pmid: "1" }]);
    // Same study, but the candidate also carries a DOI the index hasn't seen.
    expect(idx.has({ pmid: "1", doi: "10.1/new" })).toBe(true);
  });
});
