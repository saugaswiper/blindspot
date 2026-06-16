import { describe, it, expect } from "vitest";
import {
  recall,
  runRecallBenchmark,
  aggregateRecall,
  formatBenchmarkReport,
  RECALL_TARGET,
  type RecallFixture,
} from "@/lib/recall-benchmark";
import { SYNTHETIC_RECALL_FIXTURE, REAL_RECALL_FIXTURES } from "@/lib/fixtures/recall-fixtures";

describe("recall", () => {
  it("counts a study as found when a source shares its PMID or DOI", () => {
    const score = recall(
      "src",
      [{ pmid: "1", doi: "10.1/a" }, { pmid: "2" }],
      [{ doi: "https://doi.org/10.1/A" }], // matches study 1 via DOI
    );
    expect(score.found).toBe(1);
    expect(score.total).toBe(2);
    expect(score.recall).toBe(0.5);
    expect(score.missed).toEqual([{ pmid: "2" }]);
  });

  it("is 0 recall for an empty source", () => {
    expect(recall("src", [{ pmid: "1" }], []).recall).toBe(0);
  });

  it("is 0 recall (not NaN) for an empty truth set", () => {
    expect(recall("src", [], [{ pmid: "1" }]).recall).toBe(0);
  });
});

describe("runRecallBenchmark — synthetic self-test fixture", () => {
  const result = runRecallBenchmark(SYNTHETIC_RECALL_FIXTURE);

  it("flags the result as synthetic (never a measured claim)", () => {
    expect(result.synthetic).toBe(true);
  });

  it("computes the union over the deduplicated combination of sources", () => {
    // T1..T4 recoverable; T5 missed by everyone → 4/5.
    expect(result.union.found).toBe(4);
    expect(result.union.total).toBe(5);
    expect(result.union.recall).toBeCloseTo(0.8, 5);
  });

  it("reports the irreducible miss in union.missed", () => {
    expect(result.union.missed).toEqual([{ pmid: "1005", doi: "10.1000/t5" }]);
  });

  it("identifies the best single source (40%) and the union margin (+40pts)", () => {
    expect(result.bestSingleSource.recall).toBeCloseTo(0.4, 5);
    expect(result.unionMargin).toBeCloseTo(0.4, 5);
    expect(result.beatsBestSource).toBe(true);
  });

  it("does not meet the 95% target on synthetic data (by design)", () => {
    expect(result.meetsTarget).toBe(false);
  });

  it("credits PubMed with the PMID-only matches (T1, T4)", () => {
    const pubmed = result.perSource.find((s) => s.label === "PubMed")!;
    expect(pubmed.found).toBe(2);
  });

  it("credits OpenAlex via DOI matching across URL/case variants (T1, T2)", () => {
    const oa = result.perSource.find((s) => s.label === "OpenAlex")!;
    expect(oa.found).toBe(2);
  });
});

describe("aggregateRecall", () => {
  it("micro-averages union recall across fixtures", () => {
    const fa: RecallFixture = {
      name: "a", description: "", synthetic: true,
      truthSet: [{ pmid: "1" }, { pmid: "2" }],
      perSource: { S: [{ pmid: "1" }] },
    };
    const fb: RecallFixture = {
      name: "b", description: "", synthetic: true,
      truthSet: [{ pmid: "3" }, { pmid: "4" }],
      perSource: { S: [{ pmid: "3" }, { pmid: "4" }] },
    };
    const agg = aggregateRecall([runRecallBenchmark(fa), runRecallBenchmark(fb)]);
    expect(agg.totalStudies).toBe(4);
    expect(agg.unionFound).toBe(3); // 1 + 2
    expect(agg.unionRecall).toBeCloseTo(0.75, 5);
    expect(agg.meetsTarget).toBe(false);
  });

  it("meetsTarget true when micro-average clears the bar", () => {
    const perfect: RecallFixture = {
      name: "p", description: "", synthetic: true,
      truthSet: [{ pmid: "1" }],
      perSource: { S: [{ pmid: "1" }] },
    };
    const agg = aggregateRecall([runRecallBenchmark(perfect)]);
    expect(agg.unionRecall).toBe(1);
    expect(agg.meetsTarget).toBe(true);
    expect(RECALL_TARGET).toBe(0.95);
  });
});

describe("formatBenchmarkReport", () => {
  it("labels synthetic results so they can't be mistaken for measured recall", () => {
    const report = formatBenchmarkReport(runRecallBenchmark(SYNTHETIC_RECALL_FIXTURE));
    expect(report).toContain("SYNTHETIC");
    expect(report).toContain("Deduplicated union");
  });
});

describe("fixture registry integrity", () => {
  it("ships no unverified 'real' fixtures (real recall numbers require captured data)", () => {
    // Guards against someone pasting invented PMIDs as a real truth set.
    expect(REAL_RECALL_FIXTURES).toEqual([]);
  });
});
