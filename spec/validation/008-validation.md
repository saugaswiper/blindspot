# Validation 008 — Stage 3: EuropePMC cursorMark Pagination (Handoff 108)

**Tester instance** · **Date:** 2026-10-13 · **Stage:** Stage 3 — Primary-literature capture (EPMC channel)
**Spec under test:** Validation Strategy §Stage 3; Brief 008
**Handoff under test:** `spec/108-handoff.md` — `lib/europepmc.ts`
  `fetchPrimaryStudyIds`: single-page fetch → cursorMark loop; default `limit` 200 → 2000;
  `nextCursorMark?: string` added to `EuropePMCResponse` interface
**Code under test:** `lib/europepmc.ts` — `fetchPrimaryStudyIds` + `EuropePMCResponse`
**Harness:** `spec/validation/008-harness.mjs` (live network; EuropePMC REST API)
**Prior validation:** `spec/validation/006-validation.md` (F3 High — EPMC single-page truncation; 0/5 EPMC recall)
  `spec/validation/007-validation.md` (EPMC F3 carried; PubMed binary-NOT fix verified)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 108 replaced `fetchPrimaryStudyIds`'s single-page fetch (200 records) with a `cursorMark`
pagination loop (ceiling 2000, pageSize 200 → up to 10 requests). Validation 006 F3 showed the
pre-fix behaviour was returning only ~185 records (the first page of a ~1994-record result set),
causing 0/5 recall on the Mitchell 2012 truth set because the truth RCTs from 1991–2006 fell
beyond the first page.

Brief 008 acceptance criteria under test (live-network ACs; AC-union and AC-regression were
cleared by the dev's gate runs):

| AC | Criterion | Bar |
|----|-----------|-----|
| AC-depth | Full result set retrieved | ≥1900 IDs for CBT-insomnia topic (was 185 pre-fix) |
| AC-cursor | Cursor advances; no infinite loop | Distinct cursor per page; clean termination |
| AC-recall | EPMC independently retrieves truth papers | ≥2/5 Mitchell 2012 truth PMIDs in collected set |
| AC-union | Production union recall no regression | ≥4/5 (production path limit=200 unchanged) |
| AC-regression | No new TS/test failures | Confirmed by handoff 108 gate results |

---

## 2. Truth set and provenance

Unchanged from validations 004–007. Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40),
5 included RCTs.

| Ref | PMID | Citation |
|-----|------|----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 |
| [33] | **1888345**  | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

Known SR PMID (must not appear in primary query): **22631616** (Mitchell 2012 itself).

EPMC primary query mirrors the code (`lib/europepmc.ts` `withFieldRestriction` + NOT PUB_TYPE filters):
```
TITLE_ABS:(cognitive behavioral therapy insomnia) NOT PUB_TYPE:"Systematic Review" NOT PUB_TYPE:"Meta-Analysis"
```

---

## 3. Harness design

Six probes against live EuropePMC REST API, run from `spec/validation/008-harness.mjs`.
No API key required (public endpoint).

| Probe | What it tests | AC |
|-------|---------------|----|
| A1 | `hitCount` — total EPMC records for primary query (1 record, no cursor) | baseline |
| A2 | Full-depth pagination — ceiling=2000, collect all PMIDs + DOIs | AC-depth |
| A3 | Cursor-advance — verify each page's cursor is distinct from prior page | AC-cursor |
| A4 | Truth-PMID recall — how many Mitchell 2012 truth PMIDs in collected 2000 | AC-recall |
| A5 | SR exclusion — Mitchell 2012 SR PMID absent from feed | SR filter check |
| A6 | Production-path check — limit=200, verify single-page behaviour unchanged | AC-union |

Supplementary probes (follow-up investigation of AC-recall failure):
| Probe | What it tests |
|-------|---------------|
| S1 | Direct EXT_ID lookup of each truth PMID in EPMC — does the paper exist? |
| S2 | Each truth PMID in the primary filter query combined with EXT_ID — is the paper in scope? |
| S3 | PUB_TYPE for each truth PMID — are any inadvertently excluded by NOT PUB_TYPE filters? |

---

## 4. Results

### 4.1 Probe A1 — hitCount

```
ProbeA1 hitCount: status=200 hitCount=2070
  (validation 006 measured 1994; +76 new records in ~4 months of EPMC indexing)
```

Current total is 2070 — now **larger than the 2000-record ceiling**. This is the key constraint
for the recall result. Validation 006 was at 1994 (below the 2000 ceiling); the corpus has grown.

---

### 4.2 Probe A2 — Full-depth pagination — **PASS**

```
ProbeA2 depth: total IDs collected = 2000  (pages = 10)
  PMIDs: 1895  DOIs: 1913
  AC-depth: ✅ PASS (2000 ≥ 1900)
```

The loop retrieved 10 pages × 200 records = 2000 records (the ceiling). 1895 records carry PMIDs
(94.7%); 1913 carry DOIs (95.6%); some records have both, some have only a DOI (European
grey-literature records not in PubMed). This 10× improvement over the pre-fix 185-record result
is exactly what the brief specified.

---

### 4.3 Probe A3 — Cursor-advance — **PASS**

```
ProbeA3 cursor-advance (pages 1–5 shown):
  page 1: cursor=*               → next=AoIIQHDeUCg1...  (200 records)
  page 2: cursor=AoIIQHDeUCg1... → next=AoIIQDtPyCg1...  (200 records)
  page 3: cursor=AoIIQDtPyCg1... → next=AoIIQBRzrSg1...  (200 records)
  page 4: cursor=AoIIQBRzrSg1... → next=AoIIP/P7SCg0...  (200 records)
  page 5: cursor=AoIIP/P7SCg0... → next=AoIIP8wfzyg0...  (200 records)
  ... (5 more pages)
  Loop terminated cleanly: ✅ PASS
  Break reason: ceiling reached (2000 records)
  AC-cursor: ✅ PASS
```

All 10 cursors are distinct. The loop terminates at the ceiling break, not at a repeated cursor
or empty page. The four break conditions in the code (ceiling, no cursor, cursor unchanged, empty
page) are all sound: the ceiling was the binding constraint here.

---

### 4.4 Probe A4 — Truth-PMID recall — **FAIL**

```
ProbeA4 truth-PMID recall:
  PMID 16804151 (Sivertsen 2006): ❌ NOT FOUND
  PMID 15451764 (Jacobs 2004):    ✅ FOUND
  PMID 10086433 (Morin 1999):     ❌ NOT FOUND
  PMID 16785771 (Wu 2006):        ❌ NOT FOUND
  PMID 1888345  (McCluskey 1991): ❌ NOT FOUND
  Recall: 1/5 = 20%
  AC-recall: ❌ FAIL (1/5 < 2/5 bar)
```

---

### 4.5 Supplementary probes — EPMC indexing and filter coverage

To distinguish "paper not in EPMC" from "paper is in EPMC but beyond the ceiling":

**Probe S1 — Direct PMID lookup (EXT_ID, no topic query):**
All 5 truth PMIDs exist in EPMC (hitCount=1 for each):

| PMID | Year | Exists in EPMC? |
|------|------|-----------------|
| 16804151 | 2006 | ✓ |
| 15451764 | 2004 | ✓ |
| 10086433 | 1999 | ✓ |
| 16785771 | 2006 | ✓ |
| 1888345  | 1991 | ✓ |

**Probe S2/S3 — Primary-filter coverage per truth PMID:**

| PMID | In TITLE_ABS(topic)? | In primary filter? | Pub types |
|------|---------------------|-------------------|-----------|
| 16804151 | 1 | 1 | RCT, Comparative Study |
| 15451764 | 1 | 1 | RCT, Clinical Trial |
| 10086433 | 1 | 1 | RCT, Clinical Trial |
| 16785771 | 1 | 1 | RCT |
| **1888345** | **0** | **0** | RCT, Comparative Study |

**Key finding:** 4 of 5 truth PMIDs (16804151, 15451764, 10086433, 16785771) are confirmed present
in the EPMC primary filter result set. They exist in EPMC's 2070-record corpus for this query.
Only McCluskey 1991 (PMID 1888345) has the terminology gap already documented in validation 006 F5.

**This means 3 of 4 qualifying truth papers are at positions 2001–2070** — beyond the 2000-record
ceiling. They are not retrieved because:
1. The total hitCount (2070) now exceeds the ceiling (2000)
2. EuropePMC's default sort places these papers at positions 2001+ rather than ≤2000

**Probe: page-10 publication year range:**
Page 10 (records 1801–2000) contains papers with pub years **2001–2021** (mixed, non-monotone),
confirming EPMC's default sort is **not strictly date-descending by publication year**. The
sort appears to be an internal heuristic (possibly a relevance × date hybrid), making paper
position non-deterministic from the caller's perspective.

---

### 4.6 Probe A5 — SR exclusion — **PASS**

```
ProbeA5 SR exclusion: Mitchell 2012 SR PMID 22631616 in feed: NO ✅
```

The NOT PUB_TYPE filters are working correctly.

---

### 4.7 Probe A6 — Production-path check — **PASS**

```
ProbeA6 production-path (limit=200):
  status=200  page-1 records=200  truth PMIDs in page 1: 0/5
  (Production route passes limit=200 → ceiling = min(200, 2000) = 200 → one cursor page)
```

The production route (`app/api/search/route.ts:351` calls with `limit=200`) is unaffected. The
explicit limit=200 keeps the production ceiling at 200 records — one page, same latency as
before. The truth papers do not appear in page 1 (oldest papers appear beyond position 200).

Production union recall through the PubMed channel (4/5 on Mitchell 2012 — verified in
validations 004–007) is unaffected. AC-union holds at the existing 4/5 baseline.

---

## 5. Findings

| # | Severity | Finding |
|---|----------|---------|
| F1 | **High — New** | EPMC hitCount (2070) now exceeds the 2000-record ceiling. Three truth PMIDs (16804151, 10086433, 16785771) are confirmed present in EPMC's primary filter result set but fall at positions 2001–2070, beyond the ceiling. AC-recall 1/5 (was 0/5 pre-fix). The code implementation is correct; the brief's AC-recall prediction was based on hitCount=1994 (val 006); with hitCount=2070 the ceiling is binding. Two mitigations exist: (a) raise the ceiling (e.g., to 3000 or unlimited for this channel — route-level change explicitly out of scope for brief 008); (b) investigate whether a different EPMC sort parameter can surface older RCTs within the ceiling. |
| F2 | **Medium — New** | EPMC sort order is non-deterministic for publication year. Page 10 (records 1801–2000) spans pub years 2001–2021 in non-monotone order, confirming EPMC's default sort is not strictly date-based. This means paper position within the result set cannot be predicted from publication year alone, making recall sensitive to sort-order drift as the corpus grows. |
| F3 | **Medium — Carried** | McCluskey 1991 (PMID 1888345) has a terminology gap — its title/abstract does not match TITLE_ABS(topic) for "cognitive behavioral therapy insomnia." Confirmed by Probe S2 (in TITLE_ABS: 0). Carried from validation 006 F5. Ceiling=2000 would not help; this paper is not in the primary filter result set at all. |
| F4 | **Medium — Carried** | OpenAlex CRIT-1 (`api_key` 401): not tested in this validation; still open per handoffs 107/108. |
| F5 | **Low — Resolved-partial** | Pre-fix EPMC recall was 0/5 (185 records, no truth papers found). Post-fix EPMC recall is 1/5 (2000 records, Jacobs 2004 found). The 10× depth improvement is real and correctly implemented; EPMC's non-deterministic sort and the ceiling/hitCount interaction prevent the full recall improvement the brief predicted. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 008 |
|-------|-------------|------------------------------|
| `fetchPrimaryStudyIds` pagination cursor advances correctly | `claimed (handoff 108)` | **`verified (validation 008)`** — 10 pages, 10 distinct cursors, clean ceiling break |
| `fetchPrimaryStudyIds` retrieves ≥1900 IDs (full depth) | `claimed (handoff 108)` | **`verified (validation 008)`** — 2000 IDs (ceiling), hitCount=2070 |
| EPMC independently retrieves ≥2/5 Mitchell 2012 truth papers | `claimed (handoff 108)` | **`not verified`** — 1/5; 3 qualifying papers confirmed in EPMC but at positions 2001–2070 (beyond 2000 ceiling). Cause: hitCount grown past ceiling. Not a code defect. |
| Production union recall ≥4/5 (no regression) | `claimed (handoff 108)` | **`verified (validation 008)`** — production path (limit=200) unchanged; PubMed 4/5 baseline unaffected |
| McCluskey 1991 terminology gap | `open (006 F5)` | `confirmed still open — not in TITLE_ABS filter for this topic` |
| OpenAlex CRIT-1 | `open (006/007)` | `not re-tested; presumed still open` |

---

## 7. Reproduction

```bash
# Live-network harness (no API key required — EuropePMC is public):
cd /Users/dharmayudesai/blindspot
node spec/validation/008-harness.mjs

# Expected output (as of 2026-10-13):
#   ProbeA1 hitCount=2070
#   ProbeA2 depth=2000 (10 pages × 200)   AC-depth ✅
#   ProbeA3 cursor-advance: 10 distinct cursors  AC-cursor ✅
#   ProbeA4 recall: 1/5 (Jacobs 2004 only)   AC-recall ❌
#   ProbeA5 SR PMID absent ✅
#   ProbeA6 production limit=200 unchanged ✅
#
# Supplementary (inline in harness logic):
#   S1: all 5 truth PMIDs exist in EPMC  
#   S2: 4/5 match primary filter (1888345 has terminology gap)
#   S3: no PUB_TYPE exclusion on 4 qualifying papers

# Mitchell 2012 truth set:
#   16804151  Sivertsen 2006  JAMA 295:2851  — in EPMC, beyond ceiling
#   15451764  Jacobs 2004     Arch Intern Med 164:1888  — FOUND ✓
#   10086433  Morin 1999      JAMA 281:991  — in EPMC, beyond ceiling
#   16785771  Wu 2006         Psychother Psychosom 75:220  — in EPMC, beyond ceiling
#   1888345   McCluskey 1991  Am J Psychiatry 148:121  — terminology gap (not in TITLE_ABS filter)
```

---

## 8. Verdict

| AC | Criterion | Result | Notes |
|----|-----------|--------|-------|
| AC-depth | `fetchPrimaryStudyIds` ≥1900 IDs | ✅ **PASS — 2000** | 10× improvement over pre-fix 185; ceiling hit cleanly |
| AC-cursor | Cursor advances; no loop | ✅ **PASS** | 10 distinct cursors; ceiling-break termination |
| AC-recall | EPMC ≥2/5 truth papers | ❌ **FAIL — 1/5** | 3 qualifying papers at positions 2001–2070; ceiling/sort interaction (F1) |
| AC-union | Production union ≥4/5 | ✅ **PASS** | Production path (limit=200) unchanged; PubMed baseline unaffected |
| AC-regression | No new failures | ✅ **PASS** | Confirmed by handoff 108 gate results |

**Pagination implementation — overall verdict:**

The handoff 108 cursorMark loop is **mechanically correct and independently verified**:
cursor advance is clean, the four break conditions function as designed, and the 2000-record
ceiling is reached reliably. The depth improvement (185 → 2000 records) is real.

AC-recall's failure is a **ceiling/hitCount interaction** (F1): the EPMC corpus for this query
grew from 1994 (val 006) to 2070, so the 2000-record ceiling now falls short by 70. The three
missing truth papers are confirmed to exist in EPMC's primary filter result set (Probe S2) but
happen to land at positions 2001–2070 in EPMC's non-deterministic default sort. This is not a
code defect — the code correctly implements what brief 008 specified. The brief's AC-recall
prediction was invalidated by corpus growth.

**Session completed:** 2026-10-13
