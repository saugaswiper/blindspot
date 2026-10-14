/**
 * Validation 010 harness — source-presence gate (handoff 110, brief 009 slice 2a)
 *
 * External ground truth for this gate:
 *   - AMA Manual of Style (11th ed.) §18.5: journal number formatting conventions
 *   - Merriam-Webster & AP Stylebook: English number-spelling conventions
 *   - ASCII range-dash limitation documented in handoff 110 "Known limitation"
 *   - Published ketamine/TRD trial statistics (truth set, Field Report §2)
 *
 * Covers:
 *   E1  Number tokenizer — edge cases beyond unit suite
 *   E2  ASCII-hyphen-as-range-separator limitation (documented; verify empirically)
 *   E3  spelledOutForms — completeness for 0-999 English
 *   E4  AC5 sub-validation — gate on representative published trial text snippets
 */

import { describe, it, expect } from "vitest";
import {
  checkSourcePresence,
  spelledOutForms,
  type SourcePage,
} from "@/lib/extraction-source";

const pg = (page: number, text: string): SourcePage => ({ page, text });

// ── E1: Number tokenizer edge cases ──────────────────────────────────────────

describe("E1 — number tokenizer edge cases", () => {
  it("finds zero in text", () => {
    // 0 is a valid instrument score (baseline, floor)
    const r = checkSourcePresence(0, [pg(1, "The score was 0 at discharge.")], 1);
    expect(r.ok).toBe(true);
    expect(r.foundOnPages).toEqual([1]);
  });

  it("does not match 0 inside '10' or '100'", () => {
    // 0 must not spuriously match inside larger numbers; however, the regex
    // will match the standalone token "0" — this test verifies it doesn't
    // find 0 when only 10 and 100 appear in text without a standalone 0.
    const r = checkSourcePresence(0, [pg(1, "n=10 at week 100")], 1);
    // "10" tokenizes as 10; "100" tokenizes as 100; no standalone "0" → not_in_source
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
  });

  it("finds a p-value in standard journal notation (e.g. 0.042)", () => {
    const r = checkSourcePresence(
      0.042,
      [pg(5, "Statistical significance: p = 0.042 (two-tailed).")],
      5,
    );
    expect(r.ok).toBe(true);
  });

  it("finds a negative baseline change (Unicode minus)", () => {
    // Unicode minus U+2212 used in journal text
    const r = checkSourcePresence(
      -14.3,
      [pg(3, "Mean change: −14.3 points (SD 8.2)")],
      3,
    );
    expect(r.ok).toBe(true);
  });

  it("finds a large comma-grouped enrollment count", () => {
    const r = checkSourcePresence(
      12345,
      [pg(1, "A total of 12,345 records were identified.")],
      1,
    );
    expect(r.ok).toBe(true);
  });

  it("distinguishes 1234 from 12340 (embedded number check)", () => {
    const r = checkSourcePresence(1234, [pg(1, "n = 12340 screened")], 1);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
  });

  it("finds a value expressed with middle-dot decimal on any page when citedPage omitted", () => {
    const r = checkSourcePresence(3.92, [pg(2, "odds ratio 3·92 (95% CI)")]);
    expect(r.ok).toBe(true);
  });

  it("finds value written with trailing percent when citedPage supplied", () => {
    const r = checkSourcePresence(
      68,
      [pg(4, "Response rate: 68% at week 1 post-infusion.")],
      4,
    );
    expect(r.ok).toBe(true);
  });
});

// ── E2: ASCII-hyphen-as-range-dash limitation (documented in handoff 110) ────

describe("E2 — ASCII-hyphen range-separator limitation (documented)", () => {
  it("limitation FIXED (handoff 117): 4 is now FOUND in '2-4' (hyphen after a digit is a separator)", () => {
    const r = checkSourcePresence(4, [pg(1, "Scores ranged from 2-4 on the CGI.")], 1);
    expect(r.ok).toBe(true);
  });

  it("en-dash range works correctly: 4 FOUND in '2–4' (en-dash)", () => {
    // En-dash (U+2013) is NOT replaced; the regex sees "2" then "–" (non-digit)
    // then "4", so both 2 and 4 are tokenized correctly.
    const r = checkSourcePresence(4, [pg(1, "Scores ranged from 2–4 on the CGI.")], 1);
    expect(r.ok).toBe(true);
    expect(r.foundOnPages).toEqual([1]);
  });

  it("em-dash range also works: 7 FOUND in '1—7' (em-dash)", () => {
    // Em-dash (U+2014) is also not replaced; both endpoints tokenized.
    const r = checkSourcePresence(7, [pg(1, "CGI scores: 1—7 (full range).")], 1);
    expect(r.ok).toBe(true);
  });
});

// ── E3: spelledOutForms coverage (English language external ground truth) ────

describe("E3 — spelledOutForms English conventions", () => {
  it("handles zero correctly", () => {
    expect(spelledOutForms(0)).toContain("zero");
  });

  it("handles nineteen (highest ONES entry) correctly", () => {
    expect(spelledOutForms(19)).toContain("nineteen");
  });

  it("handles twenty (first TENS entry) correctly — both hyphen and space", () => {
    // "twenty" with no units; twoDigits(20) → "twenty" for both joins
    const forms = spelledOutForms(20);
    expect(forms).toContain("twenty");
  });

  it("handles 21 with both hyphenated and spaced variants", () => {
    expect(spelledOutForms(21)).toContain("twenty-one");
    expect(spelledOutForms(21)).toContain("twenty one");
  });

  it("handles 100 exactly (no 'and' since rest=0)", () => {
    expect(spelledOutForms(100)).toEqual(["one hundred"]);
  });

  it("handles 101 — includes British 'and' variant", () => {
    const forms = spelledOutForms(101);
    expect(forms).toContain("one hundred and one");
    expect(forms).toContain("one hundred one");
  });

  it("handles 999 (boundary)", () => {
    const forms = spelledOutForms(999);
    expect(forms).toContain("nine hundred ninety-nine");
    expect(forms).toContain("nine hundred and ninety-nine");
  });

  it("handles 200 (round hundreds)", () => {
    expect(spelledOutForms(200)).toEqual(["two hundred"]);
  });

  it("returns empty for 1000 (out of range)", () => {
    expect(spelledOutForms(1000)).toEqual([]);
  });

  it("returns empty for negative integers", () => {
    expect(spelledOutForms(-5)).toEqual([]);
  });

  it("returns empty for non-integers (fractions)", () => {
    expect(spelledOutForms(2.5)).toEqual([]);
    expect(spelledOutForms(0.1)).toEqual([]);
  });

  it("case-insensitive match: 'Twenty-Two' in text matches 22", () => {
    // The gate lowercases the haystack before checking, so title-case variants match.
    const r = checkSourcePresence(
      22,
      [pg(1, "Twenty-Two patients were enrolled in the study.")],
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("spelled_out");
    expect(r.spelledOutOnPages).toEqual([1]);
  });

  it("ALL-CAPS 'FORTY-TWO' in text matches 42", () => {
    const r = checkSourcePresence(
      42,
      [pg(1, "FORTY-TWO participants completed the washout.")],
      1,
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("spelled_out");
  });
});

// ── E4: AC5 sub-validation — representative ketamine/TRD trial text snippets ─

describe("E4 — AC5 sub-validation: published ketamine/TRD trial statistics", () => {
  /**
   * Truth set papers (from spec/validation/009-validation.md §2.3):
   *   Murrough 2013 (PMID 23832287): n=47 ketamine; MADRS mean 14.33, SD 12.26
   *   Zarate 2006  (PMID 16894061): n=9 ketamine (crossover); MADRS ~17 post-infusion
   *   Berman 2000  (PMID 11110514): n=7 ketamine (crossover); HDRS
   *
   * Each snippet is constructed to represent what a paper's results table text
   * layer would look like for that statistic, based on AMA journal formatting norms.
   */

  // Murrough 2013 — ketamine arm MADRS mean 14.33, SD 12.26, n=47
  const murrough2013Page3: SourcePage = {
    page: 3,
    text: [
      "Table 2. Primary Outcome Measures",
      "Ketamine group (n = 47): MADRS mean 14.33, SD 12.26 at Day 1.",
      "Midazolam group (n = 25): MADRS mean 28.14, SD 12.09 at Day 1.",
      "Difference in means: −13.81 (95% CI −19.22 to −8.40); p < 0.001.",
    ].join("\n"),
  };

  it("Murrough 2013: mean MADRS 14.33 found on page 3 (cited correctly)", () => {
    const r = checkSourcePresence(14.33, [murrough2013Page3], 3);
    expect(r.ok).toBe(true);
    expect(r.foundOnPages).toEqual([3]);
  });

  it("Murrough 2013: SD 12.26 found on page 3", () => {
    const r = checkSourcePresence(12.26, [murrough2013Page3], 3);
    expect(r.ok).toBe(true);
  });

  it("Murrough 2013: fabricated SD 11.99 (never reported) → not_in_source", () => {
    const r = checkSourcePresence(11.99, [murrough2013Page3], 3);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
  });

  it("Murrough 2013: mis-cited SD 12.09 (midazolam arm, on page 3) cited to page 2 → wrong_page", () => {
    // SD 12.09 IS in the text but page 2 is not provided — wrong_page because it's on p.3 not p.2
    const r = checkSourcePresence(12.09, [murrough2013Page3], 2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("wrong_page");
    expect(r.foundOnPages).toEqual([3]);
  });

  it("Murrough 2013: Unicode-minus diff −13.81 found (sign handled correctly)", () => {
    const r = checkSourcePresence(-13.81, [murrough2013Page3], 3);
    expect(r.ok).toBe(true);
  });

  // Zarate 2006 — MADRS score approximately 17 post-infusion (rounded integer)
  const zarate2006Page2: SourcePage = {
    page: 2,
    text: [
      "Table 1. MADRS Scores Post-Infusion",
      "Ketamine: 17.0 (SD 9.3); Saline: 28.8 (SD 10.1).",
      "Response rate ketamine: 71% (5/7 patients met ≥50% reduction criterion).",
    ].join("\n"),
  };

  it("Zarate 2006: MADRS 17.0 found as 17 (integer matches 17.0 within tolerance)", () => {
    const r = checkSourcePresence(17, [zarate2006Page2], 2);
    expect(r.ok).toBe(true);
  });

  it("Zarate 2006: response rate 71 found (trailing percent, value 71)", () => {
    const r = checkSourcePresence(71, [zarate2006Page2], 2);
    expect(r.ok).toBe(true);
  });

  it("Zarate 2006: fabricated SD 8.9 (not in text) → not_in_source", () => {
    const r = checkSourcePresence(8.9, [zarate2006Page2], 2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
  });

  // Berman 2000 — small n=7 per arm; HDRS change from baseline
  const berman2000Page2: SourcePage = {
    page: 2,
    text: [
      "Results: Seven patients completed the ketamine infusion.",
      "HDRS at 80 minutes: 12.0 (SD 6.4) versus placebo 24.0 (SD 7.4), p = 0.003.",
      "Mean change from baseline: −14.0 points (95% CI −21.0 to −7.0).",
    ].join("\n"),
  };

  it("Berman 2000: n=7 found (spelled 'Seven') → spelled_out, not fabrication", () => {
    // The number 7 appears as "Seven" in text, not as digits
    // BUT "7" also appears in "7.4" and "−7.0" as part of other numbers —
    // digit match wins over spelled-out check per the implementation.
    // This confirms digit-search takes priority.
    const r = checkSourcePresence(7, [berman2000Page2], 2);
    // "7" appears inside "7.4" and "−7.0" → these tokenize as 7.4 and -7.0, not standalone 7
    // BUT "7." at end of "−7.0" → no, "−7.0" tokenizes as -7.0
    // What about just "7" appearing as digits anywhere? Let me trace:
    // text includes: "Seven", "7.", "12.0", "6.4", "24.0", "7.4", "0.003", "14.0", "21.0", "7.0"
    // Token: -14.0, 21.0, -7.0 → wait, text has "−7.0" which is Unicode minus → "-7.0" → -7.0
    // So digit 7 standalone: NOT present as a standalone integer (all 7s are part of decimals)
    // But "Seven patients" → spelledOutForms(7) = ["seven"]
    // So: foundOnPages = [] (no standalone 7 as digit), spelledOutOnPages = [2]
    expect(r.ok).toBe(false);
    expect(r.code).toBe("spelled_out");
    expect(r.spelledOutOnPages).toEqual([2]);
  });

  it("Berman 2000: HDRS 12.0 found on page 2", () => {
    const r = checkSourcePresence(12.0, [berman2000Page2], 2);
    expect(r.ok).toBe(true);
  });

  it("Berman 2000: p-value 0.003 found on page 2", () => {
    const r = checkSourcePresence(0.003, [berman2000Page2], 2);
    expect(r.ok).toBe(true);
  });

  it("Berman 2000: fabricated CI endpoint −20.0 (text has −21.0) → not_in_source", () => {
    // A subtle fabrication: −20.0 not in text (text has −21.0)
    const r = checkSourcePresence(-20.0, [berman2000Page2], 2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
  });

  it("AC1 composite: across all three trials, zero fabricated values pass the gate", () => {
    // Fabricated values that are plausible (within instrument range, internally
    // consistent) but simply not in the source text:
    const fabrications: [number, SourcePage[], number][] = [
      [11.5,  [murrough2013Page3], 3],  // plausible MADRS but not in text
      [13.0,  [zarate2006Page2],   2],  // plausible HDRS but not in text
      [0.025, [berman2000Page2],   2],  // plausible p-value but not in text
    ];
    for (const [val, pages, cited] of fabrications) {
      const r = checkSourcePresence(val, pages, cited);
      expect(r.ok).toBe(false);
      expect(r.code).toBe("not_in_source");
    }
  });
});
