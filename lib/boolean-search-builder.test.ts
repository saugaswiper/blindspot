import { describe, it, expect } from "vitest";
import {
  generateBooleanSearchStrings,
  formatBooleanSearchForCopy,
  validateBooleanQuery,
} from "./boolean-search-builder";

describe("generateBooleanSearchStrings", () => {
  it("generates Boolean search strings from a simple query", () => {
    const result = generateBooleanSearchStrings("depression treatment");
    
    expect(result).toHaveProperty("pubmed");
    expect(result).toHaveProperty("embase");
    expect(result).toHaveProperty("central");
    expect(result.pubmed).toContain("depression");
    expect(result.pubmed).toContain("treatment");
  });

  it("excludes systematic reviews and meta-analyses from PubMed query", () => {
    const result = generateBooleanSearchStrings("anxiety");
    
    expect(result.pubmed).toContain("NOT");
    expect(result.pubmed).toContain("systematic");
    expect(result.pubmed).toContain("meta-analysis");
  });

  it("handles empty PICO elements gracefully", () => {
    const result = generateBooleanSearchStrings("insomnia", {});
    
    expect(result.pubmed).toBeTruthy();
    expect(result.notes).toContain(
      "Generated from your search query. Add/refine MeSH terms and adjust operators as needed."
    );
  });

  it("generates PICO-based query when all PICO elements provided", () => {
    const result = generateBooleanSearchStrings("review topic", {
      population: "elderly patients",
      intervention: "cognitive behavioral therapy",
      comparison: "standard treatment",
      outcome: "sleep quality",
    });
    
    expect(result.pubmed).toContain("elderly");
    expect(result.pubmed).toContain("cognitive");
    expect(result.pubmed).toContain("standard");
    expect(result.pubmed).toContain("sleep");
    expect(result.notes).toContain("Generated from PICO elements");
  });

  it("handles partial PICO elements", () => {
    const result = generateBooleanSearchStrings("query", {
      population: "children",
      intervention: "vaccine",
    });
    
    expect(result.pubmed).toContain("children");
    expect(result.pubmed).toContain("vaccine");
    expect(result.pubmed).not.toMatch(/comparison/i);
  });

  it("generates a valid PubMed URL for the search", () => {
    const result = generateBooleanSearchStrings("diabetes management");
    
    expect(result.pubmedUrl).toContain("https://pubmed.ncbi.nlm.nih.gov/");
    expect(result.pubmedUrl).toContain("term=");
  });

  it("provides different queries for different databases", () => {
    const result = generateBooleanSearchStrings("pain control");
    
    expect(result.pubmed).not.toEqual(result.embase);
    expect(result.embase).not.toEqual(result.central);
    expect(result.central).not.toEqual(result.pubmed);
  });

  it("includes helpful notes in the output", () => {
    const result = generateBooleanSearchStrings("test query");
    
    expect(result.notes).toBeInstanceOf(Array);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.notes[0]).toContain("generated");
  });

  it("quotes multi-word phrases in the query", () => {
    const result = generateBooleanSearchStrings("cognitive behavioral therapy");
    
    expect(result.pubmed).toContain('"');
  });

  it("handles special characters in input gracefully", () => {
    const result = generateBooleanSearchStrings("asthma & COPD");
    
    expect(result.pubmed).toBeTruthy();
    expect(result.embase).toBeTruthy();
  });

  it("handles very long queries", () => {
    const longQuery = "systematic review of randomized controlled trials on cognitive behavioral therapy for treatment-resistant depression in elderly patients with comorbid anxiety disorders";
    const result = generateBooleanSearchStrings(longQuery);
    
    expect(result.pubmed).toBeTruthy();
    expect(result.pubmed.length).toBeGreaterThan(0);
  });
});

describe("formatBooleanSearchForCopy", () => {
  const mockSearches = {
    pubmed: "depression AND treatment",
    embase: "depression AND therapy",
    central: "depression AND therapy NOT review",
    pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/?term=test",
    notes: ["Test note 1", "Test note 2"],
  };

  it("formats as plain text by default", () => {
    const result = formatBooleanSearchForCopy(mockSearches);
    
    expect(result).toContain("PubMed:");
    expect(result).toContain("depression AND treatment");
    expect(result).not.toContain("```");
  });

  it("formats as markdown when requested", () => {
    const result = formatBooleanSearchForCopy(mockSearches, "markdown");
    
    expect(result).toContain("## PubMed");
    expect(result).toContain("```");
    expect(result).toContain("depression AND treatment");
  });

  it("includes notes in both formats", () => {
    const plainResult = formatBooleanSearchForCopy(mockSearches, "plain");
    const markdownResult = formatBooleanSearchForCopy(mockSearches, "markdown");
    
    expect(plainResult).toContain("Test note 1");
    expect(markdownResult).toContain("Test note 1");
  });

  it("includes all database variants", () => {
    const result = formatBooleanSearchForCopy(mockSearches);
    
    expect(result).toContain("PubMed:");
    expect(result).toContain("Embase:");
    expect(result).toContain("Cochrane CENTRAL:");
  });
});

describe("validateBooleanQuery", () => {
  it("returns valid for a well-formed query", () => {
    const result = validateBooleanQuery("depression AND treatment NOT anxiety");
    
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  it("detects unmatched parentheses", () => {
    const result = validateBooleanQuery("(depression AND treatment");
    
    expect(result.valid).toBe(false);
    expect(result.warnings.some(w => w.includes("parentheses"))).toBe(true);
  });

  it("detects consecutive operators", () => {
    const result = validateBooleanQuery("depression AND OR treatment");
    
    expect(result.valid).toBe(false);
    expect(result.warnings.some(w => w.includes("Consecutive"))).toBe(true);
  });

  it("suggests quoting multi-word phrases", () => {
    const result = validateBooleanQuery("cognitive behavioral therapy AND depression");
    
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes("quoting"))).toBe(true);
  });

  it("accepts properly quoted multi-word phrases", () => {
    const result = validateBooleanQuery('"cognitive behavioral therapy" AND depression');
    
    // Should not warn about unquoted multi-word phrases
    expect(result.warnings.some(w => w.includes("unquoted"))).toBe(false);
  });

  it("handles empty input", () => {
    const result = validateBooleanQuery("");
    
    expect(result.valid).toBe(true);
  });

  it("handles queries with field tags", () => {
    const result = validateBooleanQuery('depression[MeSH Terms] AND "cognitive therapy"[tiab]');
    
    expect(result.valid).toBe(true);
  });
});
