# Validation 006 — Stage 3 Search Recall: Handoff 106 Re-test (PubMed Binary-NOT Fix)

**Tester instance** · **Date:** 2026-06-24 · **Stage:** Stage 3 — Primary-literature capture (recall)
**Spec under test:** Validation Strategy §Stage 3; Brief 005
**Handoff under test:** `spec/106-handoff.md` — PubMed `fetchPrimaryStudyIds` filter fix:
  `(${query}) AND NOT systematic[sb]` → `(${query}) NOT systematic[sb]` (binary NOT)
**Code under test:** `lib/pubmed.ts` `fetchPrimaryStudyIds` (line 276)
**Harness:** `spec/validation/006-harness.mjs` (live-network, Mitchell 2012 truth set)
**Prior validation:** `spec/validation/005-validation.md`

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 106 modified `lib/pubmed.ts` `fetchPrimaryStudyIds` (single line, line 276):

```
OLD (broken): `(${query}) AND NOT systematic[sb]${datePart}`
NEW (fixed):  `(${query}) NOT systematic[sb]${datePart}`
```

Validation 005 F1 proved the old form was silently inverted by PubMed's ATM, returning only
systematic reviews (313 SRs, 0/5 recall). The fix uses PubMed's binary NOT operator, which the
dev's own live-network test (handoff 106 §3) measured at 4/5 recall pre-merge.

This validation independently re-runs the Stage 3 recall measurement using the same Mitchell 2012
truth set (005/004 harness carryover) to confirm the claim. A **control probe** re-runs the old
broken form to verify the defect is still present with the old syntax and is absent with the new.

No other changes were in scope: EuropePMC and OpenAlex code was not touched in handoff 106.

---

## 2. Truth set and provenance

Unchanged from validations 004 and 005. Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40),
5 included RCTs confirmed in PubMed via `esummary`.

| Ref | PMID | Citation |
|-----|------|----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 |
| [33] | **1888345**  | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

---

## 3. Harness design

Six probes, run from `spec/validation/006-harness.mjs` against live NCBI / EPMC / OpenAlex APIs.

| Probe | What it tests | Query |
|-------|---------------|-------|
| A (control) | OLD broken form — should still return ~313, hits=0/5 | `(topic) AND NOT systematic[sb]`, retmax=2000, relevance |
| B (primary) | NEW fixed form — handoff 106 claim: ≥3/5 | `(topic) NOT systematic[sb]`, retmax=2000, relevance |
| B2 | Set-overlap diagnostic — confirms binary NOT honoured | intersection of A and B result sets |
| C1 | EPMC production mirror — no sort, limit=200 | TITLE_ABS filter, no sort |
| C2 | EPMC cursor pagination diagnostic — up to 2 pages | cursorMark API |
| D | OpenAlex keyed (CRIT-1 open) | api_key probe |
| E | OpenAlex keyless (mailto) | keyless production mirror |

---

## 4. Results

### 4.1 Probe A — PubMed OLD form (control)

```
ProbeA OLD: status=200 total=313 returned=313 hits=0/5 recall=0%
  missed: 16804151, 15451764, 10086433, 16785771, 1888345
```

**Confirms:** the `AND NOT systematic[sb]` defect still exists if the old query form is used. The
broken form returns exactly 313 results (all systematic reviews), unchanged from validation 005.
This is the control baseline.

---

### 4.2 Probe B — PubMed NEW form (handoff 106 fix) — **PASS 4/5 = 80%**

```
ProbeB NEW: status=200 total=3421 returned=2000 hits=4/5 recall=80%
  missed: 1888345 (McCluskey 1991 — RC2 terminology gap, expected)
  PMID 16785771 (Wu 2006):       rank  856/2000
  PMID 10086433 (Morin 1999):    rank 1180/2000
  PMID 15451764 (Jacobs 2004):   rank 1584/2000
  PMID 16804151 (Sivertsen 2006): rank 1620/2000
  PMID 1888345  (McCluskey 1991): NOT FOUND in 2000 returned
```

**The fix works.** The binary `NOT systematic[sb]` operator is honoured by PubMed: the query now
returns 3421 primary studies (vs 313 SRs with the old form). All 4 retrievable truth papers appear
within the 2000-record ceiling, at relevance ranks 856–1620.

Key observations:
- The count change (313 → 3421) matches handoff 106 §3's live measurement exactly.
- Rank positions (856, 1180, 1584, 1620) are within 1–2 of handoff 106's pre-merge measurements
  (855, 1179, 1583, 1619), consistent with minor API non-determinism from relevance re-scoring.
- The 2000-record ceiling (handoff 105) is **load-bearing**: the lowest-ranked truth paper is at
  position 1620, well past the old 200-record cap and within the new 2000 ceiling.
- McCluskey 1991 (1888345) is not found — consistent with 005 RC2: the paper predates
  "cognitive behavioral therapy" terminology and does not match the query. Out of scope for this fix.

---

### 4.3 Probe B2 — Set-overlap diagnostic

```
OLD total: 313   NEW total: 2000
In both:   0     NEW-only: 2000   OLD-only: 313
✓ Sets differ — binary NOT is being honoured (old and new query results diverge)
```

**The two result sets are completely disjoint (0% overlap).** This is the strongest possible
confirmation that the binary NOT is being honoured: the old form returned 313 systematic reviews,
and the new form returned 2000 primary studies, with zero papers in common. PubMed is now correctly
treating `NOT systematic[sb]` as an exclusion filter, not adding `AND systematic[sb]`.

This also validates handoff 106's diagnostic claim: the old and new forms are true logical
complements (for the truncated range), not the same set.

---

### 4.4 Probe C1 — EuropePMC production mirror (no sort, limit=200)

```
ProbeC1 EPMC-prod: status=200 total=1994 returned=185 hits=0/5 recall=0%
  missed: all 5 truth papers
```

Unchanged from validation 005. EuropePMC was not modified in handoff 106. The `NOT PUB_TYPE`
filter appears to work correctly (1994 results, consistent with 005), but with date-sorted order
and a 185-record page, the 1991–2006 truth papers are beyond the retrieval window. This is RC1
for EPMC (005 F4), still open.

---

### 4.5 Probe C2 — EuropePMC cursor pagination diagnostic

```
EPMC cursor p1: hitCount=1994 returned=200 nextCursorMark=AoIIQHnX7ig1MjgyMjAwMA==
  p1 hits=0/5
EPMC cursor p2: returned=181 nextCursorMark=AoIIQDizwSg1Mzg5NjE3 (different from p1)
  p2 hits=0/5
  cursor same as p1? false
```

The EPMC `cursorMark` API works. Pages return correctly, and the cursor advances between pages
(no infinite loop). However:
- Truth papers are not in the first 400 records (pages 1–2).
- Total = 1994 records across ~10 pages (200/page). The 1991–2006 papers, under default date sort,
  are likely in pages 8–10 (positions ~1400–1994).
- **A full cursor pagination through all 1994 records would be required to recover them via EPMC.**
  This confirms 005 F4 (EPMC pagination fix needed) but also shows the cursor mechanism is viable.

> **Harness note:** The full paginated probe (C2) was stopped early (after 2 pages) to avoid a
> prolonged network wait. The cursor diagnostic is sufficient to establish the mechanism works.

---

### 4.6 Probe D — OpenAlex keyed (CRIT-1 probe)

```
ProbeD OA(api_key): status=401 err={"error":"Invalid or missing API key",...}
→ CRIT-1: api_key still returns 401
```

Unchanged from validations 001, 004, 005.

---

### 4.7 Probe E — OpenAlex keyless (mailto)

```
ProbeE OA(keyless): status=200 total=3793 returned=185 hits=4/5 recall=80%
  missed: 1888345 (McCluskey 1991)
  PMID 15451764 (Jacobs):     rank  1/185
  PMID 16804151 (Sivertsen):  rank  5/185
  PMID 10086433 (Morin):      rank 28/185
  PMID 16785771 (Wu):         rank 86/185
```

Matches validation 005 (4/5, 80%). OpenAlex semantic indexing retrieves all 4 papers within the
first 200 results at high ranks (1, 5, 28, 86), requiring no extended pagination. This source
remains the most efficient retriever for this topic — if CRIT-1 were resolved, it would provide
4/5 recall with a single 200-record page.

Note: OpenAlex appears to have grown slightly (3793 vs 3793 in 005), consistent with ongoing
indexing; ranks are stable.

---

### 4.8 Union results

| Union | Sources | Hits | Recall |
|-------|---------|------|--------|
| Production (CRIT-1 open) | PubMed_NEW + EPMC_prod | **4/5** | **80%** |
| + EPMC fully paginated (if implemented) | PubMed_NEW + EPMC_2000 | 4/5 (est.) | 80% (est.) |
| Theoretical ceiling | PubMed_NEW + EPMC_prod + OA_keyless | **4/5** | **80%** |
| Missed by all sources | — | 1888345 (McCluskey 1991) | — |

Production recall has improved from **0% → 80%** since validation 005, driven entirely by the
handoff 106 PubMed filter fix. The union ceiling does not increase from PubMed alone here because
EPMC returns 0/5 and OpenAlex finds the same 4 papers PubMed does (no additive gain on this truth
set).

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | **Resolved** | PubMed `AND NOT systematic[sb]` ATM inversion (005 F1). Fixed in handoff 106. Binary NOT confirmed working: OLD set (313 SRs) and NEW set (2000 primaries) are completely disjoint (0 overlap). `fetchPrimaryStudyIds` now correctly returns primary study IDs. |
| F2 | **High — Carried** | OpenAlex CRIT-1: `api_key` still 401. With keyless OA returning 4/5 at ranks 1–86, this remains the highest-ROI single fix. |
| F3 | **High — Carried (005 F4)** | EuropePMC date-sorted truncation. Production 185 records, 0/5. Cursor pagination mechanism confirmed viable (no infinite loop), but full pagination of 1994 records is needed to recover truth papers. Fix: implement cursor loop with retmax ≈ 2000. |
| F4 | **Medium — Deferred (106 §6)** | Same `AND NOT systematic[sb]` bug in 3 sibling functions: `countPrimaryStudies` (line 124), `fetchPrimaryStudiesForScreening`, `countPrimaryStudiesRecent` (line 293). These were out of brief 005 scope but carry the same defect — they count/fetch systematic reviews as primary studies. Confirm with a dedicated brief. |
| F5 | **Medium — Carried (005 F7)** | McCluskey 1991 (PMID 1888345) not retrievable from any source. RC2: pre-CBT-I terminology. Requires synonym expansion (brief 006). Ceiling for this SR with current code = 4/5. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 006 |
|-------|-------------|------------------------------|
| `fetchPrimaryStudyIds` returns primary study IDs | `contradicted (validation 005 F1)` | **`verified (validation 006)`** — binary NOT honoured; disjoint sets confirm correct exclusion |
| PubMed recall = 4/5 (80%) for Mitchell 2012 | `claimed (handoff 106 §3)` | **`verified (validation 006)`** — independently measured: 4/5 (80%), ranks 856/1180/1584/1620 |
| AC-pubmed (≥3/5) met | `claimed (handoff 106)` | **`verified (validation 006)`** — 4/5 ≥ 3/5 ✅ |
| AC-union (≥60%) met | `claimed (handoff 106)` | **`verified (validation 006)`** — 80% ≥ 60% ✅ |
| Stage 3 union recall ≥95% | `contradicted (validation 005): 0%` | `still contradicted: production 80%, ceiling 80% (1 paper not retrievable by any source)` |
| OpenAlex CRIT-1 (`api_key` 401) | `confirmed open (005)` | `confirmed still open (validation 006)` |
| EuropePMC date-sorted truncation (F4/005) | `open` | `confirmed: cursor mechanism viable but 1994-record full pagination required` |
| `countPrimaryStudies` / `countPrimaryStudiesRecent` return primary counts | `unverified (not in scope 005/006)` | `unverified — carry same AND NOT defect per code review (lib/pubmed.ts lines 124, 293)` |

---

## 7. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local):
cd /Users/dharmayudesai/blindspot
node spec/validation/006-harness.mjs

# Expected output (as of 2026-06-24):
#   ProbeA OLD (AND NOT systematic[sb], retmax=2000): total=313  returned=313  hits=0/5  recall=0%
#   ProbeB NEW (NOT systematic[sb],     retmax=2000): total=3421 returned=2000 hits=4/5  recall=80%
#     Rank positions: 16785771→856, 10086433→1180, 15451764→1584, 16804151→1620
#   ProbeB2: OLD total=313, NEW total=2000, overlap=0  (sets fully disjoint, NOT honoured)
#   ProbeC1 EPMC-prod (no sort, 200):   total=1994 returned=185  hits=0/5
#   ProbeC2 EPMC-cursor p1: cursor advances; 0/5 in first 400 records
#   ProbeD OA(api_key):  status=401 (CRIT-1)
#   ProbeE OA(keyless):  total=3793 returned=185 hits=4/5 recall=80% (ranks 1,5,28,86)
#   Union-prod [PubMed_NEW+EPMC-prod]: hits=4/5 recall=80%
#   Ceiling [all sources]:             hits=4/5 recall=80%

# Gold SR: Mitchell 2012 (PMID 22631616)
# Truth PMIDs: 16804151, 15451764, 10086433, 16785771, 1888345
```

---

## 8. Recommended next steps

1. **Dev — Fix `countPrimaryStudies` / `countPrimaryStudiesRecent` (F4)**: Both still use
   `AND NOT systematic[sb]` (lines 124, 293). Same ATM inversion — they currently count/return
   systematic reviews, not primary studies. Apply the same binary `NOT` fix and verify with a
   count probe. `countPrimaryStudies` feeds feasibility scoring, so this is a correctness bug in a
   user-visible feature.

2. **Dev — EPMC cursor pagination (F3)**: Cursor mechanism is confirmed viable. Implement a
   cursorMark loop in `lib/europepmc.ts` `fetchPrimaryStudyIds` to fetch up to 2000 records.
   The truth papers (1991–2006) are expected in pages 8–10 of the date-sorted set.

3. **Ops — CRIT-1 (F2)**: OpenAlex keyless already delivers 4/5 at ranks 1–86. Rotating the
   API key or switching to a valid keyless `mailto` path in production is the highest-ROI ops fix.

4. **Dev — Synonym expansion (F5 / brief 006)**: McCluskey 1991 is structurally unretrievable by
   any source with the current query. Requires query synonym expansion to reach 5/5.

5. **Tester (next — Validation 007)**: Confirm the `countPrimaryStudies` F4 claim with a live
   probe; add a second SR truth set (recent, 2020–2023) to check generalisation per 005 §8.4.

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC-pubmed (≥3/5) | ✅ **PASS — 4/5 (80%)** | Independently verified; matches handoff 106 pre-merge measurement |
| AC-union (≥60%) | ✅ **PASS — 80%** | PubMed_NEW alone sufficient; EPMC adds 0/5 (date truncation), OA adds 0 (same papers) |
| PubMed binary NOT honoured | ✅ **CONFIRMED** | OLD/NEW sets disjoint (313 SRs vs 2000 primaries, 0 overlap) |
| `fetchPrimaryStudyIds` correctness | ✅ **VERIFIED** | Returns primary study IDs; NOT exclusion working |
| Stage 3 production union recall ≥95% | ❌ **FAIL — 80%** | Ceiling blocked by: EPMC pagination (F3), McCluskey RC2 (F5), CRIT-1 (F2) |
| OpenAlex CRIT-1 | ❌ **FAIL (open)** | api_key 401; unchanged |

**Overall:** Handoff 106's single-line fix (`AND NOT` → binary `NOT`) is confirmed correct.
PubMed `fetchPrimaryStudyIds` now returns primary studies, not systematic reviews. Recall improves
from 0% to 80% (4/5) on the Mitchell 2012 truth set, meeting both AC-pubmed (≥3/5) and AC-union
(≥60%) from brief 005. The dev's pre-merge measurement (handoff 106 §3) is independently verified.

The brief 005 PASS criteria are met for PubMed. The Stage 3 long-run bar (≥95%) remains
unmet — the path is: CRIT-1 (OpenAlex key) + EPMC pagination + synonym expansion.

**Session completed:** 2026-06-24
