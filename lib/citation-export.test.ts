import { describe, it, expect } from "vitest";
import { toRis, toBibtex, buildBibKey } from "./citation-export";
import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const fullReview: ExistingReview = {
  title: "Cognitive Behavioural Therapy for Insomnia: A Systematic Review",
  year: 2023,
  journal: "Sleep Medicine Reviews",
  abstract_snippet: "Background: CBT-I is effective for chronic insomnia…",
  pmid: "36543210",
  doi: "10.1016/j.smrv.2023.101234",
  source: "PubMed",
};

const minimalReview: ExistingReview = {
  title: "Minimal Review",
  year: 0,
  journal: "",
  abstract_snippet: "",
};

const doiWithPrefix: ExistingReview = {
  title: "DOI Prefix Test Review",
  year: 2022,
  journal: "Test Journal",
  abstract_snippet: "",
  doi: "https://doi.org/10.9999/test.001",
};

const reviewWithSpecialChars: ExistingReview = {
  title: 'Effects of "Omega-3" & Fish {Oil} on Cardiovascular Health: A {Review}',
  year: 2021,
  journal: "Nutrition & Metabolism",
  abstract_snippet: "Abstract with special chars: <> & {}",
  source: "OpenAlex",
};

// ---------------------------------------------------------------------------
// toRis — general shape
// ---------------------------------------------------------------------------

describe("toRis", () => {
  it("returns empty string for empty array", () => {
    expect(toRis([])).toBe("");
  });

  it("produces a record starting with TY  - JOUR", () => {
    const ris = toRis([fullReview]);
    expect(ris.startsWith("TY  - JOUR")).toBe(true);
  });

  it("ends each record with ER  - ", () => {
    const ris = toRis([fullReview]);
    // ER line has a trailing space ("ER  - "); trimEnd() removes it, so check without trimEnd
    expect(ris.endsWith("ER  - ")).toBe(true);
  });

  it("includes the title field", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("TI  - Cognitive Behavioural Therapy for Insomnia");
  });

  it("includes journal in JO and JF fields", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("JO  - Sleep Medicine Reviews");
    expect(ris).toContain("JF  - Sleep Medicine Reviews");
  });

  it("includes year in PY field", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("PY  - 2023");
  });

  it("strips https://doi.org/ prefix from DOI field", () => {
    const ris = toRis([doiWithPrefix]);
    expect(ris).toContain("DO  - 10.9999/test.001");
    expect(ris).not.toContain("DO  - https://doi.org/");
  });

  it("emits raw DOI as UR when DOI is present without prefix", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("UR  - https://doi.org/10.1016/j.smrv.2023.101234");
  });

  it("falls back to PubMed UR when no DOI but PMID exists", () => {
    const noDoi: ExistingReview = { ...fullReview, doi: undefined };
    const ris = toRis([noDoi]);
    expect(ris).toContain("UR  - https://pubmed.ncbi.nlm.nih.gov/36543210/");
  });

  it("includes AN field with PMID annotation", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("AN  - PMID:36543210");
  });

  it("includes abstract in AB field", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("AB  - Background: CBT-I is effective");
  });

  it("includes source in DB field", () => {
    const ris = toRis([fullReview]);
    expect(ris).toContain("DB  - PubMed");
  });

  it("handles a review with no optional fields (no crash)", () => {
    const ris = toRis([minimalReview]);
    expect(ris).toContain("TY  - JOUR");
    expect(ris).toContain("TI  - Minimal Review");
    // ER line has trailing space ("ER  - "); do not trimEnd before checking
    expect(ris.endsWith("ER  - ")).toBe(true);
  });

  it("separates multiple records with a blank line", () => {
    const ris = toRis([fullReview, minimalReview]);
    // Two records → one double-newline separator between them
    expect(ris).toContain("ER  - \r\n\r\nTY  - JOUR");
  });

  it("produces correct record count for 3 reviews", () => {
    const ris = toRis([fullReview, minimalReview, doiWithPrefix]);
    const count = (ris.match(/^TY  - JOUR/gm) ?? []).length;
    expect(count).toBe(3);
  });

  it("replaces newlines in field values to avoid broken RIS", () => {
    const multilineReview: ExistingReview = {
      ...fullReview,
      abstract_snippet: "Line one.\nLine two.\r\nLine three.",
    };
    const ris = toRis([multilineReview]);
    // No raw newline should appear inside the AB field value
    const abMatch = ris.match(/AB  - (.+)/);
    expect(abMatch).not.toBeNull();
    // The matched value (to end of line) should not contain embedded newlines
    expect(abMatch![1]).not.toMatch(/[\r\n]/);
  });
});

// ---------------------------------------------------------------------------
// toBibtex — general shape
// ---------------------------------------------------------------------------

describe("toBibtex", () => {
  it("returns empty string for empty array", () => {
    expect(toBibtex([])).toBe("");
  });

  it("produces a @article entry", () => {
    const bib = toBibtex([fullReview]);
    expect(bib).toMatch(/^@article\{/);
  });

  it("includes title field", () => {
    const bib = toBibtex([fullReview]);
    expect(bib).toContain("Cognitive Behavioural Therapy for Insomnia");
  });

  it("includes journal field", () => {
    const bib = toBibtex([fullReview]);
    expect(bib).toContain("Sleep Medicine Reviews");
  });

  it("includes year field", () => {
    const bib = toBibtex([fullReview]);
    expect(bib).toContain("year      = {2023}");
  });

  it("strips https://doi.org/ prefix from doi field", () => {
    const bib = toBibtex([doiWithPrefix]);
    expect(bib).toContain("doi       = {10.9999/test.001}");
    expect(bib).not.toContain("https://doi.org/");
  });

  it("includes PMID in note field when present", () => {
    const bib = toBibtex([fullReview]);
    expect(bib).toContain("PubMed ID: 36543210");
  });

  it("escapes curly braces in title", () => {
    const bib = toBibtex([reviewWithSpecialChars]);
    // The original { } chars should be escaped with backslash
    expect(bib).toContain("\\{Oil\\}");
    expect(bib).toContain("\\{Review\\}");
  });

  it("handles a review with no optional fields (no crash)", () => {
    const bib = toBibtex([minimalReview]);
    expect(bib).toContain("@article{");
    expect(bib).toContain("Minimal Review");
  });

  it("separates multiple entries with blank lines", () => {
    const bib = toBibtex([fullReview, minimalReview]);
    expect(bib).toContain("}\n\n@article{");
  });

  it("produces correct entry count for 3 reviews", () => {
    const bib = toBibtex([fullReview, minimalReview, doiWithPrefix]);
    const count = (bib.match(/@article\{/g) ?? []).length;
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// buildBibKey
// ---------------------------------------------------------------------------

describe("buildBibKey", () => {
  it("uses first word of title and year", () => {
    const key = buildBibKey(fullReview, 0);
    expect(key).toMatch(/^cognitive.*_2023$/);
  });

  it("lowercases the key", () => {
    const key = buildBibKey(fullReview, 0);
    expect(key).toBe(key.toLowerCase());
  });

  it("replaces non-alphanumeric chars with underscores", () => {
    const key = buildBibKey(reviewWithSpecialChars, 0);
    expect(key).not.toMatch(/["&{}<>]/);
  });

  it("falls back to review_<index> when title is empty", () => {
    const noTitle: ExistingReview = { ...minimalReview, title: "" };
    const key = buildBibKey(noTitle, 3);
    expect(key).toMatch(/^review_3/);
  });

  it("uses 'nd' for year when year is falsy (0)", () => {
    const key = buildBibKey(minimalReview, 0);
    expect(key.endsWith("_nd")).toBe(true);
  });

  it("truncates long titles to prevent excessively long keys", () => {
    const longTitle: ExistingReview = {
      ...fullReview,
      title: "a".repeat(100),
    };
    const key = buildBibKey(longTitle, 0);
    // The title portion should be at most 30 chars + underscore + year
    expect(key.length).toBeLessThanOrEqual(35);
  });
});
