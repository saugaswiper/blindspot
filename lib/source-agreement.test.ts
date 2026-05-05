/**
 * ACC-15 — Cross-Source Confidence Score unit tests.
 *
 * Covers the three pure helpers:
 *   computeCv          — coefficient of variation calculation
 *   classifyCv         — threshold-based level classification
 *   computeSourceAgreement — full pipeline from per-source counts to UI summary
 */

import { describe, it, expect } from "vitest";
import {
  computeCv,
  classifyCv,
  computeSourceAgreement,
  AGREE_THRESHOLD,
  DISAGREE_THRESHOLD,
} from "./source-agreement";

// ---------------------------------------------------------------------------
// computeCv
// ---------------------------------------------------------------------------

describe("computeCv", () => {
  it("returns NaN when fewer than 2 counts are supplied", () => {
    expect(computeCv([])).toBeNaN();
    expect(computeCv([42])).toBeNaN();
  });

  it("returns NaN when the mean is zero", () => {
    expect(computeCv([0, 0, 0])).toBeNaN();
  });

  it("returns 0 when all counts are equal (perfect agreement)", () => {
    expect(computeCv([100, 100, 100, 100])).toBe(0);
  });

  it("computes a small CV for closely-clustered counts", () => {
    // {95, 100, 105}: mean=100, pop std=√(50/3)≈4.08, CV≈0.041
    const cv = computeCv([95, 100, 105]);
    expect(cv).toBeCloseTo(0.0408, 3);
  });

  it("computes a large CV for highly disparate counts", () => {
    // {5, 500}: mean=252.5, pop std=247.5, CV=0.9802
    const cv = computeCv([5, 500]);
    expect(cv).toBeCloseTo(0.9802, 3);
  });

  it("ignores non-finite entries (NaN / Infinity)", () => {
    // Should compute as if NaN/Infinity weren't there
    const cv = computeCv([100, 100, Number.NaN, Number.POSITIVE_INFINITY]);
    // Effectively [100, 100] → CV = 0
    expect(cv).toBe(0);
  });

  it("uses population std dev (divides by n, not n-1)", () => {
    // {0, 100}: pop variance = ((0-50)^2 + (100-50)^2)/2 = 2500
    // pop std = 50, mean = 50, CV = 1.0
    expect(computeCv([0, 100])).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// classifyCv
// ---------------------------------------------------------------------------

describe("classifyCv", () => {
  it("classifies CV strictly less than the agree threshold as 'agree'", () => {
    expect(classifyCv(0)).toBe("agree");
    expect(classifyCv(0.1)).toBe("agree");
    expect(classifyCv(AGREE_THRESHOLD - 0.001)).toBe("agree");
  });

  it("classifies CV at the agree threshold boundary as 'vary'", () => {
    expect(classifyCv(AGREE_THRESHOLD)).toBe("vary");
  });

  it("classifies mid-range CV as 'vary'", () => {
    expect(classifyCv(0.5)).toBe("vary");
    expect(classifyCv(DISAGREE_THRESHOLD - 0.001)).toBe("vary");
  });

  it("classifies CV at the disagree threshold boundary as 'disagree'", () => {
    expect(classifyCv(DISAGREE_THRESHOLD)).toBe("disagree");
  });

  it("classifies large CV as 'disagree'", () => {
    expect(classifyCv(1.5)).toBe("disagree");
    expect(classifyCv(5)).toBe("disagree");
  });

  it("treats NaN as inconclusive ('vary')", () => {
    expect(classifyCv(Number.NaN)).toBe("vary");
  });
});

// ---------------------------------------------------------------------------
// computeSourceAgreement
// ---------------------------------------------------------------------------

describe("computeSourceAgreement", () => {
  it("returns null when only one source contributes", () => {
    expect(
      computeSourceAgreement({ pubmed: 100, openalex: null, europepmc: null, scopus: null }),
    ).toBeNull();
  });

  it("returns null when no sources contribute", () => {
    expect(
      computeSourceAgreement({ pubmed: null, openalex: null, europepmc: null, scopus: null }),
    ).toBeNull();
  });

  it("treats a 0 count as a valid contributing source", () => {
    // 0 means "this database returned no results", which is meaningful data
    const result = computeSourceAgreement({
      pubmed: 0,
      openalex: 100,
      europepmc: null,
      scopus: null,
    });
    expect(result).not.toBeNull();
    expect(result?.sourcesContributing).toBe(2);
  });

  it("classifies tightly clustered sources as 'agree'", () => {
    const result = computeSourceAgreement({
      pubmed: 95,
      openalex: 100,
      europepmc: 105,
      scopus: 102,
    });
    expect(result?.level).toBe("agree");
    expect(result?.label).toBe("Sources agree");
    expect(result?.sourcesContributing).toBe(4);
  });

  it("classifies moderately spread sources as 'vary'", () => {
    // CV around 0.5
    const result = computeSourceAgreement({
      pubmed: 50,
      openalex: 100,
      europepmc: 150,
      scopus: null,
    });
    expect(result?.level).toBe("vary");
    expect(result?.label).toBe("Sources vary");
    expect(result?.sourcesContributing).toBe(3);
  });

  it("classifies wildly different sources as 'disagree'", () => {
    const result = computeSourceAgreement({
      pubmed: 5,
      openalex: 5000,
      europepmc: 50,
      scopus: null,
    });
    expect(result?.level).toBe("disagree");
    expect(result?.label).toBe("Sources disagree");
  });

  it("ignores undefined sources (legacy callers without that field)", () => {
    const result = computeSourceAgreement({
      pubmed: 100,
      openalex: 100,
      // europepmc and scopus omitted entirely
    });
    expect(result?.sourcesContributing).toBe(2);
    expect(result?.level).toBe("agree");
  });

  it("includes a human-readable tooltip with the source count and CV", () => {
    const result = computeSourceAgreement({
      pubmed: 100,
      openalex: 100,
      europepmc: 100,
      scopus: 100,
    });
    expect(result?.tooltip).toContain("4 databases");
    expect(result?.tooltip).toMatch(/CV = \d+\.\d{2}/);
  });
});
