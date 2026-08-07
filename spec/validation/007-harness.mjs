/**
 * Validation 007 harness — Stage 3: Verify handoff 107 sibling-function fixes
 *
 * Handoff 107 applied the binary-NOT fix (proven in handoff 106, verified in
 * validation 006) to three sibling functions in lib/pubmed.ts that had been
 * missed in handoff 106:
 *
 *   countPrimaryStudies         (line 127): `(q) NOT systematic[sb]${datePart}`
 *   fetchPrimaryStudiesForScreening (line 240): `(q) NOT systematic[sb]`
 *   countPrimaryStudiesRecent   (line 300): `(q) NOT systematic[sb]`
 *
 * fetchPrimaryStudyIds (line 282) was already fixed in handoff 106 and is
 * tested here only as a regression check.
 *
 * Acceptance criteria (brief 007):
 *   AC-count         countPrimaryStudies returns primary-study count ≥3000
 *                    (old broken form returned ~313 systematic reviews)
 *   AC-screen        fetchPrimaryStudiesForScreening top-N contains no SR PMIDs
 *                    Spot-check: Mitchell SR PMID 22631616 must not appear
 *   AC-recent        countPrimaryStudiesRecent returns non-zero recent primary count
 *   AC-no-inversion  OLD (AND NOT) and NEW (NOT) result sets are disjoint
 *
 * Additional checks:
 *   REGRESSION       fetchPrimaryStudyIds (handoff 106, unchanged in 107) still
 *                    returns Mitchell 2012 truth papers at ≥4/5 recall
 *   SR-EXCLUSION     Mitchell SR PMID (22631616) absent from NOT results but
 *                    present in AND systematic[sb] results (filter working both ways)
 *   GENERALIZATION   Second topic confirms the pattern is not CBT-I specific
 *
 * Gold SR (primary truth set): Mitchell et al. 2012 (PMID 22631616)
 *   BMC Family Practice 2012;13:40
 *   "Comparative effectiveness of cognitive behavioral therapy for insomnia"
 *
 * Truth set (same as validations 004–006):
 *   16804151  Sivertsen 2006  JAMA 295:2851
 *   15451764  Jacobs 2004     Arch Intern Med 164:1888
 *   10086433  Morin 1999      JAMA 281:991
 *   16785771  Wu 2006         Psychother Psychosom 75:220
 *   1888345   McCluskey 1991  Am J Psychiatry 148:121
 *
 * Generalization topic (second domain — count test only, no full truth set):
 *   "statin cardiovascular disease prevention randomized"
 *   Tests that binary-NOT fix generalises beyond the CBT-I query domain.
 *   No recall truth set required for this probe — count differential is sufficient.
 */

import { readFileSync } from 'fs';

// ── Env setup ─────────────────────────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

// ── Constants ─────────────────────────────────────────────────────────────────
const TOPIC      = 'cognitive behavioral therapy insomnia';
const QUERY_OLD  = `(${TOPIC}) AND NOT systematic[sb]`;  // broken ATM-inversion form
const QUERY_NEW  = `(${TOPIC}) NOT systematic[sb]`;       // handoff 107 fix (binary NOT)
const QUERY_SR   = `(${TOPIC}) AND systematic[sb]`;       // positive SR filter (control)

// Three-year recent window mirrors countPrimaryStudiesRecent(query, years=3)
const THIS_YEAR  = new Date().getFullYear();
const RECENT_MIN = THIS_YEAR - 3;

const TRUTH = ['16804151', '15451764', '10086433', '16785771', '1888345'];
const MITCHELL_SR_PMID = '22631616';  // the SR itself — must NOT appear in NOT results

// Generalization probe topic (different domain)
const GEN_TOPIC  = 'statin cardiovascular disease prevention randomized';
const GEN_OLD    = `(${GEN_TOPIC}) AND NOT systematic[sb]`;
const GEN_NEW    = `(${GEN_TOPIC}) NOT systematic[sb]`;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hits(pmids, truth) {
  const found = truth.filter(t => pmids.includes(t));
  const missed = truth.filter(t => !pmids.includes(t));
  return { found, missed, n: found.length, recall: found.length / truth.length };
}

function disjoint(setA, setB) {
  const b = new Set(setB);
  return setA.filter(id => b.has(id));
}

// ── PubMed ESearch ────────────────────────────────────────────────────────────
async function esearch({ term, retmax = 1, sort, mindate, maxdate, datetype }) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort)     url.searchParams.set('sort', sort);
  if (mindate)  url.searchParams.set('mindate', String(mindate));
  if (maxdate)  url.searchParams.set('maxdate', String(maxdate));
  if (datetype) url.searchParams.set('datetype', datetype);
  if (ncbiKey)  url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { pmids: [], total: 0, status: r.status, err: await r.text() };
  const j  = await r.json();
  return {
    pmids:  j.esearchresult?.idlist ?? [],
    total:  parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── PubMed EFetch — fetch single record XML to get publication types ───────────
async function efetchType(pmid) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmid);
  url.searchParams.set('rettype', 'xml');
  url.searchParams.set('retmode', 'xml');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { pmid, types: [], status: r.status };
  const xml   = await r.text();
  // Extract all <PublicationType> values
  const types = [...xml.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g)]
    .map(m => m[1].trim());
  // Extract title for spot-check
  const titleM = xml.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
  const title  = titleM ? titleM[1].trim() : '(title not parsed)';
  return { pmid, types, title, status: 200 };
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Stage 3 Sibling-Function Fix Verification (Handoff 107) ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Gold SR:   Mitchell 2012 (PMID ${MITCHELL_SR_PMID})`);
console.log(`Truth N=${TRUTH.length}: ${TRUTH.join(', ')}`);
console.log(`OLD query: ${QUERY_OLD}`);
console.log(`NEW query: ${QUERY_NEW}`);
console.log(`Recent window: ${RECENT_MIN}–${THIS_YEAR}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// Probe A — Control: OLD broken form (countPrimaryStudies mirror)
// mirrors: `(query) AND NOT systematic[sb]` — should still return ~313 SRs
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [A] AC-no-inversion control: OLD form count (AND NOT)...');
const pA = await esearch({ term: QUERY_OLD, retmax: 1 });
console.log(`\nProbeA OLD count: status=${pA.status} total=${pA.total}`);
console.log(`  Expect: ~313 (systematic reviews — ATM inversion). ${pA.total < 500 && pA.total > 200 ? '✓ MATCHES expectation' : pA.total < 200 ? '⚠ LOWER than expected' : '⚠ HIGHER than expected'}`);
process.stderr.write(' done\n');

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe B — AC-count: NEW fixed form (countPrimaryStudies mirror)
// mirrors: `(query) NOT systematic[sb]` — should return ≥3000 primary studies
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [B] AC-count: NEW form count (NOT systematic[sb])...');
const pB = await esearch({ term: QUERY_NEW, retmax: 1 });
console.log(`\nProbeB NEW count: status=${pB.status} total=${pB.total}`);
const acCount = pB.total >= 3000;
console.log(`  AC-count (≥3000): ${acCount ? '✅ PASS' : '❌ FAIL'} (${pB.total})`);
console.log(`  Ratio NEW/OLD: ${pA.total > 0 ? (pB.total / pA.total).toFixed(1) : 'N/A'}× (expect ~11×)`);
process.stderr.write(' done\n');

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe B2 — AC-no-inversion: set-overlap diagnostic
// Fetch retmax=200 from both OLD and NEW forms; expect 0 overlap
// Same technique as validation 006 probe B2
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [B2] AC-no-inversion: set-overlap OLD vs NEW (retmax=200)...');
const pB2old = await esearch({ term: QUERY_OLD, retmax: 200 });
await sleep(400);
const pB2new = await esearch({ term: QUERY_NEW, retmax: 200 });
const overlap = disjoint(pB2new.pmids, pB2old.pmids);
const acNoInversion = overlap.length === 0;
console.log(`\nProbeB2 set-overlap:`);
console.log(`  OLD retmax=200: returned=${pB2old.pmids.length} total=${pB2old.total}`);
console.log(`  NEW retmax=200: returned=${pB2new.pmids.length} total=${pB2new.total}`);
console.log(`  In both: ${overlap.length} (expect 0 for disjoint sets)`);
console.log(`  AC-no-inversion: ${acNoInversion ? '✅ PASS — sets disjoint, binary NOT honoured' : '❌ FAIL — overlap detected, NOT may be dropped'}`);
process.stderr.write(' done\n');

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe C — AC-recent: countPrimaryStudiesRecent mirror
// mirrors: `(query) NOT systematic[sb]` + datetype=pdat, mindate=RECENT_MIN, maxdate=THIS_YEAR
// Should return non-zero count of recent primary studies
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [C] AC-recent: NEW form + date filter (3-year window)...');
const pC = await esearch({
  term:     QUERY_NEW,
  retmax:   1,
  datetype: 'pdat',
  mindate:  RECENT_MIN,
  maxdate:  THIS_YEAR,
});
// Control: what does the OLD form return for recent studies?
await sleep(400);
const pCold = await esearch({
  term:     QUERY_OLD,
  retmax:   1,
  datetype: 'pdat',
  mindate:  RECENT_MIN,
  maxdate:  THIS_YEAR,
});
const acRecent = pC.total > 0;
console.log(`\nProbeC AC-recent (${RECENT_MIN}–${THIS_YEAR}):`);
console.log(`  NEW (NOT): status=${pC.status} total=${pC.total}  ${acRecent ? '✅ PASS' : '❌ FAIL'} (expect >0 primary studies)`);
console.log(`  OLD (AND NOT): total=${pCold.total}  (should be ~recent SR count, much lower)`);
console.log(`  Ratio NEW/OLD: ${pCold.total > 0 ? (pC.total / pCold.total).toFixed(1) : 'N/A'}×`);
process.stderr.write(' done\n');

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe D — AC-screen: fetchPrimaryStudiesForScreening mirror
// mirrors: `(query) NOT systematic[sb]`, retmax=20
// Checks: Mitchell SR PMID (22631616) NOT in result set
// Spot-checks publication type of first returned PMID via EFetch
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [D] AC-screen: fetch top 20 PMIDs, check SR exclusion...');
const pD = await esearch({ term: QUERY_NEW, retmax: 20 });
const srInResults  = pD.pmids.includes(MITCHELL_SR_PMID);
const acScreen     = !srInResults;
console.log(`\nProbeD AC-screen (retmax=20): status=${pD.status} returned=${pD.pmids.length}`);
console.log(`  Mitchell SR PMID ${MITCHELL_SR_PMID} in results: ${srInResults}`);
console.log(`  AC-screen (SR excluded): ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
process.stderr.write(' done\n');

// Spot-check type of first returned PMID
if (pD.pmids.length > 0) {
  await sleep(400);
  process.stderr.write(`  [D-type] Spot-check PMID ${pD.pmids[0]} publication type...`);
  const ft = await efetchType(pD.pmids[0]);
  const isSR = ft.types.some(t => /systematic review|meta-analysis|review/i.test(t));
  console.log(`  Spot-check PMID ${ft.pmid}:`);
  console.log(`    Title: ${ft.title}`);
  console.log(`    Types: [${ft.types.join(', ')}]`);
  console.log(`    Is SR/meta: ${isSR ? '⚠ YES — check if exclusion working' : '✓ NO — primary study'}`);
  process.stderr.write(' done\n');
}

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe E — SR exclusion check (bidirectional)
// Mitchell SR PMID (22631616) should be IN `AND systematic[sb]` results
// and NOT IN `NOT systematic[sb]` results
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [E] SR-exclusion bidirectional check...');
// Check positive SR filter returns the SR
const pE_sr = await esearch({ term: QUERY_SR, retmax: 200 });
await sleep(400);
// Check if SR PMID appears when Mitchell SR is explicitly targeted
const pE_target = await esearch({ term: `${MITCHELL_SR_PMID}[uid] AND systematic[sb]`, retmax: 1 });
await sleep(400);
// Check SR PMID not in primary set
const pE_prim = await esearch({ term: `${MITCHELL_SR_PMID}[uid] NOT systematic[sb]`, retmax: 1 });
const srInSRFilter   = pE_target.total > 0;
const srInPrimFilter = pE_prim.total > 0;
console.log(`\nProbeE SR-exclusion bidirectional:`);
console.log(`  SR filter count (AND systematic[sb]): ${pE_sr.total}`);
console.log(`  Mitchell SR (${MITCHELL_SR_PMID}) in AND systematic[sb]: ${srInSRFilter ? '✓ YES (found)' : '⚠ NO (not found as SR)'}`);
console.log(`  Mitchell SR (${MITCHELL_SR_PMID}) in NOT systematic[sb]: ${srInPrimFilter ? '❌ YES — SR leaking into primary results' : '✓ NO — correctly excluded'}`);
process.stderr.write(' done\n');

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe F — Recall regression: fetchPrimaryStudyIds (handoff 106, unchanged in 107)
// Mirrors production: `(query) NOT systematic[sb]`, retmax=2000, sort=relevance
// Expect: same recall as validation 006 (4/5 = 80%, McCluskey 1991 still missed)
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [F] REGRESSION: fetchPrimaryStudyIds recall (retmax=2000, relevance)...');
const pF = await esearch({ term: QUERY_NEW, retmax: 2000, sort: 'relevance' });
const pFr = hits(pF.pmids, TRUTH);
console.log(`\nProbeF REGRESSION recall: status=${pF.status} total=${pF.total} returned=${pF.pmids.length}`);
console.log(`  hits=${pFr.n}/${TRUTH.length} recall=${(pFr.recall * 100).toFixed(0)}%`);
if (pFr.missed.length) console.log(`  missed: ${pFr.missed.join(', ')}`);
TRUTH.forEach(t => {
  const idx = pF.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: rank ${idx + 1}/${pF.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${pF.pmids.length}`);
});
const acRegression = pFr.n >= 4;  // was 4/5 in validation 006
console.log(`  REGRESSION (≥4/5 to match v006): ${acRegression ? '✅ PASS' : '❌ FAIL — handoff 107 may have regressed 106 fix'}`);
process.stderr.write(' done\n');

await sleep(600);

// ─────────────────────────────────────────────────────────────────────────────
// Probe G — Generalization: second topic (statin / CVD)
// Count-only test: confirms fix is not CBT-I specific
// Expect: OLD returns a small count (SR-heavy), NEW returns much larger primary count
// ─────────────────────────────────────────────────────────────────────────────
process.stderr.write('  [G] GENERALIZATION: second topic count probes...');
const pGold = await esearch({ term: GEN_OLD, retmax: 1 });
await sleep(400);
const pGnew = await esearch({ term: GEN_NEW, retmax: 1 });
const genRatio = pGold.total > 0 ? pGnew.total / pGold.total : null;
const acGen    = genRatio !== null && genRatio > 3;  // NEW should be substantially larger
console.log(`\nProbeG GENERALIZATION (${GEN_TOPIC.slice(0, 40)}...):`);
console.log(`  OLD (AND NOT): total=${pGold.total}  (expect SR-sized, much smaller)`);
console.log(`  NEW (NOT):     total=${pGnew.total}  (expect primary-study-sized, much larger)`);
console.log(`  Ratio: ${genRatio !== null ? genRatio.toFixed(1) + '×' : 'N/A'} (expect >3×)`);
console.log(`  GENERALIZATION: ${acGen ? '✅ PASS — binary NOT scales to second domain' : '❌ FAIL — unexpectedly small ratio'}`);
process.stderr.write(' done\n');

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n── Acceptance Criteria Summary ──');
console.log(`AC-count         (≥3000 primary):  ${acCount     ? '✅ PASS' : '❌ FAIL'}  (${pB.total})`);
console.log(`AC-recent        (>0 recent prim):  ${acRecent    ? '✅ PASS' : '❌ FAIL'}  (${pC.total})`);
console.log(`AC-screen        (SR PMID absent):  ${acScreen    ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-no-inversion  (sets disjoint):   ${acNoInversion ? '✅ PASS' : '❌ FAIL'}  (overlap=${overlap.length})`);
console.log(`REGRESSION       (recall ≥4/5):     ${acRegression  ? '✅ PASS' : '❌ FAIL'}  (${pFr.n}/5)`);
console.log(`GENERALIZATION   (ratio >3×):       ${acGen         ? '✅ PASS' : '❌ FAIL'}  (${genRatio !== null ? genRatio.toFixed(1) + '×' : 'N/A'})`);

const allPass = acCount && acRecent && acScreen && acNoInversion && acRegression && acGen;
console.log(`\nOverall: ${allPass ? '✅ ALL PASS' : '❌ ONE OR MORE FAIL'}`);
console.log('\n=== End of Harness ===');
