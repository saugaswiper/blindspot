import { describe, it, expect } from "vitest";
import {
  approxEqual,
  tCritical975,
  ciDivisor,
  seFromCi,
  sdFromSe,
  seFromSd,
  checkCiOrder,
  checkMeanInCi,
  checkSeAgainstCi,
  checkSdAgainstSe,
  checkProportion,
  checkSampleSize,
  runConsistencyChecks,
  checkInstrumentRange,
  lookupInstrumentRange,
  normalizeInstrument,
} from "@/lib/extraction-checks";

/**
 * Tests for the deterministic half of the Brief 009 extraction gate: the
 * Cochrane Ch 6 consistency relations and the instrument range check. These
 * guarantee a value is only called "consistent" when the reported statistics
 * actually agree, and that a physically impossible value is caught.
 */

describe("approxEqual", () => {
  it("agrees within the default 5% relative tolerance", () => {
    expect(approxEqual(100, 104)).toBe(true);
    expect(approxEqual(100, 106)).toBe(false);
  });

  it("uses the absolute floor near zero", () => {
    expect(approxEqual(0, 0)).toBe(true);
    expect(approxEqual(0, 1e-9)).toBe(true);
  });

  it("rejects non-finite inputs", () => {
    expect(approxEqual(NaN, 1)).toBe(false);
    expect(approxEqual(1, Infinity)).toBe(false);
  });
});

describe("tCritical975 / ciDivisor", () => {
  it("matches published t-table values", () => {
    expect(tCritical975(1)).toBeCloseTo(12.706, 3);
    expect(tCritical975(9)).toBeCloseTo(2.262, 3);
    expect(tCritical975(29)).toBeCloseTo(2.045, 3);
  });

  it("selects the nearest-lower df for unlisted df (conservative)", () => {
    // df 35 is unlisted → falls back to df 30's value
    expect(tCritical975(35)).toBeCloseTo(2.042, 3);
  });

  it("plateaus at the 100-df row for large df, normal value for invalid df", () => {
    expect(tCritical975(500)).toBeCloseTo(1.984, 3);
    expect(tCritical975(0)).toBeCloseTo(1.96, 3);
    expect(tCritical975(-5)).toBeCloseTo(1.96, 3);
  });

  it("divisor is 3.92 for large or unknown n, t-based for small n", () => {
    expect(ciDivisor(undefined)).toBeCloseTo(3.92, 5);
    expect(ciDivisor(60)).toBeCloseTo(3.92, 5);
    expect(ciDivisor(200)).toBeCloseTo(3.92, 5);
    // n = 10 → df 9 → 2 × 2.262
    expect(ciDivisor(10)).toBeCloseTo(4.524, 3);
  });
});

describe("Cochrane Ch 6 worked examples (AC2)", () => {
  it("SE from a 95% CI (large sample, divisor 3.92)", () => {
    // CI [0.60, 1.00] → width 0.40 → SE = 0.40/3.92 ≈ 0.10204
    expect(seFromCi(0.6, 1.0, 200)).toBeCloseTo(0.10204, 4);
  });

  it("SE from a 95% CI uses the t divisor for n < 60", () => {
    // n = 10 → divisor 4.524 → 0.40/4.524 ≈ 0.08842
    expect(seFromCi(0.6, 1.0, 10)).toBeCloseTo(0.08842, 4);
  });

  it("SD from SE·√n", () => {
    // SE 0.5, n 25 → SD 2.5
    expect(sdFromSe(0.5, 25)).toBeCloseTo(2.5, 6);
  });

  it("SE from SD/√n (inverse)", () => {
    expect(seFromSd(2.5, 25)).toBeCloseTo(0.5, 6);
  });
});

describe("checkCiOrder", () => {
  it("passes ordered bounds and does not run without both", () => {
    expect(checkCiOrder({ ciLow: 1, ciHigh: 2 }).ok).toBe(true);
    expect(checkCiOrder({ ciLow: 1 }).ran).toBe(false);
  });

  it("fails reversed bounds with ci_order", () => {
    const r = checkCiOrder({ ciLow: 2, ciHigh: 1 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ci_order");
  });
});

describe("checkMeanInCi", () => {
  it("passes a mean inside its CI", () => {
    expect(checkMeanInCi({ mean: 1.5, ciLow: 1, ciHigh: 2 }).ok).toBe(true);
  });

  it("fails a mean outside its CI with mean_outside_ci", () => {
    const r = checkMeanInCi({ mean: 3, ciLow: 1, ciHigh: 2 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("mean_outside_ci");
  });
});

describe("checkSeAgainstCi", () => {
  it("passes a consistent SE/CI pair", () => {
    // CI width 0.40, large n → SE ≈ 0.102
    const r = checkSeAgainstCi({ se: 0.102, ciLow: 0.6, ciHigh: 1.0, n: 200 });
    expect(r.ran).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("fails an inconsistent SE with inconsistent_se_ci (AC2 consistency case)", () => {
    const r = checkSeAgainstCi({ se: 0.5, ciLow: 0.6, ciHigh: 1.0, n: 200 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("inconsistent_se_ci");
    expect(r.computed).toBeCloseTo(0.10204, 4);
  });
});

describe("checkSdAgainstSe", () => {
  it("passes SD = SE·√n", () => {
    expect(checkSdAgainstSe({ sd: 2.5, se: 0.5, n: 25 }).ok).toBe(true);
  });

  it("fails an inconsistent SD with inconsistent_sd_se", () => {
    const r = checkSdAgainstSe({ sd: 9, se: 0.5, n: 25 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("inconsistent_sd_se");
  });
});

describe("checkProportion", () => {
  it("passes events/total = proportion", () => {
    expect(checkProportion({ proportion: 0.25, events: 25, total: 100 }).ok).toBe(true);
  });

  it("fails a mismatched proportion", () => {
    const r = checkProportion({ proportion: 0.9, events: 25, total: 100 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("inconsistent_proportion");
  });

  it("fails a zero total", () => {
    expect(checkProportion({ proportion: 0.5, events: 1, total: 0 }).ok).toBe(false);
  });
});

describe("checkSampleSize", () => {
  it("passes when analysed n ≤ randomised", () => {
    expect(checkSampleSize({ n: 48, randomised: 50 }).ok).toBe(true);
  });

  it("fails when n exceeds randomised", () => {
    const r = checkSampleSize({ n: 55, randomised: 50 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("n_exceeds_randomised");
  });
});

describe("runConsistencyChecks", () => {
  it("reports consistent when every runnable relation holds", () => {
    const rep = runConsistencyChecks({
      mean: 0.8,
      se: 0.102,
      ciLow: 0.6,
      ciHigh: 1.0,
      n: 200,
      randomised: 220,
    });
    expect(rep.consistent).toBe(true);
    expect(rep.failures).toHaveLength(0);
    expect(rep.ran.length).toBeGreaterThan(0);
  });

  it("omits relations that cannot run (absence is not failure)", () => {
    const rep = runConsistencyChecks({ mean: 1 });
    expect(rep.ran).toHaveLength(0);
    expect(rep.consistent).toBe(true);
  });

  it("collects multiple discrepancies", () => {
    const rep = runConsistencyChecks({
      mean: 5,
      ciLow: 1,
      ciHigh: 2,
      se: 0.5,
      n: 200,
    });
    expect(rep.consistent).toBe(false);
    const codes = rep.failures.map((f) => f.code);
    expect(codes).toContain("mean_outside_ci");
    expect(codes).toContain("inconsistent_se_ci");
  });
});

describe("instrument range check (check 4)", () => {
  it("normalises and resolves known instruments", () => {
    expect(normalizeInstrument("HAM-D (17-item)")).toBe("ham-d-17-item");
    expect(lookupInstrumentRange("MADRS")?.max).toBe(60);
    expect(lookupInstrumentRange("madrs")?.max).toBe(60);
  });

  it("passes an in-range MADRS score", () => {
    expect(checkInstrumentRange(34, "MADRS").ok).toBe(true);
  });

  it("fails an impossible MADRS score with out_of_range (range-violation case)", () => {
    const r = checkInstrumentRange(75, "MADRS");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("out_of_range");
  });

  it("does not run for an unknown instrument", () => {
    expect(checkInstrumentRange(999, "SomeUnknownScale").ran).toBe(false);
  });

  it("accepts an explicit range object", () => {
    expect(checkInstrumentRange(5, { name: "custom", min: 0, max: 10 }).ok).toBe(true);
    expect(checkInstrumentRange(11, { name: "custom", min: 0, max: 10 }).ok).toBe(false);
  });
});
