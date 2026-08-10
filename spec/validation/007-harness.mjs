/**
 * Validation 007 harness — Stage 3: three PubMed sibling-function fixes (handoff 107)
 *
 * Tests handoff 107: three remaining AND NOT → NOT substitutions in lib/pubmed.ts:
 *   Site 1: countPrimaryStudies      (line 124) → AC-count
 *   Site 2: fetchPrimaryStudiesForScreening (line 234) → AC-screen
 *   Site 3: countPrimaryStudiesRecent (line 293) → AC-recent
 *
 * Gold SR: Mitchell et al. 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)
 * "Comparative effectiveness of cognitive behavioral therapy for insomnia"
 * Known SR PMID (sentinel): 22631616 — must NOT appear in primary-study results.
 * Must appear in broken-form (control) results.
 *
 * Mitchell 2012 truth set (carryover from 004/005/006):
 *   16804151  Sivertsen 2006  (JAMA 295:2851)
 *   15451764  Jacobs 2004     (Arch Intern Med 164:1888)
 *   10086433  Morin 1999      (JAMA 281:991)
 *   16785771  Wu 2006         (Psychother Psychosom 75:220)
 *   1888345   McCluskey 1991  (Am J Psychiatry 148:121) — expected miss (RC2)
 *
 * Probes:
 *   S1      — countPrimaryStudies NEW form: count (retmax=1)
 *             AC-count: expect ≥ 3000 (broken form returned ~313)
 *   S1-ctrl — countPrimaryStudies OLD form: AND NOT systematic[sb], count (retmax=1)
 *             Control: expect ~313 (proves baseline unchanged)
 *   S2      — fetchPrimaryStudiesForScreening NEW form: fetch 20 PMIDs
 *             AC-screen: SR sentinel 22631616 must NOT appear; spot-check one as non-SR
 *   S2-ctrl — fetchPrimaryStudiesForScreening OLD form: fetch 20 PMIDs
 *             Control: old form returns SRs; 22631616 expected present
 *   S3      — countPrimaryStudiesRecent NEW form: last 3 years (datetype=pdat)
 *             AC-recent: count must be non-zero and > broken-form count (more primaries than SRs)
 *   S3-ctrl — countPrimaryStudiesRecent OLD form: AND NOT, last 3 years
 *             Control: returns recent SR count (expected << S3 new-form count)
 *   S4      — Disjoint-set diagnostic (mirrors val-006 probe B2)
 *             NOT systematic[sb] vs AND systematic[sb] (retmax=500 each): expect 0 overlap
 *   S5      — esummary spot-check: verify first S2 result is not a systematic review
 *             AC-screen corroboration: PubType must not contain "Systematic Review"
 *   S6      — Mitchell 2012 recall check: re-run probe B from val-006 (NOT, retmax=2000, relevance)
 *             Regression check: 4/5 recall must be preserved after handoff 107
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

const TOPIC     = 'cognitive behavioral therapy insomnia';
const QUERY_NEW = `(${TOPIC}) NOT systematic[sb]`;
const QUERY_OLD = `(${TOPIC}) AND NOT systematic[sb]`;
const QUERY_SRS = `(${TOPIC}) AND systematic[sb]`;

const TRUTH      = ['16804151', '15451764', '10086433', '16785771', '1888345'];
const SR_SENTINEL = '22631616';  // Mitchell 2012 — a known SR; must NOT appear in primary results

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch (count or IDs) ────────────────────────────────────────────
async function esearch(query, retmax, sort) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', query);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { pmids: [], status: r.status, total: 0, err: await r.text() };
  const j = await r.json();
  return {
    pmids: j.esearchresult?.idlist ?? [],
    total: parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── PubMed ESearch with date filter (mirrors countPrimaryStudiesRecent) ────────
async function esearchRecent(query, years) {
  const minYear = new Date().getFullYear() - years;
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', query);
  url.searchParams.set('retmax', '1');
  url.searchParams.set('retmode', 'json');
  url.searchParams.set('datetype', 'pdat');
  url.searchParams.set('mindate', String(minYear));
  url.searchParams.set('maxdate', String(new Date().getFullYear()));
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { count: -1, status: r.status };
  const j = await r.json();
  return { count: parseInt(j.esearchresult?.count ?? '0', 10), status: 200, minYear };
}

// ── PubMed ESummary (PubType spot-check) ──────────────────────────────────────
async function esummary(pmid) {
  const url = new URL(`${BASE}/esummary.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmid);
  url.searchParams.set('retmode', 'json');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { status: r.status };
  const j = await r.json();
  const rec = j.result?.[pmid];
  if (!rec) return { status: 200, found: false };
  return {
    status: 200,
    found: true,
    title: rec.title?.slice(0, 80),
    pubtypes: rec.pubtype ?? [],
    source: rec.fulljournalname,
    year: rec.pubdate?.slice(0, 4),
  };
}

function recall(pmids, truth) {
  const hits = truth.filter(t => pmids.includes(t));
  const missed = truth.filter(t => !pmids.includes(t));
  return { hits: hits.length, missed, recall: hits.length / truth.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log('=== Validation 007 — Stage 3: PubMed Sibling-Function Fix (handoff 107) ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Gold SR:   Mitchell 2012 (PMID ${SR_SENTINEL})`);
console.log(`SR sentinel (must not appear in primary results): ${SR_SENTINEL}`);
console.log(`Truth N=${TRUTH.length}: ${TRUTH.join(', ')}`);
console.log(`NEW query: ${QUERY_NEW}`);
console.log(`OLD query: ${QUERY_OLD}`);
console.log(`SRs query: ${QUERY_SRS}\n`);

// ── Probe S1: countPrimaryStudies NEW form (count only) ───────────────────────
process.stderr.write('  [S1] countPrimaryStudies NEW (count, NOT systematic[sb])...');
const s1 = await esearch(QUERY_NEW, 1);
console.log(`ProbeS1 count-NEW: status=${s1.status} total=${s1.total}`);
const acCount = s1.total >= 3000;
console.log(`  AC-count (≥3000): ${acCount ? '✅ PASS' : '❌ FAIL'} (${s1.total})`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S1-ctrl: countPrimaryStudies OLD form (control) ────────────────────
process.stderr.write('  [S1-ctrl] countPrimaryStudies OLD (AND NOT systematic[sb])...');
const s1ctrl = await esearch(QUERY_OLD, 1);
console.log(`ProbeS1ctrl count-OLD: status=${s1ctrl.status} total=${s1ctrl.total}`);
const s1ctrlExpect = s1ctrl.total > 0 && s1ctrl.total < 600;
console.log(`  Old-form SR count (expect ~313, i.e. <600): ${s1ctrlExpect ? '✅' : '⚠ unexpected'} (${s1ctrl.total})`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S2: fetchPrimaryStudiesForScreening NEW form ────────────────────────
process.stderr.write('  [S2] fetchPrimaryStudiesForScreening NEW (20 IDs, NOT systematic[sb])...');
const s2 = await esearch(QUERY_NEW, 20);
const s2HasSentinel = s2.pmids.includes(SR_SENTINEL);
console.log(`ProbeS2 screen-NEW: status=${s2.status} total=${s2.total} returned=${s2.pmids.length}`);
console.log(`  SR sentinel ${SR_SENTINEL} present: ${s2HasSentinel ? '❌ YES (bad — SR in primary results)' : '✅ NO (SR correctly excluded)'}`);
console.log(`  First 5 PMIDs: ${s2.pmids.slice(0, 5).join(', ')}`);
const acScreen = !s2HasSentinel && s2.pmids.length > 0;
console.log(`  AC-screen (sentinel absent, results non-empty): ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S2-ctrl: fetchPrimaryStudiesForScreening OLD form (control) ─────────
process.stderr.write('  [S2-ctrl] fetchPrimaryStudiesForScreening OLD (AND NOT systematic[sb])...');
const s2ctrl = await esearch(QUERY_OLD, 20);
const s2ctrlHasSentinel = s2ctrl.pmids.includes(SR_SENTINEL);
console.log(`ProbeS2ctrl screen-OLD: status=${s2ctrl.status} total=${s2ctrl.total} returned=${s2ctrl.pmids.length}`);
console.log(`  SR sentinel ${SR_SENTINEL} present: ${s2ctrlHasSentinel ? '✅ YES (expected — old form returns SRs)' : '⚠ NOT FOUND (unexpected for broken form)'}`);
console.log(`  First 5 PMIDs: ${s2ctrl.pmids.slice(0, 5).join(', ')}`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S3: countPrimaryStudiesRecent NEW form ──────────────────────────────
process.stderr.write('  [S3] countPrimaryStudiesRecent NEW (NOT systematic[sb], last 3y)...');
const s3 = await esearchRecent(QUERY_NEW, 3);
console.log(`ProbeS3 recent-NEW: status=${s3.status} count=${s3.count} (minYear=${s3.minYear})`);
const acRecent = s3.count > 0;
console.log(`  AC-recent (non-zero): ${acRecent ? '✅ PASS' : '❌ FAIL'} (${s3.count})`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S3-ctrl: countPrimaryStudiesRecent OLD form (control) ──────────────
process.stderr.write('  [S3-ctrl] countPrimaryStudiesRecent OLD (AND NOT systematic[sb], last 3y)...');
const s3ctrl = await esearchRecent(QUERY_OLD, 3);
console.log(`ProbeS3ctrl recent-OLD: status=${s3ctrl.status} count=${s3ctrl.count} (minYear=${s3ctrl.minYear})`);
const s3NewGtOld = s3.count > s3ctrl.count;
console.log(`  NEW count > OLD count (more primaries than SRs): ${s3NewGtOld ? '✅' : '⚠ unexpected'} (${s3.count} vs ${s3ctrl.count})`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S4: Disjoint-set diagnostic (mirrors val-006 probe B2) ──────────────
process.stderr.write('  [S4] Disjoint-set: NOT systematic[sb] vs AND systematic[sb] (retmax=500)...');
const s4not = await esearch(QUERY_NEW, 500);
await sleep(400);
const s4srs = await esearch(QUERY_SRS, 500);
const s4notSet = new Set(s4not.pmids);
const s4overlap = s4srs.pmids.filter(id => s4notSet.has(id));
console.log(`ProbeS4 disjoint: NOT total=${s4not.total} returned=${s4not.pmids.length}`);
console.log(`         AND-SR  total=${s4srs.total} returned=${s4srs.pmids.length}`);
console.log(`         Overlap: ${s4overlap.length} (expect 0 for correct binary NOT)`);
const acNoInversion = s4overlap.length === 0;
console.log(`  AC-no-inversion (overlap=0): ${acNoInversion ? '✅ PASS' : '❌ FAIL'} (overlap=${s4overlap.length})`);
if (s4overlap.length > 0) console.log(`  Overlapping PMIDs: ${s4overlap.slice(0, 10).join(', ')}`);
// Extra: confirm sentinel in SRs set, absent from NOT set
const sentinelInSRs = s4srs.pmids.includes(SR_SENTINEL);
const sentinelInNot = s4not.pmids.includes(SR_SENTINEL);
console.log(`  Sentinel ${SR_SENTINEL} in SR set: ${sentinelInSRs ? '✅ YES' : 'NO (may be beyond page 500)'}`);
console.log(`  Sentinel ${SR_SENTINEL} in NOT set: ${sentinelInNot ? '❌ YES (bad)' : '✅ NO'}`);
process.stderr.write(' done\n');

await sleep(500);

// ── Probe S5: esummary spot-check on first S2 result ─────────────────────────
const spotPmid = s2.pmids[0];
if (spotPmid) {
  process.stderr.write(`  [S5] esummary spot-check on PMID ${spotPmid}...`);
  const summary = await esummary(spotPmid);
  console.log(`\nProbeS5 esummary PMID ${spotPmid}:`);
  if (summary.found) {
    const isSR = summary.pubtypes.some(t =>
      ['Systematic Review', 'Meta-Analysis', 'Review'].includes(t)
    );
    console.log(`  Title:    ${summary.title}`);
    console.log(`  Year:     ${summary.year}`);
    console.log(`  Source:   ${summary.source}`);
    console.log(`  PubTypes: ${summary.pubtypes.join(', ')}`);
    console.log(`  Is SR/Meta/Review: ${isSR ? '❌ YES (screening workbench would receive SR)' : '✅ NO — primary study'}`);
  } else {
    console.log(`  PMID ${spotPmid} not found in esummary (unexpected)`);
  }
  process.stderr.write(' done\n');
  await sleep(500);
}

// ── Probe S6: Regression — Mitchell 2012 recall (mirrors val-006 probe B) ─────
process.stderr.write('  [S6] Recall regression: NOT systematic[sb], retmax=2000, relevance...');
const s6 = await esearch(QUERY_NEW, 2000, 'relevance');
const s6r = recall(s6.pmids, TRUTH);
console.log(`\nProbeS6 recall-regression: status=${s6.status} total=${s6.total} returned=${s6.pmids.length} hits=${s6r.hits}/${TRUTH.length} recall=${(s6r.recall * 100).toFixed(0)}%`);
if (s6r.missed.length) console.log(`  missed: ${s6r.missed.join(', ')}`);
TRUTH.forEach(t => {
  const idx = s6.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: rank ${idx + 1}/${s6.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${s6.pmids.length} returned`);
});
const acRegression = s6r.hits >= 4;  // val-006 established 4/5 baseline
console.log(`  AC-regression (≥4/5 recall preserved): ${acRegression ? '✅ PASS' : '❌ FAIL'} (${s6r.hits}/5)`);
process.stderr.write(' done\n');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Verdict vs Brief 007 ACs ──');
console.log(`AC-count     (countPrimaryStudies ≥3000):           ${acCount ? '✅ PASS' : '❌ FAIL'} (${s1.total})`);
console.log(`AC-screen    (sentinel absent from screening feed):  ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-recent    (countPrimaryStudiesRecent non-zero):   ${acRecent ? '✅ PASS' : '❌ FAIL'} (${s3.count})`);
console.log(`AC-no-inversion (NOT/SR disjoint sets, overlap=0):  ${acNoInversion ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-regression (val-006 recall ≥4/5 preserved):      ${acRegression ? '✅ PASS' : '❌ FAIL'} (${s6r.hits}/5)`);
console.log('\n=== End of Harness ===');
