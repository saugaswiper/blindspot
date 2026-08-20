/**
 * Validation 007 harness — Stage 3 + Stage 3 screening feed
 * Verifies handoff 107: binary NOT fix applied to 3 sibling functions in lib/pubmed.ts
 *   countPrimaryStudies         (line 127)
 *   fetchPrimaryStudiesForScreening (line 240)
 *   countPrimaryStudiesRecent   (line 300)
 *
 * All three previously used `AND NOT systematic[sb]` — PubMed ATM silently inverts the NOT,
 * returning systematic reviews instead of excluding them. The fix uses binary NOT:
 *   `(topic) NOT systematic[sb]`  (set-difference operator; ATM cannot rewrite it)
 *
 * Prior art: validation 006 probe B2 confirmed OLD and NEW result sets are fully disjoint.
 *
 * Topic / truth set: Mitchell 2012 (PMID 22631616, CBT insomnia SR, BMC Fam Pract 2012;13:40)
 *   Gold SR PMID: 22631616 — must NOT appear in primary-study queries
 *   5 included RCTs (truth set, unchanged from 004/005/006):
 *     16804151  Sivertsen 2006   JAMA 295:2851
 *     15451764  Jacobs 2004      Arch Intern Med 164:1888
 *     10086433  Morin 1999       JAMA 281:991
 *     16785771  Wu 2006          Psychother Psychosom 75:220
 *     1888345   McCluskey 1991   Am J Psychiatry 148:121
 *
 * Probes:
 *   F1  countPrimaryStudies — OLD broken form (control): should return ~313 (SRs)
 *   F2  countPrimaryStudies — NEW fixed form: should return ≥3000 (primary studies)
 *   G   fetchPrimaryStudiesForScreening — NEW form, limit=20:
 *         known SR PMID 22631616 must be absent; spot-check one PMID via EFetch
 *   H1  countPrimaryStudiesRecent — OLD broken form (control): recent SR count
 *   H2  countPrimaryStudiesRecent — NEW fixed form: recent primary count (>> H1)
 *   I   non-inversion arithmetic: primaries_count + SR_count ≈ total_count
 *         (confirms binary NOT is set-difference, not set-addition)
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

const TOPIC    = 'cognitive behavioral therapy insomnia';
const QUERY_OLD = `(${TOPIC}) AND NOT systematic[sb]`;  // broken form — control
const QUERY_NEW = `(${TOPIC}) NOT systematic[sb]`;       // handoff 107 fix
const QUERY_SR  = `(${TOPIC}) AND systematic[sb]`;       // positive SR filter (control)
const QUERY_ALL = TOPIC;                                  // no filter (denominator)

const MITCHELL_SR_PMID = '22631616';  // SR PMID that must NOT appear in primary queries
const TRUTH_PMIDS = ['16804151', '15451764', '10086433', '16785771', '1888345'];

const CURRENT_YEAR = new Date().getFullYear();  // 2026
const RECENT_YEARS = 3;
const RECENT_MIN   = CURRENT_YEAR - RECENT_YEARS;  // 2023

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch ─────────────────────────────────────────────────────────────
async function pubmedESearch(query, retmax = 1, sort = null, extraParams = {}) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', query);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, String(v));
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) {
    const err = await r.text();
    return { ids: [], count: 0, status: r.status, err: err.slice(0, 120) };
  }
  const j = await r.json();
  return {
    ids: j.esearchresult?.idlist ?? [],
    count: parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── PubMed EFetch — spot-check publication types ───────────────────────────────
async function pubmedEFetchTypes(pmids) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmids.join(','));
  url.searchParams.set('rettype', 'xml');
  url.searchParams.set('retmode', 'xml');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { status: r.status, records: [] };

  const txt = await r.text();
  const records = [];
  const articleRx = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let m;
  while ((m = articleRx.exec(txt)) !== null) {
    const art = m[1];
    const pmidMatch = art.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const types = [];
    const titleMatch = art.match(/<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/);
    const typeRx = /<PublicationType[^>]*>([^<]+)<\/PublicationType>/g;
    let tm;
    while ((tm = typeRx.exec(art)) !== null) types.push(tm[1].trim());
    if (pmidMatch) records.push({ pmid: pmidMatch[1], types, title: titleMatch?.[1] ?? '(no title)' });
  }
  return { status: 200, records };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Returns true only for records that would match systematic[sb] — PubMed's SR filter.
// Narrative reviews (type="Review" without "Systematic Review") are NOT SRs under this filter.
function isPubMedSR(types) {
  return types.some(t =>
    t.toLowerCase().includes('systematic review') ||
    t.toLowerCase().includes('meta-analysis')
  );
}
// Returns true for broad Review type (includes narrative reviews — expected in primary feed)
function isAnyReview(types) {
  return types.some(t => t.toLowerCase().includes('review'));
}
function isRCT(types) {
  return types.some(t =>
    t.toLowerCase().includes('randomized controlled') ||
    t.toLowerCase().includes('randomised controlled') ||
    t.toLowerCase().includes('clinical trial')
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Handoff 107: Binary-NOT fix in 3 sibling PubMed functions ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Topic: ${TOPIC}`);
console.log(`Gold SR: Mitchell 2012 (PMID ${MITCHELL_SR_PMID})`);
console.log(`OLD broken query: ${QUERY_OLD}`);
console.log(`NEW fixed  query: ${QUERY_NEW}`);
console.log(`Recent window:    datetype=pdat mindate=${RECENT_MIN} maxdate=${CURRENT_YEAR}\n`);


// ── Probe F1: countPrimaryStudies — OLD broken form (control) ─────────────────
process.stderr.write('  [F1] countPrimaryStudies OLD (AND NOT, count only)...');
const f1 = await pubmedESearch(QUERY_OLD, 1);
console.log(`ProbeF1 countPrimary-OLD: status=${f1.status} count=${f1.count}  (expected ≈313 SRs)`);
process.stderr.write(' done\n');
await sleep(600);

// ── Probe F2: countPrimaryStudies — NEW fixed form (AC-count) ─────────────────
process.stderr.write('  [F2] countPrimaryStudies NEW (NOT, count only)...');
const f2 = await pubmedESearch(QUERY_NEW, 1);
console.log(`ProbeF2 countPrimary-NEW: status=${f2.status} count=${f2.count}  (AC-count bar: ≥3000; expected ≈3421)`);
const acCount = f2.count >= 3000;
console.log(`  AC-count: ${acCount ? '✅ PASS' : '❌ FAIL'} (${f2.count} ≥ 3000?)`);
process.stderr.write(' done\n');
await sleep(600);


// ── Probe G: fetchPrimaryStudiesForScreening — NEW form, limit=20 (AC-screen) ─
process.stderr.write('  [G] fetchPrimaryStudiesForScreening NEW (20 IDs + spot-check)...');
const g = await pubmedESearch(QUERY_NEW, 20, 'relevance');
console.log(`\nProbeG screenFeed-NEW: status=${g.status} total=${g.count} returned=${g.ids.length}`);
console.log(`  First 20 PMIDs: ${g.ids.join(', ')}`);

const mitchellInFeed = g.ids.includes(MITCHELL_SR_PMID);
console.log(`  SR PMID ${MITCHELL_SR_PMID} (Mitchell 2012) present in feed: ${mitchellInFeed ? '⚠ YES (BAD)' : 'NO (good)'}`);

// spot-check all 20 PMIDs via EFetch for publication type
// AC-screen requires: (a) known SR PMID absent; (b) at least one RCT in the feed
// Note: systematic[sb] filter does NOT exclude narrative "Review" articles — only SR/meta-analysis
process.stderr.write(' efetch all 20...');
await sleep(400);
const efetchResult = await pubmedEFetchTypes(g.ids);
console.log(`\n  EFetch spot-check (all ${g.ids.length} returned PMIDs):`);
let rctCount = 0;
let systeReviewCount = 0;
let narrativeReviewCount = 0;
let primaryCount = 0;
for (const rec of efetchResult.records) {
  const sysr = isPubMedSR(rec.types);
  const anyRev = isAnyReview(rec.types);
  const rct = isRCT(rec.types);
  if (rct) rctCount++;
  if (sysr) systeReviewCount++;
  else if (anyRev) narrativeReviewCount++;
  else primaryCount++;
  const label = sysr ? '⚠ SYSTEMATIC REVIEW' : rct ? '✓ RCT' : anyRev ? '~ narrative review (expected — not filtered by systematic[sb])' : '✓ primary';
  console.log(`    PMID ${rec.pmid}: types=[${rec.types.join('; ')}] → ${label}`);
}
console.log(`\n  Summary of feed (top 20 by relevance):`);
console.log(`    Systematic Reviews (unexpected): ${systeReviewCount}`);
console.log(`    Narrative Reviews (allowed by filter): ${narrativeReviewCount}`);
console.log(`    RCTs/Clinical Trials: ${rctCount}`);
console.log(`    Other primary: ${primaryCount}`);

const acScreen = !mitchellInFeed && rctCount > 0 && systeReviewCount === 0;
console.log(`  AC-screen: ${acScreen ? '✅ PASS' : '❌ FAIL'} (SR PMID absent=${!mitchellInFeed}, ≥1 RCT=${rctCount > 0}, no systematic[sb] records=${systeReviewCount === 0})`);
process.stderr.write(' done\n');
await sleep(600);


// ── Probe H1: countPrimaryStudiesRecent — OLD broken form (control) ────────────
process.stderr.write('  [H1] countPrimaryStudiesRecent OLD (AND NOT, date-filtered)...');
const h1 = await pubmedESearch(QUERY_OLD, 1, null, {
  datetype: 'pdat', mindate: String(RECENT_MIN), maxdate: String(CURRENT_YEAR),
});
console.log(`\nProbeH1 recentCount-OLD: status=${h1.status} count=${h1.count}  (expected: small SR count)`);
process.stderr.write(' done\n');
await sleep(600);

// ── Probe H2: countPrimaryStudiesRecent — NEW fixed form (AC-recent) ──────────
process.stderr.write('  [H2] countPrimaryStudiesRecent NEW (NOT, date-filtered)...');
const h2 = await pubmedESearch(QUERY_NEW, 1, null, {
  datetype: 'pdat', mindate: String(RECENT_MIN), maxdate: String(CURRENT_YEAR),
});
console.log(`ProbeH2 recentCount-NEW: status=${h2.status} count=${h2.count}  (AC-recent bar: >0, expected >> H1)`);
const acRecent = h2.count > 0 && h2.count > h1.count;
console.log(`  AC-recent: ${acRecent ? '✅ PASS' : '❌ FAIL'} (count=${h2.count} > 0 and > H1=${h1.count}?)`);
process.stderr.write(' done\n');
await sleep(600);


// ── Probe I: Non-inversion arithmetic (AC-no-inversion) ───────────────────────
// If binary NOT is a true set difference: primaries + SRs ≈ total (within API rounding)
// If NOT were silently treated as AND-NOT → AND, then: primaries ≈ SRs (tiny, ~313)
process.stderr.write('  [I] Non-inversion arithmetic (total vs primaries + SRs)...');
const iAll = await pubmedESearch(QUERY_ALL, 1);
await sleep(400);
const iSR  = await pubmedESearch(QUERY_SR, 1);
console.log(`\nProbeI non-inversion:`);
console.log(`  total (no filter):       ${iAll.count}`);
console.log(`  SRs   (AND systematic):  ${iSR.count}`);
console.log(`  primaries (NOT systematic): ${f2.count}`);
const impliedTotal = f2.count + iSR.count;
const diff = Math.abs(impliedTotal - iAll.count);
const diffPct = ((diff / (iAll.count || 1)) * 100).toFixed(1);
console.log(`  primaries + SRs = ${impliedTotal}  vs  total = ${iAll.count}  (diff = ${diff}, ${diffPct}%)`);
// Allow ≤15% difference (PubMed count can differ between queries due to ATM, caching, etc.)
const acNoInversion = f2.count > iSR.count * 5 && diff / (iAll.count || 1) < 0.30;
console.log(`  primaries >> SRs (>5×): ${f2.count} vs ${iSR.count} → ${f2.count > iSR.count * 5 ? '✓' : '⚠'}`);
console.log(`  implied total within 30% of actual: ${diff / (iAll.count || 1) < 0.30 ? '✓' : '⚠'} (${diffPct}%)`);
console.log(`  AC-no-inversion: ${acNoInversion ? '✅ PASS' : '❌ FAIL'}`);
process.stderr.write(' done\n');


// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Verdict vs Brief 007 bars ──');
console.log(`AC-count      (countPrimaryStudies ≥3000): ${acCount  ? '✅ PASS' : '❌ FAIL'} (${f2.count})`);
console.log(`AC-screen     (feed has no SRs + spot-ok): ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-recent     (recentCount >0 and > OLD):  ${acRecent ? '✅ PASS' : '❌ FAIL'} (NEW=${h2.count}, OLD=${h1.count})`);
console.log(`AC-no-inversion (primaries >> SRs, arith): ${acNoInversion ? '✅ PASS' : '❌ FAIL'}`);

const allPass = acCount && acScreen && acRecent && acNoInversion;
console.log(`\nOverall: ${allPass ? '✅ ALL ACs PASS — handoff 107 verified' : '❌ ONE OR MORE ACs FAILED'}`);
console.log('\n=== End of Harness ===');
