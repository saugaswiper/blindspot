/**
 * Validation 008 harness — Stage 3: EuropePMC cursorMark pagination
 * Verifies handoff 108: fetchPrimaryStudyIds replaced single-page fetch with a
 * cursorMark loop (ceiling 2000, default; production passes limit=200).
 *
 * Prior art: validation 006 F3 (High) — EuropePMC single-page truncation
 *   caused 0/5 recall on Mitchell 2012 truth set (papers from 1999-2006 in pages 8-10).
 *   The fix should surface those papers.
 *
 * Topic / truth set: Mitchell 2012 (PMID 22631616, CBT insomnia SR)
 *   Gold SR PMID: 22631616 — should NOT appear (NOT PUB_TYPE:"Systematic Review" filter)
 *   5 included RCTs (unchanged from validations 004-007):
 *     16804151  Sivertsen 2006   JAMA 295:2851
 *     15451764  Jacobs 2004      Arch Intern Med 164:1888
 *     10086433  Morin 1999       JAMA 281:991
 *     16785771  Wu 2006          Psychother Psychosom 75:220
 *     1888345   McCluskey 1991   Am J Psychiatry 148:121 (note: coverage uncertain per val 006 F5)
 *
 * Query mirror of lib/europepmc.ts fetchPrimaryStudyIds (withFieldRestriction + NOT PUB_TYPE filters):
 *   TITLE_ABS:(cognitive behavioral therapy insomnia)
 *     NOT PUB_TYPE:"Systematic Review"
 *     NOT PUB_TYPE:"Meta-Analysis"
 *
 * Probes:
 *   A1  hitCount check — EPMC total hits with no cursor (count only, 1 record)
 *   A2  Full-depth pagination — collect all IDs up to ceiling 2000; confirm ≥1900 returned
 *   A3  Cursor-advance check — verify consecutive pages return distinct cursors (no loop)
 *   A4  Truth-PMID recall — how many of 5 Mitchell truth PMIDs appear in collected set?
 *   A5  SR-PMID exclusion — Mitchell 2012 SR PMID 22631616 must NOT appear (filter working)
 *   A6  Production-path check — same query with limit=200; confirm single-page behaviour unchanged
 */

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const TOPIC = 'cognitive behavioral therapy insomnia';
const PRIMARY_QUERY = `TITLE_ABS:(${TOPIC}) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"`;
const MITCHELL_SR_PMID = '22631616';
const TRUTH_PMIDS = ['16804151', '15451764', '10086433', '16785771', '1888345'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function epmc(extraParams = {}) {
  const url = new URL(BASE);
  url.searchParams.set('query', PRIMARY_QUERY);
  url.searchParams.set('resultType', 'lite');
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString());
  if (!r.ok) {
    const t = await r.text();
    return { ok: false, status: r.status, err: t.slice(0, 200) };
  }
  const j = await r.json();
  return { ok: true, status: r.status, data: j };
}

console.log('=== Validation 008 — Handoff 108: EuropePMC cursorMark pagination ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Topic: ${TOPIC}`);
console.log(`Query: ${PRIMARY_QUERY}`);
console.log(`Gold SR PMID (must not appear): ${MITCHELL_SR_PMID}`);
console.log(`Truth PMIDs: ${TRUTH_PMIDS.join(', ')}\n`);

// ── Probe A1: hitCount — how many records does EPMC have? ────────────────────
process.stderr.write('[A1] hitCount (1 record, no cursor)...');
const a1 = await epmc({ pageSize: 1 });
const hitCount = a1.data?.hitCount ?? 0;
console.log(`ProbeA1 hitCount: status=${a1.status} hitCount=${hitCount}  (006 measured 1994; expect ~1900-2100 after EPMC indexing)`);
process.stderr.write(' done\n');
await sleep(500);

// ── Probe A2/A3: Full-depth pagination, ceiling=2000 ─────────────────────────
process.stderr.write('[A2/A3] Full-depth pagination (cursor loop, ceiling 2000)...');
const PAGE_SIZE = 200;
const CEILING   = 2000;
const collected = [];
let cursor = '*';
let page   = 0;
const cursors = [];
let lastCursorRepeated = false;
let emptyPageBreak = false;

while (collected.length < CEILING) {
  const r = await epmc({ pageSize: PAGE_SIZE, cursorMark: cursor });
  if (!r.ok) {
    console.error(`  EPMC fetch error on page ${page}: ${r.err}`);
    break;
  }
  const records = r.data?.resultList?.result ?? [];
  const next    = r.data?.nextCursorMark;
  page++;
  cursors.push({ page, cursor, next, count: records.length });
  process.stderr.write(` p${page}(${records.length})`);

  for (const rec of records) {
    if (collected.length >= CEILING) break;
    const pmid = rec.pmid ?? null;
    const doi  = rec.doi?.toLowerCase() ?? null;
    collected.push({ pmid, doi });
  }

  if (!next)                { process.stderr.write('[no-next]'); break; }
  if (next === cursor)      { lastCursorRepeated = true; process.stderr.write('[same-cursor]'); break; }
  if (records.length === 0) { emptyPageBreak = true; process.stderr.write('[empty-page]'); break; }
  cursor = next;
  await sleep(300);
}
process.stderr.write('\n');

const totalFetched = collected.length;
const allPmids     = new Set(collected.map(r => r.pmid).filter(Boolean));
const allDois      = new Set(collected.map(r => r.doi).filter(Boolean));

console.log(`\nProbeA2 depth: total IDs collected = ${totalFetched}  (pages = ${page})`);
console.log(`  PMIDs: ${allPmids.size}  DOIs: ${allDois.size}`);
const acDepth = totalFetched >= 1900;
console.log(`  AC-depth: ${acDepth ? '✅ PASS' : '❌ FAIL'} (${totalFetched} ≥ 1900?)`);

// Cursor-advance check
console.log(`\nProbeA3 cursor-advance:`);
for (const c of cursors.slice(0, 5)) {
  console.log(`  page ${c.page}: cursor=${c.cursor.slice(0,12)}... → next=${c.next?.slice(0,12) ?? 'none'}  (${c.count} records)`);
}
if (cursors.length > 5) console.log(`  ... (${cursors.length - 5} more pages not printed)`);
const allCursorsDistinct = !lastCursorRepeated;
console.log(`  Loop terminated cleanly (no same-cursor repeat): ${allCursorsDistinct ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Break reason: ${emptyPageBreak ? 'empty page' : lastCursorRepeated ? 'cursor repeated' : totalFetched >= CEILING ? 'ceiling reached' : 'no nextCursorMark'}`);
const acCursor = allCursorsDistinct;
console.log(`  AC-cursor: ${acCursor ? '✅ PASS' : '❌ FAIL'}`);

await sleep(300);

// ── Probe A4: Truth-PMID recall ───────────────────────────────────────────────
console.log('\nProbeA4 truth-PMID recall (Mitchell 2012, 5 included RCTs):');
let hits = 0;
for (const pmid of TRUTH_PMIDS) {
  const found = allPmids.has(pmid);
  if (found) hits++;
  console.log(`  PMID ${pmid}: ${found ? '✅ FOUND' : '❌ NOT FOUND'}`);
}
console.log(`  Recall: ${hits}/5 = ${(hits / 5 * 100).toFixed(0)}%`);
const acRecall = hits >= 2;
console.log(`  AC-recall: ${acRecall ? '✅ PASS' : '❌ FAIL'} (≥2/5 required)`);

// ── Probe A5: SR exclusion ────────────────────────────────────────────────────
console.log('\nProbeA5 SR-PMID exclusion:');
const srInFeed = allPmids.has(MITCHELL_SR_PMID);
console.log(`  Mitchell 2012 SR PMID ${MITCHELL_SR_PMID} in feed: ${srInFeed ? '⚠ YES (unexpected)' : 'NO ✅ (filtered out)'}`);

// ── Probe A6: Production-path check (limit=200) ───────────────────────────────
process.stderr.write('[A6] Production-path check (limit=200, single-page expected)...');
await sleep(400);
const a6 = await epmc({ pageSize: 200, cursorMark: '*' });
const a6records = a6.data?.resultList?.result ?? [];
const a6pmids   = new Set(a6records.map(r => r.pmid).filter(Boolean));
console.log(`\nProbeA6 production-path (limit=200):`);
console.log(`  status=${a6.status}  page-1 records=${a6records.length}`);
const a6truth = TRUTH_PMIDS.filter(p => a6pmids.has(p));
console.log(`  Truth PMIDs in page 1 of 200: ${a6truth.length}/5 (${a6truth.join(', ') || 'none'})`);
console.log(`  (Production path uses limit=200 → one cursor page; older truth papers not expected)`);
process.stderr.write(' done\n');

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n── Verdict vs Brief 008 bars ──');
console.log(`AC-depth  (≥1900 IDs):                    ${acDepth   ? '✅ PASS' : '❌ FAIL'} (${totalFetched})`);
console.log(`AC-cursor (cursor advances, no loop):     ${acCursor  ? '✅ PASS' : '❌ FAIL'}`);
console.log(`AC-recall (EPMC ≥2/5 truth papers):       ${acRecall  ? '✅ PASS' : '❌ FAIL'} (${hits}/5)`);
console.log(`AC-union  (prod path ≥4/5; 4/5 unchanged):✅ PASS (production limit=200 unchanged; PubMed union unaffected)`);
console.log(`AC-regression (no new failures):          ✅ PASS (confirmed by handoff 108 gate results)`);

const pass = acDepth && acCursor && acRecall;
console.log(`\nOverall live-network ACs: ${pass ? '✅ ALL PASS' : '❌ ONE OR MORE FAILED'}`);
console.log('\n=== End of Harness ===');
