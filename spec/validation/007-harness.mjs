/**
 * Validation 007 harness — Brief 007: sibling-function AND-NOT fix
 *
 * Handoff 107 applied the binary NOT fix (proven by handoff 106, validated by 006)
 * to three functions left unpatched in lib/pubmed.ts:
 *
 *   countPrimaryStudies        (line 127) — feasibility display + cache
 *   fetchPrimaryStudiesForScreening (line 240) — screening workbench feed
 *   countPrimaryStudiesRecent  (line 300) — study-count trend (NEW-2)
 *
 * Change: `(query) AND NOT systematic[sb]`  →  `(query) NOT systematic[sb]`
 *
 * Brief 007 acceptance criteria:
 *   AC-count       countPrimaryStudies returns primary study count (≥3000 for CBTI topic)
 *   AC-recent      countPrimaryStudiesRecent returns non-zero primary count
 *   AC-screen      fetchPrimaryStudiesForScreening does NOT return SR PMIDs;
 *                  spot-check ≥1 returned PMID is an RCT
 *   AC-no-inversion NOT-form and AND-form result sets are disjoint
 *   AC-regression  TypeScript + test suite clean (pre-run gate; not repeated here)
 *
 * Truth set (carried from 006/005/004):
 *   Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)
 *   Included RCTs: 16804151, 15451764, 10086433, 16785771, 1888345
 *
 * Control SR PMID for screening spot-check: 22631616 (Mitchell 2012 SR itself)
 *
 * Second topic (generalization): "exercise depression" — different domain,
 * confirms the count is in primary-study range (not the ~313 SR range) for
 * an unrelated query. Full second-truth-set recall deferred to validation 008.
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

// ── Truth sets ────────────────────────────────────────────────────────────────
// Topic 1 (primary): cognitive behavioral therapy for insomnia (CBTI)
const TOPIC     = 'cognitive behavioral therapy insomnia';
const TRUTH     = ['16804151', '15451764', '10086433', '16785771', '1888345'];
const SR_PMID   = '22631616';   // Mitchell 2012 SR — must NOT appear in screening results
const QUERY_OLD = `(${TOPIC}) AND NOT systematic[sb]`;   // broken form (validation 005 F1)
const QUERY_NEW = `(${TOPIC}) NOT systematic[sb]`;        // handoff 107 fix form

// Topic 2 (generalization): exercise for depression — different clinical domain
const TOPIC2     = 'exercise depression';
const QUERY2_NEW = `(${TOPIC2}) NOT systematic[sb]`;

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch (count only, retmax=1) ────────────────────────────────────
async function esearchCount(term) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', '1');
  url.searchParams.set('retmode', 'json');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);
  const r = await fetch(url.toString());
  if (!r.ok) return { count: 0, status: r.status, err: await r.text() };
  const j = await r.json();
  return { count: parseInt(j.esearchresult?.count ?? '0', 10), status: 200 };
}

// ── PubMed ESearch (IDs, configurable retmax + sort) ─────────────────────────
async function esearchIds(term, retmax, sort) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
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

// ── PubMed ESearch with recent date filter (mirrors countPrimaryStudiesRecent) ─
async function esearchCountRecent(term, years) {
  const minYear = new Date().getFullYear() - years;
  const maxYear = new Date().getFullYear();
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', '1');
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

// ── PubMed ESummary (publication type lookup) ─────────────────────────────────
async function esummary(pmids) {
  const url = new URL(`${BASE}/esummary.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmids.join(','));
  url.searchParams.set('retmode', 'json');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);
  const r = await fetch(url.toString());
  if (!r.ok) return null;
  const j = await r.json();
  return j.result;
}

// ── Recall ────────────────────────────────────────────────────────────────────
function recall(sourcePmids, truth) {
  const hits  = truth.filter(t => sourcePmids.includes(t));
  const missed = truth.filter(t => !sourcePmids.includes(t));
  return { hits: hits.length, missed, recall: hits.length / truth.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Brief 007 Sibling-Function AND-NOT Fix ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Gold SR:  Mitchell et al. 2012 (PMID ${SR_PMID}, BMC Fam Pract 2012;13:40)`);
console.log(`Truth N=${TRUTH.length}: ${TRUTH.join(', ')}`);
console.log(`OLD query form: ${QUERY_OLD}`);
console.log(`NEW query form: ${QUERY_NEW}\n`);

// ── Probe A: Control — countPrimaryStudies OLD form ───────────────────────────
// Mirrors the pre-fix form for all three functions.
// Expected: ~313 (systematic review count, not primary study count).
process.stderr.write('  [A] countPrimaryStudies OLD (AND NOT systematic[sb], retmax=1 count)...');
const ctOld = await esearchCount(QUERY_OLD);
console.log(`ProbeA countPrimaryStudies OLD: status=${ctOld.status} count=${ctOld.count} (expected ~313 SRs)`);
const controlIsSR = ctOld.count >= 200 && ctOld.count <= 500;
console.log(`  Control plausible (200–500 SR range): ${controlIsSR ? '✓ YES' : '⚠ UNEXPECTED'}`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe B: Fixed — countPrimaryStudies NEW form (AC-count) ─────────────────
// Mirrors countPrimaryStudies (line 127) post-fix.
// Expected: ≥3000 (primary study count for CBTI topic).
process.stderr.write('  [B] countPrimaryStudies NEW (NOT systematic[sb], retmax=1 count)...');
const ctNew = await esearchCount(QUERY_NEW);
console.log(`\nProbeB countPrimaryStudies NEW: status=${ctNew.status} count=${ctNew.count} (expected ≥3000)`);
const acCount = ctNew.count >= 3000;
console.log(`  AC-count (≥3000): ${acCount ? '✅ PASS' : '❌ FAIL'}`);
// Also check ratio vs OLD (primary-study count should be ~10x the SR count for this topic)
const ratio = ctOld.count > 0 ? (ctNew.count / ctOld.count).toFixed(1) : 'N/A';
console.log(`  Ratio NEW/OLD = ${ratio}x (expect ~10x given 313 SRs vs ~3421 primaries)`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe C: Fixed — countPrimaryStudiesRecent NEW form (AC-recent) ───────────
// Mirrors countPrimaryStudiesRecent (line 300) post-fix.
// Expected: non-zero count of recent (last 3 years) primary studies.
process.stderr.write('  [C] countPrimaryStudiesRecent NEW (NOT systematic[sb], 3-year window)...');
const ctRecent = await esearchCountRecent(QUERY_NEW, 3);
console.log(`\nProbeC countPrimaryStudiesRecent NEW: status=${ctRecent.status} count=${ctRecent.count} (expected non-zero)`);
// Control: OLD form for recent count — should return recent SRs (low count)
const ctRecentOld = await esearchCountRecent(QUERY_OLD, 3);
console.log(`  Control OLD recent count: ${ctRecentOld.count} (expected lower; recent SRs only)`);
const acRecent = ctRecent.count > 0;
console.log(`  AC-recent (non-zero): ${acRecent ? '✅ PASS' : '❌ FAIL'}`);
const recentRatioOk = ctRecent.count > ctRecentOld.count;
console.log(`  NEW > OLD recent count: ${recentRatioOk ? '✓ YES' : '⚠ UNEXPECTED (investigate)'}`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe D: Fixed — fetchPrimaryStudiesForScreening (AC-screen) ──────────────
// Mirrors fetchPrimaryStudiesForScreening (line 240) post-fix, limit=20.
// Expected:
//   - SR_PMID (22631616, Mitchell 2012) does NOT appear
//   - No other known SR PMIDs appear
//   - At least one returned PMID has publication type RCT or Clinical Trial
process.stderr.write('  [D] fetchPrimaryStudiesForScreening NEW (NOT systematic[sb], retmax=20)...');
const screenResult = await esearchIds(QUERY_NEW, 20, 'relevance');
console.log(`\nProbeD fetchPrimaryStudiesForScreening: status=${screenResult.status} total=${screenResult.total} returned=${screenResult.pmids.length}`);
console.log(`  PMIDs: ${screenResult.pmids.join(', ')}`);
const srInScreen = screenResult.pmids.includes(SR_PMID);
console.log(`  SR PMID ${SR_PMID} in results: ${srInScreen ? '⚠ YES (FAIL)' : '✓ NO (expected)'}`);

// Spot-check publication types via ESummary for first 5 returned PMIDs
await sleep(400);
const spotPmids = screenResult.pmids.slice(0, 5);
let spotResult = null;
if (spotPmids.length > 0) {
  process.stderr.write('\n    [D-spot] ESummary pub-type check...');
  spotResult = await esummary(spotPmids);
  process.stderr.write(' done\n');
}

let foundRCT = false;
let foundSR  = false;
if (spotResult) {
  console.log('  Spot-check pub types (first 5 PMIDs):');
  for (const pmid of spotPmids) {
    const doc = spotResult[pmid];
    const pubtypes = doc?.pubtype ?? [];
    const isRCT = pubtypes.some(t =>
      t.toLowerCase().includes('randomized') || t.toLowerCase().includes('clinical trial'));
    const isSR  = pubtypes.some(t =>
      t.toLowerCase().includes('systematic') || t.toLowerCase().includes('review') ||
      t.toLowerCase().includes('meta-analysis'));
    if (isRCT) foundRCT = true;
    if (isSR)  foundSR  = true;
    console.log(`    PMID ${pmid}: ${pubtypes.join(' | ')} ${isRCT ? '[RCT✓]' : ''} ${isSR ? '[SR⚠]' : ''}`);
  }
}
const acScreen = !srInScreen && foundRCT && !foundSR;
console.log(`  AC-screen (SR absent + ≥1 RCT found + no SRs in spot-check): ${acScreen ? '✅ PASS' : '❌ FAIL or PARTIAL'}`);
console.log(`    SR absent: ${!srInScreen}, ≥1 RCT: ${foundRCT}, no SR in spot: ${!foundSR}`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe E: Disjoint set check (AC-no-inversion) ────────────────────────────
// countPrimaryStudies uses NOT systematic[sb]; countSystematicReviews uses AND systematic[sb].
// These must be disjoint (0 overlap), same as probe B2 in validation 006.
process.stderr.write('  [E] Disjoint check: NOT-form (retmax=1000) vs AND-form (retmax=1000)...');
const notForm = await esearchIds(QUERY_NEW, 1000, null);
await sleep(400);
const andForm = await esearchIds(`(${TOPIC}) AND systematic[sb]`, 1000, null);
await sleep(400);
const notSet = new Set(notForm.pmids);
const andSet = new Set(andForm.pmids);
const inBoth   = notForm.pmids.filter(id => andSet.has(id));
const notOnly  = notForm.pmids.filter(id => !andSet.has(id));
const andOnly  = andForm.pmids.filter(id => !notSet.has(id));
console.log(`\nProbeE Disjoint check:`);
console.log(`  NOT-form: total=${notForm.total} returned=${notForm.pmids.length}`);
console.log(`  AND-form: total=${andForm.total} returned=${andForm.pmids.length}`);
console.log(`  In both: ${inBoth.length}  NOT-only: ${notOnly.length}  AND-only: ${andOnly.length}`);
const acNoInversion = inBoth.length === 0;
console.log(`  AC-no-inversion (0 overlap): ${acNoInversion ? '✅ PASS' : '❌ FAIL — overlap detected!'}`);
if (inBoth.length > 0) console.log(`  Overlapping PMIDs (first 5): ${inBoth.slice(0, 5).join(', ')}`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe F: Recall with screening form (Mitchell 2012 truth) ────────────────
// Does fetchPrimaryStudiesForScreening recover the Mitchell 2012 truth papers?
// Uses retmax=2000 (same ceiling as fetchPrimaryStudyIds in 006 probe B).
// This is a carry-over recall check to confirm screening form picks up truth papers.
process.stderr.write('  [F] Recall: screening form retmax=2000 vs Mitchell 2012 truth...');
const screenRecall = await esearchIds(QUERY_NEW, 2000, 'relevance');
const recallR = recall(screenRecall.pmids, TRUTH);
console.log(`\nProbeF Recall (screening form, retmax=2000): total=${screenRecall.total} returned=${screenRecall.pmids.length} hits=${recallR.hits}/${TRUTH.length} recall=${(recallR.recall * 100).toFixed(0)}%`);
if (recallR.missed.length) console.log(`  missed: ${recallR.missed.join(', ')}`);
TRUTH.forEach(t => {
  const idx = screenRecall.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: rank ${idx + 1}/${screenRecall.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${screenRecall.pmids.length}`);
});
process.stderr.write(' done\n');

await sleep(600);

// ── Probe G: Generalization — second topic (exercise depression) ──────────────
// Confirms the primary-study count fix is not topic-specific.
// Expected: NEW form returns primary study count >> SR range (~200-500)
// for a completely different clinical topic.
process.stderr.write('  [G] Generalization: countPrimaryStudies for "exercise depression"...');
const genOld = await esearchCount(`(${TOPIC2}) AND NOT systematic[sb]`);
await sleep(400);
const genNew = await esearchCount(QUERY2_NEW);
console.log(`\nProbeG Generalization (exercise depression):`);
console.log(`  OLD count (AND NOT): ${genOld.count}   NEW count (NOT): ${genNew.count}`);
const genRatioOk = genNew.count > genOld.count * 3;
console.log(`  NEW >> OLD (>3x): ${genRatioOk ? '✓ YES' : '⚠ UNEXPECTED'}`);
const genInRange = genNew.count >= 1000;
console.log(`  NEW ≥1000 (primary study range): ${genInRange ? '✓ YES' : '⚠ FAIL'}`);
process.stderr.write(' done\n');

// ── Summary verdict ───────────────────────────────────────────────────────────
console.log('\n── Verdict vs Brief 007 bars ──');
console.log(`AC-count  (≥3000): ${acCount    ? '✅ PASS' : '❌ FAIL'} (${ctNew.count})`);
console.log(`AC-recent (non-0): ${acRecent   ? '✅ PASS' : '❌ FAIL'} (${ctRecent.count})`);
console.log(`AC-screen: ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-no-inv (0 ovl): ${acNoInversion ? '✅ PASS' : '❌ FAIL'} (overlap=${inBoth.length})`);
console.log(`Recall F  (≥3/5):  ${recallR.hits >= 3 ? '✅ PASS' : '❌ FAIL'} (${recallR.hits}/${TRUTH.length})`);
console.log(`Generalztn (≥1000): ${genInRange ? '✓ PASS' : '⚠ FAIL'} (${genNew.count})`);

console.log('\n=== End of Harness ===');
