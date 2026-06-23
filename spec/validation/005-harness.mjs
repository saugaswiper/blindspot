/**
 * Validation 005 harness — Stage 3 PubMed recall after handoff 105 fix
 *
 * Tests handoff 105: fetchPrimaryStudyIds() in lib/pubmed.ts now uses
 *   retmax=2000 + sort=relevance (was retmax=200 + implicit date sort)
 *
 * Gold standard SR: Mitchell et al. 2012 (PMID 22631616, PMCID PMC3481424)
 * "Comparative effectiveness of cognitive behavioral therapy for insomnia:
 *  a systematic review" BMC Fam Pract 2012;13:40.
 *
 * Truth set: 5 included RCTs (from PMC XML refs [29]-[33], verified v004):
 *   16804151  Sivertsen 2006 (JAMA, CBT-I vs zopiclone)
 *   15451764  Jacobs 2004 (Arch Intern Med, CBT-I vs zolpidem)
 *   10086433  Morin 1999 (JAMA, CBT-I vs temazepam)
 *   16785771  Wu 2006 (Psychother Psychosom, CBT-I vs temazepam)
 *   1888345   McCluskey 1991 (Am J Psychiatry, CBT-I vs triazolam)
 *
 * Production query mirrors fetchPrimaryStudyIds("cognitive behavioral therapy insomnia"):
 *   (cognitive behavioral therapy insomnia) AND NOT systematic[sb]
 *
 * Comparison: we also run the old (date-sorted, retmax=200) query to confirm
 * that 004's 0% result is reproducible and that the fix changed the outcome.
 *
 * EuropePMC and OpenAlex are included for completeness / union measurement
 * (neither was fixed in handoff 105; both carry over from 004).
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local','utf8').split('\n').reduce((acc,l)=>{
  const m=l.match(/^([A-Z_0-9]+)=(.+)$/); if(m)acc[m[1]]=m[2].trim(); return acc;
},{});
const ncbiKey = env.NCBI_API_KEY ?? '';
const oaKey   = env.OPENALEX_API_KEY ?? '';
const oaEmail = env.OPENALEX_EMAIL ?? 'blindspot-validation@example.org';

// Mitchell 2012 truth set — identical to 004
const TRUTH = ['16804151','15451764','10086433','16785771','1888345'];

// Production query: fetchPrimaryStudyIds("cognitive behavioral therapy insomnia")
// → `(${query}) AND NOT systematic[sb]`
const PROD_QUERY_TOPIC = 'cognitive behavioral therapy insomnia';
const PROD_QUERY_PUBMED = `(${PROD_QUERY_TOPIC}) AND NOT systematic[sb]`;

// EuropePMC / OpenAlex free-text query (unchanged from 004)
const QUERY_FREE = 'cognitive behavioral therapy insomnia';

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ── PubMed ─────────────────────────────────────────────────────────────────
/**
 * Mirrors esearch() in lib/pubmed.ts.
 * sort='relevance' = PubMed "Best Match"; omit for implicit date sort.
 */
async function fetchPubMed(query, retmax, sort){
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db', 'pubmed');
  url.searchParams.set('term', query);
  url.searchParams.set('retmax', String(retmax));
  url.searchParams.set('retmode', 'json');
  if (sort) url.searchParams.set('sort', sort);
  if (ncbiKey) url.searchParams.set('api_key', ncbiKey);

  const r = await fetch(url.toString());
  if (!r.ok) return { pmids:[], status:r.status, total:0 };
  const j = await r.json();
  return {
    pmids: j.esearchresult?.idlist ?? [],
    total: parseInt(j.esearchresult?.count ?? '0', 10),
    status: 200,
  };
}

// ── EuropePMC (unchanged from 004) ────────────────────────────────────────
async function fetchEuropePMC(query, limit){
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', query);
  url.searchParams.set('resultType', 'lite');
  url.searchParams.set('pageSize', String(limit));
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'RELEVANCE');

  const r = await fetch(url.toString());
  if (!r.ok) return { pmids:[], status:r.status, total:0 };
  const j = await r.json();
  const results = j.resultList?.result ?? [];
  return {
    pmids: results.map(x=>x.pmid).filter(Boolean),
    total: j.hitCount ?? 0,
    status: 200,
  };
}

// ── OpenAlex (api_key — CRIT-1 probe, unchanged from 004) ─────────────────
async function fetchOpenAlexKeyed(query, limit){
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `title_and_abstract.search:${query},type:article`);
  url.searchParams.set('per-page', String(Math.min(limit,200)));
  url.searchParams.set('select', 'doi,ids');
  if (oaKey) url.searchParams.set('api_key', oaKey);
  const r = await fetch(url.toString());
  if (!r.ok) return { pmids:[], status:r.status, total:0, err:(await r.text()).slice(0,120) };
  const j = await r.json();
  const results = j.results ?? [];
  return {
    pmids: results.map(w=>w.ids?.pmid?.replace(/\D/g,'')||null).filter(Boolean),
    total: j.meta?.count ?? 0,
    status: 200,
  };
}

// ── OpenAlex (keyless mailto, unchanged from 004) ─────────────────────────
async function fetchOpenAlexKeyless(query, limit){
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter', `title_and_abstract.search:${query},type:article`);
  url.searchParams.set('per-page', String(Math.min(limit,200)));
  url.searchParams.set('select', 'doi,ids');
  url.searchParams.set('mailto', oaEmail);
  const r = await fetch(url.toString());
  if (!r.ok) return { pmids:[], status:r.status, total:0 };
  const j = await r.json();
  const results = j.results ?? [];
  return {
    pmids: results.map(w=>w.ids?.pmid?.replace(/\D/g,'')||null).filter(Boolean),
    total: j.meta?.count ?? 0,
    status: 200,
  };
}

function recall(sourcePmids, truth){
  const hits = truth.filter(t => sourcePmids.includes(t));
  const missed = truth.filter(t => !sourcePmids.includes(t));
  return { hits: hits.length, missed, recall: hits.length / truth.length };
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log('=== Validation 005 — Stage 3 PubMed Recall Post-Handoff-105 ===');
console.log(`Date: ${new Date().toISOString().slice(0,10)}`);
console.log(`Gold SR: Mitchell et al. 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)`);
console.log(`Truth PMIDs (N=${TRUTH.length}): ${TRUTH.join(', ')}`);
console.log(`Production PubMed query: ${PROD_QUERY_PUBMED}\n`);

// 1. PubMed OLD path (date sort, retmax=200) — reproduces 004 baseline
process.stderr.write('  [1/5] PubMed OLD (date-sort, retmax=200)...');
const pmOld = await fetchPubMed(PROD_QUERY_PUBMED, 200, null);
const pmOldR = recall(pmOld.pmids, TRUTH);
console.log(`PubMed OLD (date,200): status=${pmOld.status} total=${pmOld.total} returned=${pmOld.pmids.length} hits=${pmOldR.hits}/${TRUTH.length} recall=${(pmOldR.recall*100).toFixed(0)}%`);
if(pmOldR.missed.length) console.log(`  OLD missed: ${pmOldR.missed.join(', ')}`);
process.stderr.write(' done\n');

await sleep(500);

// 2. PubMed NEW path (relevance sort, retmax=2000) — mirrors handoff 105 fix
process.stderr.write('  [2/5] PubMed NEW (relevance-sort, retmax=2000)...');
const pmNew = await fetchPubMed(PROD_QUERY_PUBMED, 2000, 'relevance');
const pmNewR = recall(pmNew.pmids, TRUTH);
console.log(`PubMed NEW (relevance,2000): status=${pmNew.status} total=${pmNew.total} returned=${pmNew.pmids.length} hits=${pmNewR.hits}/${TRUTH.length} recall=${(pmNewR.recall*100).toFixed(0)}%`);
if(pmNewR.missed.length) console.log(`  NEW missed: ${pmNewR.missed.join(', ')}`);
// Log which truth papers were found and at which rank
TRUTH.forEach(t => {
  const idx = pmNew.pmids.indexOf(t);
  if (idx >= 0) console.log(`    PMID ${t}: rank ${idx+1}/${pmNew.pmids.length}`);
  else          console.log(`    PMID ${t}: NOT FOUND in ${pmNew.pmids.length} returned`);
});
process.stderr.write(' done\n');

await sleep(500);

// 3. EuropePMC (200-limit, unchanged from 004)
process.stderr.write('  [3/5] EuropePMC (relevance, limit=200)...');
const ep = await fetchEuropePMC(QUERY_FREE, 200);
const epR = recall(ep.pmids, TRUTH);
console.log(`EuropePMC (relevance,200): status=${ep.status} total=${ep.total} returned=${ep.pmids.length} hits=${epR.hits}/${TRUTH.length} recall=${(epR.recall*100).toFixed(0)}%`);
if(epR.missed.length) console.log(`  EuropePMC missed: ${epR.missed.join(', ')}`);
process.stderr.write(' done\n');

await sleep(500);

// 4. OpenAlex keyed (CRIT-1 probe)
process.stderr.write('  [4/5] OpenAlex (api_key, CRIT-1 probe)...');
const oak = await fetchOpenAlexKeyed(QUERY_FREE, 200);
const oakR = recall(oak.pmids, TRUTH);
console.log(`OpenAlex(api_key): status=${oak.status}${oak.err?' err='+oak.err:''} total=${oak.total} returned=${oak.pmids.length} hits=${oakR.hits}/${TRUTH.length} recall=${(oakR.recall*100).toFixed(0)}%`);
if(oak.status!==200) console.log('  → CRIT-1: api_key still returns 401');
process.stderr.write(' done\n');

await sleep(500);

// 5. OpenAlex keyless
process.stderr.write('  [5/5] OpenAlex (mailto/keyless)...');
const oakl = await fetchOpenAlexKeyless(QUERY_FREE, 200);
const oaklR = recall(oakl.pmids, TRUTH);
console.log(`OpenAlex(keyless): status=${oakl.status} total=${oakl.total} returned=${oakl.pmids.length} hits=${oaklR.hits}/${TRUTH.length} recall=${(oaklR.recall*100).toFixed(0)}%`);
if(oaklR.missed.length) console.log(`  OpenAlex(keyless) missed: ${oaklR.missed.join(', ')}`);
process.stderr.write(' done\n');

// Union results
const unionNewPmids = [...new Set([...pmNew.pmids, ...ep.pmids])];
const unionNewR = recall(unionNewPmids, TRUTH);
console.log(`\nUnion(PubMed_NEW + EuropePMC): hits=${unionNewR.hits}/${TRUTH.length} recall=${(unionNewR.recall*100).toFixed(0)}%`);

const unionCeilPmids = [...new Set([...pmNew.pmids, ...ep.pmids, ...oakl.pmids])];
const unionCeilR = recall(unionCeilPmids, TRUTH);
console.log(`Union(PubMed_NEW + EuropePMC + OA_keyless) theoretical ceiling: hits=${unionCeilR.hits}/${TRUTH.length} recall=${(unionCeilR.recall*100).toFixed(0)}%`);

const allMissed = TRUTH.filter(t => !unionCeilPmids.includes(t));
if(allMissed.length) console.log(`\nStudies missed by ALL sources: ${allMissed.join(', ')}`);
else                 console.log('\nNo studies missed by the ceiling union.');

console.log('\n=== End of Harness ===');
