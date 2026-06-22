/**
 * spec/validation/002-harness.mjs
 * Validation harness for handoff 102 — OA resolution chain (lib/fulltext.ts)
 *
 * Tests AC1 (≥70% resolution rate) and AC2 (p95 ≤ 3 s) against a live-network
 * gold set of 20 PMC-indexed systematic reviews.
 *
 * Gold set provenance:
 *   PubMed esearch, filter: pmc free full text[filter] AND systematic review[pt]
 *   AND 2024:2025[dp], retrieved 2026-06-22, first 20 with DOIs selected.
 *   PMC deposition = verified open-access (NCBI policy requires OA for PMC deposit).
 *
 * Usage:  node spec/validation/002-harness.mjs
 * No API keys required (Unpaywall/Europe PMC/PMC are all keyless).
 */

// ---------------------------------------------------------------------------
// Gold set — 20 PMC-linked SRs with DOIs (truth: NCBI PMC OA filter, 2026-06-22)
// ---------------------------------------------------------------------------
const GOLD_SET = [
  { pmid: "42256478", doi: "10.15167/2421-4248/jpmh2025.66.4.3461", pmcid: "PMC13235388" },
  { pmid: "41641246", doi: "10.3389/fmed.2025.1732129",               pmcid: "PMC12865719" },
  { pmid: "41640684", doi: "10.3389/fphar.2025.1731397",              pmcid: "PMC12864444" },
  { pmid: "41458387", doi: "10.46989/001c.154588",                    pmcid: "PMC12742321" },
  { pmid: "41444887", doi: "10.1186/s12911-025-03326-8",              pmcid: "PMC12849454" },
  { pmid: "41204169", doi: "10.1186/s12906-025-05139-8",              pmcid: "PMC12595913" },
  { pmid: "41172929", doi: "10.1016/j.jpsychires.2025.10.063",        pmcid: null },
  { pmid: "41148593", doi: "10.31557/APJCP.2025.26.10.3561",          pmcid: "PMC12887904" },
  { pmid: "41088058", doi: "10.1186/s12885-025-15068-x",              pmcid: "PMC12523103" },
  { pmid: "41069963", doi: "10.3389/fnagi.2025.1598608",              pmcid: "PMC12504467" },
  { pmid: "41010989", doi: "10.3390/medicina61091596",                pmcid: "PMC12471333" },
  { pmid: "41008589", doi: "10.3390/biom15091282",                    pmcid: "PMC12467331" },
  { pmid: "40976496", doi: "10.1016/j.bone.2025.117636",              pmcid: null },
  { pmid: "40951465", doi: "10.52225/narra.v5i2.2268",                pmcid: "PMC12425541" },
  { pmid: "40850887", doi: "10.1016/j.clinthera.2025.07.006",         pmcid: null },
  { pmid: "40849686", doi: "10.31557/APJCP.2025.26.8.2699",           pmcid: "PMC12659866" },
  { pmid: "40812100", doi: "10.1016/j.semarthrit.2025.152805",        pmcid: null },
  { pmid: "40781547", doi: "10.1038/s41432-025-01182-z",              pmcid: "PMC12716998" },
  { pmid: "40678664", doi: "10.3138/canlivj-2024-0050",               pmcid: "PMC12269252" },
  { pmid: "40668786", doi: "10.1371/journal.pone.0325563",            pmcid: "PMC12266414" },
];

const EMAIL = "research@blindspot.app";
const EUROPEPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const PMC_IDCONV    = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/";
const PMC_ARTICLE_BASE = "https://www.ncbi.nlm.nih.gov/pmc/articles";

function normalizeDoi(doi) {
  if (!doi) return null;
  return doi.toLowerCase().trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}

// ---------------------------------------------------------------------------
// Source functions (mirrors lib/fulltext.ts logic exactly, no Next.js deps)
// ---------------------------------------------------------------------------

async function tryUnpaywall(doi) {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(EMAIL)}`;
  const res = await fetch(url);
  if (!res.ok) return { result: null, paywalled: false, status: res.status };
  const data = await res.json();
  if (!data.is_oa || data.oa_status === "closed" || !data.best_oa_location) {
    return { result: null, paywalled: true, status: res.status };
  }
  const loc = data.best_oa_location;
  const pdf = loc.url_for_pdf ?? null;
  const target = pdf ?? loc.url ?? null;
  if (!target) return { result: null, paywalled: false, status: res.status };
  return {
    result: {
      url: target,
      source: "unpaywall",
      oa_status: data.oa_status,
      content_type: pdf ? "pdf" : "html",
    },
    paywalled: false,
    status: res.status,
  };
}

async function tryOpenAlex(doi) {
  // Keyless (no OPENALEX_API_KEY in this context) — uses polite pool
  const url = `https://api.openalex.org/works/doi:${doi}?mailto=${encodeURIComponent(EMAIL)}`;
  const res = await fetch(url);
  if (!res.ok) return { result: null, paywalled: false, status: res.status };
  const data = await res.json();
  const oa = data.open_access;
  if (!oa?.is_oa || oa.oa_status === "closed" || !oa.oa_url) {
    return { result: null, paywalled: oa ? !oa.is_oa : false, status: res.status };
  }
  return {
    result: {
      url: oa.oa_url,
      source: "openalex",
      oa_status: oa.oa_status,
      content_type: /\.pdf($|[?#])/i.test(oa.oa_url) ? "pdf" : "html",
    },
    paywalled: false,
    status: res.status,
  };
}

async function tryEuropePMC(pmid) {
  const url = `${EUROPEPMC_BASE}/MED/${encodeURIComponent(pmid)}/fullTextXML`;
  const res = await fetch(url);
  if (!res.ok) return { result: null, paywalled: false, status: res.status };
  return {
    result: { url, source: "europepmc", oa_status: "green", content_type: "html" },
    paywalled: false,
    status: res.status,
  };
}

async function tryPmc(pmid) {
  const u = new URL(PMC_IDCONV);
  u.searchParams.set("ids", pmid);
  u.searchParams.set("format", "json");
  u.searchParams.set("tool", "blindspot-tester");
  u.searchParams.set("email", EMAIL);
  const res = await fetch(u.toString());
  if (!res.ok) return { result: null, paywalled: false, status: res.status };
  const data = await res.json();
  const pmcid = data.records?.find(r => r.pmcid)?.pmcid;
  if (!pmcid) return { result: null, paywalled: false, status: res.status };
  return {
    result: {
      url: `${PMC_ARTICLE_BASE}/${pmcid}/pdf/`,
      source: "pmc",
      oa_status: "green",
      content_type: "pdf",
    },
    paywalled: false,
    status: res.status,
  };
}

// Mirrors resolveFulltext orchestrator from lib/fulltext.ts
async function resolveFulltext(doiInput, pmidInput) {
  const doi = normalizeDoi(doiInput);
  const pmid = pmidInput ? String(pmidInput).trim() : null;
  if (!doi && !pmid) return { result: null, reason: "all_sources_failed", sourceAttempts: [] };

  let paywalled = false;
  let errored = false;
  const sourceAttempts = [];

  const chain = [
    ...(doi  ? [["unpaywall", () => tryUnpaywall(doi)],
                ["openalex",  () => tryOpenAlex(doi)]] : []),
    ...(pmid ? [["europepmc", () => tryEuropePMC(pmid)],
                ["pmc",       () => tryPmc(pmid)]] : []),
  ];

  for (const [name, run] of chain) {
    try {
      const outcome = await run();
      sourceAttempts.push({ source: name, status: outcome.status ?? null, found: !!outcome.result, paywalled: outcome.paywalled });
      if (outcome.result) {
        // backstop gate
        if (outcome.result.oa_status !== "closed") {
          return { result: outcome.result, reason: null, sourceAttempts };
        }
        paywalled = true;
      }
      if (outcome.paywalled) paywalled = true;
    } catch (e) {
      errored = true;
      sourceAttempts.push({ source: name, status: null, found: false, paywalled: false, error: e.message });
    }
  }

  const reason = paywalled ? "paywalled" : errored ? "source_error" : "all_sources_failed";
  return { result: null, reason, sourceAttempts };
}

// ---------------------------------------------------------------------------
// Run validation
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[002-harness] Running OA resolution validation — ${GOLD_SET.length} studies`);
  console.log(`[002-harness] Date: ${new Date().toISOString()}`);
  console.log("");

  const results = [];
  const latencies = [];

  for (const study of GOLD_SET) {
    const t0 = Date.now();
    let resolution;
    try {
      resolution = await resolveFulltext(study.doi, study.pmid);
    } catch (e) {
      resolution = { result: null, reason: "harness_error", sourceAttempts: [], error: e.message };
    }
    const ms = Date.now() - t0;
    latencies.push(ms);

    const row = {
      pmid: study.pmid,
      doi: study.doi,
      pmcid: study.pmcid,
      resolved: !!resolution.result,
      source: resolution.result?.source ?? null,
      oa_status: resolution.result?.oa_status ?? null,
      reason: resolution.reason,
      ms,
      sourceAttempts: resolution.sourceAttempts,
    };
    results.push(row);

    const marker = row.resolved ? "✓" : "✗";
    console.log(`${marker} pmid:${study.pmid} doi:${study.doi.slice(0, 30)}... → ${row.source ?? row.reason} (${ms}ms)`);
  }

  // Aggregate
  const resolved = results.filter(r => r.resolved).length;
  const total = results.length;
  const rate = (resolved / total) * 100;

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(total * 0.5)];
  const p95 = latencies[Math.floor(total * 0.95)];
  const p100 = latencies[total - 1];

  // Per-source breakdown
  const sourceCount = {};
  for (const r of results) {
    if (r.source) sourceCount[r.source] = (sourceCount[r.source] || 0) + 1;
  }

  // Reason breakdown for failures
  const failReasons = {};
  for (const r of results.filter(r => !r.resolved)) {
    failReasons[r.reason] = (failReasons[r.reason] || 0) + 1;
  }

  // PMC-confirmed OA vs non-PMC breakdown
  const pmcStudies = results.filter(r => r.pmcid);
  const nonPmcStudies = results.filter(r => !r.pmcid);
  const pmcResolved = pmcStudies.filter(r => r.resolved).length;
  const nonPmcResolved = nonPmcStudies.filter(r => r.resolved).length;

  console.log("\n=== SUMMARY ===");
  console.log(`Resolution rate:  ${resolved}/${total}  (${rate.toFixed(1)}%)  [AC1 bar: ≥70%]`);
  console.log(`AC1 verdict:      ${rate >= 70 ? "PASS" : "FAIL"}`);
  console.log(`Latency p50:      ${p50}ms`);
  console.log(`Latency p95:      ${p95}ms  [AC2 bar: ≤3000ms]`);
  console.log(`Latency p100:     ${p100}ms`);
  console.log(`AC2 verdict:      ${p95 <= 3000 ? "PASS" : "FAIL"}`);
  console.log(`Per-source wins:  ${JSON.stringify(sourceCount)}`);
  console.log(`Fail reasons:     ${JSON.stringify(failReasons)}`);
  console.log(`PMC-confirmed OA studies resolved:     ${pmcResolved}/${pmcStudies.length}`);
  console.log(`Non-PMC (gold/hybrid OA) studies:      ${nonPmcResolved}/${nonPmcStudies.length}`);

  console.log("\n=== PER-STUDY DETAIL ===");
  for (const r of results) {
    const attempts = r.sourceAttempts.map(a => `${a.source}:${a.found ? "hit" : (a.error ? "err" : "miss")}`).join(" → ");
    console.log(`pmid:${r.pmid}  pmcid:${r.pmcid ?? "none"}  resolved:${r.resolved}  source:${r.source ?? r.reason}  ${r.ms}ms  [${attempts}]`);
  }

  // Machine-readable JSON for report
  const report = { resolved, total, rate, p50, p95, p100, sourceCount, failReasons, pmcResolved, pmcTotal: pmcStudies.length, nonPmcResolved, nonPmcTotal: nonPmcStudies.length, results };
  process.stdout.write("\n=== JSON (for report) ===\n");
  process.stdout.write(JSON.stringify(report, null, 2));
  process.stdout.write("\n");
}

main().catch(e => { console.error("Harness error:", e); process.exit(1); });
