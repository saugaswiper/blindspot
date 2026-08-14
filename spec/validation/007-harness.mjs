/**
 * Validation 007 harness — Sibling-function fixes from handoff 107
 *
 * Handoff 107 applied the binary-NOT fix (proven in handoff 106 / validation 006) to three
 * sibling functions in lib/pubmed.ts that still used AND NOT systematic[sb]:
 *
 *   countPrimaryStudies        (line 127) — feasibility count
 *   fetchPrimaryStudiesForScreening (line 240) — screening workbench feed
 *   countPrimaryStudiesRecent  (line 300) — study-count trend (NEW-2)
 *
 * Gold SR (carried from 004–006): Mitchell et al. 2012, BMC Fam Pract 13:40
 *   PMID 22631616; truth set: 16804151, 15451764, 10086433, 16785771, 1888345
 *
 * Second topic (generalisation — count-inversion check only):
 *   "exercise therapy depression" — no recall truth set; verifies fix is not topic-specific.
 *
 * Probes
 * ──────
 *  P1        AC-count:       countPrimaryStudies form — fixed query (NOT), retmax=1
 *  P1-ctrl   Control:        old broken form (AND NOT), retmax=1  → expect ~313
 *  P1-SR     Regression:     AND systematic[sb] (positive SR filter) → expect ≈ P1-ctrl
 *  P2        AC-recent:      countPrimaryStudiesRecent form — fixed query + date window
 *  P2-ctrl   Control:        old form + same date window
 *  P3        AC-screen:      fetchPrimaryStudiesForScreening form — retmax=20, no sort
 *              → Mitchell SR PMID (22631616) must NOT appear
 *              → EFetch spot-check: first 5 returned PMIDs pub-types must NOT include
 *                Systematic Review or Meta-Analysis
 *  P4        AC-no-inversion: set-overlap check between P1/P1-ctrl result IDs (retmax=500)
 *              → expect 0 overlap (disjoint sets)
 *  P5        Generalisation: second topic — same three queries (NOT / AND NOT / AND SR)
 *              → fixed count should >> control; control should ≈ SR count
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

// ── Constants ─────────────────────────────────────────────────────────────────
const TOPIC1 = 'cognitive behavioral therapy insomnia';
const TOPIC2 = 'exercise therapy depression';

// Mitchell 2012 truth set (unchanged from 004–006)
const TRUTH1 = ['16804151', '15451764', '10086433', '16785771', '1888345'];

// Mitchell SR PMID — must NOT appear in screening feed
const MITCHELL_SR_PMID = '22631616';

// Known additional SR PMIDs for CBT-I to spot-check exclusion
// Trauer et al. 2015 Annals (PMID 26054060) and van Straten et al. 2018 Sleep Med Rev
// (less certain of exact PMID, so only assert Mitchell definitively)
const KNOWN_SR_PMIDS = new Set([MITCHELL_SR_PMID]);

// Brief 007 AC bars
const AC_COUNT_MIN = 3000;   // countPrimaryStudies must return ≥ 3000 (pre-fix was 313 SRs)
const AC_COUNT_OLD_MAX = 500; // old form should stay ≤ 500 (known ~313 SRs)

// Date window for countPrimaryStudiesRecent — mirrors lib/pubmed.ts countPrimaryStudiesRecent
const CURRENT_YEAR = new Date().getFullYear();
const RECENT_YEARS = 3;
const MIN_YEAR = CURRENT_YEAR - RECENT_YEARS;

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch ────────────────────────────────────────────────────────────
async function esearch(term, retmax = 1, sort = null, extraParams = {}) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) {
    const txt = await r.text();
    return { count: 0, ids: [], status: r.status, err: txt.slice(0, 200) };
  }
  const j = await r.json();
  return {
    count: parseInt(j.esearchresult?.count ?? '0', 10),
    ids: j.esearchresult?.idlist ?? [],
    status: 200,
  };
}

// ── PubMed EFetch (publication type check) ───────────────────────────────────
async function efetchPubTypes(pmids) {
  if (!pmids.length) return [];
  const url = new URL(`${BASE}/efetch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmids.join(','));
  url.searchParams.set('rettype', 'xml');
  url.searchParams.set('retmode', 'xml');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return [];
  const xml = await r.text();

  const articles = [];
  const blocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];
  for (const block of blocks) {
    const pmid = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    const types = [...block.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)]
      .map(m => m[1].trim());
    const title = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
      ?.replace(/<[^>]+>/g, '').trim().slice(0, 80) ?? '(no title)';
    if (pmid) articles.push({ pmid, pubTypes: types, title });
  }
  return articles;
}

// ── Recall helper ─────────────────────────────────────────────────────────────
function recall(ids, truth) {
  const hits = truth.filter(t => ids.includes(t));
  const missed = truth.filter(t => !ids.includes(t));
  return { hits: hits.length, missed, pct: (hits.length / truth.length * 100).toFixed(0) };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Sibling-Function Fix Verification (Handoff 107) ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Topic 1: "${TOPIC1}"`);
console.log(`Topic 2: "${TOPIC2}" (generalisation)`);
console.log(`Gold SR: Mitchell 2012 (PMID ${MITCHELL_SR_PMID})`);
console.log(`Truth PMIDs (N=${TRUTH1.length}): ${TRUTH1.join(', ')}`);
console.log(`Recent window: ${MIN_YEAR}–${CURRENT_YEAR} (${RECENT_YEARS} yrs)`);
console.log('');

// ── P1: AC-count — countPrimaryStudies FIXED form ─────────────────────────────
process.stderr.write('[P1] countPrimaryStudies FIXED form (NOT systematic[sb], retmax=1)...');
await sleep(400);
const p1 = await esearch(`(${TOPIC1}) NOT systematic[sb]`, 1);
console.log(`P1  countPrimaryStudies-FIXED: status=${p1.status} count=${p1.count}`);
const acCount = p1.count >= AC_COUNT_MIN;
console.log(`  AC-count (≥${AC_COUNT_MIN}): ${acCount ? '✅ PASS' : '❌ FAIL'} — count=${p1.count}`);
process.stderr.write(' done\n');

// ── P1-ctrl: countPrimaryStudies BROKEN form (control) ───────────────────────
await sleep(400);
process.stderr.write('[P1-ctrl] Old broken form (AND NOT systematic[sb], retmax=1)...');
const p1ctrl = await esearch(`(${TOPIC1}) AND NOT systematic[sb]`, 1);
console.log(`P1-ctrl countPrimaryStudies-OLD: status=${p1ctrl.status} count=${p1ctrl.count}`);
console.log(`  Expect ≤${AC_COUNT_OLD_MAX} (SR-only count from 006 ~313): ${p1ctrl.count <= AC_COUNT_OLD_MAX ? '✅ consistent' : '⚠ unexpected — re-check'}`);
process.stderr.write(' done\n');

// ── P1-SR: countSystematicReviews regression (positive filter) ───────────────
await sleep(400);
process.stderr.write('[P1-SR] countSystematicReviews (AND systematic[sb], regression check)...');
const p1sr = await esearch(`${TOPIC1} AND systematic[sb]`, 1);
console.log(`P1-SR  countSystematicReviews:  status=${p1sr.status} count=${p1sr.count}`);
console.log(`  Old-form ≈ SR count? P1-ctrl=${p1ctrl.count} P1-SR=${p1sr.count} — delta=${Math.abs(p1ctrl.count - p1sr.count)}`);
console.log(`  (Small delta expected: AND NOT form returns SRs; positive AND form is the true SR count)`);
process.stderr.write(' done\n');

// ── P2: AC-recent — countPrimaryStudiesRecent FIXED form ─────────────────────
await sleep(400);
process.stderr.write(`[P2] countPrimaryStudiesRecent FIXED (NOT systematic[sb], ${MIN_YEAR}–${CURRENT_YEAR})...`);
const p2 = await esearch(
  `(${TOPIC1}) NOT systematic[sb]`,
  1,
  null,
  { datetype: 'pdat', mindate: String(MIN_YEAR), maxdate: String(CURRENT_YEAR) },
);
console.log(`P2  countPrimaryStudiesRecent-FIXED: status=${p2.status} count=${p2.count}`);
const acRecent = p2.count > 0;
console.log(`  AC-recent (> 0): ${acRecent ? '✅ PASS' : '❌ FAIL'} — count=${p2.count}`);
process.stderr.write(' done\n');

// ── P2-ctrl: old broken form + date filter ───────────────────────────────────
await sleep(400);
process.stderr.write('[P2-ctrl] Old form (AND NOT systematic[sb]) + date filter...');
const p2ctrl = await esearch(
  `(${TOPIC1}) AND NOT systematic[sb]`,
  1,
  null,
  { datetype: 'pdat', mindate: String(MIN_YEAR), maxdate: String(CURRENT_YEAR) },
);
console.log(`P2-ctrl countPrimaryStudiesRecent-OLD: status=${p2ctrl.status} count=${p2ctrl.count}`);
console.log(`  Fixed count (${p2.count}) >> old-form count (${p2ctrl.count})? ${p2.count > p2ctrl.count ? '✅ yes — inversion confirmed fixed' : '❌ no — investigate'}`);
process.stderr.write(' done\n');

// ── P3: AC-screen — fetchPrimaryStudiesForScreening FIXED form ────────────────
await sleep(500);
process.stderr.write('[P3] fetchPrimaryStudiesForScreening (NOT systematic[sb], retmax=20, no sort)...');
const p3 = await esearch(`(${TOPIC1}) NOT systematic[sb]`, 20);
const mitchellPresent = p3.ids.includes(MITCHELL_SR_PMID);
const knownSrPresent = p3.ids.filter(id => KNOWN_SR_PMIDS.has(id));
console.log(`P3  fetchPrimaryStudiesForScreening-FIXED: status=${p3.status} total=${p3.count} returned=${p3.ids.length}`);
console.log(`  Mitchell SR (${MITCHELL_SR_PMID}) in results: ${mitchellPresent ? '❌ FOUND (bug!)' : '✅ NOT FOUND'}`);
console.log(`  Other known SR PMIDs in results: ${knownSrPresent.length === 0 ? '✅ none' : '❌ ' + knownSrPresent.join(', ')}`);
console.log(`  First 10 returned PMIDs: ${p3.ids.slice(0, 10).join(', ')}`);
process.stderr.write(' done\n');

// Spot-check first 5 PMIDs via EFetch — verify pub types are NOT SR/MA
await sleep(600);
process.stderr.write('[P3-spot] EFetch pub-type spot-check on first 5 returned PMIDs...');
const spotPmids = p3.ids.slice(0, 5);
const pubTypeRecords = await efetchPubTypes(spotPmids);
console.log(`P3-spot EFetch pub-types (first 5 PMIDs):`);
let srFound = 0;
for (const rec of pubTypeRecords) {
  const isSR = rec.pubTypes.some(t => ['Systematic Review', 'Meta-Analysis', 'Review'].includes(t));
  console.log(`  PMID ${rec.pmid}: [${rec.pubTypes.join('; ')}]${isSR ? ' ⚠ REVIEW TYPE' : ' ✓ primary'}`);
  console.log(`    title: "${rec.title}"`);
  if (rec.pubTypes.some(t => ['Systematic Review', 'Meta-Analysis'].includes(t))) srFound++;
}
const acScreen = !mitchellPresent && srFound === 0;
console.log(`  AC-screen: ${acScreen ? '✅ PASS' : '❌ FAIL'} — SR PMID absent; SR/MA pub-types in spot=${srFound}/5`);
process.stderr.write(' done\n');

// ── P3-ctrl: old broken form — screening would have returned SRs ──────────────
await sleep(400);
process.stderr.write('[P3-ctrl] Old form (AND NOT systematic[sb], retmax=20) — screening control...');
const p3ctrl = await esearch(`(${TOPIC1}) AND NOT systematic[sb]`, 20);
const mitchellInCtrl = p3ctrl.ids.includes(MITCHELL_SR_PMID);
console.log(`P3-ctrl fetchPrimaryStudiesForScreening-OLD: returned=${p3ctrl.ids.length} total=${p3ctrl.count}`);
console.log(`  Mitchell SR (${MITCHELL_SR_PMID}) in old-form results: ${mitchellInCtrl ? '✓ FOUND (confirms bug in old form)' : '⚠ NOT FOUND (unexpected for old form)'}`);
process.stderr.write(' done\n');

// ── P4: AC-no-inversion — set-overlap check ──────────────────────────────────
await sleep(500);
process.stderr.write('[P4] Set-overlap: fixed vs. old form (retmax=500) ...');
const p4new = await esearch(`(${TOPIC1}) NOT systematic[sb]`, 500);
await sleep(400);
const p4old = await esearch(`(${TOPIC1}) AND NOT systematic[sb]`, 500);
const newSet = new Set(p4new.ids);
const oldSet = new Set(p4old.ids);
const overlap = p4new.ids.filter(id => oldSet.has(id));
console.log(`P4  Set-overlap diagnostic:`);
console.log(`  FIXED (NOT): total=${p4new.count} returned=${p4new.ids.length}`);
console.log(`  OLD (AND NOT): total=${p4old.count} returned=${p4old.ids.length}`);
console.log(`  In both: ${overlap.length}   FIXED-only: ${p4new.ids.filter(id => !oldSet.has(id)).length}   OLD-only: ${p4old.ids.filter(id => !newSet.has(id)).length}`);
const acNoInversion = overlap.length === 0 && p4new.ids.length > p4old.ids.length;
console.log(`  AC-no-inversion: ${acNoInversion ? '✅ PASS' : '❌ FAIL'} — overlap=${overlap.length} (expect 0); fixed>old: ${p4new.ids.length}>${p4old.ids.length}`);
if (overlap.length > 0) console.log(`  Overlapping PMIDs: ${overlap.slice(0, 10).join(', ')}`);
process.stderr.write(' done\n');

// ── P5: Generalisation — second topic (exercise therapy depression) ───────────
await sleep(500);
process.stderr.write(`[P5] Generalisation topic: "${TOPIC2}" ...\n`);

process.stderr.write('  [P5a] Fixed form (NOT systematic[sb])...');
await sleep(300);
const p5new = await esearch(`(${TOPIC2}) NOT systematic[sb]`, 1);
console.log(`P5a  TOPIC2 FIXED (NOT): status=${p5new.status} count=${p5new.count}`);
process.stderr.write(' done\n');

process.stderr.write('  [P5b] Old form (AND NOT systematic[sb])...');
await sleep(300);
const p5old = await esearch(`(${TOPIC2}) AND NOT systematic[sb]`, 1);
console.log(`P5b  TOPIC2 OLD (AND NOT): status=${p5old.status} count=${p5old.count}`);
process.stderr.write(' done\n');

process.stderr.write('  [P5c] SR positive filter (AND systematic[sb])...');
await sleep(300);
const p5sr = await esearch(`${TOPIC2} AND systematic[sb]`, 1);
console.log(`P5c  TOPIC2 SR-filter (AND SR): status=${p5sr.status} count=${p5sr.count}`);
const generalises = p5new.count > p5old.count && Math.abs(p5old.count - p5sr.count) < (p5sr.count * 0.5 + 10);
console.log(`  Generalisation: FIXED(${p5new.count}) >> OLD(${p5old.count}) >> SR-count(${p5sr.count})? ${p5new.count > p5old.count ? '✅ yes' : '❌ no'}`);
console.log(`  OLD ≈ SR-count (ATM inversion still present if broken)? ${Math.abs(p5old.count - p5sr.count) < (p5sr.count * 0.5 + 10) ? 'yes' : 'no'} — OLD=${p5old.count} SR=${p5sr.count}`);
process.stderr.write(' done\n');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Summary vs. Brief 007 ACs ──');
console.log(`AC-count   (countPrimaryStudies ≥${AC_COUNT_MIN}):   ${acCount ? '✅ PASS' : '❌ FAIL'} — ${p1.count}`);
console.log(`AC-recent  (countPrimaryStudiesRecent > 0): ${acRecent ? '✅ PASS' : '❌ FAIL'} — ${p2.count} recent primary studies (${MIN_YEAR}–${CURRENT_YEAR})`);
console.log(`AC-screen  (fetchPrimaryStudiesForScreening no SR): ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-no-inv  (disjoint sets, overlap=0):      ${acNoInversion ? '✅ PASS' : '❌ FAIL'}`);
const allPass = acCount && acRecent && acScreen && acNoInversion;
console.log(`\nOverall: ${allPass ? '✅ ALL PASS' : '❌ ONE OR MORE FAILED'}`);

console.log('\n=== End of Harness ===');
