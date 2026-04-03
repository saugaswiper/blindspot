import { describe, it, expect } from "vitest";
import {
  deriveReviewTitle,
  buildRationale,
  buildResearchQuestion,
  buildOutcomes,
  buildStudyDesigns,
  buildDataSources,
  generateProsperoRegistration,
  formatProsperoAsText,
  type ProsperoRegistration,
} from "./prospero-export";
import type { GapAnalysis, StudyDesignRecommendation } from "@/types";

describe("prospero-export", () => {
  describe("deriveReviewTitle", () => {
    it("uses suggested topic title if available", () => {
      const gapAnalysis: GapAnalysis = {
        gaps: [],
        overall_assessment: "Good opportunity",
        suggested_topics: [
          {
            title: "Cognitive Behavioral Therapy for Insomnia in Elderly Patients",
            gap_type: "population" as const,
            pubmed_query: "CBT insomnia elderly",
            estimated_studies: 100,
            rationale: "High demand",
            feasibility: "high" as const,
            expected_outcomes: "Good outcomes",
          },
        ],
        boolean_search_string: "test",
      };
      const title = deriveReviewTitle("insomnia elderly", gapAnalysis);
      expect(title).toBe(
        "Cognitive Behavioral Therapy for Insomnia in Elderly Patients"
      );
    });

    it("falls back to query-derived title when no gap analysis", () => {
      const title = deriveReviewTitle("depression treatment", null);
      expect(title).toBe("Systematic Review: depression treatment");
    });

    it("prioritizes high-feasibility topics", () => {
      const gapAnalysis: GapAnalysis = {
        gaps: [],
        overall_assessment: "Good opportunity",
        suggested_topics: [
          {
            title: "Moderate Topic",
            gap_type: "population" as const,
            pubmed_query: "test",
            estimated_studies: 50,
            rationale: "Medium demand",
            feasibility: "moderate" as const,
            expected_outcomes: "Moderate",
          },
          {
            title: "High Feasibility Topic",
            gap_type: "population" as const,
            pubmed_query: "test",
            estimated_studies: 200,
            rationale: "High demand",
            feasibility: "high" as const,
            expected_outcomes: "Strong",
          },
        ],
        boolean_search_string: "test",
      };
      const title = deriveReviewTitle("test", gapAnalysis);
      expect(title).toBe("High Feasibility Topic");
    });
  });

  describe("buildRationale", () => {
    it("generates rationale from gap analysis", () => {
      const gapAnalysis: GapAnalysis = {
        gaps: [
          {
            dimension: "population" as const,
            description: "Limited evidence in pediatric populations",
            importance: "high" as const,
          },
          {
            dimension: "outcome" as const,
            description: "Few long-term follow-up studies",
            importance: "high" as const,
          },
          {
            dimension: "geographic" as const,
            description: "Limited evidence outside North America",
            importance: "low" as const,
          },
        ],
        overall_assessment: "Good opportunity",
        suggested_topics: [],
        boolean_search_string: "test",
      };
      const rationale = buildRationale("insomnia", gapAnalysis);
      expect(rationale).toContain("insomnia");
      expect(rationale).toContain("3 evidence gaps");
      expect(rationale).toContain("2 high-priority gaps");
      expect(rationale).toContain(
        "Limited evidence in pediatric populations"
      );
    });

    it("handles null gap analysis gracefully", () => {
      const rationale = buildRationale("depression", null);
      expect(rationale).toBe(
        "This systematic review will synthesize the evidence on depression."
      );
    });
  });

  describe("buildResearchQuestion", () => {
    it("builds PICO-structured research question", () => {
      const pico = {
        population: "elderly patients",
        intervention: "cognitive behavioral therapy",
        comparison: "standard care",
        outcome: "sleep quality",
      };
      const question = buildResearchQuestion("insomnia", pico);
      expect(question).toContain("In elderly patients");
      expect(question).toContain("does cognitive behavioral therapy");
      expect(question).toContain("compared to standard care");
      expect(question).toContain("improve sleep quality?");
    });

    it("handles partial PICO elements", () => {
      const pico = {
        population: "adults",
        intervention: "exercise",
        comparison: null,
        outcome: "anxiety",
      };
      const question = buildResearchQuestion("anxiety", pico);
      expect(question).toContain("In adults");
      expect(question).toContain("does exercise");
      expect(question).not.toContain("compared to");
      expect(question).toContain("improve anxiety?");
    });

    it("falls back to simple question when no PICO", () => {
      const question = buildResearchQuestion("insomnia", undefined);
      expect(question).toBe("What is the evidence on insomnia?");
    });
  });

  describe("buildOutcomes", () => {
    it("uses PICO outcome when available", () => {
      const pico = { outcome: "Pain reduction" };
      const outcomes = buildOutcomes(null, null, pico);
      expect(outcomes).toContain("Primary: Pain reduction");
    });

    it("extracts outcome gaps from gap analysis", () => {
      const gapAnalysis: GapAnalysis = {
        gaps: [
          {
            dimension: "outcome" as const,
            description: "Missing long-term follow-up",
            importance: "high" as const,
          },
        ],
        overall_assessment: "Opportunity",
        suggested_topics: [],
        boolean_search_string: "test",
      };
      const outcomes = buildOutcomes(gapAnalysis, null);
      expect(outcomes).toContain("Missing long-term follow-up");
    });

    it("provides default when no data available", () => {
      const outcomes = buildOutcomes(null, null);
      expect(outcomes).toBe("To be determined by review protocol");
    });
  });

  describe("buildStudyDesigns", () => {
    it("formats study design with rationale", () => {
      const studyDesign: StudyDesignRecommendation = {
        primary: "Systematic Review with Meta-Analysis" as const,
        rationale: "Highest level of evidence",
        steps: ["Step 1"],
        example_paper: { citation: "Paper et al.", url: "http://example.com" },
        alternatives: [],
        methodology_links: [],
      };
      const designs = buildStudyDesigns(studyDesign);
      expect(designs).toContain("Systematic Review with Meta-Analysis");
      expect(designs).toContain("Highest level of evidence");
    });

    it("provides default when no study design", () => {
      const designs = buildStudyDesigns(null);
      expect(designs).toContain("randomized controlled trials");
    });
  });

  describe("buildDataSources", () => {
    it("includes PubMed search string", () => {
      const sources = buildDataSources("depression AND (CBT OR psychotherapy)");
      expect(sources).toContain("PubMed");
      expect(sources).toContain("depression AND (CBT OR psychotherapy)");
    });

    it("works without search string", () => {
      const sources = buildDataSources(undefined);
      expect(sources).toContain("PubMed");
      expect(sources).toContain("Embase");
    });
  });

  describe("generateProsperoRegistration", () => {
    it("generates complete registration from all inputs", () => {
      const gapAnalysis: GapAnalysis = {
        gaps: [
          {
            dimension: "population" as const,
            description: "Limited evidence",
            importance: "high" as const,
          },
        ],
        overall_assessment: "Opportunity",
        suggested_topics: [
          {
            title: "CBT for Adult Insomnia",
            gap_type: "population" as const,
            pubmed_query: "CBT insomnia adults",
            estimated_studies: 150,
            rationale: "High priority",
            feasibility: "high" as const,
            expected_outcomes: "Good outcomes",
          },
        ],
        boolean_search_string: "test",
      };

      const pico = {
        population: "Adults with insomnia",
        intervention: "Cognitive behavioral therapy",
        comparison: "Standard care",
        outcome: "Sleep quality improvement",
      };

      const studyDesign: StudyDesignRecommendation = {
        primary: "Systematic Review with Meta-Analysis",
        rationale: "High evidence level",
        steps: ["Step 1"],
        example_paper: { citation: "Example", url: "http://example.com" },
        alternatives: [],
        methodology_links: [],
      };

      const reg = generateProsperoRegistration(
        "insomnia treatment",
        gapAnalysis,
        studyDesign,
        "Protocol draft",
        pico,
        "insomnia AND (CBT OR cognitive)"
      );

      expect(reg.title).toBe("CBT for Adult Insomnia");
      expect(reg.rationale).toContain("insomnia treatment");
      expect(reg.population).toBe("Adults with insomnia");
      expect(reg.intervention).toBe("Cognitive behavioral therapy");
      expect(reg.pubmedSearchString).toBe("insomnia AND (CBT OR cognitive)");
    });
  });

  describe("formatProsperoAsText", () => {
    it("formats registration as readable text", () => {
      const reg: ProsperoRegistration = {
        title: "Test Review",
        rationale: "This review addresses a gap",
        researchQuestion: "What is the evidence?",
        population: "Adults",
        intervention: "Treatment",
        outcomes: "Primary: Recovery",
        studyDesigns: "RCT",
        searchStrategy: "Systematic search",
        dataSources: "PubMed, Embase",
      };

      const text = formatProsperoAsText(reg);
      expect(text).toContain("PROSPERO REGISTRATION DRAFT");
      expect(text).toContain("Test Review");
      expect(text).toContain("This review addresses a gap");
      expect(text).toContain("Adults");
      expect(text).toContain("NEXT STEPS");
      expect(text).toContain("https://www.crd.york.ac.uk/prospero/");
    });
  });
});
