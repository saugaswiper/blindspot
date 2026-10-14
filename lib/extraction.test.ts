import { describe, it, expect } from "vitest";
import {
  extractOutcomes,
  type ExtractionPass,
  type ExtractionTarget,
  type PassCandidate,
} from "@/lib/extraction";
import type { SourcePage } from "@/lib/extraction-source";

/**
 * Tests for the Brief 009 slice-2b orchestrator — the four-check gate that
 * assigns each target a disposition. The central guarantees:
 *   - AC1: a fabricated number (absent from the text) is NEVER `verified`.
 *   - AC3: every returned value carries provenance or a failure code.
 *   - AC4: two disagreeing passes yield `conflict`, never an average.
 * Plus: a consistency failure and an out-of-range value drop to `check`; a
 * figure-only value is `author_contact`; a no-reading target is `manual`; and a
 * value that passes all four checks is `verified`.
 *
 * The two model passes are stubbed (the orchestrator is model-/network-pure).
 */

const pages = (map: Record<number, string>): SourcePage[] =>
  Object.entries(map).map(([page, text]) => ({ page: Number(page), text }));

/** A pass that always returns the same canned candidate. */
const fixedPass = (c: PassCandidate): ExtractionPass => () => c;

const target = (over: Partial<ExtractionTarget> = {}): ExtractionTarget => ({
  id: "t1",
  label: "MADRS change, week 1",
  instrument: "MADRS",
  ...over,
});

describe("extractOutcomes — happy path (all four checks pass)", () => {
  it("marks a present, agreed, consistent, in-range value `verified`", () => {
    const src = pages({ 4: "Mean MADRS change was 12.4 points (Table 2)." });
    const cand: PassCandidate = { value: 12.4, page: 4, source_text: "12.4", locator: "Table 2" };
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).toBe("verified");
    expect(res.values[0].value).toBe(12.4);
    expect(res.values[0].provenance?.page).toBe(4);
    expect(res.values[0].calculated).toBe(false);
    expect(res.summary.verified).toBe(1);
    expect(res.method).toBe("ai-assisted-two-pass");
  });
});

describe("extractOutcomes — fabrication (AC1)", () => {
  it("never verifies a number absent from the source → not_in_source", () => {
    const src = pages({ 4: "Mean MADRS change was 12.4 points." });
    const cand: PassCandidate = { value: 18.7, page: 4, source_text: "18.7" };
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).not.toBe("verified");
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_codes).toContain("not_in_source");
  });
});

describe("extractOutcomes — mis-citation (wrong page)", () => {
  it("flags a value cited to the wrong page → wrong_page, not verified", () => {
    const src = pages({ 4: "no numbers here", 5: "MADRS change 12.4" });
    const cand: PassCandidate = { value: 12.4, page: 4, source_text: "12.4" };
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_codes).toContain("wrong_page");
  });
});

describe("extractOutcomes — two-pass conflict (AC4)", () => {
  it("does not average two disagreeing readings; status is conflict", () => {
    const src = pages({ 4: "values 10.0 and 14.0 appear here" });
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass({ value: 10.0, page: 4, source_text: "10.0" }),
      hunter: fixedPass({ value: 14.0, page: 4, source_text: "14.0" }),
    });
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_code).toBe("conflict");
    // Never the mean of the two readings.
    expect(res.values[0].value).not.toBe(12.0);
  });

  it("treats a one-sided reading (only one pass found it) as a conflict", () => {
    const src = pages({ 4: "MADRS change 12.4" });
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass({ value: 12.4, page: 4 }),
      hunter: fixedPass({ value: null }),
    });
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_code).toBe("conflict");
  });
});

describe("extractOutcomes — internal consistency (check 3)", () => {
  it("drops an SE/CI-inconsistent value to `check`", () => {
    // Agreed value present in source, but the reported SE contradicts the CI.
    const src = pages({ 7: "estimate 5 (95% CI 1 to 9), SE 3.0" });
    const stats = { ciLow: 1, ciHigh: 9, se: 3.0, n: 100 }; // SE should be ~2.04
    const cand: PassCandidate = { value: 5, page: 7, source_text: "5", stats };
    const res = extractOutcomes(src, [target({ instrument: undefined })], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_codes).toContain("inconsistent_se_ci");
  });
});

describe("extractOutcomes — instrument range (check 4)", () => {
  it("drops an out-of-range value to `check` → out_of_range", () => {
    const src = pages({ 4: "MADRS score reported as 75" });
    const cand: PassCandidate = { value: 75, page: 4, source_text: "75" };
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).toBe("check");
    expect(res.values[0].failure_codes).toContain("out_of_range");
  });
});

describe("extractOutcomes — refusals", () => {
  it("marks a figure-only value `author_contact`", () => {
    const src = pages({ 4: "see Figure 1" });
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass({ value: 12.4, page: 4, from_figure: true }),
      hunter: fixedPass({ value: 12.4, page: 4, from_figure: true }),
    });
    expect(res.values[0].status).toBe("author_contact");
  });

  it("treats a figure-flagged value found verbatim in the text as text, not author_contact", () => {
    const src = pages({ 4: "Table 2: MADRS change 12.4" });
    const cand: PassCandidate = { value: 12.4, page: 4, source_text: "12.4", from_figure: true };
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).toBe("verified");
  });

  it("keeps author_contact when a figure-flagged value appears only on a different page (wrong-page variant)", () => {
    const src = pages({ 3: "Table 2: MADRS change 12.55", 6: "see Figure 2" });
    const cand: PassCandidate = { value: 12.55, page: 6, from_figure: true };
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass(cand),
      hunter: fixedPass({ ...cand }),
    });
    expect(res.values[0].status).toBe("author_contact");
  });

  it.each([10, 31, 60, 2, 0.05])(
    "never verifies a figure-flagged common value %s that coincidentally appears in text",
    (value) => {
      const src = pages({ 4: `Participants n=${value}; p<${value}; see Figure 1` });
      const cand: PassCandidate = { value, page: 4, from_figure: true };
      const res = extractOutcomes(src, [target()], {
        transcriber: fixedPass(cand),
        hunter: fixedPass({ ...cand }),
      });
      expect(res.values[0].status).toBe("author_contact");
    },
  );

  it("does not route to author_contact when only one pass says figure", () => {
    const src = pages({ 4: "see Figure 1" });
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass({ value: 12.4, page: 4, from_figure: true }),
      hunter: fixedPass({ value: 12.4, page: 4 }),
    });
    expect(res.values[0].status).not.toBe("author_contact");
  });

  it("marks a target neither pass could read `manual`", () => {
    const src = pages({ 4: "prose with no outcome numbers" });
    const res = extractOutcomes(src, [target()], {
      transcriber: fixedPass({ value: null }),
      hunter: fixedPass({ value: null }),
    });
    expect(res.values[0].status).toBe("manual");
    expect(res.values[0].value).toBeNull();
  });
});

describe("extractOutcomes — provenance (AC3)", () => {
  it("every value carries provenance or a failure code", () => {
    const src = pages({ 4: "MADRS change 12.4; score 75" });
    const res = extractOutcomes(
      src,
      [target({ id: "ok" }), target({ id: "bad", label: "out of range" })],
      {
        transcriber: (_p, t) =>
          t.id === "ok"
            ? { value: 12.4, page: 4, source_text: "12.4" }
            : { value: 75, page: 4, source_text: "75" },
        hunter: (_p, t) =>
          t.id === "ok"
            ? { value: 12.4, page: 4, source_text: "12.4" }
            : { value: 75, page: 4, source_text: "75" },
      },
    );
    for (const v of res.values) {
      const hasProvenance = v.provenance?.page !== undefined || v.provenance?.source_text !== undefined;
      const hasFailure = (v.failure_codes?.length ?? 0) > 0;
      expect(hasProvenance || hasFailure).toBe(true);
    }
  });
});

describe("extractOutcomes — precision guard (validation 013)", () => {
  const src = pages({ 4: "Mean stay was 9 days overall.", 5: "Table 4: mean stay 8.70" });
  const run = (cand: PassCandidate, t: ExtractionTarget) =>
    extractOutcomes(src, [t], { transcriber: fixedPass(cand), hunter: fixedPass({ ...cand }) }).values[0];

  it("sends a prose integer for a continuous target to `check` (prose_integer)", () => {
    const v = run(
      { value: 9, page: 4, source_text: "Mean stay was 9 days overall." },
      target({ label: "Mean length of stay", instrument: undefined }),
    );
    expect(v.status).toBe("check");
    expect(v.failure_codes).toContain("prose_integer");
  });

  it("verifies the table-unit decimal for the same quantity", () => {
    const v = run(
      { value: 8.7, page: 5, locator: "Table 4", source_text: "mean stay 8.70" },
      target({ label: "Mean length of stay", instrument: undefined }),
    );
    expect(v.status).toBe("verified");
  });

  it("does not apply to a count target", () => {
    const v = run(
      { value: 9, page: 4, source_text: "Mean stay was 9 days overall." },
      target({ label: "Participants randomised", instrument: undefined }),
    );
    expect(v.status).toBe("verified");
  });
});
