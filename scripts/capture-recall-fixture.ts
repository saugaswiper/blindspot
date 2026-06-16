/**
 * Capture a real gold-standard recall fixture for lib/recall-benchmark.ts.
 *
 * Addresses validation finding F2 (spec/validation/001-validation.md): the
 * harness documented this script but it did not exist, leaving criterion #2
 * (measured ≥95% union recall) unmeasurable.
 *
 * What it does: for one published systematic review, query each Blindspot source
 * for the review's search string, record the `{pmid, doi}` records each source
 * returns, and emit a `RecallFixture` whose `perSource` is real recorded data
 * and whose `truthSet` is the review's openly-listed included studies (which YOU
 * supply — never fabricated here).
 *
 * NETWORK + KEYS: hits PubMed/OpenAlex/Europe PMC/Scopus live. Honors the same
 * env vars as the app (OPENALEX_API_KEY, NCBI_API_KEY, ELSEVIER_API_KEY,
 * OPENALEX_EMAIL). A source that errors or lacks a key contributes [] (the
 * fixture records the gap honestly rather than inventing coverage).
 *
 * RUN (tsx resolves the `@/` path alias from tsconfig):
 *   npx tsx scripts/capture-recall-fixture.ts \
 *     --name "smith-2021-cbt-insomnia" \
 *     --description "Smith 2021, CBT for insomnia (PMID 12345678); includes from Table 2" \
 *     --query '"cognitive behavioral therapy" AND "insomnia"' \
 *     --truth-file ./truth.txt   # one PMID or DOI per line (the review's includes)
 *     [--limit 500] [--out lib/fixtures/captured/smith-2021.json]
 *
 * The emitted JSON is a RecallFixture (synthetic:false). Paste it into
 * REAL_RECALL_FIXTURES (or import the file) and relax the empty-registry guard
 * in lib/recall-benchmark.test.ts, then the tester can compute real recall.
 */

import { writeFileSync } from "node:fs";
import { fetchPrimaryStudyIds as pubmedIds } from "@/lib/pubmed";
import { fetchPrimaryStudyIds as openalexIds } from "@/lib/openalex";
import { fetchPrimaryStudyIds as europepmcIds } from "@/lib/europepmc";
import { fetchPrimaryStudyIds as scopusIds } from "@/lib/scopus";
import { readFileSync } from "node:fs";
import type { StudyId } from "@/lib/study-id";
import type { RecallFixture } from "@/lib/recall-benchmark";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Parse a token as a PMID (all digits) or a DOI (contains "/"). */
function parseTruthToken(token: string): StudyId | null {
  const t = token.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return { pmid: t };
  if (t.includes("/")) return { doi: t };
  return null; // unrecognized — skip rather than guess
}

const SOURCES: Array<{ name: string; fn: (q: string, minYear?: number, limit?: number) => Promise<StudyId[]> }> = [
  { name: "PubMed", fn: pubmedIds },
  { name: "OpenAlex", fn: openalexIds },
  { name: "Europe PMC", fn: europepmcIds },
  { name: "Scopus", fn: scopusIds },
];

async function main(): Promise<void> {
  const name = arg("--name");
  const description = arg("--description");
  const query = arg("--query");
  const truthFile = arg("--truth-file");
  const limit = Number(arg("--limit") ?? "500");
  const out = arg("--out");

  if (!name || !description || !query || !truthFile) {
    console.error("Missing required args. See the header of this file for usage.");
    process.exit(1);
    return;
  }

  const truthSet = readFileSync(truthFile, "utf8")
    .split(/\r?\n/)
    .map(parseTruthToken)
    .filter((x): x is StudyId => x !== null);

  if (truthSet.length === 0) {
    console.error(`No valid PMIDs/DOIs parsed from ${truthFile}.`);
    process.exit(1);
    return;
  }

  const perSource: Record<string, StudyId[]> = {};
  for (const { name: src, fn } of SOURCES) {
    try {
      const ids = await fn(query, undefined, limit);
      perSource[src] = ids;
      console.error(`  ${src.padEnd(12)} ${ids.length} records`);
    } catch (e) {
      perSource[src] = [];
      console.error(`  ${src.padEnd(12)} ERROR (${(e as Error).message}) — recorded as 0`);
    }
  }

  const fixture: RecallFixture = {
    name,
    description,
    synthetic: false,
    truthSet,
    perSource,
    mergeOrder: SOURCES.map((s) => s.name),
  };

  const json = JSON.stringify(fixture, null, 2);
  if (out) {
    writeFileSync(out, json + "\n");
    console.error(`\nWrote ${out} (${truthSet.length} truth studies).`);
  } else {
    console.log(json);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
