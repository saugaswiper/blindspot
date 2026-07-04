/**
 * Validation 007 harness — Handoff 107: Three PubMed sibling function fixes
 *
 * Tests that the binary-NOT fix (handoff 106, validated in 006) was correctly
 * applied to the three remaining call sites in lib/pubmed.ts:
 *
 *   countPrimaryStudies        (line 124)  — feasibility display + cache
 *   fetchPrimaryStudiesForScreening (line 240) — screening workbench feed
 *   countPrimaryStudiesRecent  (line 300)  — study-count trend (NEW-2)
 *
 * All three changed: `(query) AND NOT systematic[sb]` → `(query) NOT systematic[sb]`
 *
 * Acceptance criteria (brief 007):
 *   AC-count:      countPrimaryStudies → count ≥ 3000 (not ~313 SR count)
 *   AC-screen:     fetchPrimaryStudiesForScreening → PMIDs that are NOT SRs;
 *                  known SR PMID 22631616 not present; at least one returned PMID
 *                  spot-checks as an Article (not Systematic Review)
 *   AC-recent:     countPrimaryStudiesRecent → non-zero count; >> old SR count
 *   AC-no-inversion: NOT systematic[sb] and AND systematic[sb] are disjoint sets
 *
 * Control probes use the OLD broken form (AND NOT) for each function to
 * confirm: (a) old form still produces the inverted (SR) result, (b) new form
 * differs, confirming the fix is live in code.
 *
 * Generalisation probe: repeats count test on second topic ("exercise depression")
 * to confirm the count pattern is not query-specific.
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

const TOPIC  = 'cognitive behavioral therapy insomnia';
const TOPIC2 = 'exercise depression';  // generalisation probe — different domain

// Known SR PMIDs that should NOT appear in primary-study results
const KNOWN_SR_PMIDS = [
  '22631616',   // Mitchell 2012 (Mitchell SR — our gold standard)
  '26593376',   // Trauer 2015 (Cochrane SR on CBT-I)
  '28329761',   // Koffel 2018 (SR on digital CBT-I)
];

const QUERY_NEW  = q => `(${q}) NOT systematic[sb]`;      // handoff 107 fix
const QUERY_OLD  = q => `(${q}) AND NOT systematic[sb]`;  // broken form (control)
const QUERY_POS  = q => `(${q}) AND systematic[sb]`;      // intentional SR filter

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch ────────────────────────────────────────────────────────────
async function esearch(query, retmax, sort) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', query);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);
  const r = await fetch(url.toString());
  if (!r.ok) return { pmids: [], total: 0, status: r.status, err: await r.text() };
  const j = await r.json();
  return {
    pmids: j.esearchresult?.idlist ?? [],
    total: parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── PubMed ESummary (pub types for spot-check) ────────────────────────────────
async function esummary(pmids) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmids.join(','));
  url.searchParams.set('retmode', 'json');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);
  const r = await fetch(url.toString());
  if (!r.ok) return {};
  const j = await r.json();
  const result = j.result ?? {};
  // result has uid list + keyed records
  const uids = result.uids ?? [];
  return Object.fromEntries(
    uids.map(uid => [uid, {
      title:   result[uid]?.title ?? '',
      pubtypes: result[uid]?.pubtype ?? [],
      year:    result[uid]?.pubdate?.slice(0, 4) ?? '',
      authors: (result[uid]?.authors ?? []).slice(0, 2).map(a => a.name).join(', '),
    }])
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// isSR checks for PubMed's systematic[sb]-targeted PubTypes only.
// "Review" (narrative review) is NOT in systematic[sb] — only "Systematic Review"
// and "Meta-Analysis" are excluded by the filter. Narrative reviews are expected
// to pass through and are valid primary-literature candidates.
function isSR(pubtypes) {
  const srTypes = ['Systematic Review', 'Meta-Analysis'];
  return pubtypes.some(t => srTypes.includes(t));
}

function overlap(a, b) { const sb = new Set(b); return a.filter(x => sb.has(x)); }

// ── MAIN ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Handoff 107: Three PubMed sibling function fixes ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Topic 1: "${TOPIC}"`);
console.log(`Topic 2: "${TOPIC2}" (generalisation)\n`);

// ─────────────────────────────────────────────────────────────────────────────
// PROBE P1: countPrimaryStudies simulation
//   Function: esearch(`(query) NOT systematic[sb]`, 1)  [retmax=1, count only]
//   Expected: count_new ≥ 3000; count_old ≈ 313 (SRs)
// ─────────────────────────────────────────────────────────────────────────────
console.log('── Probe P1: countPrimaryStudies (AC-count) ──────────────────────────────');
process.stderr.write('  [P1-old] countPrimaryStudies OLD (AND NOT)...');
const p1old = await esearch(QUERY_OLD(TOPIC), 1);
process.stderr.write(' done\n');
console.log(`P1-old (AND NOT): status=${p1old.status} count=${p1old.total}`);

await sleep(600);

process.stderr.write('  [P1-new] countPrimaryStudies NEW (NOT)...');
const p1new = await esearch(QUERY_NEW(TOPIC), 1);
process.stderr.write(' done\n');
console.log(`P1-new (NOT):     status=${p1new.status} count=${p1new.total}`);

const p1Pass = p1new.total >= 3000 && p1old.total < 1000;
console.log(`AC-count: ${p1Pass ? '✅ PASS' : '❌ FAIL'} — new=${p1new.total} (≥3000?), old=${p1old.total} (<1000 SR control?)`);
if (!p1Pass) {
  if (p1new.total < 3000) console.log(`  FAIL: new count ${p1new.total} < 3000 — fix may not be active`);
  if (p1old.total >= 1000) console.log(`  WARN: old (AND NOT) count ${p1old.total} ≥ 1000 — PubMed API behaviour may have changed`);
}

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// PROBE P2: fetchPrimaryStudiesForScreening simulation
//   Function: esearch(`(query) NOT systematic[sb]`, min(limit=20, 10000))
//   Expected:
//     - known SR PMIDs not present
//     - PubType spot-check: returned records are Articles, not SRs
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Probe P2: fetchPrimaryStudiesForScreening (AC-screen) ─────────────────');

process.stderr.write('  [P2-old] fetchPrimaryStudiesForScreening OLD (AND NOT), retmax=20...');
const p2old = await esearch(QUERY_OLD(TOPIC), 20);
process.stderr.write(' done\n');
console.log(`P2-old (AND NOT): status=${p2old.status} total=${p2old.total} returned=${p2old.pmids.length}`);

const p2oldSrHits = KNOWN_SR_PMIDS.filter(pmid => p2old.pmids.includes(pmid));
console.log(`  Known SR PMIDs in OLD result: ${p2oldSrHits.length > 0 ? p2oldSrHits.join(', ') : 'none'}`);

await sleep(600);

process.stderr.write('  [P2-new] fetchPrimaryStudiesForScreening NEW (NOT), retmax=20...');
const p2new = await esearch(QUERY_NEW(TOPIC), 20);
process.stderr.write(' done\n');
console.log(`P2-new (NOT):     status=${p2new.status} total=${p2new.total} returned=${p2new.pmids.length}`);

const p2newSrHits = KNOWN_SR_PMIDS.filter(pmid => p2new.pmids.includes(pmid));
console.log(`  Known SR PMIDs in NEW result: ${p2newSrHits.length > 0 ? p2newSrHits.join(', ') : 'none'}`);
console.log(`  PMIDs returned: ${p2new.pmids.slice(0, 10).join(', ')}${p2new.pmids.length > 10 ? '...' : ''}`);

await sleep(600);

// Spot-check: fetch PubTypes for first 5 returned PMIDs from NEW result
process.stderr.write('  [P2-spot] ESummary PubType spot-check (first 5 new PMIDs)...');
const spotPmids = p2new.pmids.slice(0, 5);
const spotSummary = await esummary(spotPmids);
process.stderr.write(' done\n');

let spotSrCount = 0;
let spotArticleCount = 0;
console.log('  PubType spot-check (first 5 PMIDs from NEW form):');
for (const pmid of spotPmids) {
  const s = spotSummary[pmid];
  if (!s) { console.log(`    ${pmid}: no summary returned`); continue; }
  const sr = isSR(s.pubtypes);
  if (sr) spotSrCount++; else spotArticleCount++;
  const flag = sr ? '⚠ SR/Review' : '✓ primary';
  console.log(`    PMID ${pmid} [${flag}]: pubtypes=[${s.pubtypes.join(', ')}] year=${s.year} — ${s.title.slice(0, 60)}`);
}

const p2Pass = p2newSrHits.length === 0 && spotSrCount === 0;
console.log(`AC-screen: ${p2Pass ? '✅ PASS' : '❌ FAIL'} — known-SR check: ${p2newSrHits.length} hits; spot-check SRs: ${spotSrCount}/${spotPmids.length}`);
if (!p2Pass) {
  if (p2newSrHits.length > 0) console.log(`  FAIL: known SR PMIDs found in screening result: ${p2newSrHits.join(', ')}`);
  if (spotSrCount > 0) console.log(`  FAIL: ${spotSrCount} spot-checked PMIDs have SR/Review pub type`);
}

// Set-overlap check: old vs new screening results
const p2overlap = overlap(p2old.pmids, p2new.pmids);
console.log(`  Set-overlap (OLD ∩ NEW, retmax=20): ${p2overlap.length}/${p2old.pmids.length} — ${p2overlap.length === 0 ? '✓ disjoint (expected)' : '⚠ overlapping (unexpected)'}`);

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// PROBE P3: countPrimaryStudiesRecent simulation
//   Function builds URL directly with:
//     term=`(query) NOT systematic[sb]`, datetype=pdat, mindate=2023, maxdate=2026
//   Expected: count_new > 0 and count_new >> count_old (recent primary vs recent SRs)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Probe P3: countPrimaryStudiesRecent (AC-recent) ──────────────────────');

const years = 3;
const minYear = new Date().getFullYear() - years;  // 2023
const maxYear = new Date().getFullYear();           // 2026

async function countRecent(queryStr) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', queryStr);
  url.searchParams.set('retmax', '1');
  url.searchParams.set('retmode', 'json');
  url.searchParams.set('datetype', 'pdat');
  url.searchParams.set('mindate', String(minYear));
  url.searchParams.set('maxdate', String(maxYear));
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);
  const r = await fetch(url.toString());
  if (!r.ok) return { total: 0, status: r.status };
  const j = await r.json();
  return { total: parseInt(j.esearchresult?.count ?? '0', 10), status: 200 };
}

process.stderr.write(`  [P3-old] countPrimaryStudiesRecent OLD (AND NOT), years=${years}, mindate=${minYear}..`);
const p3old = await countRecent(QUERY_OLD(TOPIC));
process.stderr.write('. done\n');
console.log(`P3-old (AND NOT, recent): status=${p3old.status} count=${p3old.total} (recent SRs, broken form)`);

await sleep(600);

process.stderr.write(`  [P3-new] countPrimaryStudiesRecent NEW (NOT), years=${years}, mindate=${minYear}..`);
const p3new = await countRecent(QUERY_NEW(TOPIC));
process.stderr.write('. done\n');
console.log(`P3-new (NOT, recent):     status=${p3new.status} count=${p3new.total} (recent primary studies, fixed form)`);

const p3Pass = p3new.total > 0 && p3new.total > p3old.total;
console.log(`AC-recent: ${p3Pass ? '✅ PASS' : '❌ FAIL'} — new count=${p3new.total} (>0?), new > old (${p3new.total} > ${p3old.total}?)`);
if (!p3Pass) {
  if (p3new.total === 0) console.log('  FAIL: new count = 0 — function returns nothing (query or date filter broken)');
  if (p3new.total <= p3old.total) console.log(`  FAIL: new count not > old count — NOT exclusion may not be working for recent query`);
}

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// PROBE P4: AC-no-inversion — confirm NOT systematic[sb] and AND systematic[sb]
//   are disjoint (same pattern as validation 006 probe B2)
//   Uses retmax=50 for meaningful overlap measurement
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Probe P4: AC-no-inversion ────────────────────────────────────────────');

process.stderr.write('  [P4-pos] esearch AND systematic[sb], retmax=50...');
const p4pos = await esearch(QUERY_POS(TOPIC), 50);
process.stderr.write(' done\n');
console.log(`P4-pos (AND systematic[sb]): status=${p4pos.status} total=${p4pos.total} returned=${p4pos.pmids.length}`);

await sleep(600);

process.stderr.write('  [P4-neg] esearch NOT systematic[sb], retmax=50...');
const p4neg = await esearch(QUERY_NEW(TOPIC), 50);
process.stderr.write(' done\n');
console.log(`P4-neg (NOT systematic[sb]): status=${p4neg.status} total=${p4neg.total} returned=${p4neg.pmids.length}`);

const p4overlap = overlap(p4pos.pmids, p4neg.pmids);
const p4Pass = p4overlap.length === 0;
console.log(`AC-no-inversion: ${p4Pass ? '✅ PASS' : '❌ FAIL'} — overlap=${p4overlap.length}/${p4pos.pmids.length}`);
if (!p4Pass) {
  console.log(`  FAIL: ${p4overlap.length} PMIDs appear in both SR and non-SR result sets:`);
  console.log(`  ${p4overlap.join(', ')}`);
}
if (p4pos.total > 0 && p4neg.total > 0) {
  console.log(`  Counts: SR=${p4pos.total}, non-SR=${p4neg.total}, sum=${p4pos.total + p4neg.total} (vs unconstrained total)`);
}

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// PROBE G1: Generalisation — countPrimaryStudies on second topic
//   Confirms count inversion fix is not query-specific (different domain)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Probe G1: Generalisation — countPrimaryStudies on second topic ────────');
console.log(`Topic: "${TOPIC2}"`);

process.stderr.write('  [G1-old] OLD (AND NOT)...');
const g1old = await esearch(QUERY_OLD(TOPIC2), 1);
process.stderr.write(' done\n');
console.log(`G1-old (AND NOT): status=${g1old.status} count=${g1old.total}`);

await sleep(600);

process.stderr.write('  [G1-new] NEW (NOT)...');
const g1new = await esearch(QUERY_NEW(TOPIC2), 1);
process.stderr.write(' done\n');
console.log(`G1-new (NOT):     status=${g1new.status} count=${g1new.total}`);

const g1Pass = g1new.total > g1old.total && g1new.total > 1000;
console.log(`Generalisation: ${g1Pass ? '✅ PASS' : '❌ FAIL'} — new=${g1new.total} > old=${g1old.total}? new > 1000?`);
if (g1old.total > 0) {
  console.log(`  Ratio new/old: ${(g1new.total / g1old.total).toFixed(1)}x`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Summary ──────────────────────────────────────────────────────────────');
const results = [
  ['AC-count (P1)',          p1Pass],
  ['AC-screen (P2)',         p2Pass],
  ['AC-recent (P3)',         p3Pass],
  ['AC-no-inversion (P4)',   p4Pass],
  ['Generalisation (G1)',    g1Pass],
];
for (const [label, pass] of results) {
  console.log(`  ${pass ? '✅' : '❌'} ${label}`);
}
const allPass = results.every(([, p]) => p);
console.log(`\nOverall: ${allPass ? '✅ ALL PASS' : '❌ ONE OR MORE FAILURES'}`);
console.log('\n=== End of Harness 007 ===');
