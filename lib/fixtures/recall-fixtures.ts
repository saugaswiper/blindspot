/**
 * Gold-standard fixtures for the search recall benchmark (lib/recall-benchmark.ts).
 *
 * A real fixture is a published systematic review whose included studies are
 * openly listed (the truth set), paired with what each Blindspot source
 * returned for that review's query. Real fixtures are captured offline with
 * scripts/capture-recall-fixture.ts and committed here so the benchmark is
 * deterministic and runnable in CI without network access.
 *
 * ⚠ INTEGRITY RULE: every record below is either (a) marked `synthetic: true`
 * and used only to validate the harness math, or (b) real recorded data with a
 * citation in `description`. Never paste invented PMIDs/DOIs as a real truth
 * set — that would make the recall numbers fiction.
 *
 * `REAL_RECALL_FIXTURES` is intentionally empty until real reviews are
 * captured; see spec handoff and the capture script for how to populate it.
 */

import type { RecallFixture } from "@/lib/recall-benchmark";

/**
 * Synthetic fixture — NOT a measured result. Exists solely to prove the recall
 * engine computes per-source and union recall correctly, including:
 *   - PMID-only matching (PubMed has no DOIs)
 *   - DOI matching across URL-prefixed and bare forms
 *   - the union recovering studies no single source has
 *   - a study in the truth set that NO source returned (a true miss)
 *
 * Truth set = 5 studies (T1..T5). Coverage by design:
 *   T1: PubMed + OpenAlex      T2: OpenAlex only (bare DOI vs URL DOI)
 *   T3: Scopus only            T4: PubMed only (PMID)
 *   T5: missed by every source (the irreducible miss)
 * Union should recover T1..T4 = 4/5 = 80%; best single source (PubMed or
 * OpenAlex) = 2/5 = 40%; union margin = +40 pts.
 */
export const SYNTHETIC_RECALL_FIXTURE: RecallFixture = {
  name: "synthetic-harness-selftest",
  description: "Synthetic data to validate the recall engine — not a real review.",
  synthetic: true,
  truthSet: [
    { pmid: "1001", doi: "10.1000/t1" },
    { pmid: "1002", doi: "10.1000/t2" },
    { pmid: "1003", doi: "10.1000/t3" },
    { pmid: "1004" },
    { pmid: "1005", doi: "10.1000/t5" },
  ],
  perSource: {
    PubMed: [{ pmid: "1001" }, { pmid: "1004" }, { pmid: "9999" }],
    // OpenAlex returns URL-prefixed DOIs; T1 also (dedup via DOI), T2 via DOI only.
    OpenAlex: [
      { doi: "https://doi.org/10.1000/T1" },
      { doi: "https://doi.org/10.1000/t2" },
    ],
    Scopus: [{ doi: "10.1000/t3" }, { pmid: "8888" }],
  },
  mergeOrder: ["PubMed", "OpenAlex", "Scopus"],
};

/**
 * Real captured fixtures. EMPTY until populated via the capture script with
 * published SRs (PMIDs/DOIs of their includes + recorded source responses).
 * The benchmark aggregate over these is what proves the ≥95% recall claim.
 */
export const REAL_RECALL_FIXTURES: RecallFixture[] = [];

export const ALL_RECALL_FIXTURES: RecallFixture[] = [
  SYNTHETIC_RECALL_FIXTURE,
  ...REAL_RECALL_FIXTURES,
];
