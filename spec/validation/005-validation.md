# Validation 005 — Stage 3 Search Recall: Handoff 105 Re-test + Root Cause Revision

**Tester instance** · **Date:** 2026-06-23 · **Stage:** Stage 3 — Primary-literature capture (recall)
**Spec under test:** Validation Strategy §Stage 3; Brief 005
**Handoff under test:** `spec/105-handoff.md` — PubMed `fetchPrimaryStudyIds` relevance sort + 2000-record ceiling
**Code under test:** `lib/pubmed.ts` `fetchPrimaryStudyIds` (fixed), `lib/europepmc.ts` (unchanged), `lib/openalex.ts` (unchanged — not touched in handoff 105)
**Harness:** `spec/validation/005-harness.mjs` (live-network, Mitchell 2012 truth set)
**Prior validation:** `spec/validation/004-validation.md`

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 105 modified `lib/pubmed.ts` `fetchPrimaryStudyIds`:
- Default `limit` raised `200 → 2000`
- `sort="relevance"` (PubMed "Best Match") added as third arg to `esearch()`

The handoff's stated premise was validation 004 RC1: truth papers were in positions 201–313 of a
date-sorted 313-result set, excluded by the 200-record cap. The fix should, per the brief, raise
PubMed recall from 0/5 to ≥3/5 (the 3 CBT-terminology papers).

This validation re-runs the Stage 3 recall measurement against the same Mitchell 2012 truth set to
determine whether the fix achieved its stated outcome, and investigates any discrepancy.

---

## 2. Truth set and provenance

Unchanged from validation 004. Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40), 5 included
RCTs extracted from PMC XML refs [29]–[33], individually confirmed in PubMed via `esummary`.

| Ref | PMID | Citation |
|-----|------|----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 |
| [33] | **1888345** | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

---

## 3. Source queries

### PubMed (production mirror)
`fetchPrimaryStudyIds("cognitive behavioral therapy insomnia")` issues:
```
(cognitive behavioral therapy insomnia) AND NOT systematic[sb]
```
- **Old path (004 baseline):** retmax=200, no sort (implicit date)
- **New path (handoff 105):** retmax=2000, sort=relevance

### EuropePMC (unchanged from 004 production)
`fetchPrimaryStudyIds("cognitive behavioral therapy insomnia")` issues (via `withFieldRestriction`):
```
TITLE_ABS:(cognitive behavioral therapy insomnia) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"
```
limit=200, no sort parameter in production code.

### OpenAlex (free-text topic)
```
filter=title_and_abstract.search:cognitive behavioral therapy insomnia,type:article
```
per-page=200.

> **Harness query note:** The 005 harness uses `QUERY_FREE = "cognitive behavioral therapy insomnia"`
> for EuropePMC and OpenAlex. This differs from the 004 harness query
> (`"cognitive behavioral therapy" insomnia pharmacotherapy medication`). The narrower 004 query
> was not a production mirror; the 005 query is closer to what a user topic entry would produce.
> See §4.4 for the impact on OpenAlex recall.

---

## 4. Results

### 4.1 PubMed OLD path (retmax=200, date sort) — baseline re-test

```
PubMed OLD (date,200): status=200  total=313  returned=200  hits=0/5  recall=0%
  missed: 16804151, 15451764, 10086433, 16785771, 1888345
```

Confirms validation 004 baseline (0%). Handoff 105 not applied here.

---

### 4.2 PubMed NEW path (retmax=2000, sort=relevance) — **FAIL (0/5 = 0%)**

```
PubMed NEW (relevance,2000): status=200  total=313  returned=313  hits=0/5  recall=0%
  missed: 16804151, 15451764, 10086433, 16785771, 1888345
  (all 5 truth PMIDs: NOT FOUND in 313 returned)
```

**The fix had no effect.** All 313 results were fetched (total=313 < retmax=2000 so no truncation
occurred), yet 0/5 truth papers appeared. The handoff 105 change is a correct implementation of
what was described, but the described root cause (RC1: date-sorted truncation of positions 201–313)
was incorrect.

#### Root cause investigation

**Step 1 — Individual keyword match.** Each truth PMID was tested with
`{pmid}[uid] AND (cognitive behavioral therapy insomnia)`:

| PMID | Matches keyword query? |
|------|----------------------|
| 16804151 (Sivertsen) | ✓ YES (count=1) |
| 15451764 (Jacobs) | ✓ YES (count=1) |
| 10086433 (Morin) | ✓ YES (count=1) |
| 16785771 (Wu) | ✓ YES (count=1) |
| 1888345 (McCluskey) | ✗ NO (count=0) |

Conclusion: 4/5 papers match the keyword query alone. They are absent from the 313-result set for
a different reason.

**Step 2 — Systematic filter audit.** Tested `{pmid}[uid] AND systematic[sb]` for each paper:
all returned count=0 (none are classified as systematic reviews in PubMed's SubsetBank).

**Step 3 — Filter equivalence test (critical).**

```
(cognitive behavioral therapy insomnia) AND NOT systematic[sb]  →  313 results
(cognitive behavioral therapy insomnia) AND systematic[sb]      →  313 results
Set overlap between the two result sets:  313 / 313  (100% identical)
Union:  313 (same set)
```

**`AND NOT systematic[sb]` and `AND systematic[sb]` return exactly the same 313 papers.**
The `NOT` modifier is being dropped or inverted. PubMed's Automatic Term Mapping (ATM) query
translation confirms this:

```
Query sent:   (cognitive behavioral therapy insomnia) AND NOT systematic[sb]
ATM output:   ("cognitive behavioural therapy"[All Fields] OR "cognitive behavioral therapy"[MeSH Terms]
               OR ...) AND ("insomnia"[All Fields] OR ...) AND "systematic"[Filter]
```

The ATM translation shows `AND "systematic"[Filter]` — the NOT is absent. PubMed is translating
`AND NOT systematic[sb]` as `AND systematic[sb]`, returning **only systematic reviews**.

This is a **critical production defect** in `fetchPrimaryStudyIds`: the function is returning
**systematic review IDs**, not primary study IDs, because the `AND NOT systematic[sb]` filter
is silently inverted/dropped by PubMed's ATM.

**Implication for validation 004 RC1:** The RC1 diagnosis ("truth papers in positions 201–313,
never fetched") was wrong. The truth papers are absent because they are **primary studies**
(correctly absent from a systematic-review-only result set). The 200→2000 retmax change has zero
impact because the filtering error occurs before truncation. RC2 (terminology variation) was
correctly identified as a secondary cause for McCluskey 1991 (1888345) — the only paper that
also does not match the keyword query.

---

### 4.3 EuropePMC — **FAIL (0/5 = 0%)**, harness anomaly noted

**Harness result (sort=RELEVANCE):** `status=200 total=0 returned=0 hits=0/5`

`sort=RELEVANCE` is no longer a valid EuropePMC sort parameter; the API returns `{"version":"6.9"}`
with no results. This is a harness bug — the production `lib/europepmc.ts` `fetchPrimaryStudyIds`
does **not** pass a sort parameter (no change in handoff 105).

**Production query re-test (no sort param, production mirror):**

```
TITLE_ABS:(cognitive behavioral therapy insomnia) NOT PUB_TYPE:"Systematic Review"
  NOT PUB_TYPE:"Meta-Analysis"
→ hitCount=1994  returned=185 (date-sorted, limit=200)  hits=0/5  recall=0%
```

This matches validation 004 exactly. EuropePMC was not changed in handoff 105. EuropePMC's filter
syntax (`NOT PUB_TYPE:"Systematic Review"`) appears to work correctly (unlike PubMed's
`NOT systematic[sb]`), but the result is still 0/5 because the truth papers fall outside the 185-
record date-sorted window (EuropePMC has 1994 total for this query, and the 1991–2006 papers are
well beyond position 185).

Note: EuropePMC's date-sorted truncation (RC1) IS a real barrier for EPMC, unlike for PubMed where
the filter failure is the primary cause.

---

### 4.4 OpenAlex (api_key — CRIT-1) — **FAIL (401 confirmed)**

```
OpenAlex(api_key): status=401  err={"error":"Invalid or missing API key",...}
→ CRIT-1 still open
```

Unchanged from validations 001 and 004.

---

### 4.5 OpenAlex keyless — **PARTIAL PASS (4/5 = 80%)**

```
OpenAlex(keyless): status=200  total=3793  returned=185  hits=4/5  recall=80%
  Found:  16804151 (Sivertsen), 15451764 (Jacobs), 10086433 (Morin), 16785771 (Wu)
  Missed: 1888345 (McCluskey 1991)
```

**This is a significant improvement from validation 004 (which measured 0/5 on OpenAlex keyless).**
The improvement is entirely due to the query change:

| Harness | OpenAlex query | total | returned | recall |
|---------|---------------|-------|----------|--------|
| 004 | `"cognitive behavioral therapy" insomnia pharmacotherapy medication` | 78 | 38 | 0/5 = 0% |
| 005 | `cognitive behavioral therapy insomnia` | 3793 | 185 | 4/5 = 80% |

The broader 005 query yields a far larger result set and retrieves 4 truth papers. This is not a
code fix — it is a harness query choice. It does, however, represent **the correct production
query input** (a user entering "cognitive behavioral therapy insomnia" as their topic), whereas the
004 harness used a narrower, non-production query.

OpenAlex's `title_and_abstract.search:` filter uses semantic/full-text indexing rather than strict
keyword matching, which may explain its ability to recover papers that PubMed's filter excludes.
McCluskey 1991 (1888345) is missed by all sources — confirming validation 004's RC2 finding for
that paper.

---

### 4.6 Union results

```
Union(PubMed_NEW + EuropePMC) — production baseline:
  hits=0/5  recall=0%

Union(PubMed_NEW + EuropePMC + OpenAlex_keyless) — theoretical ceiling:
  hits=4/5  recall=80%

Studies missed by ALL sources: 1888345 (McCluskey 1991)
```

**Production recall (with CRIT-1 blocking OpenAlex): 0% (unchanged from 004).**
**Theoretical ceiling (if CRIT-1 fixed, OpenAlex keyless in production): 80%.**

The ceiling has changed substantially from validation 004 (where OpenAlex keyless also returned 0%
due to the narrow harness query). The 80% ceiling reflects what production would deliver with the
correct topic query and OpenAlex available.

---

## 5. Findings

| # | Severity | Finding | Owner |
|---|---|---|---|
| F1 | **CRITICAL — New** | **`AND NOT systematic[sb]` silently inverted in PubMed.** `fetchPrimaryStudyIds` issues `(topic) AND NOT systematic[sb]` expecting primary studies, but PubMed ATM drops the `NOT`, returning only systematic reviews. Confirmed: `AND NOT systematic[sb]` and `AND systematic[sb]` return identical result sets (313/313 overlap, 100%). The function is misnamed — it retrieves SR IDs, not primary study IDs. Fix: use a different exclusion syntax (e.g., `NOT (systematic review[pt] OR meta-analysis[pt] OR cochrane database syst rev[journal])`) or restructure to `(topic) NOT review[pt] NOT systematic review[pt] NOT meta-analysis[pt]`. | Dev |
| F2 | **High — Carried** | **OpenAlex CRIT-1: `api_key` still returns 401.** Unchanged since validation 001. With this fix, OpenAlex keyless delivers 4/5 (80%) recall on the Mitchell truth set — making CRIT-1 the highest-impact single fix currently available. | Dev/Ops |
| F3 | **High — Revision of 004 RC1** | **Validation 004 RC1 (date-sorted truncation) was incorrect for PubMed.** The truth papers were never in the 313-result set regardless of retmax or sort order; they were excluded by the filter failure (F1). The handoff 105 fix correctly implements the described change, but the described root cause was wrong, so the fix has no effect on recall. The fix is not harmful and remains beneficial for topics where the systematic review filter would work correctly (if F1 is fixed), but it cannot be the recall improvement until F1 is addressed. | — (informational) |
| F4 | **High — Carried from 004** | **EuropePMC date-sorted truncation is a real barrier.** Unlike PubMed where the filter failure is primary, EuropePMC's 200-record date-sorted cap genuinely excludes the 1991–2006 truth papers (1994 total, truth papers well beyond position 185). The brief 005 EPMC fix (cursor pagination + RELEVANCE sort + limit 2000) is still needed once the valid EPMC sort parameter is identified (see F5). | Dev |
| F5 | **Medium — New** | **EuropePMC `sort=RELEVANCE` parameter is broken.** Returns `{"version":"6.9"}` with zero results. The 004 harness used this parameter and reported valid results; the parameter appears to have been deprecated since then. Production `lib/europepmc.ts` does not use a sort parameter, so production is unaffected. The brief 005 EPMC fix plan must use the correct EPMC sort parameter (likely `P_PDATE_D asc` or no sort with cursor-pagination through all results). | Dev (when implementing EPMC fix) |
| F6 | **Low — Resolved** | **005 harness EuropePMC encoding bug** (`URLSearchParams` encodes spaces as `+`, EPMC expects `%20`). Cross-checked by re-testing with production query format (no sort, URL string encoding) — result confirmed at 0/5. No impact on final measurements. Harness corrected for the EPMC probe but the `sort=RELEVANCE` failure (F5) also contributed to the 0-total result. | — (harness) |
| F7 | **Medium — McCluskey 1991 (1888345)** | **Not retrievable by any source for this topic query.** Does not match `(cognitive behavioral therapy insomnia)` in PubMed; absent from OpenAlex keyless. Consistent with 004 RC2: pre-CBT-I era paper uses "behavioral therapy" not "cognitive behavioral therapy." This paper represents a systematic retrieval gap that requires synonym expansion (brief 006) regardless of the filter/CRIT-1 fixes. | Dev |

---

## 6. Claims status

| Claim | Prior status | Status after validation 005 |
|-------|-------------|------------------------------|
| Stage 3 union recall ≥95% | `contradicted (validation 004): 0% on Mitchell 2012` | `contradicted (validation 005): 0% production, 80% ceiling. New root cause: PubMed systematic filter failure (F1) not date truncation (004 RC1). Fix priority: CRIT-1 (F2) > PubMed filter (F1) > EPMC pagination (F4) > synonyms (F7)` |
| Validation 004 RC1: date-sorted truncation | `open` | `incorrect for PubMed — superseded by F1 (filter failure). RC1 remains valid for EuropePMC (F4). Handoff 105 PubMed fix has no effect on recall until F1 is resolved` |
| OpenAlex keyless ceiling = 0% (004 harness) | `measured 004` | `corrected: correct production query yields 4/5 (80%) ceiling. 004 harness used a narrower non-production query` |
| OpenAlex CRIT-1 (`api_key` 401) | `confirmed open (validation 004)` | `confirmed still open (validation 005)` |
| `fetchPrimaryStudyIds` returns primary study IDs | `unverified` | `contradicted (validation 005 F1): returns systematic review IDs due to PubMed ATM dropping NOT from NOT systematic[sb]` |

---

## 7. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local):
node spec/validation/005-harness.mjs

# Expected output:
#   PubMed OLD (date,200):        hits=0/5  recall=0%
#   PubMed NEW (relevance,2000):  hits=0/5  recall=0%  (all 313 fetched; filter failure)
#   EuropePMC (relevance,200):    total=0   (sort=RELEVANCE harness bug; see note)
#   OpenAlex(api_key):            status=401 (CRIT-1)
#   OpenAlex(keyless):            hits=4/5  recall=80%
#   Union(PubMed_NEW+EPMC):       0/5  recall=0%
#   Union ceiling (+OA_keyless):  4/5  recall=80%
#
# Gold SR: Mitchell 2012 (PMID 22631616)
# Truth PMIDs: 16804151, 15451764, 10086433, 16785771, 1888345

# Key diagnostic commands:
# Confirm filter equivalence (F1):
#   esearch.fcgi?db=pubmed&term=(cognitive+behavioral+therapy+insomnia)+AND+NOT+systematic[sb]&retmax=0
#   esearch.fcgi?db=pubmed&term=(cognitive+behavioral+therapy+insomnia)+AND+systematic[sb]&retmax=0
#   Both should return count=313 (identical sets)

# Confirm truth papers match keyword (without filter):
#   16804151[uid] AND (cognitive behavioral therapy insomnia) → count=1
#   16804151[uid] AND NOT systematic[sb] → count=0  (confirms filter exclusion)

# Confirm EuropePMC production query (no sort, proper encoding):
#   query=TITLE_ABS:(cognitive+behavioral+therapy+insomnia)+NOT+PUB_TYPE:"Systematic+Review"...
#   → hitCount=1994, 0/5 truth papers in first 185
```

---

## 8. Recommended next steps

1. **Dev — Fix PubMed `AND NOT systematic[sb]` (F1, CRITICAL)**: The filter is silently inverted by
   PubMed ATM. Replace with explicit publication type exclusion:
   `(topic) NOT (systematic review[pt] OR meta-analysis[pt] OR cochrane database syst rev[journal])`
   or use PubMed's filter URL params (`&filter=pubt.clinicaltrial` etc.) rather than the query
   string. Validate by confirming the 5 truth papers appear in the result set after the fix.
   **This must be fixed before any other PubMed recall work is meaningful.**

2. **Dev — Fix CRIT-1 (F2, High)**: OpenAlex keyless delivers 4/5 (80%) recall today on the
   correct production query. Rotating the api_key or switching to keyless `mailto` path would
   immediately raise the production ceiling from 0% to 80% for this topic. Highest-impact single fix.

3. **Dev — EuropePMC pagination (F4)**: After identifying the valid EPMC sort parameter (not
   RELEVANCE — see F5), implement cursor pagination + higher limit as planned in brief 005. This
   would extend the EPMC window beyond the current 185 date-sorted papers.

4. **Dev — Synonym expansion (F7 / brief 006)**: McCluskey 1991 is not recoverable without query
   synonyms. This is the last mile to approach 5/5 recall.

5. **Tester (next) — Validation 006**: Re-run after F1 (PubMed filter fix) with the same Mitchell
   2012 truth set. Expected: PubMed should then return primary studies; RC1 (retmax 2000,
   relevance sort from handoff 105) can then be properly evaluated. Recommend also adding a second
   SR truth set (recent, 2020–2023) per validation 004 F5 to confirm generalisation.

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| Stage 3 production union recall ≥95% | ❌ **FAIL (0%)** | PubMed and EPMC both 0/5; OpenAlex blocked by CRIT-1 |
| Handoff 105 effect on PubMed recall | ❌ **No effect (0/5 → 0/5)** | Fix implemented correctly but wrong root cause; filter failure (F1) is upstream |
| OpenAlex CRIT-1 | ❌ **FAIL (open)** | api_key still 401 |
| OpenAlex theoretical ceiling | 🔼 **80% (4/5)** | Improved from 004's 0% (004 used narrow non-production query) |
| PubMed `fetchPrimaryStudyIds` correctness | ❌ **FAIL** | Returns SR IDs not primary IDs (F1: NOT systematic[sb] inverted) |

**Overall:** Handoff 105 correctly implements the described change but the validation 004 root
cause analysis (RC1: date-sorted truncation) was incorrect for PubMed. The actual root cause is a
PubMed ATM filter failure: `AND NOT systematic[sb]` is silently treated as `AND systematic[sb]`,
causing `fetchPrimaryStudyIds` to return systematic review IDs exclusively. This is confirmed by
set-equivalence testing: the NOT-systematic and systematic result sets are identical (313/313
overlap). The handoff 105 fix (retmax, sort) has no effect until this filter bug is resolved.

The most impactful immediate fix is CRIT-1 (OpenAlex key rotation/keyless): with a valid OpenAlex
path and the correct production topic query, recall reaches 80% (4/5) without any code changes to
the search logic.

**Session completed:** 2026-06-23
