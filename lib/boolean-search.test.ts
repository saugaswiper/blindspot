import { describe, it, expect } from "vitest";
import {
  sanitizeBooleanString,
  looksLikeBooleanString,
  buildPubMedUrl,
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
