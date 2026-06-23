/**
 * spec/validation/003-harness.mjs
 * Validation harness for handoff 103 — concurrent DOI fanout (lib/fulltext.ts)
 *
 * Mirrors the CONCURRENT orchestrator shipped in handoff 103.
 * The previous harness (002-harness.mjs) was a sequential mirror and could not
 * measure the effect of the fanout fix — see handoff 103 §"Validation harness note".
 *
 * Tests:
 *   AC1 (≥70% resolution rate) — unchanged gold set from validation 002
 *   AC2 (p95 ≤ 3 s, concurrent) — the key new measure: does the fanout hold?
 *
 * Gold set provenance: same as 002 (PubMed PMC free full text filter, 2026-06-22).
 *
 * Usage:  node spec/validation/003-harness.mjs
 * No API keys required.
 */

// ---------------------------------------------------------------------------
// Gold set — same 20 PMC-linked SRs used in validation 002
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

function isPdfUrl(url) {
  return /\.pdf($|[?#])/i.test(url);
}

function gate(result) {
  return result.oa_status === "closed" ? null : result;
}

// ---------------------------------------------------------------------------
// Source functions — mirrors lib/fulltext.ts source functions exactly
// ---------------------------------------------------------------------------

async function tryUnpaywall(doi) {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(EMAIL)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return { result: null, paywalled: false, httpStatus: res.status };
    throw new Error(`Unpaywall failed: ${res.status}`);
  }
  const data = await res.json();
  const oa_status = data.oa_status ?? "closed";
  const loc = data.best_oa_location;
  if (!data.is_oa || oa_status === "closed" || !loc) {
    return { result: null, paywalled: true, httpStatus: res.status };
  }
  const pdf = loc.url_for_pdf ?? null;
  const target = pdf ?? loc.url ?? null;
  if (!target) return { result: null, paywalled: false, httpStatus: res.status };
  return {
    result: { url: target, source: "unpaywall", oa_status, content_type: pdf ? "pdf" : "html" },
    paywalled: false,
    httpStatus: res.status,
  };
}

async function tryOpenAlex(doi) {
  // Keyless — uses polite pool via mailto (matches lib/fulltext.ts when no OPENALEX_API_KEY)
  const url = `https://api.openalex.org/works/doi:${doi}?mailto=${encodeURIComponent(EMAIL)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { result: null, paywalled: false, httpStatus: res.status };
    }
    throw new Error(`OpenAlex failed: ${res.status}`);
  }
  const data = await res.json();
  const oa = data.open_access;
  const oa_status = oa?.oa_status ?? "closed";
  if (!oa?.is_oa || oa_status === "closed" || !oa.oa_url) {
    return { result: null, paywalled: oa ? !oa.is_oa : false, httpStatus: res.status };
  }
  return {
    result: {
      url: oa.oa_url,
      source: "openalex",
      oa_status,
      content_type: isPdfUrl(oa.oa_url) ? "pdf" : "html",
    },
    paywalled: false,
    httpStatus: res.status,
  };
}

async function tryEuropePMC(pmid) {
  const url = `${EUROPEPMC_BASE}/MED/${encodeURIComponent(pmid)}/fullTextXML`;
  const res = await fetch(url);
  if (!res.ok) return { result: null, paywalled: false, httpStatus: res.status };
  return {
    result: { url, source: "europepmc", oa_status: "green", content_type: "html" },
    paywalled: false,
    httpStatus: res.status,
  };
}

async function tryPmc(pmid) {
  const u = new URL(PMC_IDCONV);
  u.searchParams.set("ids", pmid);
  u.searchParams.set("format", "json");
  u.searchParams.set("tool", "blindspot-tester");
  u.searchParams.set("email", EMAIL);
  const res = await fetch(u.toString());
  if (!res.ok) return { result: null, paywalled: false, httpStatus: res.status };
  const data = await res.json();
  const pmcid = data.records?.find(r => r.pmcid)?.pmcid;
  if (!pmcid) return { result: null, paywalled: false, httpStatus: res.status };
  return {
    result: {
      url: `${PMC_ARTICLE_BASE}/${pmcid}/pdf/`,
      source: "pmc",
      oa_status: "green",
      content_type: "pdf",
    },
    paywalled: false,
    httpStatus: res.status,
  };
}

// ---------------------------------------------------------------------------
// Concurrent fanout — mirrors lib/fulltext.ts:fanout() exactly
// ---------------------------------------------------------------------------

function fanout(calls) {
  return new Promise((resolve) => {
    let paywalled = false;
    let errored = false;
    let remaining = calls.length;
    let done = false;
    const sourceLog = [];

    if (remaining === 0) {
      resolve({ result: null, paywalled, errored, sourceLog });
      return;
    }

    const settle = () => {
      remaining -= 1;
      if (!done && remaining === 0) {
        done = true;
        resolve({ result: null, paywalled, errored, sourceLog });
      }
    };

    for (const { name, call } of calls) {
      call.then(
        (outcome) => {
          sourceLog.push({ source: name, found: !!outcome.result, paywalled: outcome.paywalled, httpStatus: outcome.httpStatus ?? null });
          if (done) return;
          if (outcome.result) {
            const gated = gate(outcome.result);
            if (gated) {
              done = true;
              resolve({ result: gated, paywalled, errored, sourceLog });
              return;
            }
            paywalled = true;
          }
          if (outcome.paywalled) paywalled = true;
        },
        (err) => {
          sourceLog.push({ source: name, found: false, error: err.message });
          if (!done) errored = true;
        },
      ).finally(settle);
    }
  });
}

// ---------------------------------------------------------------------------
// Orchestrator — mirrors lib/fulltext.ts:resolveFulltext() concurrent design
// ---------------------------------------------------------------------------

async function resolveFulltext(doiInput, pmidInput) {
  const doi = normalizeDoi(doiInput);
  const pmid = pmidInput ? String(pmidInput).trim() : null;
  if (!doi && !pmid) return { result: null, reason: "all_sources_failed", sourceLog: [] };

  let paywalled = false;
  let errored = false;
  const allSourceLog = [];

  // DOI tier: concurrent fanout (Unpaywall ∥ OpenAlex), first OA hit wins.
  if (doi) {
    const out = await fanout([
      { name: "unpaywall", call: tryUnpaywall(doi) },
      { name: "openalex",  call: tryOpenAlex(doi)  },
    ]);
    allSourceLog.push(...out.sourceLog);
    if (out.result) return { result: out.result, reason: null, sourceLog: allSourceLog };
    paywalled = paywalled || out.paywalled;
    errored   = errored   || out.errored;
  }

  // PMID tier: sequential fallbacks (same as lib/fulltext.ts).
  if (pmid) {
    const fallbacks = [
      { name: "europepmc", run: () => tryEuropePMC(pmid) },
      { name: "pmc",       run: () => tryPmc(pmid) },
    ];
    for (const { name, run } of fallbacks) {
      try {
        const outcome = await run();
        allSourceLog.push({ source: name, found: !!outcome.result, paywalled: outcome.paywalled, httpStatus: outcome.httpStatus ?? null });
        if (outcome.result) {
          const gated = gate(outcome.result);
          if (gated) return { result: gated, reason: null, sourceLog: allSourceLog };
          paywalled = true;
        }
        if (outcome.paywalled) paywalled = true;
      } catch (e) {
        allSourceLog.push({ source: name, found: false, error: e.message });
        errored = true;
      }
    }
  }

  const reason = paywalled ? "paywalled" : errored ? "source_error" : "all_sources_failed";
  return { result: null, reason, sourceLog: allSourceLog };
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  // Same formula as validation 002: Math.floor(n * p)
  return sorted[Math.floor(sorted.length * p)];
}

// ---------------------------------------------------------------------------
// Run validation
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[003-harness] Concurrent DOI fanout — OA resolution validation`);
  console.log(`[003-harness] Gold set: ${GOLD_SET.length} PMC-indexed SRs (same as validation 002)`);
  console.log(`[003-harness] Date: ${new Date().toISOString()}`);
  console.log(`[003-harness] Harness: mirrors lib/fulltext.ts concurrent fanout (handoff 103)`);
  console.log("");

  const results = [];
  const latencies = [];

  for (const study of GOLD_SET) {
    const t0 = Date.now();
    let resolution;
    try {
      resolution = await resolveFulltext(study.doi, study.pmid);
    } catch (e) {
      resolution = { result: null, reason: "harness_error", sourceLog: [], error: e.message };
    }
    const ms = Date.now() - t0;
    latencies.push(ms);

    const row = {
      pmid: study.pmid,
      doi:  study.doi,
      pmcid: study.pmcid,
      resolved: !!resolution.result,
      source:   resolution.result?.source ?? null,
      oa_status: resolution.result?.oa_status ?? null,
      reason:   resolution.reason,
      ms,
      sourceLog: resolution.sourceLog,
    };
    results.push(row);

    const marker = row.resolved ? "✓" : "✗";
    const sources = row.sourceLog.map(s => `${s.source}:${s.found ? "hit" : (s.error ? "err" : "miss")}`).join(" ∥→ ");
    console.log(`${marker} pmid:${study.pmid}  → ${row.source ?? row.reason}  (${ms}ms)  [${sources}]`);
  }

  // Aggregate
  const resolved  = results.filter(r => r.resolved).length;
  const total     = results.length;
  const rate      = (resolved / total) * 100;

  const sortedMs = [...latencies].sort((a, b) => a - b);
  const p50  = percentile(sortedMs, 0.50);
  const p75  = percentile(sortedMs, 0.75);
  const p95  = percentile(sortedMs, 0.95);
  const p100 = sortedMs[sortedMs.length - 1];

  const sourceCount = {};
  for (const r of results) {
    if (r.source) sourceCount[r.source] = (sourceCount[r.source] || 0) + 1;
  }

  const failReasons = {};
  for (const r of results.filter(r => !r.resolved)) {
    failReasons[r.reason] = (failReasons[r.reason] || 0) + 1;
  }

  const pmcStudies    = results.filter(r =>  r.pmcid);
  const nonPmcStudies = results.filter(r => !r.pmcid);
  const pmcResolved    = pmcStudies.filter(r => r.resolved).length;
  const nonPmcResolved = nonPmcStudies.filter(r => r.resolved).length;

  // Who wins the race?
  const fanoutWins = { unpaywall_first: 0, openalex_first: 0 };
  for (const r of results.filter(r => r.resolved && (r.source === "unpaywall" || r.source === "openalex"))) {
    if (r.source === "unpaywall") fanoutWins.unpaywall_first++;
    else fanoutWins.openalex_first++;
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Resolution rate:  ${resolved}/${total}  (${rate.toFixed(1)}%)  [AC1 bar: ≥70%]`);
  console.log(`AC1 verdict:      ${rate >= 70 ? "PASS" : "FAIL"}`);
  console.log(`Latency p50:      ${p50}ms`);
  console.log(`Latency p75:      ${p75}ms`);
  console.log(`Latency p95:      ${p95}ms  [AC2 bar: ≤3000ms]`);
  console.log(`Latency p100:     ${p100}ms`);
  console.log(`AC2 verdict:      ${p95 <= 3000 ? "PASS" : "FAIL"}`);
  console.log(`Per-source wins:  ${JSON.stringify(sourceCount)}`);
  console.log(`Fanout race:      unpaywall first=${fanoutWins.unpaywall_first}  openalex first=${fanoutWins.openalex_first}`);
  console.log(`Fail reasons:     ${JSON.stringify(failReasons)}`);
  console.log(`PMC-confirmed OA resolved:  ${pmcResolved}/${pmcStudies.length}`);
  console.log(`Non-PMC (OA via Unpaywall): ${nonPmcResolved}/${nonPmcStudies.length}`);

  console.log("\n=== ALL LATENCIES (sorted, ms) ===");
  console.log(sortedMs.join(", "));

  const report = {
    harness: "003",
    date: new Date().toISOString(),
    resolved, total, rate,
    p50, p75, p95, p100,
    sortedLatencies: sortedMs,
    sourceCount, fanoutWins, failReasons,
    pmcResolved, pmcTotal: pmcStudies.length,
    nonPmcResolved, nonPmcTotal: nonPmcStudies.length,
    results,
  };
  process.stdout.write("\n=== JSON (for report) ===\n");
  process.stdout.write(JSON.stringify(report, null, 2));
  process.stdout.write("\n");
}

main().catch(e => { console.error("Harness error:", e); process.exit(1); });
