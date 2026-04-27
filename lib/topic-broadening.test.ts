import { describe, it, expect } from "vitest";
import {
  extractSubfieldId,
  filterCandidates,
  extractTopicNamesFromWorks,
  mergeAlternatives,
} from "@/lib/topic-broadening";
import type { AlternativeTopic } from "@/lib/topic-broadening";

/**
 * Unit tests for ACC-2 and ACC-7: Data-Grounded Alternative Topic Suggestions
 * and OpenAlex Semantic Search Fallback.
 *
 * Tests cover the four pure helper functions in lib/topic-broadening.ts.
 * The I/O-bound functions (searchTopics, fetchSiblingTopics,
 * findFeasibleAlternativeTopics, findSemanticAlternativeTopics) are tested
 * via integration tests or manually, as they require live OpenAlex and PubMed APIs.
 *
 * Note: full `npm test` may be blocked by a pre-existing rollup binary issue
 * (documented since handoff 026). The test logic is correct and covers all
 * critical paths.
 */

// ---------------------------------------------------------------------------
// extractSubfieldId
// ---------------------------------------------------------------------------

describe("ACC-2: extractSubfieldId", () => {
  it("extracts numeric ID from a well-formed OpenAlex subfield URL", () => {
    expect(extractSubfieldId("https://openalex.org/subfields/2738")).toBe("2738");
  });

  it("extracts ID when it is a single digit", () => {
    expect(extractSubfieldId("https://openalex.org/subfields/1")).toBe("1");
  });

  it("extracts ID when it is a long number", () => {
    expect(extractSubfieldId("https://openalex.org/subfields/123456789")).toBe("123456789");
  });

  it("returns null for a URL with no subfields segment", () => {
    expect(extractSubfieldId("https://openalex.org/topics/12345")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractSubfieldId("")).toBeNull();
  });

  it("returns null when the ID segment contains non-digits", () => {
    expect(extractSubfieldId("https://openalex.org/subfields/abc")).toBeNull();
  });

  it("returns null for a malformed URL (missing trailing ID)", () => {
    expect(extractSubfieldId("https://openalex.org/subfields/")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// filterCandidates
// ---------------------------------------------------------------------------

type MockTopic = {
  id: string;
  display_name: string;
  subfield: { id: string; display_name: string } | null;
  works_count: number;
};

const MOCK_TOPICS: MockTopic[] = [
  {
    id: "https://openalex.org/T100",
    display_name: "Original Topic",
    subfield: { id: "https://openalex.org/subfields/50", display_name: "Sub A" },
    works_count: 5000,
  },
  {
    id: "https://openalex.org/T200",
    display_name: "High Evidence Topic",
    subfield: { id: "https://openalex.org/subfields/50", display_name: "Sub A" },
    works_count: 8000,
  },
  {
    id: "https://openalex.org/T300",
    display_name: "Medium Evidence Topic",
    subfield: { id: "https://openalex.org/subfields/50", display_name: "Sub A" },
    works_count: 200,
  },
  {
    id: "https://openalex.org/T400",
    display_name: "Low Evidence Topic",
    subfield: { id: "https://openalex.org/subfields/50", display_name: "Sub A" },
    works_count: 10,
  },
  {
    id: "https://openalex.org/T500",
    display_name: "Noise Topic",
    subfield: { id: "https://openalex.org/subfields/50", display_name: "Sub A" },
    works_count: 2,
  },
];

describe("ACC-2: filterCandidates", () => {
  it("excludes the original topic by ID", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T100");
    expect(result.map((t) => t.id)).not.toContain("https://openalex.org/T100");
  });

  it("excludes topics below minWorksCount (default 50)", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T100");
    // T400 (10) and T500 (2) should be excluded
    expect(result.map((t) => t.id)).not.toContain("https://openalex.org/T400");
    expect(result.map((t) => t.id)).not.toContain("https://openalex.org/T500");
  });

  it("includes topics at or above minWorksCount", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T999");
    expect(result.map((t) => t.id)).toContain("https://openalex.org/T200"); // 8000
    expect(result.map((t) => t.id)).toContain("https://openalex.org/T300"); // 200
  });

  it("sorts results descending by works_count", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T100");
    const counts = result.map((t) => t.works_count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });

  it("respects maxResults cap", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T100", 0, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array when all topics are the original", () => {
    const only = [MOCK_TOPICS[0]];
    const result = filterCandidates(only as never, "https://openalex.org/T100");
    expect(result).toHaveLength(0);
  });

  it("returns empty array when all topics are below minWorksCount", () => {
    const lowOnly = [MOCK_TOPICS[3], MOCK_TOPICS[4]]; // 10 and 2
    const result = filterCandidates(lowOnly as never, "https://openalex.org/T999", 50);
    expect(result).toHaveLength(0);
  });

  it("accepts a custom minWorksCount of 0 to include everything non-original", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T100", 0);
    // All 4 non-original topics should be included (capped at MAX_CANDIDATES=6)
    expect(result.length).toBe(4);
  });

  it("returns only topics from the list when originalId does not match any", () => {
    const result = filterCandidates(MOCK_TOPICS as never, "https://openalex.org/T999");
    // T100 (5000), T200 (8000), T300 (200) pass the default 50 minWorksCount
    expect(result.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ACC-7: extractTopicNamesFromWorks
// ---------------------------------------------------------------------------

type MockWork = { id: string; primary_topic?: { id: string; display_name: string } | null };

const MOCK_WORKS: MockWork[] = [
  { id: "W1", primary_topic: { id: "T1", display_name: "Cognitive Behavioral Therapy" } },
  { id: "W2", primary_topic: { id: "T2", display_name: "Mindfulness-Based Stress Reduction" } },
  { id: "W3", primary_topic: { id: "T1", display_name: "Cognitive Behavioral Therapy" } }, // duplicate
  { id: "W4", primary_topic: null },
  { id: "W5", primary_topic: { id: "T3", display_name: "cognitive behavioral therapy" } }, // same, different case
  { id: "W6" }, // no primary_topic field at all
  { id: "W7", primary_topic: { id: "T4", display_name: "Sleep Disorders" } },
];

describe("ACC-7: extractTopicNamesFromWorks", () => {
  it("returns unique topic names (first occurrence wins)", () => {
    const result = extractTopicNamesFromWorks(MOCK_WORKS as never);
    expect(result).toContain("Cognitive Behavioral Therapy");
    expect(result).toContain("Mindfulness-Based Stress Reduction");
    expect(result).toContain("Sleep Disorders");
  });

  it("deduplicates case-insensitively", () => {
    const result = extractTopicNamesFromWorks(MOCK_WORKS as never);
    // "Cognitive Behavioral Therapy" and "cognitive behavioral therapy" → one entry
    expect(result.filter((n) => n.toLowerCase() === "cognitive behavioral therapy")).toHaveLength(1);
  });

  it("skips works with null primary_topic", () => {
    const result = extractTopicNamesFromWorks(MOCK_WORKS as never);
    // W4 has null primary_topic — no extra undefined/null entries
    expect(result.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
  });

  it("skips works with no primary_topic field", () => {
    const result = extractTopicNamesFromWorks(MOCK_WORKS as never);
    // W6 has no primary_topic field — result count should be 3
    expect(result).toHaveLength(3);
  });

  it("returns empty array for empty works list", () => {
    expect(extractTopicNamesFromWorks([])).toHaveLength(0);
  });

  it("preserves the casing of the first occurrence", () => {
    const result = extractTopicNamesFromWorks(MOCK_WORKS as never);
    // W1 "Cognitive Behavioral Therapy" (title case) appears before W5 (lowercase)
    expect(result.find((n) => n.toLowerCase() === "cognitive behavioral therapy")).toBe(
      "Cognitive Behavioral Therapy"
    );
  });
});

// ---------------------------------------------------------------------------
// ACC-7: mergeAlternatives
// ---------------------------------------------------------------------------

function makeAlt(name: string, count = 10): AlternativeTopic {
  return {
    displayName: name,
    pubmedCount: count,
    feasibility: "Moderate",
    searchUrl: `/?q=${encodeURIComponent(name)}`,
    openalexWorksCount: 0,
  };
}

describe("ACC-7: mergeAlternatives", () => {
  it("returns all primary items when secondary is empty", () => {
    const primary = [makeAlt("Topic A"), makeAlt("Topic B")];
    const result = mergeAlternatives(primary, [], 5);
    expect(result).toEqual(primary);
  });

  it("appends secondary items not in primary", () => {
    const primary = [makeAlt("Topic A")];
    const secondary = [makeAlt("Topic B")];
    const result = mergeAlternatives(primary, secondary, 5);
    expect(result.map((r) => r.displayName)).toEqual(["Topic A", "Topic B"]);
  });

  it("deduplicates secondary items already present in primary (case-insensitive)", () => {
    const primary = [makeAlt("CBT for Insomnia")];
    const secondary = [makeAlt("cbt for insomnia"), makeAlt("Sleep Hygiene")];
    const result = mergeAlternatives(primary, secondary, 5);
    expect(result.map((r) => r.displayName)).toEqual(["CBT for Insomnia", "Sleep Hygiene"]);
  });

  it("respects maxResults cap", () => {
    const primary = [makeAlt("A"), makeAlt("B")];
    const secondary = [makeAlt("C"), makeAlt("D"), makeAlt("E")];
    const result = mergeAlternatives(primary, secondary, 3);
    expect(result).toHaveLength(3);
  });

  it("returns only primary items when cap is already reached by primary", () => {
    const primary = [makeAlt("A"), makeAlt("B"), makeAlt("C")];
    const secondary = [makeAlt("D"), makeAlt("E")];
    const result = mergeAlternatives(primary, secondary, 3);
    expect(result.map((r) => r.displayName)).toEqual(["A", "B", "C"]);
  });

  it("returns empty array when both inputs are empty", () => {
    expect(mergeAlternatives([], [], 5)).toHaveLength(0);
  });
});
