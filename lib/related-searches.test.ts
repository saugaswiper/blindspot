/**
 * lib/related-searches.test.ts
 *
 * Unit tests for the related-searches utilities.
 * Tests are written for Node.js smoke-test execution (no build required)
 * and are also vitest-compatible via the standard describe/it/expect API.
 */

import { describe, it, expect } from "vitest";
import {
  cleanPubMedQuery,
  truncateLabel,
  extractSnippet,
  deriveRelatedSearches,
} from "./related-searches";
import type { GapAnalysis, SuggestedTopic } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTopic(overrides: Partial<SuggestedTopic> = {}): SuggestedTopic {
  return {
    title: "A Systematic Review of Something",
    gap_type: "population",
    pubmed_query: "keyword1 keyword2 keyword3",
    rationale: "This review is needed because existing work does not cover this area. More research is warranted.",
    expected_outcomes: "Effect sizes and clinical recommendations.",
    feasibility: "high",
    estimated_studies: 50,
    ...overrides,
  };
}

function makeGapAnalysis(topics: SuggestedTopic[]): GapAnalysis {
  return {
    gaps: [],
    suggested_topics: topics,
    overall_assessment: "The evidence landscape has several meaningful gaps.",
    boolean_search_string: undefined,
  };
}

// ---------------------------------------------------------------------------
// cleanPubMedQuery
// ---------------------------------------------------------------------------

describe("cleanPubMedQuery", () => {
  it("returns plain keyword strings unchanged (modulo whitespace)", () => {
    expect(cleanPubMedQuery("ketamine elderly depression treatment")).toBe(
      "ketamine elderly depression treatment"
    );
  });

  it("strips [MeSH Terms] qualifiers", () => {
    const result = cleanPubMedQuery('"insomnia"[MeSH Terms] AND "elderly"[tiab]');
    expect(result).toBe("insomnia elderly");
  });

  it("strips [tiab] and [pt] qualifiers", () => {
    const result = cleanPubMedQuery('"CBT"[tiab] AND "systematic review"[pt]');
    expect(result).toBe("CBT systematic review");
  });

  it("strips Boolean AND operator", () => {
    expect(cleanPubMedQuery("insomnia AND elderly")).toBe("insomnia elderly");
  });

  it("strips Boolean OR operator", () => {
    expect(cleanPubMedQuery("insomnia OR sleeplessness")).toBe("insomnia sleeplessness");
  });

  it("strips Boolean NOT operator", () => {
    expect(cleanPubMedQuery("insomnia NOT children")).toBe("insomnia children");
  });

  it("strips parentheses", () => {
    const result = cleanPubMedQuery('("CBT"[tiab] OR "cognitive behavioral"[tiab]) AND "insomnia"[MeSH Terms]');
    expect(result).toBe("CBT cognitive behavioral insomnia");
  });

  it("strips double quotes", () => {
    expect(cleanPubMedQuery('"cognitive therapy" depression')).toBe("cognitive therapy depression");
  });

  it("strips square brackets (non-qualifier)", () => {
    // Bracketed text not matching field qualifier pattern is removed
    expect(cleanPubMedQuery("insomnia [sleep] disorder")).toBe("insomnia disorder");
  });

  it("collapses multiple spaces to single space", () => {
    expect(cleanPubMedQuery("insomnia    elderly   depression")).toBe("insomnia elderly depression");
  });

  it("trims leading and trailing whitespace", () => {
    expect(cleanPubMedQuery("  insomnia elderly  ")).toBe("insomnia elderly");
  });

  it("handles an empty string", () => {
    expect(cleanPubMedQuery("")).toBe("");
  });

  it("handles a string that becomes empty after stripping", () => {
    // Only contains operators and qualifiers
    expect(cleanPubMedQuery("AND OR [MeSH Terms]")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// truncateLabel
// ---------------------------------------------------------------------------

describe("truncateLabel", () => {
  it("returns text unchanged when it is short enough", () => {
    expect(truncateLabel("short text", 60)).toBe("short text");
  });

  it("truncates at word boundary and appends ellipsis", () => {
    const text = "cognitive behavioral therapy insomnia elderly patients systematic review";
    const result = truncateLabel(text, 40);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(40 + 1); // +1 for the ellipsis char
  });

  it("uses default maxChars of 60", () => {
    const text = "a".repeat(70);
    const result = truncateLabel(text);
    expect(result.length).toBeLessThanOrEqual(61); // 60 chars + ellipsis
  });

  it("returns empty string unchanged", () => {
    expect(truncateLabel("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// extractSnippet
// ---------------------------------------------------------------------------

describe("extractSnippet", () => {
  it("returns the first sentence when it ends within maxChars", () => {
    const rationale = "This is the first sentence. And then more context follows.";
    expect(extractSnippet(rationale)).toBe("This is the first sentence.");
  });

  it("falls back to truncated text when no sentence boundary in maxChars", () => {
    const longSentence = "This is a very long sentence without any punctuation until the very end " +
      "which goes on and on well past the limit so it gets cut off";
    const result = extractSnippet(longSentence, 50);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(51);
  });

  it("returns full text when it is shorter than maxChars and has no sentence end", () => {
    const text = "Short rationale";
    expect(extractSnippet(text)).toBe("Short rationale");
  });

  it("handles exclamation marks as sentence endings", () => {
    const rationale = "A review is urgently needed! Much more work is required.";
    expect(extractSnippet(rationale)).toBe("A review is urgently needed!");
  });

  it("handles question marks as sentence endings", () => {
    const rationale = "Is this gap real? Yes, clearly it is.";
    expect(extractSnippet(rationale)).toBe("Is this gap real?");
  });
});

// ---------------------------------------------------------------------------
// deriveRelatedSearches
// ---------------------------------------------------------------------------

describe("deriveRelatedSearches", () => {
  it("returns empty array for null gapAnalysis", () => {
    expect(deriveRelatedSearches(null)).toEqual([]);
  });

  it("returns empty array when suggested_topics is empty", () => {
    expect(deriveRelatedSearches(makeGapAnalysis([]))).toEqual([]);
  });

  it("returns up to maxSuggestions results (default 4)", () => {
    const topics = Array.from({ length: 6 }, (_, i) =>
      makeTopic({ pubmed_query: `keyword${i}a keyword${i}b keyword${i}c` })
    );
    const results = deriveRelatedSearches(makeGapAnalysis(topics));
    expect(results.length).toBe(4);
  });

  it("respects a custom maxSuggestions value", () => {
    const topics = Array.from({ length: 5 }, (_, i) =>
      makeTopic({ pubmed_query: `topic${i} keyword${i} search${i}` })
    );
    expect(deriveRelatedSearches(makeGapAnalysis(topics), 2).length).toBe(2);
  });

  it("prioritises high-feasibility topics over moderate and low", () => {
    const topics = [
      makeTopic({ pubmed_query: "low feasibility topic keywords", feasibility: "low" }),
      makeTopic({ pubmed_query: "high feasibility topic keywords", feasibility: "high" }),
      makeTopic({ pubmed_query: "moderate feasibility topic words", feasibility: "moderate" }),
    ];
    const results = deriveRelatedSearches(makeGapAnalysis(topics), 3);
    expect(results[0].feasibility).toBe("high");
    expect(results[1].feasibility).toBe("moderate");
    expect(results[2].feasibility).toBe("low");
  });

  it("deduplicates identical cleaned queries (case-insensitive)", () => {
    const topics = [
      makeTopic({ pubmed_query: "insomnia elderly CBT treatment" }),
      makeTopic({ pubmed_query: "insomnia elderly CBT treatment" }), // exact dup
      makeTopic({ pubmed_query: "INSOMNIA ELDERLY CBT TREATMENT" }), // case variant dup
    ];
    const results = deriveRelatedSearches(makeGapAnalysis(topics));
    expect(results.length).toBe(1);
  });

  it("skips topics whose cleaned query is shorter than 5 characters", () => {
    const topics = [
      makeTopic({ pubmed_query: '[MeSH Terms] AND [tiab]' }), // becomes empty after cleaning
      makeTopic({ pubmed_query: "anxiety treatment cognitive behavioral therapy" }),
    ];
    const results = deriveRelatedSearches(makeGapAnalysis(topics));
    expect(results.length).toBe(1);
    expect(results[0].query).toBe("anxiety treatment cognitive behavioral therapy");
  });

  it("sets the correct RelatedSearch fields from the topic", () => {
    const topic = makeTopic({
      pubmed_query: "depression elderly SSRIs treatment",
      feasibility: "high",
      gap_type: "population",
      rationale: "This gap exists because elderly populations are underrepresented. More research is needed.",
    });
    const [result] = deriveRelatedSearches(makeGapAnalysis([topic]));
    expect(result.query).toBe("depression elderly SSRIs treatment");
    expect(result.label).toBe("depression elderly SSRIs treatment");
    expect(result.gapType).toBe("population");
    expect(result.feasibility).toBe("high");
    // snippet should be the first sentence
    expect(result.snippet).toBe("This gap exists because elderly populations are underrepresented.");
  });

  it("applies PubMed cleaning to pubmed_query before deduplication", () => {
    const topics = [
      makeTopic({ pubmed_query: '"insomnia"[MeSH Terms] AND "elderly"[tiab]' }),
      makeTopic({ pubmed_query: "insomnia elderly" }), // same after cleaning, should be dedup'd
    ];
    const results = deriveRelatedSearches(makeGapAnalysis(topics));
    expect(results.length).toBe(1);
  });

  it("does not mutate the input suggested_topics array", () => {
    const topics = [
      makeTopic({ pubmed_query: "anxiety CBT treatment adults", feasibility: "low" }),
      makeTopic({ pubmed_query: "depression SSRI elderly patients", feasibility: "high" }),
    ];
    const original = [...topics];
    deriveRelatedSearches(makeGapAnalysis(topics));
    // The outer array should not have been re-ordered
    expect(topics[0].pubmed_query).toBe(original[0].pubmed_query);
    expect(topics[1].pubmed_query).toBe(original[1].pubmed_query);
  });

  it("returns at most the number of valid topics when fewer than maxSuggestions exist", () => {
    const topics = [makeTopic({ pubmed_query: "only one valid topic query words" })];
    expect(deriveRelatedSearches(makeGapAnalysis(topics), 4).length).toBe(1);
  });
});
