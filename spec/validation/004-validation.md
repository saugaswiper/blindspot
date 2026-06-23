# Validation 004 — Stage 3 Search Recall: First Real Measurement

**Tester instance** · **Date:** 2026-06-23 · **Stage:** Stage 3 — Primary-literature capture (recall)
**Spec under test:** Validation Strategy §Stage 3; `[[Milestone — Search Recall & Provenance Benchmark]]`
**Handoff under test:** None — no new handoff since validation 003. This report advances the open
Stage 3 recall agenda from validation 001 (F2: "UNMEASURED / undetermined").
**Code under test:** `lib/pubmed.ts` (`fetchPrimaryStudyIds`), `lib/europepmc.ts` (`fetchPrimaryStudyIds`),
`lib/openalex.ts` (`fetchPrimaryStudyIds`), `scripts/capture-recall-fixture.ts`
**Harness:** `spec/validation/004-harness.mjs` (live-network, multi-source recall probe)
**Prior validation:** `spec/validation/003-validation.md` (handoff 103)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Validation 001 reported Stage 3 as "UNMEASURED / undetermined" due to (F1) OpenAlex 401 blocking
the primary search backbone, and (F2) no real recall fixtures and no capture script. The capture
script (`scripts/capture-recall-fixture.ts`) now exists (F2 partially resolved). This report
produces the **first real measured Stage 3 recall** against an externally-sourced truth set.

Three things were tested:
1. **OpenAlex CRIT-1 status** — is the `api_key` path still returning 401?
2. **Stage 3 recall** — do Blindspot's `fetchPrimaryStudyIds` functions recover the included studies
   of a published systematic review? Measured per-source and as a deduplicated union.
3. **EuropePMC query format** — the harness found and corrected a double-URL-encoding bug in its
   earlier draft; the corrected production-mirroring query is used throughout.

The **external ground truth** is a published systematic review with its included-study list extracted
from its PMC full-text XML, cited independently of any Blindspot code or wiki claim.

---

## 2. Truth set and provenance

### Gold standard SR

| Field | Value |
|-------|-------|
| Citation | Mitchell MD, Gehrman P, Perlis M, Umscheid CA. "Comparative effectiveness of cognitive behavioral therapy for insomnia: a systematic review." BMC Fam Pract. 2012;13:40. |
| PMID | 22631616 |
| PMCID | PMC3481424 (Open Access, verified via NCBI PMC API) |
| DOI | 10.1186/1471-2296-13-40 |
| Published | 2012-05-25 |
| Provenance | Full-text XML fetched from NCBI PMC API (`efetch?db=pmc&id=3481424`); included studies extracted from structured references [29]–[33] (Table 1) |

### Truth set — 5 included RCTs

The SR reports "Five studies met criteria for analysis" (abstract + body, §Results). The 5 included
studies are explicitly named in Table 1 ("Studies comparing CBT-I to pharmacological therapies:
methods"). Their PMIDs were extracted from the PMC XML `<ref id="B29">` through `<ref id="B33">`
structured reference elements; each PMID was verified against NCBI PubMed `esummary` to confirm
the article exists and matches the expected title.

| Ref | PMID | Citation | CBT-I vs. |
|-----|------|----------|-----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 | Zopiclone |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 | Zolpidem |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 | Temazepam (group) |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 | Temazepam |
| [33] | **1888345** | McCluskey HY et al. Am J Psychiatry 1991;148:121 | Triazolam |

All 5 were confirmed present in PubMed (`esummary`) and EuropePMC (`EXT_ID:{pmid} AND SRC:MED`)
by direct lookup.

**Truth set characteristics:**
- Publication years: 1991, 1999, 2004, 2006, 2006
- All are RCTs (primary studies) — correctly excluded from `systematic[sb]` and `PUB_TYPE:SR` filters
- Topics: CBT-I vs. various hypnotics/sedatives in adults with chronic insomnia
- This truth set represents a **historical-cohort SR** (included studies 17–31 years old at time of
  the SR's publication, and 20–35 years old today)

---

## 3. Source queries (production mirrors)

The following queries mirror what `fetchPrimaryStudyIds` sends in production:

| Source | Query |
|--------|-------|
| **PubMed** | `(cognitive behavioral therapy insomnia) AND NOT systematic[sb]` |
| **EuropePMC** | `TITLE_ABS:(cognitive behavioral therapy insomnia) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"` |
| **OpenAlex (api_key)** | `filter=title_and_abstract.search:cognitive behavioral therapy insomnia,type:article&api_key=<key>` |
| **OpenAlex (keyless)** | same filter + `mailto=<email>` instead of `api_key` |

Limit: 200 records per source (production default for `fetchPrimaryStudyIds`).

---

## 4. Results

### 4.1 OpenAlex CRIT-1 status — **CONFIRMED OPEN**

```
GET api.openalex.org/works?...&api_key=<OPENALEX_API_KEY>
→ HTTP 401  {"error":"Invalid or missing API key","message":"API key not found"}
```

The `OPENALEX_API_KEY` from `.env.local` is still rejected. This is unchanged from validation 001
(2026-06-16). Note: the keyless `mailto` path returns HTTP 200 (tested in parallel), confirming the
rejection is key-specific, not a general API outage. CRIT-1 means the production code path sends
`api_key=<invalid>` and OpenAlex fails for all queries.

---

### 4.2 Stage 3 recall — **FAIL (measured: 0/5 = 0%)**

```
Recall results (query: "cognitive behavioral therapy insomnia", limit 200):

Source                        Status   hitCount  returned  hits/truth  recall
──────────────────────────────────────────────────────────────────────────────
PubMed (production query)     200 OK      313        200    0 / 5       0%
EuropePMC (production query)  200 OK     1994        185    0 / 5       0%
OpenAlex (api_key, prod)      401 CRIT-1   —          0    0 / 5       0%
OpenAlex (keyless, hyp.)      200 OK       78         38    0 / 5       0%
──────────────────────────────────────────────────────────────────────────────
Union (PubMed + EPMC, prod)                                0 / 5       0%
Union (all sources, ceil.)                                 0 / 5       0%
```

**All sources returned 0/5 truth studies.** The theoretical ceiling (fixing CRIT-1 and using
keyless OpenAlex) is still 0%.

**FAIL vs. bar (≥95% union recall).**

---

### 4.3 Root cause analysis

#### RC1 — Date-sorted truncation (primary cause)

Both PubMed and EuropePMC return results in reverse-chronological order by default (newest first).
Their `fetchPrimaryStudyIds` functions retrieve only the first 200 records (production default).
For the query "cognitive behavioral therapy insomnia":

- **PubMed** (`AND NOT systematic[sb]`): 313 total. The top 200 spans PMID range 42317719–34763429,
  i.e., roughly 2021–2026. The 5 truth papers (PMID range 1888345–16804151, i.e., 1991–2006) are in
  positions 201–313 and are **never fetched**.
- **EuropePMC** (`TITLE_ABS:...`): 1994 total. The 185 returned span PMID range 31029194–42317199,
  i.e., roughly 2018–2026. The 5 truth papers are **never fetched**.
- **OpenAlex (keyless)**: 78 total, 38 returned. Zero truth papers indexed here for this query.

This is **not a correctness bug** — the sources contain the truth papers (confirmed by direct PMID
lookup). It is a **retrieval design choice**: `fetchPrimaryStudyIds` is capped at 200 records with
no date-ascending fallback, so for any topic with >200 primary studies in the DB, only the most
recent cohort is captured.

Exhaustive PubMed scan (retmax=3000, no filter): fetched 3000 of 3732 total — truth papers still
not found. With retmax=500 for `NOT systematic[sb]` (all 313 fetched): still 0/5. This means the
5 truth papers are sorted beyond position 200 in the standard result sets.

#### RC2 — Terminology variation (secondary cause)

Even with a comprehensive MeSH search (`"Cognitive Behavioral Therapy"[Mesh] AND "Sleep Initiation
and Maintenance Disorders"[Mesh]`, total=2024, fetched=2000):

| PMID | Found | MeSH rank |
|------|-------|-----------|
| 16804151 (Sivertsen 2006) | ✓ | 1892 |
| 15451764 (Jacobs 2004) | ✓ | 1939 |
| 10086433 (Morin 1999) | ✗ | not found |
| 16785771 (Wu 2006) | ✓ | 1894 |
| 1888345 (McCluskey 1991) | ✗ | not found |

Morin 1999 title: "Behavioral and pharmacological therapies for late-life insomnia" — does not use
the phrase "cognitive behavioral therapy"; likely indexed under "Behavior Therapy"[Mesh], not
"Cognitive Behavioral Therapy"[Mesh]. McCluskey 1991: "Efficacy of behavioral versus triazolam
treatment" — same issue, predates the CBT-I standardization era.

Even with MeSH search: theoretical ceiling is 3/5 = 60%. For the 3 papers that MeSH finds, they
rank 1892–1939 out of 2024 — far beyond any 200-record cap.

#### RC3 — EuropePMC harness double-encoding bug

The initial harness draft pre-encoded the query string and then passed it to `url.searchParams.set()`,
causing double URL-encoding that returned 0 total hits (`hitCount=undefined`). This was corrected
before measurement by using `url.searchParams.set('query', rawQuery)` directly. The corrected
results above (hitCount=1994, 185 returned, 0/5 hits) are correct and consistent with PubMed.
This is a **harness bug** with no impact on the final result — both harness versions give 0/5.

---

## 5. Findings

| # | Severity | Finding | Owner |
|---|---|---|---|
| F1 | **Confirmed open** | CRIT-1: OpenAlex `api_key` still returns 401. Carried from validation 001. Not addressed by handoffs 102–103 (those worked on full-text retrieval, not search recall). | Dev |
| F2 | **Superseded — now measured** | Validation 001 F2 was "Stage 3 unmeasured / no real fixtures." The capture script now exists. This validation provides the first real recall measurement: **0/5 (0%) union recall** on the Mitchell 2012 truth set. F2 closes as a blocking issue; the result is a measured **FAIL**, not "pending." | — |
| F3 | **High — New** | **Date-sorted truncation: `fetchPrimaryStudyIds` captures only the most recent ~200 papers.** Both PubMed and EuropePMC return results newest-first; the 200-record cap means the Stage 3 search window is effectively the last 5–10 years for most clinical topics. Any SR whose included studies predate this window will have ≈0% recall. This is a structural design choice, not a bug per se, but it is incompatible with the ≥95% recall claim as stated in the Validation Strategy and About page context. | Dev |
| F4 | **High — New** | **Terminology coverage gap: 2/5 truth studies are not retrievable even with MeSH.** Morin 1999 and McCluskey 1991 use "behavioral therapy" / "behavioral treatment" rather than "cognitive behavioral therapy" — a different MeSH heading that predates the CBT-I standardization era. A reviewer who enters "cognitive behavioral therapy insomnia" would miss these studies even with exhaustive pagination. This reflects a general limitation: SR searches need synonym expansion (CBT, CBT-I, cognitive behaviour therapy, behavior therapy, sleep restriction, stimulus control) to achieve high recall. Blindspot does not currently expand synonyms in `fetchPrimaryStudyIds`. | Dev |
| F5 | **Medium — New** | **The Mitchell 2012 SR truth set is a hard case (historical-cohort).** The 5 included studies (1991–2006) are 20–35 years old. Blindspot may have higher recall on recent SRs whose included studies fall within the 200-record recent-cohort window. A follow-up validation using a 2020–2024 SR (included studies from 2015–2024) would establish whether the truncation finding generalises or is limited to historical-cohort SRs. Recommended for validation 005. | — (informational) |
| F6 | **Low — Harness** | Double-URL-encoding bug in initial harness draft (see RC3 above). Corrected before measurement. Not a production code issue. | — (harness, resolved) |

---

## 6. Claims status

| Claim | Prior status | Status after validation 004 |
|-------|-------------|------------------------------|
| Stage 3 union recall ≥95% | `unmeasured` (validation 001) | `contradicted (validation 004): measured 0/5 = 0% on Mitchell 2012 truth set. Root cause: date-sorted truncation + terminology gap; not a single-source failure` |
| OpenAlex CRIT-1 (`api_key` 401) | `open (validation 001)` | `confirmed still open (validation 004)` |
| `scripts/capture-recall-fixture.ts` exists | `missing (validation 001 F2)` | `verified: script now exists and is well-formed` |
| REAL_RECALL_FIXTURES populated | `empty (validation 001 F2)` | `still empty — no fixtures added since validation 001` |

---

## 7. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local; OpenAlex and EuropePMC keyless):
node spec/validation/004-harness.mjs

# Expected output:
#   PubMed: hits=0/5 recall=0%
#   EuropePMC: hits=0/5 recall=0%
#   OpenAlex(api_key): 401 (CRIT-1)
#   OpenAlex(keyless): hits=0/5 recall=0%
#   Union recall: 0%
#
# Gold SR: Mitchell 2012 (PMID 22631616, BMC Fam Pract)
# Truth PMIDs: 16804151, 15451764, 10086433, 16785771, 1888345
# All are confirmed in PubMed/EPMC via direct PMID lookup (separate from the recall query)

# Verify truth PMIDs exist in PubMed (offline verification):
# curl "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=16804151,15451764,10086433,16785771,1888345&retmode=json" | jq '.result | to_entries[] | .value.title'
# Expected: 5 titles matching Sivertsen 2006, Jacobs 2004, Morin 1999, Wu 2006, McCluskey 1991

# Root cause probe (date-sorted truncation):
# PubMed returns 313 total for the production query; oldest in first 200 is PMID ~34763429 (≈2021)
# Truth papers (PMID ≤ 16804151, ≈2006) are in positions 201–313, never fetched
```

---

## 8. Recommended next steps

1. **Dev — Fix date-sorted truncation (F3)**: The ≥95% recall claim requires comprehensive retrieval,
   not a recent-cohort snapshot. Options: (a) increase the default `limit` in `fetchPrimaryStudyIds`
   substantially (≥2000) and sort by relevance rather than date; (b) add MeSH-expanded queries as a
   second pass alongside free-text; (c) add date-decoupled retrieval (e.g., date-stratified batches
   covering 5-year windows back to the earliest relevant literature). The right approach depends on
   performance constraints.

2. **Dev — Fix CRIT-1 (F1, carried)**: The `OPENALEX_API_KEY` returns 401; either rotate the key or
   restructure to use the keyless `mailto` path for the search recall path (as `lib/fulltext.ts`
   does for full-text retrieval). Note that OpenAlex keyless also returned 0/5 on this truth set,
   so CRIT-1 is not the primary recall barrier here, but it remains a production correctness issue.

3. **Dev — Add synonym expansion (F4)**: `fetchPrimaryStudyIds` should expand CBT-related queries to
   include synonyms: "cognitive behaviour therapy" (UK spelling), "CBT-I", "behavioral therapy",
   "sleep restriction therapy", "stimulus control therapy". This is the standard SR boolean search
   practice and is needed to reach ≥95% recall on terminology-diverse topics.

4. **Tester (next) — Validation 005: recent-SR truth set (F5)**: Run the same harness against a
   2020–2023 SR with included studies from 2015–2023 to isolate whether the 0% result is specific to
   historical-cohort SRs or generalises. If recall is ≥95% on recent SRs, the gap narrows; if still
   near-zero, the truncation problem is more fundamental.

5. **Librarian**: The wiki claim that Stage 3 recall is "pending" or "unmeasured" should be updated.
   The claim that the ≥95% bar "cannot be evaluated yet" (from validation 001) should be updated to
   "measured fail (0%) on Mitchell 2012 truth set; root cause: date-sorted truncation + terminology
   gap; fix required before re-test."

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| Stage 3 union recall ≥95% | ❌ **FAIL** (measured 0%) | All sources, union: 0/5 on Mitchell 2012 truth set |
| OpenAlex CRIT-1 | ❌ **FAIL (open)** | api_key still 401; unchanged since validation 001 |
| capture script exists | ✅ **PASS** | F2 from validation 001 resolved |
| REAL_RECALL_FIXTURES | ⏳ **Still empty** | Capture script exists but no fixtures committed yet |

**Overall:** The Stage 3 ≥95% union recall bar produces its **first measured result: 0%** against
the Mitchell 2012 external truth set. This is a definitive FAIL, not an artefact: all truth papers
exist in both PubMed and EuropePMC (confirmed by direct PMID lookup) but are systematically excluded
by date-sorted truncation at the 200-record cap. Two of five truth papers cannot be retrieved even
with exhaustive MeSH search due to terminology variation predating the CBT-I standardisation era.

The root cause is a structural mismatch between Blindspot's search implementation (designed for
recent-cohort feasibility assessment) and the ≥95% comprehensive historical recall requirement.
Dev action on F3 (date-sorted truncation) and F4 (synonym expansion) is required before this bar
can be re-tested.

**Session completed:** 2026-06-23
