/**
 * Validation 006 harness — Stage 3 PubMed recall after handoff 106 fix
 *
 * Tests handoff 106: fetchPrimaryStudyIds() in lib/pubmed.ts changed
 *   (${query}) AND NOT systematic[sb]   →  (${query}) NOT systematic[sb]
 * (binary NOT, not AND-NOT; validated by dev at pre-merge: 4/5 recall claimed)
 *
 * Gold standard SR: Mitchell et al. 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)
 * "Comparative effectiveness of cognitive behavioral therapy for insomnia:
 *  a systematic review" BMC Fam Pract 2012;13:40.
 *
 * Truth set: 5 included RCTs (validated 004/005):
 *   16804151  Sivertsen 2006  (JAMA 295:2851)
 *   15451764  Jacobs 2004     (Arch Intern Med 164:1888)
 *   10086433  Morin 1999      (JAMA 281:991)
 *   16785771  Wu 2006         (Psychother Psychosom 75:220)
 *   1888345   McCluskey 1991  (Am J Psychiatry 148:121)
 *
 * Design:
 *  Probe A  — OLD broken form: (topic) AND NOT systematic[sb], retmax=2000, relevance
 *             Control: should still return ~313 (all SRs), hits=0/5
 *             (confirms regression did not inadvertently fix old path)
 *  Probe B  — NEW fixed form: (topic) NOT systematic[sb], retmax=2000, relevance
 *             Primary claim: handoff 106 AC-pubmed: expect ≥3/5, dev pre-measured 4/5
 *  Probe B2 — Set-overlap diagnostic: does NEW form differ from OLD form?
 *             Validates that the binary NOT is actually honoured (not silently dropped again)
 *  Probe C  — EuropePMC production mirror (no sort, limit=200, cursor-based paging to 2000)
 *             Unchanged from 005; separate pagination probe added
 *  Probe D  — OpenAlex (api_key, CRIT-1 probe)
 *  Probe E  — OpenAlex (keyless mailto)
 *  Union    — PubMed_NEW + EPMC + OA_keyless
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([A-Z_0-9]+)=(.+)$/);
  if (m) acc[m[1]] = m[2].trim();
  return acc;
}, {});
const ncbiKey = env.NCBI_API_KEY ?? '';
const oaKey   = env.OPENALEX_API_KEY ?? '';
const oaEmail = env.OPENALEX_EMAIL ?? 'blindspot-validation@example.org';

// Mitchell 2012 truth set — unchanged from 004/005
const TRUTH = ['16804151', '15451764', '10086433', '16785771', '1888345'];

const TOPIC = 'cognitive behavioral therapy insomnia';
const QUERY_OLD = `(${TOPIC}) AND NOT systematic[sb]`;  // broken form (005 F1)
const QUERY_NEW = `(${TOPIC}) NOT systematic[sb]`;       // handoff 106 fix

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PubMed ESearch ────────────────────────────────────────────────────────────
async function fetchPubMed(query, retmax, sort) {
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
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

// ── Set overlap utility ───────────────────────────────────────────────────────
function overlap(setA, setB) {
  const b = new Set(setB);
  return setA.filter(x => b.has(x));
}

// ── EuropePMC ─────────────────────────────────────────────────────────────────
// Production mirror: no sort, limit=200 (matches lib/europepmc.ts default)
async function fetchEPMCPage(query, limit, cursorMark) {
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', query);
  url.searchParams.set('resultType', 'lite');
  url.searchParams.set('pageSize', String(limit));
  url.searchParams.set('format', 'json');
  if (cursorMark) url.searchParams.set('cursorMark', cursorMark);

  const r = await fetch(url.toString());
  if (!r.ok) return { pmids: [], status: r.status, total: 0, nextCursorMark: null };
  const j = await r.json();
  const results = j.resultList?.result ?? [];
  return {
    pmids: results.map(x => x.pmid).filter(Boolean),
    total: j.hitCount ?? 0,
    status: 200,
    nextCursorMark: j.nextCursorMark ?? null,
  };
}

// Production query mirrors lib/europepmc.ts withFieldRestriction:
const EPMC_QUERY = `TITLE_ABS:(${TOPIC}) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"`;

// Probe C1: single page, no sort (production mirror)
async function fetchEPMCProduction() {
  return fetchEPMCPage(EPMC_QUERY, 200, null);
}

// Probe C2: paginate up to 2000 records via cursorMark
async function fetchEPMCPaginated(maxRecords) {
  let allPmids = [];
  let cursorMark = null;
  let total = 0;
  let pages = 0;
  const pageSize = 200;

  do {
    await sleep(300);
    const page = await fetchEPMCPage(EPMC_QUERY, pageSize, cursorMark);
    if (page.status !== 200) break;
    if (pages === 0) total = page.total;
    allPmids = [...allPmids, ...page.pmids];
    cursorMark = page.nextCursorMark;
    pages++;
  } while (cursorMark && allPmids.length < maxRecords);

  return { pmids: allPmids, total, pages };
}

// ── OpenAlex ─────────────────────────────────────────────────────────────────
async function fetchOpenAlexKeyed(query, limit) {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `title_and_abstract.search:${query},type:article`);
  url.searchParams.set('per-page', String(Math.min(limit, 200)));
  url.searchParams.set('select', 'doi,ids');
  if (oaKey) url.searchParams.set('api_key', oaKey);
  const r = await fetch(url.toString());
  if (!r.ok) {
    const txt = await r.text();
    return { pmids: [], status: r.status, total: 0, err: txt.slice(0, 120) };
  }
  const j = await r.json();
  const results = j.results ?? [];
  return {
    pmids: results.map(w => w.ids?.pmid?.replace(/\D/g, '') || null).filter(Boolean),
    total: j.meta?.count ?? 0,
    status: 200,
  };
}

async function fetchOpenAlexKeyless(query, limit) {
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `title_and_abstract.search:${query},type:article`);
  url.searchParams.set('per-page', String(Math.min(limit, 200)));
  url.searchParams.set('select', 'doi,ids');
  url.searchParams.set('mailto', oaEmail);
  const r = await fetch(url.toString());
  if (!r.ok) return { pmids: [], status: r.status, total: 0 };
  const j = await r.json();
  const results = j.results ?? [];
  return {
    pmids: results.map(w => w.ids?.pmid?.replace(/\D/g, '') || null).filter(Boolean),
    total: j.meta?.count ?? 0,
    status: 200,
  };
}

// ── Recall ────────────────────────────────────────────────────────────────────
function recall(sourcePmids, truth) {
  const hits = truth.filter(t => sourcePmids.includes(t));
  const missed = truth.filter(t => !sourcePmids.includes(t));
  return { hits: hits.length, missed, recall: hits.length / truth.length };
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== Validation 006 — Stage 3 PubMed Recall Post-Handoff-106 ===');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Gold SR:  Mitchell et al. 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)`);
console.log(`Truth N=${TRUTH.length}: ${TRUTH.join(', ')}`);
console.log(`OLD query: ${QUERY_OLD}`);
console.log(`NEW query: ${QUERY_NEW}\n`);

// ── Probe A: OLD broken form (control) ───────────────────────────────────────
process.stderr.write('  [A] PubMed OLD (AND NOT systematic[sb], retmax=2000, relevance)...');
const pmOld = await fetchPubMed(QUERY_OLD, 2000, 'relevance');
const pmOldR = recall(pmOld.pmids, TRUTH);
console.log(`ProbeA OLD: status=${pmOld.status} total=${pmOld.total} returned=${pmOld.pmids.length} hits=${pmOldR.hits}/${TRUTH.length} recall=${(pmOldR.recall * 100).toFixed(0)}%`);
if (pmOldR.missed.length) console.log(`  missed: ${pmOldR.missed.join(', ')}`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe B: NEW fixed form (handoff 106) ────────────────────────────────────
process.stderr.write('  [B] PubMed NEW (NOT systematic[sb], retmax=2000, relevance)...');
const pmNew = await fetchPubMed(QUERY_NEW, 2000, 'relevance');
const pmNewR = recall(pmNew.pmids, TRUTH);
console.log(`ProbeB NEW: status=${pmNew.status} total=${pmNew.total} returned=${pmNew.pmids.length} hits=${pmNewR.hits}/${TRUTH.length} recall=${(pmNewR.recall * 100).toFixed(0)}%`);
if (pmNewR.missed.length) console.log(`  missed: ${pmNewR.missed.join(', ')}`);
// Report rank positions for all truth papers
TRUTH.forEach(t => {
  const idx = pmNew.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: rank ${idx + 1}/${pmNew.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${pmNew.pmids.length} returned`);
});
process.stderr.write(' done\n');

await sleep(600);

// ── Probe B2: Set overlap diagnostic ─────────────────────────────────────────
// Do old and new return the same set? (If so, binary NOT still silently dropped)
const oldSet = new Set(pmOld.pmids);
const newSet = new Set(pmNew.pmids);
const inBoth = pmNew.pmids.filter(id => oldSet.has(id));
const inNewOnly = pmNew.pmids.filter(id => !oldSet.has(id));
const inOldOnly = pmOld.pmids.filter(id => !newSet.has(id));
console.log(`\nProbeB2 Set-overlap diagnostic:`);
console.log(`  OLD total: ${pmOld.pmids.length}  NEW total: ${pmNew.pmids.length}`);
console.log(`  In both: ${inBoth.length}  NEW-only: ${inNewOnly.length}  OLD-only: ${inOldOnly.length}`);
if (pmOld.pmids.length > 0 && inBoth.length === pmOld.pmids.length && pmNew.pmids.length === pmOld.pmids.length) {
  console.log('  ⚠ WARNING: OLD and NEW return identical sets — binary NOT may still be dropped!');
} else {
  console.log('  ✓ Sets differ — binary NOT is being honoured (old and new query results diverge)');
}

// ── Probe C1: EuropePMC production mirror (no sort, limit=200) ───────────────
process.stderr.write('\n  [C1] EuropePMC production mirror (no sort, limit=200)...');
const epProd = await fetchEPMCProduction();
const epProdR = recall(epProd.pmids, TRUTH);
console.log(`\nProbeC1 EPMC-prod: status=${epProd.status} total=${epProd.total} returned=${epProd.pmids.length} hits=${epProdR.hits}/${TRUTH.length} recall=${(epProdR.recall * 100).toFixed(0)}%`);
if (epProdR.missed.length) console.log(`  missed: ${epProdR.missed.join(', ')}`);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe C2: EuropePMC paginated (up to 2000 via cursorMark) ────────────────
process.stderr.write('  [C2] EuropePMC paginated (cursorMark, up to 2000)...');
const epPag = await fetchEPMCPaginated(2000);
const epPagR = recall(epPag.pmids, TRUTH);
console.log(`ProbeC2 EPMC-paged: total=${epPag.total} fetched=${epPag.pmids.length} pages=${epPag.pages} hits=${epPagR.hits}/${TRUTH.length} recall=${(epPagR.recall * 100).toFixed(0)}%`);
if (epPagR.missed.length) console.log(`  missed: ${epPagR.missed.join(', ')}`);
TRUTH.forEach(t => {
  const idx = epPag.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: position ${idx + 1}/${epPag.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${epPag.pmids.length}`);
});
process.stderr.write(' done\n');

await sleep(600);

// ── Probe D: OpenAlex keyed (CRIT-1 probe) ───────────────────────────────────
process.stderr.write('  [D] OpenAlex (api_key, CRIT-1 probe)...');
const oak = await fetchOpenAlexKeyed(TOPIC, 200);
const oakR = recall(oak.pmids, TRUTH);
console.log(`ProbeD OA(api_key): status=${oak.status}${oak.err ? ' err=' + oak.err : ''} total=${oak.total} returned=${oak.pmids.length} hits=${oakR.hits}/${TRUTH.length} recall=${(oakR.recall * 100).toFixed(0)}%`);
if (oak.status !== 200) console.log('  → CRIT-1: api_key still returns ' + oak.status);
process.stderr.write(' done\n');

await sleep(600);

// ── Probe E: OpenAlex keyless ─────────────────────────────────────────────────
process.stderr.write('  [E] OpenAlex (mailto/keyless)...');
const oakl = await fetchOpenAlexKeyless(TOPIC, 200);
const oaklR = recall(oakl.pmids, TRUTH);
console.log(`ProbeE OA(keyless): status=${oakl.status} total=${oakl.total} returned=${oakl.pmids.length} hits=${oaklR.hits}/${TRUTH.length} recall=${(oaklR.recall * 100).toFixed(0)}%`);
if (oaklR.missed.length) console.log(`  missed: ${oaklR.missed.join(', ')}`);
process.stderr.write(' done\n');

// ── Union calculations ────────────────────────────────────────────────────────
console.log('\n── Union results ──');

// Production baseline: PubMed(NEW) + EPMC(prod) only — OpenAlex blocked by CRIT-1 in prod
const unionProdPmids = [...new Set([...pmNew.pmids, ...epProd.pmids])];
const unionProdR = recall(unionProdPmids, TRUTH);
console.log(`Union-prod [PubMed_NEW+EPMC-prod]:     hits=${unionProdR.hits}/${TRUTH.length} recall=${(unionProdR.recall * 100).toFixed(0)}%`);

// Production + paginated EPMC
const unionProdPagPmids = [...new Set([...pmNew.pmids, ...epPag.pmids])];
const unionProdPagR = recall(unionProdPagPmids, TRUTH);
console.log(`Union-prod+EPMC-paged [PM_NEW+EPMC-2k]: hits=${unionProdPagR.hits}/${TRUTH.length} recall=${(unionProdPagR.recall * 100).toFixed(0)}%`);

// Theoretical ceiling: + OA keyless
const unionCeilPmids = [...new Set([...pmNew.pmids, ...epPag.pmids, ...oakl.pmids])];
const unionCeilR = recall(unionCeilPmids, TRUTH);
console.log(`Union-ceil [all sources]:               hits=${unionCeilR.hits}/${TRUTH.length} recall=${(unionCeilR.recall * 100).toFixed(0)}%`);

const allMissed = TRUTH.filter(t => !unionCeilPmids.includes(t));
if (allMissed.length) console.log(`\nMissed by ALL sources: ${allMissed.join(', ')}`);
else                  console.log('\nNo studies missed by ceiling union.');

// ── Pass/fail vs brief 005 bars ───────────────────────────────────────────────
console.log('\n── Verdict vs Brief 005 bars ──');
const acPubmed = pmNewR.hits >= 3;
const acUnion  = unionProdR.recall >= 0.60;
console.log(`AC-pubmed  (≥3/5): ${acPubmed ? '✅ PASS' : '❌ FAIL'} (${pmNewR.hits}/5)`);
console.log(`AC-union   (≥60%): ${acUnion ? '✅ PASS' : '❌ FAIL'} (${(unionProdR.recall * 100).toFixed(0)}%)`);
console.log(`Stage3 bar (≥95%): ❌ FAIL — Long-term bar; not achievable at this stage`);

console.log('\n=== End of Harness ===');
