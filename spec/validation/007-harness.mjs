/**
 * Validation 007 harness — Handoff 107 sibling-function fix
 *
 * Handoff 107 applied the binary `NOT systematic[sb]` fix (from handoff 106) to the
 * three remaining sites in lib/pubmed.ts:
 *
 *   Site 1: countPrimaryStudies       (line 124)  – count query, no date filter
 *   Site 2: fetchPrimaryStudiesForScreening (line 240) – id fetch, retmax=limit
 *   Site 3: countPrimaryStudiesRecent (line 300)  – count query, date filter
 *
 * Each probe mirrors the function's exact ESearch call. We do NOT call the TypeScript
 * functions directly — we replicate their query strings via the public ESearch API so
 * the harness is independent of app-code internals.
 *
 * Gold SR (Site 2 negative control): Mitchell et al. 2012 (PMID 22631616)
 *   "a systematic review" — should NOT appear in screening feed.
 * Truth PMIDs (Site 2 positive control): 5 RCTs from Mitchell 2012
 *   16804151, 15451764, 10086433, 16785771, 1888345
 *
 * Acceptance criteria (brief 007):
 *   AC-screen : fetchPrimaryStudiesForScreening result does NOT contain SR PMID 22631616;
 *               spot-checked PMIDs are primary article types (not meta-analyses / SRs)
 *   AC-count  : countPrimaryStudies returns count consistent with ≥3000 (old: ~313)
 *   AC-recent : countPrimaryStudiesRecent returns a non-zero count of recent primary studies
 *   AC-no-inv : OLD (AND NOT) form returns ~313 SRs; NEW (NOT) form returns ~3000+ primaries
 *               The two counts are in different order-of-magnitude ranges (>5× apart)
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';

const TOPIC      = 'cognitive behavioral therapy insomnia';
const QUERY_NEW  = `(${TOPIC}) NOT systematic[sb]`;          // fixed form
const QUERY_OLD  = `(${TOPIC}) AND NOT systematic[sb]`;      // broken form (control)

// Known SR PMID — must NOT appear in screening feed if fix is correct
const SR_PMID    = '22631616';  // Mitchell 2012

// Mitchell 2012 included-RCT truth set (validated in 004/005/006)
const TRUTH_RCTS = ['16804151', '15451764', '10086433', '16785771', '1888345'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── ESearch helper ─────────────────────────────────────────────────────────────
async function esearch(term, retmax, extra = {}) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', term);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (extra.datetype)  url.searchParams.set('datetype', extra.datetype);
  if (extra.mindate)   url.searchParams.set('mindate',  String(extra.mindate));
  if (extra.maxdate)   url.searchParams.set('maxdate',  String(extra.maxdate));
  if (extra.sort)      url.searchParams.set('sort',     extra.sort);
  if (ncbiKey)         url.searchParams.set('api_key',  ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { ids: [], count: 0, status: r.status, err: await r.text() };
  const j = await r.json();
  return {
    ids:    j.esearchresult?.idlist ?? [],
    count:  parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── ESummary — get pub-type for spot-check ─────────────────────────────────────
async function esummary(pmids) {
  if (!pmids.length) return {};
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('id', pmids.join(','));
  url.searchParams.set('retmode', 'json');
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { error: r.status };
  const j = await r.json();
  const result = j.result ?? {};
  const out = {};
  for (const id of pmids) {
    const rec = result[id];
    if (rec) {
      out[id] = {
        title:   (rec.title ?? '').slice(0, 80),
        pubtypes: (rec.pubtype ?? []).join('; '),
        year:    rec.pubdate?.slice(0, 4) ?? '?',
      };
    }
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isSrType(pubtypes) {
  const s = (pubtypes ?? '').toLowerCase();
  return s.includes('systematic review') || s.includes('meta-analysis') || s.includes('review');
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 007 — Handoff 107: sibling-function AND NOT fix ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Topic: ${TOPIC}`);
console.log(`NEW query: ${QUERY_NEW}`);
console.log(`OLD query (control): ${QUERY_OLD}`);
console.log(`SR negative-control: PMID ${SR_PMID} (Mitchell 2012)\n`);

// ── P1: countPrimaryStudies mirror (NEW form, no date) ────────────────────────
process.stderr.write('  [P1] countPrimaryStudies mirror (NEW, retmax=1, no date)...');
const p1New = await esearch(QUERY_NEW, 1);
console.log(`P1-NEW countPrimaryStudies: status=${p1New.status} count=${p1New.count}`);
process.stderr.write(' done\n');
await sleep(600);

// ── P4: countPrimaryStudies mirror (OLD broken form, control) ─────────────────
process.stderr.write('  [P4] countPrimaryStudies OLD form (AND NOT, retmax=1, control)...');
const p4Old = await esearch(QUERY_OLD, 1);
console.log(`P4-OLD countPrimaryStudies (control): status=${p4Old.status} count=${p4Old.count}`);
process.stderr.write(' done\n');
await sleep(600);

// ── P1 vs P4 AC-no-inversion ratio ───────────────────────────────────────────
const ratio = p4Old.count > 0 ? (p1New.count / p4Old.count).toFixed(1) : 'N/A';
const inversionFlipped = p1New.count > p4Old.count * 5;
console.log(`P1/P4 ratio: ${p1New.count} / ${p4Old.count} = ${ratio}× (>5× required for AC-no-inversion)`);
console.log(`AC-no-inversion: ${inversionFlipped ? '✅ PASS' : '❌ FAIL'} — new form returns ${inversionFlipped ? 'far more' : 'NOT sufficiently more'} records than old`);

// ── P2: fetchPrimaryStudiesForScreening mirror (NEW form, retmax=20) ──────────
await sleep(600);
process.stderr.write('\n  [P2] fetchPrimaryStudiesForScreening mirror (NEW, retmax=20)...');
const p2New = await esearch(QUERY_NEW, 20, { sort: undefined });
const hasSR = p2New.ids.includes(SR_PMID);
const truthInFeed = TRUTH_RCTS.filter(id => p2New.ids.includes(id));
console.log(`\nP2-NEW fetchPrimaryStudiesForScreening (retmax=20): status=${p2New.status} returned=${p2New.ids.length}`);
console.log(`  SR PMID ${SR_PMID} (Mitchell SR) in result: ${hasSR ? '⚠ YES (would be wrong)' : 'NO ✓'}`);
console.log(`  Truth RCTs in feed: ${truthInFeed.length}/${TRUTH_RCTS.length} — ${truthInFeed.join(', ') || 'none (expected; retmax=20 is small)'}`);
process.stderr.write(' done\n');
await sleep(600);

// ── P2 OLD form (control) — does SR PMID appear in broken-form feed? ──────────
process.stderr.write('  [P2-OLD] fetchPrimaryStudiesForScreening OLD form control (retmax=20)...');
const p2Old = await esearch(QUERY_OLD, 20);
const hasSROld = p2Old.ids.includes(SR_PMID);
const totalOldFeed = p2Old.count;
console.log(`P2-OLD feed (AND NOT, retmax=20): status=${p2Old.status} returned=${p2Old.ids.length} total=${totalOldFeed}`);
console.log(`  SR PMID ${SR_PMID} in OLD result: ${hasSROld ? 'YES (confirms inversion present in old form)' : 'NO'}`);
process.stderr.write(' done\n');
await sleep(600);

// ── P2 esummary spot-check of first 5 IDs from NEW feed ──────────────────────
process.stderr.write('  [P2-spot] esummary spot-check of first 5 PMIDs in NEW feed...');
const spot5 = p2New.ids.slice(0, 5);
const summaries = await esummary(spot5);
console.log(`\nP2-spot esummary spot-check (first 5 IDs from NEW feed):`);
let srCount = 0;
for (const [pmid, info] of Object.entries(summaries)) {
  const flag = isSrType(info.pubtypes) ? '⚠ SR-type' : '✓ primary';
  if (isSrType(info.pubtypes)) srCount++;
  console.log(`  PMID ${pmid} [${info.year}]: ${flag} | types="${info.pubtypes}" | title="${info.title}"`);
}
if (spot5.length > Object.keys(summaries).length) {
  console.log(`  (esummary returned ${Object.keys(summaries).length}/${spot5.length} records)`);
}
const spotSrRate = spot5.length > 0 ? `${srCount}/${spot5.length}` : 'N/A';
console.log(`Spot-check SR-type rate: ${spotSrRate} (expected: 0/${spot5.length} if fix correct)`);
process.stderr.write(' done\n');
await sleep(600);

// ── P3: countPrimaryStudiesRecent mirror (NEW form, last 3 years) ─────────────
const currentYear = new Date().getFullYear();
const minYear = currentYear - 3;
process.stderr.write(`\n  [P3] countPrimaryStudiesRecent mirror (NEW, ${minYear}–${currentYear})...`);
const p3New = await esearch(QUERY_NEW, 1, { datetype: 'pdat', mindate: minYear, maxdate: currentYear });
console.log(`\nP3-NEW countPrimaryStudiesRecent (${minYear}–${currentYear}): status=${p3New.status} count=${p3New.count}`);
process.stderr.write(' done\n');
await sleep(600);

// P3 OLD form control
process.stderr.write('  [P3-OLD] countPrimaryStudiesRecent OLD form (AND NOT, control)...');
const p3Old = await esearch(QUERY_OLD, 1, { datetype: 'pdat', mindate: minYear, maxdate: currentYear });
console.log(`P3-OLD countPrimaryStudiesRecent OLD (AND NOT, control): status=${p3Old.status} count=${p3Old.count}`);
process.stderr.write(' done\n');
const recentRatio = p3Old.count > 0 ? (p3New.count / p3Old.count).toFixed(1) : 'N/A';
console.log(`P3 ratio NEW/OLD: ${p3New.count} / ${p3Old.count} = ${recentRatio}× recent`);

// ── Verdict ───────────────────────────────────────────────────────────────────
console.log('\n── Verdict vs brief 007 bars ──');

const acNoInversion = p1New.count > p4Old.count * 5;
const acCount       = p1New.count >= 3000;
const acScreen      = !hasSR && srCount === 0;
const acRecent      = p3New.count > 0;

console.log(`AC-no-inversion : ${acNoInversion ? '✅ PASS' : '❌ FAIL'} — NEW count ${p1New.count} vs OLD ${p4Old.count} (ratio ${ratio}×)`);
console.log(`AC-count        : ${acCount ? '✅ PASS' : '❌ FAIL'} — countPrimaryStudies=${p1New.count} (bar: ≥3000)`);
console.log(`AC-screen       : ${acScreen ? '✅ PASS' : '❌ FAIL'} — SR 22631616 absent=${!hasSR}; spot SR-types=${srCount}/${spot5.length}`);
console.log(`AC-recent       : ${acRecent ? '✅ PASS' : '❌ FAIL'} — countPrimaryStudiesRecent=${p3New.count} (bar: >0)`);

console.log('\n=== End of Harness ===');
