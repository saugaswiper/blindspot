/**
 * lib/protocol-generator.test.ts
 *
 * Unit tests for the buildProtocolPrompt utility in lib/prompts.ts.
 * Tests are written for both vitest and Node.js smoke-test execution.
 *
 * Vitest: npx vitest run lib/protocol-generator.test.ts
 * Node (smoke): node --experimental-transform-types lib/protocol-generator.test.ts
 */

import { describe, it, expect } from "vitest";
import { buildProtocolPrompt } from "./prompts";
import type { ProtocolInput } from "./prompts";
import type { GapAnalysis, StudyDesignRecommendation } from "@/types";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const baseGapAnalysis: GapAnalysis = {
  gaps: [
    { dimension: "population", description: "Elderly patients understudied", importance: "high" },
    { dimension: "geographic", description: "Low-income countries lack data", importance: "medium" },
  ],
  suggested_topics: [
    {
      title: "CBT for insomnia in adults over 65",
      gap_type: "population",
      pubmed_query: "CBT insomnia elderly adults",
      estimated_studies: 120,
      rationale: "Existing reviews focus on working-age adults.",
      feasibility: "high",
      expected_outcomes: "Effect sizes for sleep quality in older adults.",
    },
    {
      title: "CBT for insomnia in low-income settings",
      gap_type: "geographic",
      pubmed_query: "CBT insomnia low-income",
      estimated_studies: 45,
      rationale: "No reviews include LMIC populations.",
      feasibility: "moderate",
      expected_outcomes: "Generalizability of CBT-I to global populations.",
    },
  ],
  overall_assessment:
    "CBT for insomnia is well-studied in Western adults but lacks evidence for elderly and LMIC populations.",
  boolean_search_string:
    '("cognitive behavioral therapy"[MeSH Terms] OR "CBT"[tiab]) AND ("insomnia"[MeSH Terms] OR "sleep disorder"[tiab])',
};

const baseStudyDesign: StudyDesignRecommendation = {
  primary: "Systematic Review with Meta-Analysis",
  rationale: "Sufficient RCTs exist for meta-analysis.",
  steps: ["Search databases", "Screen titles", "Extract data"],
  example_paper: { citation: "Smith et al. 2021", url: "https://example.com" },
  alternatives: [],
  methodology_links: [],
};

const basePico = {
  population: "Adults with chronic insomnia",
  intervention: "Cognitive behavioral therapy",
  comparison: "Waitlist or placebo",
  outcome: "Sleep quality (PSQI, ISI)",
};

function makeInput(overrides: Partial<ProtocolInput> = {}): ProtocolInput {
  return {
    query: "CBT for insomnia",
    gapAnalysis: baseGapAnalysis,
    studyDesign: null,
    pico: null,
    booleanSearchString: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* buildProtocolPrompt                                                  */
/* ------------------------------------------------------------------ */

describe("buildProtocolPrompt", () => {
  it("returns a non-empty string", () => {
    const result = buildProtocolPrompt(makeInput());
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(200);
  });

  it("includes the search query in the prompt", () => {
    const result = buildProtocolPrompt(makeInput({ query: "mindfulness in chronic pain" }));
    expect(result).toContain("mindfulness in chronic pain");
  });

  it("uses the high-feasibility topic as the primary focus", () => {
    const result = buildProtocolPrompt(makeInput());
    expect(result).toContain("CBT for insomnia in adults over 65");
  });

  it("falls back to moderate-feasibility topic when no high-feasibility topic exists", () => {
    const analysisNoHigh: GapAnalysis = {
      ...baseGapAnalysis,
      suggested_topics: [{ ...baseGapAnalysis.suggested_topics[1] }], // moderate only
    };
    const result = buildProtocolPrompt(makeInput({ gapAnalysis: analysisNoHigh }));
    expect(result).toContain("CBT for insomnia in low-income settings");
  });

  it("includes PICO elements when provided", () => {
    const result = buildProtocolPrompt(makeInput({ pico: basePico }));
    expect(result).toContain("Adults with chronic insomnia");
    expect(result).toContain("Cognitive behavioral therapy");
    expect(result).toContain("Sleep quality (PSQI, ISI)");
  });

  it("does not include a PICO section when pico is null", () => {
    const result = buildProtocolPrompt(makeInput({ pico: null }));
    expect(result).not.toContain("Population:");
  });

  it("includes the boolean search string when provided", () => {
    const boolStr = '("CBT"[tiab]) AND ("insomnia"[MeSH Terms])';
    const result = buildProtocolPrompt(makeInput({ booleanSearchString: boolStr }));
    expect(result).toContain(boolStr);
  });

  it("does not include a boolean string section when booleanSearchString is null", () => {
    const result = buildProtocolPrompt(makeInput({ booleanSearchString: null }));
    expect(result).not.toContain("DRAFT BOOLEAN SEARCH STRING");
  });

  it("includes the study design recommendation when provided", () => {
    const result = buildProtocolPrompt(makeInput({ studyDesign: baseStudyDesign }));
    expect(result).toContain("Systematic Review with Meta-Analysis");
    expect(result).toContain("Sufficient RCTs exist for meta-analysis");
  });

  it("does not include a study design section when studyDesign is null", () => {
    const result = buildProtocolPrompt(makeInput({ studyDesign: null }));
    expect(result).not.toContain("RECOMMENDED REVIEW TYPE");
  });

  it("includes the overall assessment in the prompt", () => {
    const result = buildProtocolPrompt(makeInput());
    expect(result).toContain("CBT for insomnia is well-studied in Western adults");
  });

  it("includes gap descriptions and importance labels", () => {
    const result = buildProtocolPrompt(makeInput());
    expect(result).toContain("Elderly patients understudied");
    expect(result).toContain("[HIGH]");
  });

  it("requests the required protocol sections", () => {
    const result = buildProtocolPrompt(makeInput());
    expect(result).toContain("## 1. Background and Rationale");
    expect(result).toContain("## 3. Eligibility Criteria");
    expect(result).toContain("## 4. Information Sources and Search Strategy");
    expect(result).toContain("## 8. Next Steps Checklist");
  });

  it("does not throw when suggested_topics is empty", () => {
    const emptyTopics: GapAnalysis = { ...baseGapAnalysis, suggested_topics: [] };
    expect(() => buildProtocolPrompt(makeInput({ gapAnalysis: emptyTopics }))).not.toThrow();
  });

  it("includes a date stamp in the prompt footer", () => {
    const result = buildProtocolPrompt(makeInput());
    expect(result).toContain(new Date().getFullYear().toString());
  });

  it("handles partial PICO (population + outcome only)", () => {
    const partialPico = {
      population: "Children with ADHD",
      intervention: null,
      comparison: undefined,
      outcome: "Academic performance",
    };
    const result = buildProtocolPrompt(makeInput({ pico: partialPico }));
    expect(result).toContain("Children with ADHD");
    expect(result).toContain("Academic performance");
    expect(result).not.toContain("Intervention: null");
  });

  it("lists all suggested topics (up to 4)", () => {
    const manyTopics: GapAnalysis = {
      ...baseGapAnalysis,
      suggested_topics: [
        ...baseGapAnalysis.suggested_topics,
        {
          title: "CBT-I in adolescents",
          gap_type: "population",
          pubmed_query: "CBT insomnia adolescents",
          estimated_studies: 30,
          rationale: "No reviews cover teens.",
          feasibility: "low",
          expected_outcomes: "Efficacy in younger population.",
        },
      ],
    };
    const result = buildProtocolPrompt(makeInput({ gapAnalysis: manyTopics }));
    expect(result).toContain("CBT for insomnia in adults over 65");
    expect(result).toContain("CBT for insomnia in low-income settings");
    expect(result).toContain("CBT-I in adolescents");
  });

  it("does not mutate the input object", () => {
    const input = makeInput();
    const topicsBefore = input.gapAnalysis.suggested_topics.length;
    buildProtocolPrompt(input);
    expect(input.gapAnalysis.suggested_topics.length).toBe(topicsBefore);
  });
});
