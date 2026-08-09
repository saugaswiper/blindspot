/**
 * Validation 007 harness — Stage 3 sibling-function fix verification
 *
 * Handoff under test: spec/107-handoff.md
 * Brief: spec/briefs/007.md
 * Prior validation: spec/validation/006-validation.md
 *
 * Tests the three binary-NOT fixes applied in handoff 107:
 *   - countPrimaryStudies (lib/pubmed.ts line 127): `(query) NOT systematic[sb]`
 *   - fetchPrimaryStudiesForScreening (line 240):   `(query) NOT systematic[sb]`
 *   - countPrimaryStudiesRecent (line 300):         `(query) NOT systematic[sb]`
 *
 * Gold SR: Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)
 * Truth set (5 included RCTs — validated 004/005/006):
 *   16804151  Sivertsen 2006  (JAMA 295:2851)
 *   15451764  Jacobs 2004     (Arch Intern Med 164:1888)
 *   10086433  Morin 1999      (JAMA 281:991)
 *   16785771  Wu 2006         (Psychother Psychosom 75:220)
 *   1888345   McCluskey 1991  (Am J Psychiatry 148:121)
 *
 * Known SR PMID (must NOT appear in primary-study results): 22631616 (Mitchell 2012)
 *
 * Probes:
 *   1a/1b  — AC-count: mirrors countPrimaryStudies (retmax=1, no sort)
 *            OLD (AND NOT) vs NEW (NOT); expected count jump ~313 → ~3421
 *   1c     — count-overlap: OLD/NEW retmax=200, intersection must = 0
 *   2a     — AC-screen (prod limit): mirrors fetchPrimaryStudiesForScreening(query, 20)
 *            no sort; check SR PMIDs absent; EFetch first result for spot-check
 *   2b     — AC-screen (recall): retmax=500, sort=relevance; recall on truth set
 *   3a/3b  — AC-recent: mirrors countPrimaryStudiesRecent (pdat filter, retmax=1)
 *            OLD vs NEW; expected NEW >> OLD
 *   3c     — recent-overlap: OLD/NEW retmax=200 with pdat filter, intersection = 0
 *   4      — AC-no-inversion summary: disjoint-set verdict across all function proxies
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});

const ncbiKey = env.NCBI_API_KEY ?? '';

const TRUTH   = ['16804151', '15451764', '10086433', '16785771', '1888345'];
const SR_PMID = '22631616';   // Mitchell 2012 — the gold SR itself; must NOT appear in primary feed
const TOPIC   = 'cognitive behavioral therapy insomnia';

const QUERY_OLD = `(${TOPIC}) AND NOT systematic[sb]`;  // broken pre-107 form
const QUERY_NEW = `(${TOPIC}) NOT systematic[sb]`;       // fixed binary-NOT form

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch (mirrors lib/pubmed.ts esearch()) ─────────────────────────
async function esearch(term, retmax, sort) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) {
    const txt = await r.text();
    return { pmids: [], total: 0, status: r.status, err: txt.slice(0, 200) };
  }
  const j = await r.json();
  return {
    pmids: j.esearchresult?.idlist ?? [],
    total: parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── PubMed ESearch (mirrors countPrimaryStudiesRecent — direct URL with pdat) ─
async function esearchRecent(term, minYear, maxYear) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', '1');          // count only, like the function
  url.searchParams.set('retmode', 'json');
  url.searchParams.set('datetype', 'pdat');
  url.searchParams.set('mindate', String(minYear));
  url.searchParams.set('maxdate', String(maxYear));
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { count: 0, status: r.status };
  const j = await r.json();
  return { count: parseInt(j.esearchresult?.count ?? '0', 10), status: 200 };
}

// Same but retmax=200 to get IDs for overlap check
async function esearchRecentIds(term, minYear, maxYear, retmax = 200) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  url.searchParams.set('datetype', 'pdat');
  url.searchParams.set('mindate', String(minYear));
  url.searchParams.set('maxdate', String(maxYear));
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { pmids: [], total: 0, status: r.status };
  const j = await r.json();
  return {
    pmids: j.esearchresult?.idlist ?? [],
    total: parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── PubMed EFetch (spot-check one PMID) ──────────────────────────────────────
async function efetchOne(pmid) {
  const url = new URL(`${BASE}/efetch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmid);
  url.searchParams.set('rettype', 'abstract');
  url.searchParams.set('retmode', 'text');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { status: r.status, text: '' };
  const text = await r.text();
  return { status: 200, text: text.slice(0, 600) };   // enough to see journal / article type
}

// ── Overlap helper ────────────────────────────────────────────────────────────
function setOverlap(oldPmids, newPmids) {
  const oldSet = new Set(oldPmids);
  const both = newPmids.filter(id => oldSet.has(id));
  return { both: both.length, oldOnly: oldPmids.length - both.length, newOnly: newPmids.length - both.length };
}

// ── Recall helper ─────────────────────────────────────────────────────────────
function recall(pmids, truth) {
  const hits = truth.filter(t => pmids.includes(t));
  const missed = truth.filter(t => !pmids.includes(t));
  return { hits: hits.length, missed, pct: (hits.length / truth.length * 100).toFixed(0) };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Stage 3 Sibling-Function Fix (Handoff 107) ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Topic: "${TOPIC}"`);
console.log(`Gold SR: Mitchell 2012 (PMID ${SR_PMID})`);
console.log(`Truth set (${TRUTH.length} RCTs): ${TRUTH.join(', ')}`);
console.log(`OLD query: ${QUERY_OLD}`);
console.log(`NEW query: ${QUERY_NEW}`);
console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PROBE 1: AC-count — mirrors countPrimaryStudies (retmax=1, no sort)
// ════════════════════════════════════════════════════════════════════════════
console.log('── Probe 1: AC-count (countPrimaryStudies proxy) ──');

process.stderr.write('  [1a] countPrimaryStudies OLD (AND NOT, retmax=1)...');
const cnt1a = await esearch(QUERY_OLD, 1);
console.log(`Probe1a OLD: status=${cnt1a.status} count=${cnt1a.total}`);
process.stderr.write(' done\n');

await sleep(400);

process.stderr.write('  [1b] countPrimaryStudies NEW (NOT, retmax=1)...');
const cnt1b = await esearch(QUERY_NEW, 1);
console.log(`Probe1b NEW: status=${cnt1b.status} count=${cnt1b.total}`);
process.stderr.write(' done\n');

await sleep(400);

// Count overlap diagnostic (retmax=200)
process.stderr.write('  [1c] count-overlap (OLD/NEW retmax=200)...');
const cnt1aIds = await esearch(QUERY_OLD, 200);
await sleep(300);
const cnt1bIds = await esearch(QUERY_NEW, 200);
const ov1 = setOverlap(cnt1aIds.pmids, cnt1bIds.pmids);
console.log(`Probe1c overlap: OLD returned=${cnt1aIds.pmids.length} NEW returned=${cnt1bIds.pmids.length} both=${ov1.both}`);
if (ov1.both === 0) {
  console.log('  ✓ Sets disjoint — binary NOT honoured (no overlap between old and new forms)');
} else {
  console.log(`  ⚠ ${ov1.both} PMIDs appear in both sets — binary NOT may not be fully honoured`);
}
process.stderr.write(' done\n');

const acCountPass = cnt1b.total >= 3000;
console.log(`AC-count: ${acCountPass ? '✅ PASS' : '❌ FAIL'} — NEW count=${cnt1b.total} (bar: ≥3000; OLD was ~313)`);
console.log('');

await sleep(500);

// ════════════════════════════════════════════════════════════════════════════
// PROBE 2a: AC-screen (prod limit) — mirrors fetchPrimaryStudiesForScreening(query, 20)
// ════════════════════════════════════════════════════════════════════════════
console.log('── Probe 2a: AC-screen prod-limit (fetchPrimaryStudiesForScreening proxy, retmax=20, no sort) ──');

process.stderr.write('  [2a-old] screen OLD (AND NOT, retmax=20, no sort)...');
const scr2aOld = await esearch(QUERY_OLD, 20);
const srInOld = scr2aOld.pmids.includes(SR_PMID);
const truthInOld = recall(scr2aOld.pmids, TRUTH);
console.log(`Probe2a OLD: status=${scr2aOld.status} total=${scr2aOld.total} returned=${scr2aOld.pmids.length}`);
console.log(`  SR PMID ${SR_PMID} in result: ${srInOld ? '⚠ YES (expected NOT to find it if truly inverted)' : 'no'}`);
console.log(`  Truth hits: ${truthInOld.hits}/${TRUTH.length} (note: truth papers 1991-2006 unlikely with default date sort + low retmax)`);
if (scr2aOld.pmids.length > 0) console.log(`  First PMID returned: ${scr2aOld.pmids[0]}`);
process.stderr.write(' done\n');

await sleep(400);

process.stderr.write('  [2a-new] screen NEW (NOT, retmax=20, no sort)...');
const scr2aNew = await esearch(QUERY_NEW, 20);
const srInNew = scr2aNew.pmids.includes(SR_PMID);
const truthInNew = recall(scr2aNew.pmids, TRUTH);
console.log(`Probe2a NEW: status=${scr2aNew.status} total=${scr2aNew.total} returned=${scr2aNew.pmids.length}`);
console.log(`  SR PMID ${SR_PMID} in result: ${srInNew ? '⚠ YES (unexpected)' : '✓ no (correct)'}`);
console.log(`  Truth hits: ${truthInNew.hits}/${TRUTH.length}`);
if (scr2aNew.pmids.length > 0) console.log(`  First PMID returned: ${scr2aNew.pmids[0]}`);
process.stderr.write(' done\n');

const acScreenSrAbsent = !srInNew;
console.log(`AC-screen (SR absent): ${acScreenSrAbsent ? '✅ PASS' : '❌ FAIL'} — Mitchell SR (${SR_PMID}) ${srInNew ? 'found in' : 'absent from'} screening feed`);

await sleep(400);

// Spot-check: EFetch first returned PMID from NEW screening result
if (scr2aNew.pmids.length > 0) {
  const spotPmid = scr2aNew.pmids[0];
  process.stderr.write(`  [2a-efetch] EFetch spot-check PMID ${spotPmid}...`);
  const ef = await efetchOne(spotPmid);
  console.log(`\nProbe2a spot-check PMID ${spotPmid} (EFetch abstract, first 600 chars):`);
  console.log(ef.text || `  status=${ef.status} (no text)`);
  process.stderr.write(' done\n');
}

console.log('');
await sleep(500);

// ════════════════════════════════════════════════════════════════════════════
// PROBE 2b: AC-screen (recall) — retmax=500, sort=relevance
// ════════════════════════════════════════════════════════════════════════════
console.log('── Probe 2b: AC-screen recall (retmax=500, sort=relevance) ──');

process.stderr.write('  [2b-new] screen NEW recall (NOT, retmax=500, relevance)...');
const scr2bNew = await esearch(QUERY_NEW, 500, 'relevance');
const r2b = recall(scr2bNew.pmids, TRUTH);
console.log(`Probe2b NEW recall: status=${scr2bNew.status} total=${scr2bNew.total} returned=${scr2bNew.pmids.length} hits=${r2b.hits}/${TRUTH.length} recall=${r2b.pct}%`);
if (r2b.missed.length) console.log(`  missed: ${r2b.missed.join(', ')}`);
TRUTH.forEach(t => {
  const idx = scr2bNew.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: rank ${idx + 1}/${scr2bNew.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${scr2bNew.pmids.length} returned`);
});
process.stderr.write(' done\n');
console.log('');

await sleep(500);

// ════════════════════════════════════════════════════════════════════════════
// PROBE 3: AC-recent — mirrors countPrimaryStudiesRecent (pdat filter)
// ════════════════════════════════════════════════════════════════════════════
const recentMinYear = new Date().getFullYear() - 3;  // 2023 as of 2026
const recentMaxYear = new Date().getFullYear();       // 2026

console.log(`── Probe 3: AC-recent (countPrimaryStudiesRecent proxy, pdat ${recentMinYear}–${recentMaxYear}) ──`);

process.stderr.write(`  [3a] recent OLD (AND NOT, pdat ${recentMinYear}-${recentMaxYear}, retmax=1)...`);
const rec3a = await esearchRecent(QUERY_OLD, recentMinYear, recentMaxYear);
console.log(`Probe3a OLD: status=${rec3a.status} count=${rec3a.count}`);
process.stderr.write(' done\n');

await sleep(400);

process.stderr.write(`  [3b] recent NEW (NOT, pdat ${recentMinYear}-${recentMaxYear}, retmax=1)...`);
const rec3b = await esearchRecent(QUERY_NEW, recentMinYear, recentMaxYear);
console.log(`Probe3b NEW: status=${rec3b.status} count=${rec3b.count}`);
process.stderr.write(' done\n');

await sleep(400);

// Recent overlap diagnostic (retmax=200 with pdat filter)
process.stderr.write(`  [3c] recent-overlap (OLD/NEW retmax=200, pdat ${recentMinYear}-${recentMaxYear})...`);
const rec3aIds = await esearchRecentIds(QUERY_OLD, recentMinYear, recentMaxYear, 200);
await sleep(300);
const rec3bIds = await esearchRecentIds(QUERY_NEW, recentMinYear, recentMaxYear, 200);
const ov3 = setOverlap(rec3aIds.pmids, rec3bIds.pmids);
console.log(`Probe3c overlap: OLD returned=${rec3aIds.pmids.length} NEW returned=${rec3bIds.pmids.length} both=${ov3.both}`);
if (ov3.both === 0) {
  console.log('  ✓ Sets disjoint — binary NOT honoured for recent filter too');
} else {
  console.log(`  ⚠ ${ov3.both} PMIDs appear in both sets`);
}
process.stderr.write(' done\n');

const acRecentPass = rec3b.count > 0 && rec3b.count > rec3a.count;
console.log(`AC-recent: ${acRecentPass ? '✅ PASS' : '❌ FAIL'} — NEW count=${rec3b.count} OLD count=${rec3a.count} (bar: NEW>0 AND NEW>OLD)`);
console.log('');

await sleep(500);

// ════════════════════════════════════════════════════════════════════════════
// PROBE 4: AC-no-inversion summary
// ════════════════════════════════════════════════════════════════════════════
console.log('── Probe 4: AC-no-inversion summary ──');
console.log('Disjoint-set results across all three function proxies:');
console.log(`  countPrimaryStudies (Probe 1c):  OLD=${cnt1aIds.pmids.length} NEW=${cnt1bIds.pmids.length} overlap=${ov1.both} → ${ov1.both === 0 ? '✓ disjoint' : '⚠ overlap'}`);
console.log(`  countPrimaryStudiesRecent (Probe 3c): OLD=${rec3aIds.pmids.length} NEW=${rec3bIds.pmids.length} overlap=${ov3.both} → ${ov3.both === 0 ? '✓ disjoint' : '⚠ overlap'}`);
// For screen overlap (Probe 2a retmax=20)
const ov2 = setOverlap(scr2aOld.pmids, scr2aNew.pmids);
console.log(`  fetchPrimaryStudiesForScreening (Probe 2a, retmax=20): OLD=${scr2aOld.pmids.length} NEW=${scr2aNew.pmids.length} overlap=${ov2.both} → ${ov2.both === 0 ? '✓ disjoint' : '⚠ overlap'}`);

const allDisjoint = ov1.both === 0 && ov3.both === 0 && ov2.both === 0;
console.log(`\nAC-no-inversion: ${allDisjoint ? '✅ PASS' : '❌ FAIL'} — ${allDisjoint ? 'all three function proxies return disjoint OLD/NEW sets' : 'some overlap detected'}`);
console.log('');

// ════════════════════════════════════════════════════════════════════════════
// Verdict
// ════════════════════════════════════════════════════════════════════════════
console.log('── Verdict vs Brief 007 bars ──');
console.log(`AC-count  (NEW ≥ 3000):            ${acCountPass     ? '✅ PASS' : '❌ FAIL'} — NEW=${cnt1b.total}, OLD=${cnt1a.total}`);
console.log(`AC-screen (SR absent, retmax=20):  ${acScreenSrAbsent ? '✅ PASS' : '❌ FAIL'} — Mitchell SR ${srInNew ? 'FOUND' : 'absent'} in feed`);
console.log(`AC-recent (NEW>0 AND NEW>OLD):      ${acRecentPass    ? '✅ PASS' : '❌ FAIL'} — NEW=${rec3b.count}, OLD=${rec3a.count}`);
console.log(`AC-no-inversion (all disjoint):    ${allDisjoint     ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n=== End of Harness ===');
