import { describe, it, expect } from "vitest";
import { SCREENING_FEED_EXCLUSIONS, screeningFeedTerm } from "@/lib/pubmed";

describe("screening feed term (brief 012)", () => {
  it("wraps the query and appends the exclusions", () => {
    expect(screeningFeedTerm("insomnia AND cbt")).toBe(`(insomnia AND cbt)${SCREENING_FEED_EXCLUSIONS}`);
  });

  it("never uses AND NOT", () => {
    expect(screeningFeedTerm("x")).not.toMatch(/AND NOT/);
  });

  it("excludes systematic, meta-analysis, NMA and review types", () => {
    const t = screeningFeedTerm("x");
    for (const f of ["NOT systematic[sb]", 'NOT "meta-analysis"[pt]', 'NOT "network meta-analysis"[pt]', "NOT review[pt]"]) {
      expect(t).toContain(f);
    }
  });
});
