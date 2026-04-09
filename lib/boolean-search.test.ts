import { describe, it, expect } from "vitest";
import {
  sanitizeBooleanString,
  looksLikeBooleanString,
  buildPubMedUrl,
  isUserBooleanQuery,
} from "./boolean-search";

/* -------------------------------------------------------------------------- */
/* sanitizeBooleanString                                                       */
/* -------------------------------------------------------------------------- */

describe("sanitizeBooleanString", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitizeBooleanString("  hello  ")).toBe("hello");
  });

  it("collapses 3+ consecutive newlines to a single blank line", () => {
    const input = "line1\n\n\nline2\n\n\n\nline3";
    const result = sanitizeBooleanString(input);
    expect(result).toBe("line1\n\nline2\n\nline3");
  });

  it("leaves a single blank line unchanged", () => {
    const input = "line1\n\nline2";
    expect(sanitizeBooleanString(input)).toBe("line1\n\nline2");
  });

  it("handles a typical PubMed string without modification (no excess whitespace)", () => {
    const str =
      '("insomnia"[MeSH Terms] OR "sleep disorder"[tiab]) AND ("cognitive behavioral therapy"[MeSH Terms] OR "CBT"[tiab])';
    expect(sanitizeBooleanString(str)).toBe(str);
  });

  it("trims a string that is only whitespace to an empty string", () => {
    expect(sanitizeBooleanString("   \n  ")).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* looksLikeBooleanString                                                      */
/* -------------------------------------------------------------------------- */

describe("looksLikeBooleanString", () => {
  it("returns true for a string with AND", () => {
    expect(looksLikeBooleanString("depression AND treatment")).toBe(true);
  });

  it("returns true for a string with OR", () => {
    expect(looksLikeBooleanString("insomnia OR sleep disorder")).toBe(true);
  });

  it("returns true for a string with NOT", () => {
    expect(looksLikeBooleanString("cancer NOT lung")).toBe(true);
  });

  it("returns true for a string with [MeSH Terms] qualifier", () => {
    expect(looksLikeBooleanString('"insomnia"[MeSH Terms]')).toBe(true);
  });

  it("returns true for a string with [tiab] qualifier", () => {
    expect(looksLikeBooleanString('"cognitive therapy"[tiab]')).toBe(true);
  });

  it("returns true for a string with [pt] qualifier", () => {
    expect(looksLikeBooleanString('"systematic review"[pt]')).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(looksLikeBooleanString("")).toBe(false);
  });

  it("returns false for a plain prose sentence with no operators", () => {
    expect(
      looksLikeBooleanString(
        "This is a plain sentence without any Boolean operators."
      )
    ).toBe(false);
  });

  it("returns false for whitespace-only input", () => {
    expect(looksLikeBooleanString("   ")).toBe(false);
  });

  it("is case-insensitive for operator matching", () => {
    expect(looksLikeBooleanString("depression and treatment")).toBe(true);
    expect(looksLikeBooleanString("insomnia or sleep")).toBe(true);
  });

  it("returns true for a realistic multi-block PubMed query", () => {
    const str =
      '("cognitive behavioral therapy"[MeSH Terms] OR "CBT"[tiab] OR "cognitive behaviour therapy"[tiab]) AND ("insomnia"[MeSH Terms] OR "sleep disorder"[tiab]) AND ("systematic review"[pt] OR "meta-analysis"[pt])';
    expect(looksLikeBooleanString(str)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* isUserBooleanQuery                                                          */
/* -------------------------------------------------------------------------- */

describe("isUserBooleanQuery", () => {
  // --- Positive cases: uppercase operators ---

  it("returns true when query contains uppercase AND", () => {
    expect(isUserBooleanQuery("CBT AND insomnia")).toBe(true);
  });

  it("returns true when query contains uppercase OR", () => {
    expect(isUserBooleanQuery("CBT OR 'cognitive therapy'")).toBe(true);
  });

  it("returns true when query contains uppercase NOT", () => {
    expect(isUserBooleanQuery("depression NOT seasonal")).toBe(true);
  });

  it("returns true for a multi-operator query", () => {
    expect(
      isUserBooleanQuery(
        '"cognitive behavioral therapy" OR "CBT" AND "insomnia" NOT "subclinical"'
      )
    ).toBe(true);
  });

  it("returns true for a query with PubMed [MeSH Terms] tag", () => {
    expect(isUserBooleanQuery('"insomnia"[MeSH Terms]')).toBe(true);
  });

  it("returns true for a query with [tiab] field tag", () => {
    expect(isUserBooleanQuery('"cognitive therapy"[tiab]')).toBe(true);
  });

  it("returns true for a query with [pt] publication type tag", () => {
    expect(isUserBooleanQuery('"systematic review"[pt]')).toBe(true);
  });

  it("returns true for a full realistic PubMed query string", () => {
    const q =
      '("insomnia"[MeSH Terms] OR "sleep disorder"[tiab]) AND ("CBT"[tiab]) NOT "pharmacotherapy"[tiab]';
    expect(isUserBooleanQuery(q)).toBe(true);
  });

  // --- Negative cases: lowercase connectors are natural language ---

  it("returns false when query contains lowercase 'and' only", () => {
    expect(isUserBooleanQuery("CBT for insomnia and anxiety")).toBe(false);
  });

  it("returns false for a natural-language query with no operators", () => {
    expect(
      isUserBooleanQuery("cognitive behavioral therapy for insomnia in elderly patients")
    ).toBe(false);
  });

  it("returns false for a single keyword", () => {
    expect(isUserBooleanQuery("insomnia")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isUserBooleanQuery("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isUserBooleanQuery("   ")).toBe(false);
  });

  // 'and' in the middle of a word (e.g. "randomized") must not trigger
  it("returns false when AND appears only as a substring (e.g. 'randomized')", () => {
    expect(isUserBooleanQuery("randomized controlled trial")).toBe(false);
  });

  // Boundary: mixed case should NOT trigger (not an intentional operator)
  it("returns false for mixed-case 'And' (not an intentional operator)", () => {
    expect(isUserBooleanQuery("CBT And insomnia")).toBe(false);
  });

  // Boundary: 'OR' at the start of a word should not false-positive
  it("returns false when OR appears only as a substring (e.g. 'order')", () => {
    expect(isUserBooleanQuery("order of operations")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* buildPubMedUrl                                                              */
/* -------------------------------------------------------------------------- */

describe("buildPubMedUrl", () => {
  it("returns a URL starting with the PubMed base", () => {
    const url = buildPubMedUrl("depression AND treatment");
    expect(url).toMatch(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\?term=/);
  });

  it("percent-encodes spaces", () => {
    const url = buildPubMedUrl("depression AND treatment");
    expect(url).toContain("depression%20AND%20treatment");
  });

  it("percent-encodes square brackets used in field qualifiers", () => {
    const url = buildPubMedUrl('"insomnia"[MeSH Terms]');
    expect(url).toContain("%5BMeSH%20Terms%5D");
  });

  it("round-trips: decoding the query portion yields the original string", () => {
    const original = '("insomnia"[MeSH Terms] OR "sleep disorder"[tiab]) AND ("CBT"[tiab])';
    const url = buildPubMedUrl(original);
    const queryParam = new URL(url).searchParams.get("term");
    expect(queryParam).toBe(original);
  });
});
