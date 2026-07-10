/**
 * Validation 007 harness — Handoff 107: sibling function fixes in lib/pubmed.ts
 *
 * Handoff 107 applied the binary-NOT fix (proven in 106 / validated in 006) to three
 * sibling functions that still used `AND NOT systematic[sb]`:
 *   countPrimaryStudies        (line 124) → `(query) NOT systematic[sb]`
 *   fetchPrimaryStudiesForScreening (line 234) → `(query) NOT systematic[sb]`
 *   countPrimaryStudiesRecent  (line 293) → `(query) NOT systematic[sb]`
 *
 * Each probe mirrors the production API call pattern exactly (same retmax, sort, datetype).
 * A control run of the OLD broken form is included for each probe to confirm ATM inversion
 * still occurs with `AND NOT` (regression control).
 *
 * ACs from brief 007:
 *   AC-count        countPrimaryStudies → count ≥ 3000 (not ~313 SR count)
 *   AC-screen       fetchPrimaryStudiesForScreening → returns primary studies, not SRs
 *   AC-recent       countPrimaryStudiesRecent → non-zero AND greater than OLD count
 *   AC-no-inversion NEW and OLD forms produce disjoint result sets
 *   AC-regression   (static gate, already passed by dev — not re-run here)
 *
 * Gold SR: Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)
 * Primary topic: "cognitive behavioral therapy insomnia"
 * Second topic (count-level generalisation): "exercise type 2 diabetes"
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const TOPIC  = 'cognitive behavioral therapy insomnia';
const TOPIC2 = 'exercise type 2 diabetes';
const CURRENT_YEAR = new Date().getFullYear();

// Mitchell 2012 SR PMID — should NOT appear in a correctly-filtered primary-study set
// (it is a systematic review; if the filter is broken it returns SRs and this would appear
//  in a date-sorted result if it were recent, but its 2012 date means it may not be in
//  the first 20 of a date-sorted result either way — see probe 2b esummary for definitive check)
const MITCHELL_SR_PMID = '22631616';

// ── Utility ───────────────────────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function esearch(term, retmax = 1, opts = {}) {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (opts.sort)     url.searchParams.set('sort',     opts.sort);
  if (opts.datetype) url.searchParams.set('datetype', opts.datetype);
  if (opts.mindate)  url.searchParams.set('mindate',  String(opts.mindate));
  if (opts.maxdate)  url.searchParams.set('maxdate',  String(opts.maxdate));
  if (ncbiKey)       url.searchParams.set('api_key',  ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    return { count: 0, ids: [], status: r.status, err: err.slice(0, 200) };
  }
  const j = await r.json();
  return {
    count: parseInt(j.esearchresult?.count ?? '0', 10),
    ids:   j.esearchresult?.idlist ?? [],
    status: 200,
  };
}

// esummary: fetch article metadata (title + pub types) for spot-check
async function esummary(pmids) {
  if (pmids.length === 0) return {};
  const url = new URL(`${BASE}/esummary.fcgi`);
  url.searchParams.set('db',      'pubmed');
  url.searchParams.set('id',      pmids.join(','));
  url.searchParams.set('retmode', 'json');
  url.searchParams.set('version', '2.0');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return {};
  const j = await r.json();
  const out = {};
  for (const pmid of pmids) {
    const rec = j.result?.[pmid];
    if (rec) {
      out[pmid] = {
        title:   rec.title ?? '',
        pubdate: rec.pubdate ?? '',
        pubtype: rec.pubtype ?? [],
      };
    }
  }
  return out;
}

// ── Header ────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Handoff 107: Sibling Function Fixes in lib/pubmed.ts ===');
console.log(`Date:        ${new Date().toISOString().slice(0, 10)}`);
console.log(`Primary topic:  "${TOPIC}"`);
console.log(`Secondary topic:"${TOPIC2}"`);
console.log(`Gold SR:     Mitchell 2012 (PMID ${MITCHELL_SR_PMID})`);
console.log(`NCBI API key: ${ncbiKey ? 'present' : 'absent (rate-limited)'}`);
console.log('');

// ──────────────────────────────────────────────────────────────────────────────
// PROBE 1 — countPrimaryStudies
// Mirrors production code: esearch(`(${query}) NOT systematic[sb]`, 1)
// Old broken form:         esearch(`(${query}) AND NOT systematic[sb]`, 1)
// retmax=1 is used because production only needs the count.
// ──────────────────────────────────────────────────────────────────────────────
console.log('── Probe 1: countPrimaryStudies ──────────────────────────────────────────────');

process.stderr.write('  [1a] countPrimaryStudies NEW form (NOT, retmax=1)...');
const p1new = await esearch(`(${TOPIC}) NOT systematic[sb]`, 1);
console.log(`Probe1a countPS-NEW: status=${p1new.status} count=${p1new.count}`);
process.stderr.write(' done\n');
await sleep(600);

process.stderr.write('  [1b] countPrimaryStudies OLD form (AND NOT, retmax=1, control)...');
const p1old = await esearch(`(${TOPIC}) AND NOT systematic[sb]`, 1);
console.log(`Probe1b countPS-OLD: status=${p1old.status} count=${p1old.count}`);
process.stderr.write(' done\n');
await sleep(600);

const acCount = p1new.count >= 3000;
const countRatio = p1old.count > 0 ? (p1new.count / p1old.count).toFixed(1) : 'N/A';
console.log(`Probe1 summary: NEW=${p1new.count} OLD=${p1old.count} ratio=${countRatio}x`);
console.log(`AC-count (≥3000): ${acCount ? '✅ PASS' : '❌ FAIL'} (got ${p1new.count})\n`);

// ──────────────────────────────────────────────────────────────────────────────
// PROBE 2 — fetchPrimaryStudiesForScreening
// Mirrors production code: esearch(`(${query}) NOT systematic[sb]`, Math.min(limit, 10000))
// No sort (production code passes no sort arg → PubMed default: date, most-recent first)
// We use retmax=20 to keep network cost low; check total count + spot-check pub types.
// ──────────────────────────────────────────────────────────────────────────────
console.log('── Probe 2: fetchPrimaryStudiesForScreening ──────────────────────────────────');

process.stderr.write('  [2a] screen NEW form (NOT, retmax=20, no sort)...');
const p2new = await esearch(`(${TOPIC}) NOT systematic[sb]`, 20);
console.log(`Probe2a screen-NEW: status=${p2new.status} total=${p2new.count} returned=${p2new.ids.length}`);
console.log(`  PMIDs: ${p2new.ids.join(', ')}`);
const mitchellInNew = p2new.ids.includes(MITCHELL_SR_PMID);
console.log(`  Mitchell SR (${MITCHELL_SR_PMID}) in result: ${mitchellInNew ? '⚠ YES (unexpected)' : 'no (expected)'}`);
process.stderr.write(' done\n');
await sleep(600);

// Spot-check: pub types for first 5 returned PMIDs (is the filter returning SRs or primary studies?)
process.stderr.write('  [2b] esummary spot-check on first 5 PMIDs...');
const spotPmids = p2new.ids.slice(0, 5);
const spotMeta = await esummary(spotPmids);
console.log(`\nProbe2b esummary spot-check (first 5 of ${p2new.ids.length}):`);
let srCountInSpot = 0;
for (const pmid of spotPmids) {
  const m = spotMeta[pmid];
  if (m) {
    const isSR = m.pubtype.some(t => /systematic review|meta.analy/i.test(t));
    if (isSR) srCountInSpot++;
    console.log(`  PMID ${pmid} (${m.pubdate}): ${m.pubtype.join('; ') || 'no types'} — ${isSR ? '⚠ SR/MA' : 'primary study'}`);
    if (m.title) console.log(`    title: ${m.title.slice(0, 90)}...`);
  } else {
    console.log(`  PMID ${pmid}: no esummary data`);
  }
}
process.stderr.write(' done\n');
await sleep(600);

// Control: old broken form (should return SRs in the top results)
process.stderr.write('  [2c] screen OLD form (AND NOT, retmax=20, no sort, control)...');
const p2old = await esearch(`(${TOPIC}) AND NOT systematic[sb]`, 20);
const mitchellInOld = p2old.ids.includes(MITCHELL_SR_PMID);
console.log(`\nProbe2c screen-OLD: status=${p2old.status} total=${p2old.count} returned=${p2old.ids.length}`);
console.log(`  Mitchell SR (${MITCHELL_SR_PMID}) in OLD result: ${mitchellInOld ? 'yes' : 'no'}`);
process.stderr.write(' done\n');
await sleep(600);

// Spot-check OLD form pub types to confirm it returns SRs (regression control)
process.stderr.write('  [2d] esummary spot-check OLD form (first 5)...');
const spotOldPmids = p2old.ids.slice(0, 5);
const spotOldMeta = await esummary(spotOldPmids);
console.log(`\nProbe2d esummary OLD form (first 5 of ${p2old.ids.length}):`);
let srCountInOldSpot = 0;
for (const pmid of spotOldPmids) {
  const m = spotOldMeta[pmid];
  if (m) {
    const isSR = m.pubtype.some(t => /systematic review|meta.analy/i.test(t));
    if (isSR) srCountInOldSpot++;
    console.log(`  PMID ${pmid} (${m.pubdate}): ${m.pubtype.join('; ') || 'no types'} — ${isSR ? 'SR/MA (expected in broken form)' : 'primary study (unexpected in broken form)'}`);
  }
}
process.stderr.write(' done\n');
await sleep(600);

// AC-screen verdict
// Primary criterion: total count ≥ 3000 (filter is producing primary studies, not SRs)
// Secondary criterion: esummary spot-check shows ≤1 SR in the top 5 (primary studies at top)
const acScreenCount = p2new.count >= 3000;
const acScreenPubtype = srCountInSpot <= 1;
const acScreen = acScreenCount && acScreenPubtype;
console.log(`\nProbe2 summary: NEW total=${p2new.count} OLD total=${p2old.count}`);
console.log(`  SRs in NEW spot-check (top 5): ${srCountInSpot}/5 | SRs in OLD spot-check: ${srCountInOldSpot}/5`);
console.log(`AC-screen (count≥3000 AND ≤1 SR in top 5): ${acScreen ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  count criterion: ${acScreenCount ? 'PASS' : 'FAIL'} (${p2new.count} ≥ 3000)`);
console.log(`  pubtype criterion: ${acScreenPubtype ? 'PASS' : 'FAIL'} (${srCountInSpot}/5 are SRs)\n`);

// ──────────────────────────────────────────────────────────────────────────────
// PROBE 3 — countPrimaryStudiesRecent
// Mirrors production code: term=`(${query}) NOT systematic[sb]`, datetype=pdat,
//   mindate=currentYear-years, maxdate=currentYear  (years=3 default)
// Note: production uses direct URL construction, not esearch(); we replicate params.
// ──────────────────────────────────────────────────────────────────────────────
console.log('── Probe 3: countPrimaryStudiesRecent ────────────────────────────────────────');

const minYear = CURRENT_YEAR - 3;
process.stderr.write(`  [3a] recentPS NEW form (NOT, datetype=pdat, ${minYear}–${CURRENT_YEAR})...`);
const p3new = await esearch(
  `(${TOPIC}) NOT systematic[sb]`, 1,
  { datetype: 'pdat', mindate: minYear, maxdate: CURRENT_YEAR }
);
console.log(`Probe3a recentPS-NEW: status=${p3new.status} count=${p3new.count} (${minYear}–${CURRENT_YEAR})`);
process.stderr.write(' done\n');
await sleep(600);

process.stderr.write(`  [3b] recentPS OLD form (AND NOT, datetype=pdat, ${minYear}–${CURRENT_YEAR}, control)...`);
const p3old = await esearch(
  `(${TOPIC}) AND NOT systematic[sb]`, 1,
  { datetype: 'pdat', mindate: minYear, maxdate: CURRENT_YEAR }
);
console.log(`Probe3b recentPS-OLD: status=${p3old.status} count=${p3old.count} (${minYear}–${CURRENT_YEAR})`);
process.stderr.write(' done\n');
await sleep(600);

const acRecent = p3new.count > 0 && p3new.count > p3old.count;
const recentRatio = p3old.count > 0 ? (p3new.count / p3old.count).toFixed(1) : 'N/A';
console.log(`Probe3 summary: NEW=${p3new.count} OLD=${p3old.count} ratio=${recentRatio}x`);
console.log(`AC-recent (>0 AND NEW>OLD): ${acRecent ? '✅ PASS' : '❌ FAIL'}\n`);

// ──────────────────────────────────────────────────────────────────────────────
// PROBE 4 — AC-no-inversion (disjoint-set confirmation for fetchPrimaryStudiesForScreening)
// Uses retmax=100 to get overlapping ID lists (like validation 006 probe B2, but for screening fn).
// If the binary-NOT is honoured, OLD and NEW result sets should be disjoint (0 overlap).
// ──────────────────────────────────────────────────────────────────────────────
console.log('── Probe 4: AC-no-inversion (disjoint-set, retmax=100) ───────────────────────');

process.stderr.write('  [4a] disjoint-set NEW form (NOT, retmax=100, no sort)...');
const p4new = await esearch(`(${TOPIC}) NOT systematic[sb]`, 100);
process.stderr.write(' done\n');
await sleep(600);

process.stderr.write('  [4b] disjoint-set OLD form (AND NOT, retmax=100, no sort)...');
const p4old = await esearch(`(${TOPIC}) AND NOT systematic[sb]`, 100);
process.stderr.write(' done\n');
await sleep(600);

const newSet4 = new Set(p4new.ids);
const overlap4 = p4old.ids.filter(id => newSet4.has(id));
const acNoInversion = overlap4.length === 0 && p4new.count !== p4old.count;
console.log(`Probe4 disjoint: NEW total=${p4new.count} ids=${p4new.ids.length} | OLD total=${p4old.count} ids=${p4old.ids.length}`);
console.log(`  Overlapping PMIDs: ${overlap4.length === 0 ? 'none (expected)' : overlap4.join(', ')}`);
console.log(`  Counts differ: ${p4new.count !== p4old.count ? 'yes' : 'no (unexpected)'}`);
console.log(`AC-no-inversion (disjoint AND counts differ): ${acNoInversion ? '✅ PASS' : '❌ FAIL'}\n`);

// ──────────────────────────────────────────────────────────────────────────────
// PROBE 5 — Topic 2 count-level generalisation
// Tests that the inversion fix generalises beyond the Mitchell 2012 CBT-insomnia topic.
// Uses "exercise type 2 diabetes" — a different clinical domain.
// Does NOT include a recall truth set (full second-SR recall test is a follow-on task).
// ──────────────────────────────────────────────────────────────────────────────
console.log('── Probe 5: Topic 2 generalisation (exercise type 2 diabetes) ────────────────');

process.stderr.write('  [5a] topic2 NEW form (NOT, retmax=1)...');
const p5new = await esearch(`(${TOPIC2}) NOT systematic[sb]`, 1);
console.log(`Probe5a topic2-NEW: status=${p5new.status} count=${p5new.count}`);
process.stderr.write(' done\n');
await sleep(600);

process.stderr.write('  [5b] topic2 OLD form (AND NOT, retmax=1, control)...');
const p5old = await esearch(`(${TOPIC2}) AND NOT systematic[sb]`, 1);
console.log(`Probe5b topic2-OLD: status=${p5old.status} count=${p5old.count}`);
process.stderr.write(' done\n');

const topic2Ratio = p5old.count > 0 ? (p5new.count / p5old.count).toFixed(1) : 'N/A';
const acTopic2 = p5new.count > p5old.count && p5new.count >= 1000;
console.log(`Probe5 summary: NEW=${p5new.count} OLD=${p5old.count} ratio=${topic2Ratio}x`);
console.log(`AC-topic2 (NEW>OLD AND ≥1000): ${acTopic2 ? '✅ PASS' : '❌ FAIL'}\n`);

// ──────────────────────────────────────────────────────────────────────────────
// SUMMARY TABLE
// ──────────────────────────────────────────────────────────────────────────────
console.log('══ Brief 007 AC verdict ══════════════════════════════════════════════════════');
console.log(`AC-count        (countPrimaryStudies ≥ 3000):          ${acCount       ? '✅ PASS' : '❌ FAIL'}  (${p1new.count})`);
console.log(`AC-screen       (count≥3000 AND ≤1 SR in top-5):      ${acScreen      ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-recent       (recentPS > 0 AND > OLD):              ${acRecent      ? '✅ PASS' : '❌ FAIL'}  (${p3new.count} vs ${p3old.count})`);
console.log(`AC-no-inversion (ID sets disjoint, counts differ):     ${acNoInversion ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-topic2-gen   (exercise T2D NEW>OLD AND ≥1000):      ${acTopic2      ? '✅ PASS' : '❌ FAIL'}  (${p5new.count})`);
console.log('');
console.log('=== End of harness ===');
