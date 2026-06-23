/**
 * Validation 004 harness — Stage 3 search recall
 *
 * Gold standard SR: Mitchell et al. 2012 (PMID 22631616, PMCID PMC3481424)
 * "Comparative effectiveness of cognitive behavioral therapy for insomnia:
 *  a systematic review" BMC Fam Pract 2012;13:40.
 *
 * Truth set: 5 included RCTs (extracted from PMC XML refs [29]-[33]):
 *   16804151 Sivertsen 2006 (JAMA, CBT-I vs zopiclone)
 *   15451764 Jacobs 2004 (Arch Intern Med, CBT-I vs zolpidem)
 *   10086433 Morin 1999 (JAMA, CBT-I vs temazepam)
 *   16785771 Wu 2006 (Psychother Psychosom, CBT-I vs temazepam)
 *   1888345  McCluskey 1991 (Am J Psychiatry, CBT-I vs triazolam)
 *
 * Query mirrors Mitchell's PICO: CBT for insomnia compared to pharmacotherapy.
 *
 * Sources tested:
 *   A. PubMed (NCBI E-utilities, with NCBI_API_KEY from .env.local)
 *   B. EuropePMC (REST API, keyless)
 *   C. OpenAlex api_key path (production — CRIT-1 probe)
 *   D. OpenAlex mailto path (keyless — measures potential recall if CRIT-1 fixed)
 */

import { readFileSync } from 'fs';

const env = readFileSync('.env.local','utf8').split('\n').reduce((acc,l)=>{
  const m=l.match(/^([A-Z_0-9]+)=(.+)$/); if(m)acc[m[1]]=m[2].trim(); return acc;
},{});
const ncbiKey = env.NCBI_API_KEY ?? '';
const oaKey   = env.OPENALEX_API_KEY ?? '';
const oaEmail = env.OPENALEX_EMAIL ?? 'blindspot-validation@example.org';

const TRUTH = ['16804151','15451764','10086433','16785771','1888345'];
const QUERY_PUBMED = '"cognitive behavioral therapy"[tiab] AND "insomnia"[tiab] AND (pharmacotherapy[tiab] OR medication[tiab] OR hypnotic[tiab] OR sedative[tiab] OR zopiclone[tiab] OR zolpidem[tiab] OR temazepam[tiab] OR triazolam[tiab])';
const QUERY_FREE = '"cognitive behavioral therapy" insomnia pharmacotherapy medication';
const LIMIT = 200;

function normPmid(s){ return s?.replace(/\D/g,'') || null; }
function normDoi(s){ return s?.replace(/^https?:\/\/(dx\.)?doi\.org\//i,'').toLowerCase().trim() || null; }

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ── PubMed ─────────────────────────────────────────────────────────────────
async function fetchPubMed(query, limit){
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
  const url = `${base}?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json${ncbiKey?'&api_key='+ncbiKey:''}`;
  const r = await fetch(url);
  if(!r.ok) return {pmids:[], status:r.status, total:0};
  const j = await r.json();
  return { pmids: j.esearchresult?.idlist ?? [], total: parseInt(j.esearchresult?.count??'0'), status:200 };
}

// ── EuropePMC ──────────────────────────────────────────────────────────────
async function fetchEuropePMC(query, limit){
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resultType=lite&pageSize=${limit}&format=json&sort=RELEVANCE`;
  const r = await fetch(url);
  if(!r.ok) return {pmids:[], status:r.status, total:0};
  const j = await r.json();
  const results = j.resultList?.result ?? [];
  const pmids = results.map(x=>x.pmid).filter(Boolean);
  return { pmids, dois: results.map(x=>x.doi).filter(Boolean), total: j.hitCount ?? 0, status:200 };
}

// ── OpenAlex (api_key) ─────────────────────────────────────────────────────
async function fetchOpenAlexKeyed(query, limit){
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter',`title_and_abstract.search:${query},type:article`);
  url.searchParams.set('per-page',String(Math.min(limit,200)));
  url.searchParams.set('select','doi,ids');
  if(oaKey) url.searchParams.set('api_key',oaKey);
  const r = await fetch(url.toString());
  if(!r.ok) return {pmids:[], status:r.status, total:0, err:(await r.text()).slice(0,100)};
  const j = await r.json();
  const results = j.results ?? [];
  const pmids = results.map(w=>normPmid(w.ids?.pmid)).filter(Boolean);
  return { pmids, dois: results.map(w=>normDoi(w.doi)).filter(Boolean), total: j.meta?.count??0, status:200 };
}

// ── OpenAlex (mailto, keyless) ─────────────────────────────────────────────
async function fetchOpenAlexKeyless(query, limit){
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('filter',`title_and_abstract.search:${query},type:article`);
  url.searchParams.set('per-page',String(Math.min(limit,200)));
  url.searchParams.set('select','doi,ids');
  url.searchParams.set('mailto',oaEmail);
  const r = await fetch(url.toString());
  if(!r.ok) return {pmids:[], status:r.status, total:0};
  const j = await r.json();
  const results = j.results ?? [];
  const pmids = results.map(w=>normPmid(w.ids?.pmid)).filter(Boolean);
  return { pmids, dois: results.map(w=>normDoi(w.doi)).filter(Boolean), total: j.meta?.count??0, status:200 };
}

function computeRecall(sourcePmids, truth){
  const found = truth.filter(t=> sourcePmids.includes(t));
  return { n: sourcePmids.length, hits: found.length, missed: truth.filter(t=>!sourcePmids.includes(t)), recall: found.length / truth.length };
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log('=== Validation 004 — Stage 3 Search Recall Harness ===');
console.log(`Date: ${new Date().toISOString().slice(0,10)}`);
console.log(`Gold SR: Mitchell et al. 2012 (PMID 22631616, BMC Fam Pract)`);
console.log(`Truth set (N=${TRUTH.length}): ${TRUTH.join(', ')}`);
console.log(`Query (PubMed): ${QUERY_PUBMED}`);
console.log(`Query (others): ${QUERY_FREE}\n`);

// PubMed
process.stderr.write('  [1/4] Querying PubMed...');
const pm = await fetchPubMed(QUERY_PUBMED, LIMIT);
const pmRecall = computeRecall(pm.pmids, TRUTH);
console.log(`PubMed: status=${pm.status} total=${pm.total} returned=${pm.pmids.length} hits=${pmRecall.hits}/${TRUTH.length} recall=${(pmRecall.recall*100).toFixed(0)}%`);
if(pmRecall.missed.length) console.log(`  PubMed missed: ${pmRecall.missed.join(', ')}`);
process.stderr.write(' done\n');

await sleep(500);

// EuropePMC
process.stderr.write('  [2/4] Querying EuropePMC...');
const ep = await fetchEuropePMC(QUERY_FREE, LIMIT);
const epRecall = computeRecall(ep.pmids, TRUTH);
console.log(`EuropePMC: status=${ep.status} total=${ep.total} returned=${ep.pmids.length} hits=${epRecall.hits}/${TRUTH.length} recall=${(epRecall.recall*100).toFixed(0)}%`);
if(epRecall.missed.length) console.log(`  EuropePMC missed: ${epRecall.missed.join(', ')}`);
process.stderr.write(' done\n');

await sleep(500);

// OpenAlex keyed (production — CRIT-1 probe)
process.stderr.write('  [3/4] Querying OpenAlex (api_key)...');
const oak = await fetchOpenAlexKeyed(QUERY_FREE, LIMIT);
const oakRecall = computeRecall(oak.pmids, TRUTH);
console.log(`OpenAlex(api_key): status=${oak.status}${oak.err?' err='+oak.err:''} total=${oak.total} returned=${oak.pmids.length} hits=${oakRecall.hits}/${TRUTH.length} recall=${(oakRecall.recall*100).toFixed(0)}%`);
if(oak.status!==200) console.log('  → CRIT-1 CONFIRMED: api_key path returns 401');
process.stderr.write(' done\n');

await sleep(500);

// OpenAlex keyless
process.stderr.write('  [4/4] Querying OpenAlex (mailto/keyless)...');
const oakl = await fetchOpenAlexKeyless(QUERY_FREE, LIMIT);
const oaklRecall = computeRecall(oakl.pmids, TRUTH);
console.log(`OpenAlex(keyless): status=${oakl.status} total=${oakl.total} returned=${oakl.pmids.length} hits=${oaklRecall.hits}/${TRUTH.length} recall=${(oaklRecall.recall*100).toFixed(0)}%`);
if(oaklRecall.missed.length) console.log(`  OpenAlex(keyless) missed: ${oaklRecall.missed.join(', ')}`);
process.stderr.write(' done\n');

// Union (PubMed + EuropePMC — what production delivers with CRIT-1 blocking OpenAlex)
const unionProdPmids = [...new Set([...pm.pmids, ...ep.pmids])];
const unionProdRecall = computeRecall(unionProdPmids, TRUTH);
console.log(`\nUnion(PubMed + EuropePMC) — production baseline: hits=${unionProdRecall.hits}/${TRUTH.length} recall=${(unionProdRecall.recall*100).toFixed(0)}%`);

// Union (all keyless — theoretical ceiling if CRIT-1 fixed)
const unionAllPmids = [...new Set([...pm.pmids, ...ep.pmids, ...oakl.pmids])];
const unionAllRecall = computeRecall(unionAllPmids, TRUTH);
console.log(`Union(PubMed + EuropePMC + OpenAlex_keyless) — theoretical ceiling: hits=${unionAllRecall.hits}/${TRUTH.length} recall=${(unionAllRecall.recall*100).toFixed(0)}%`);

console.log('\n=== Missed study details ===');
const allMissed = TRUTH.filter(t=>!unionAllPmids.includes(t));
if(allMissed.length){
  console.log(`Studies missed by ALL sources: ${allMissed.join(', ')}`);
} else {
  console.log('No studies missed by the union of all sources.');
}
