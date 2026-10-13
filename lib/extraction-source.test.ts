import { describe, it, expect } from "vitest";
import {
  checkSourcePresence,
  spelledOutForms,
  type SourcePage,
} from "@/lib/extraction-source";

/**
 * Tests for check 1 of the Brief 009 extraction gate — the source-presence
 * gate. The central guarantee (AC1) is that a fabricated number can never pass:
 * a value absent from the text layer is `not_in_source`. The gate also keeps a
 * mis-citation (`wrong_page`) distinct from a fabrication, and never calls a
 * spelled-out number a fabrication.
 */

const pages = (map: Record<number, string>): SourcePage[] =>
  Object.entries(map).map(([page, text]) => ({ page: Number(page), text }));

describe("checkSourcePresence — fabrication (AC1)", () => {
  it("never passes a number absent from every page", () => {
    const r = checkSourcePresence(
      99.9,
      pages({ 3: "Mean change was 12.4 points on the MADRS." }),
      3,
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
    expect(r.foundOnPages).toEqual([]);
  });

  it("does not match a value embedded inside a larger number", () => {
    // 42 must not be found inside "4267".
    const r = checkSourcePresence(42, pages({ 1: "n = 4267 participants" }), 1);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("not_in_source");
  });
});

describe("checkSourcePresence — present on cited page", () => {
  it("passes when the value is on the cited page", () => {
    const r = checkSourcePresence(
      12.4,
      pages({ 3: "Mean change was 12.4 points." }),
      3,
    );
    expect(r.ok).toBe(true);
    expect(r.foundOnPages).toEqual([3]);
    expect(r.code).toBeUndefined();
  });

  it("passes when present and no page was cited", () => {
    const r = checkSourcePresence(12.4, pages({ 3: "a change of 12.4 points" }));
    expect(r.ok).toBe(true);
    expect(r.foundOnPages).toEqual([3]);
  });
});

describe("checkSourcePresence — mis-citation (wrong_page, distinct from fabrication)", () => {
  it("flags wrong_page when the value is real but on another page", () => {
    const r = checkSourcePresence(
      12.4,
      pages({ 3: "see Table 2", 4: "Mean change was 12.4 points." }),
      3,
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("wrong_page");
    expect(r.foundOnPages).toEqual([4]);
  });
});

describe("checkSourcePresence — journal number formatting", () => {
  it("recognises comma-grouped thousands", () => {
    const r = checkSourcePresence(1234, pages({ 1: "1,234 records screened" }), 1);
    expect(r.ok).toBe(true);
  });

  it("recognises a middle-dot decimal point", () => {
    const r = checkSourcePresence(3.92, pages({ 1: "the divisor was 3·92" }), 1);
    expect(r.ok).toBe(true);
  });

  it("recognises a Unicode-minus negative value", () => {
    const r = checkSourcePresence(-2.5, pages({ 1: "difference −2.5 (95% CI)" }), 1);
    expect(r.ok).toBe(true);
  });

  it("recognises a value written with a trailing percent", () => {
    const r = checkSourcePresence(42, pages({ 1: "response rate was 42% at week 4" }), 1);
    expect(r.ok).toBe(true);
  });
});

describe("checkSourcePresence — spelled-out numbers are flagged, not fabricated", () => {
  it("flags a hyphenated spelled-out integer", () => {
    const r = checkSourcePresence(42, pages({ 2: "Forty-two patients were enrolled." }), 2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("spelled_out");
    expect(r.spelledOutOnPages).toEqual([2]);
  });

  it("flags a spaced spelled-out integer", () => {
    const r = checkSourcePresence(30, pages({ 1: "thirty participants completed" }), 1);
    expect(r.code).toBe("spelled_out");
  });

  it("prefers a digit match over a spelled-out one when both exist", () => {
    const r = checkSourcePresence(
      42,
      pages({ 1: "Forty-two (n = 42) patients" }),
      1,
    );
    expect(r.ok).toBe(true);
    expect(r.code).toBeUndefined();
  });
});

describe("spelledOutForms", () => {
  it("covers the common variants", () => {
    expect(spelledOutForms(42)).toContain("forty-two");
    expect(spelledOutForms(42)).toContain("forty two");
    expect(spelledOutForms(7)).toEqual(["seven"]);
    expect(spelledOutForms(20)).toContain("twenty");
    expect(spelledOutForms(123)).toContain("one hundred and twenty-three");
    expect(spelledOutForms(100)).toEqual(["one hundred"]);
  });

  it("returns nothing for values it does not spell out", () => {
    expect(spelledOutForms(-1)).toEqual([]);
    expect(spelledOutForms(3.5)).toEqual([]);
    expect(spelledOutForms(1000)).toEqual([]);
  });
});
