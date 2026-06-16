/**
 * Search recall benchmark harness.
 *
 * Implements acceptance criterion #1 of the Search Recall & Provenance
 * Benchmark milestone: turn "our search is better" into a reproducible,
 * numbers-backed result.
 *
 * Method (Bramer et al. 2017): take a set of published systematic reviews
 * whose included studies are openly listed. Those PRISMA-reported includes are
 * the GOLD-STANDARD TRUTH SET. For each review, record what each database
 * returned for the review's query, then measure:
 *   - per-source recall (fraction of the truth set that source recovered)
 *   - UNION recall over the deduplicated combination of all sources
 *   - the margin by which the union beats the best single source
 *
 * This module is pure and deterministic: it computes recall from fixtures
 * (recorded source results), never by calling a live API. Fixture capture is a
 * separate, network-bound step (see scripts/capture-recall-fixture.ts) so the
 * benchmark itself runs offline and in CI.
 *
 * Matching uses the SAME identifier semantics as production dedup
 * (lib/study-id.ts) — a study counts as "found" if a source returned a record
 * sharing its PMID or normalized DOI.
 */

import { StudyIdIndex, dedupeStudyIds, type StudyId } from "@/lib/study-id";

/** A published systematic review used as a recall gold standard. */
export interface RecallFixture {
  /** Short identifier, e.g. "smith-2021-cbt-insomnia". */
  name: string;
  /** Human-readable description / citation of the source review. */
  description: string;
  /**
   * Whether the truth set and per-source records are real recorded data or
   * synthetic data used only to validate the harness math. Synthetic fixtures
   * MUST set this to true so reports never present made-up recall as measured.
   */
  synthetic?: boolean;
  /** The review's PRISMA-reported included studies (the truth set). */
  truthSet: StudyId[];
  /**
   * What each source returned for this review's query, keyed by source name
   * (e.g. "PubMed", "OpenAlex", "Europe PMC", "Scopus", "Semantic Scholar").
   */
  perSource: Record<string, StudyId[]>;
  /**
   * Merge order for the deduplicated union. Defaults to Object.keys(perSource).
   * Order only affects which source is credited for a shared record, not the
   * union recall total.
   */
  mergeOrder?: string[];
}

/** Recall for a single source (or the union) against a truth set. */
export interface RecallScore {
  label: string;
  /** Truth-set studies this source/union recovered. */
  found: number;
  /** Total studies in the truth set. */
  total: number;
  /** found / total, in [0, 1]. */
  recall: number;
  /** Truth-set studies NOT recovered — the actionable misses. */
  missed: StudyId[];
}

/** Evidence-based recall targets (Bramer et al. 2017). */
export const RECALL_TARGET = 0.95;
export const RECALL_ASPIRATION = 0.98;
/** Minimum margin by which the union should beat the best single source. */
export const UNION_MARGIN_TARGET = 0.05;

export interface BenchmarkResult {
  fixtureName: string;
  synthetic: boolean;
  perSource: RecallScore[];
  union: RecallScore;
  /** The single best-performing source (highest recall). */
  bestSingleSource: RecallScore;
  /** union.recall - bestSingleSource.recall. */
  unionMargin: number;
  /** union.recall >= RECALL_TARGET. */
  meetsTarget: boolean;
  /** union.recall >= RECALL_ASPIRATION. */
  meetsAspiration: boolean;
  /** unionMargin >= UNION_MARGIN_TARGET. */
  beatsBestSource: boolean;
}

/**
 * Recall of a set of found records against a truth set, matching by PMID or
 * normalized DOI.
 */
export function recall(label: string, truthSet: StudyId[], found: StudyId[]): RecallScore {
  const index = new StudyIdIndex(found);
  const missed: StudyId[] = [];
  let foundCount = 0;
  for (const study of truthSet) {
    if (index.has(study)) foundCount++;
    else missed.push(study);
  }
  const total = truthSet.length;
  return {
    label,
    found: foundCount,
    total,
    recall: total === 0 ? 0 : foundCount / total,
    missed,
  };
}

/** Run the full recall benchmark for one gold-standard fixture. */
export function runRecallBenchmark(fixture: RecallFixture): BenchmarkResult {
  const order = fixture.mergeOrder ?? Object.keys(fixture.perSource);

  const perSource = order.map((source) =>
    recall(source, fixture.truthSet, fixture.perSource[source] ?? []),
  );

  // Union = deduplicated combination of every source's records, then recall.
  const merged = dedupeStudyIds(order.map((source) => fixture.perSource[source] ?? []));
  const union = recall("Deduplicated union", fixture.truthSet, merged.unique);

  // Best single source by recall (ties broken by first in merge order).
  const bestSingleSource = perSource.reduce(
    (best, s) => (s.recall > best.recall ? s : best),
    perSource[0] ?? union,
  );

  const unionMargin = union.recall - bestSingleSource.recall;

  return {
    fixtureName: fixture.name,
    synthetic: fixture.synthetic ?? false,
    perSource,
    union,
    bestSingleSource,
    unionMargin,
    meetsTarget: union.recall >= RECALL_TARGET,
    meetsAspiration: union.recall >= RECALL_ASPIRATION,
    beatsBestSource: unionMargin >= UNION_MARGIN_TARGET,
  };
}

/** Aggregate recall across multiple fixtures (micro-average over all truth-set studies). */
export interface AggregateRecall {
  /** Number of (non-synthetic) fixtures aggregated. */
  fixtureCount: number;
  /** Total truth-set studies across all fixtures. */
  totalStudies: number;
  /** Union studies found across all fixtures. */
  unionFound: number;
  /** Micro-averaged union recall. */
  unionRecall: number;
  meetsTarget: boolean;
}

export function aggregateRecall(results: BenchmarkResult[]): AggregateRecall {
  let totalStudies = 0;
  let unionFound = 0;
  for (const r of results) {
    totalStudies += r.union.total;
    unionFound += r.union.found;
  }
  const unionRecall = totalStudies === 0 ? 0 : unionFound / totalStudies;
  return {
    fixtureCount: results.length,
    totalStudies,
    unionFound,
    unionRecall,
    meetsTarget: unionRecall >= RECALL_TARGET,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Render a benchmark result as a plain-text report (for handoffs / CI logs). */
export function formatBenchmarkReport(result: BenchmarkResult): string {
  const lines: string[] = [];
  lines.push(`Recall benchmark — ${result.fixtureName}${result.synthetic ? " [SYNTHETIC — not a measured result]" : ""}`);
  lines.push("");
  for (const s of [...result.perSource].sort((a, b) => b.recall - a.recall)) {
    lines.push(`  ${s.label.padEnd(20)} ${pct(s.recall).padStart(7)}  (${s.found}/${s.total})`);
  }
  lines.push(`  ${"—".repeat(38)}`);
  lines.push(`  ${result.union.label.padEnd(20)} ${pct(result.union.recall).padStart(7)}  (${result.union.found}/${result.union.total})`);
  lines.push("");
  lines.push(`  Best single source: ${result.bestSingleSource.label} (${pct(result.bestSingleSource.recall)})`);
  lines.push(`  Union margin over best: +${pct(result.unionMargin)} ${result.beatsBestSource ? "✓" : "✗ (target +5.0%)"}`);
  lines.push(`  Meets ${pct(RECALL_TARGET)} target: ${result.meetsTarget ? "✓" : "✗"}`);
  lines.push(`  Meets ${pct(RECALL_ASPIRATION)} aspiration: ${result.meetsAspiration ? "✓" : "✗"}`);
  return lines.join("\n");
}
