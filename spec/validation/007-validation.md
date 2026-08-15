# Validation 007 — Brief 007: Sibling-Function AND-NOT Fix (countPrimaryStudies, fetchPrimaryStudiesForScreening, countPrimaryStudiesRecent)

**Tester instance** · **Date:** 2026-08-15 · **Stage:** Stage 3 — Primary-literature capture + Stage 3 Screening feed
**Spec under test:** Validation Strategy §Stage 3; Brief 007
**Handoff under test:** `spec/107-handoff.md` — Three sibling-function binary-NOT fixes in `lib/pubmed.ts`:
  - `countPrimaryStudies` (line 127): `(${query}) AND NOT systematic[sb]` → `(${query}) NOT systematic[sb]`
  - `fetchPrimaryStudiesForScreening` (line 240): same substitution
  - `countPrimaryStudiesRecent` (line 300): same substitution
**Code under test:** `lib/pubmed.ts` lines 127, 240, 300
**Harness:** `spec/validation/007-harness.mjs` + corrected ad-hoc probe (see §3.5)
**Prior validation:** `spec/validation/006-validation.md`

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 106 fixed the binary-NOT defect in `fetchPrimaryStudyIds` only. Validation 006 §5 F4
confirmed three sibling functions still used `AND NOT systematic[sb]`, which PubMed's ATM rewrites
to `AND [systematic]` — counting and fetching systematic reviews instead of excluding them.

Handoff 107 applied the same proven fix to all three remaining call sites:

| Function | Line | Pre-fix behavior |
|----------|------|-----------------|
| `countPrimaryStudies` | 127 | Counted SRs (~320), not primary studies |
| `fetchPrimaryStudiesForScreening` | 240 | Fed SR records to the screening workbench |
| `countPrimaryStudiesRecent` | 300 | Counted recent SRs, not recent primary studies |

`fetchPrimaryStudyIds` (line 282) was already fixed in handoff 106 and is untouched.

**Static gate (not re-run in harness):** Handoff 107 §5 reports `npx tsc --noEmit --skipLibCheck`
exit 0, `npx vitest run` 857 passed / 15 pre-existing failures, 0 new — same baseline as
handoff 106. AC-regression: **assumed PASS** per dev report; not independently re-run.

---

## 2. Truth set and provenance

Unchanged from validations 004–006. Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40),
5 included RCTs confirmed in PubMed via `esummary` in validation 004.

| Ref | PMID | Citation |
|-----|------|----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 |
| [33] | **1888345**  | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

Control SR PMID for screening spot-check: **22631616** (Mitchell 2012 SR itself — must NOT
appear in `fetchPrimaryStudiesForScreening` results).

**Second truth set / generalization:** Full second-SR recall test deferred to validation 008
(per 006 §8 recommended step 5). Probe G provides a count-only generalization check using
"exercise depression" as an independent topic.

---

## 3. Harness design

Six probes from `spec/validation/007-harness.mjs` plus one corrected ad-hoc probe against
live NCBI APIs.

| Probe | Function mirrored | What it tests | Bar |
|-------|-------------------|---------------|-----|
| A | `countPrimaryStudies` OLD | Control: AND NOT form still returns ~313 SRs | Plausible 200–500 |
| B | `countPrimaryStudies` NEW | AC-count: NOT form returns ≥3000 primaries | ≥3000 |
| C | `countPrimaryStudiesRecent` NEW + OLD | AC-recent: non-zero recent primaries; NEW > OLD | Non-zero; NEW > OLD |
| D (corrected) | `fetchPrimaryStudiesForScreening` NEW | AC-screen: no SR PMIDs; ≥1 RCT in first 20 | SR absent; ≥1 RCT |
| E | Both count paths | AC-no-inversion: NOT-form ∩ AND-form = ∅ | 0 overlap |
| F | Screening form recall | Carry-over: 4/5 truth papers in retmax=2000 | ≥3/5 (brief 005 bar) |
| G | countPrimaryStudies (second topic) | Generalisation: "exercise depression" primary count ≥1000 | ≥1000 |

**Harness design note — Probe D sort correction:** The initial harness (007-harness.mjs)
ran Probe D with `sort='relevance'`. This was incorrect: `fetchPrimaryStudiesForScreening`
calls `esearch()` without a sort argument, which produces PubMed's default date-descending
(newest-first) order. An ad-hoc corrected re-probe was run without sort to match the
production code. Results differ significantly (see §4.4). Both sets are reported.

---

## 4. Results

### 4.1 Probe A — `countPrimaryStudies` OLD (control)

```
ProbeA countPrimaryStudies OLD (AND NOT systematic[sb], retmax=1):
  status=200  count=320  (expected ~313 SRs; slight growth from database updates)
  Control plausible (200–500 SR range): ✓ YES
```

The OLD form returns 320, confirming the `AND NOT systematic[sb]` defect still produces an SR
count. The small difference from the 006 baseline (313) is expected — PubMed continues to index
new systematic reviews. This validates the control baseline.

---

### 4.2 Probe B — `countPrimaryStudies` NEW — **PASS: 3481**

```
ProbeB countPrimaryStudies NEW (NOT systematic[sb], retmax=1):
  status=200  count=3481  (expected ≥3000)
  AC-count (≥3000): ✅ PASS
  Ratio NEW/OLD = 10.9x  (expected ~10x per 006 baseline)
```

The binary NOT form returns 3481 primary studies (vs 320 SRs with the OLD form). The 10.9x ratio
is consistent with the validation 006 benchmark (3421 vs 313 for `fetchPrimaryStudyIds`). The small
absolute difference (3481 vs 3421) reflects ongoing PubMed indexing in the ~2 months since
validation 006.

**AC-count: PASS** (3481 ≥ 3000).

---

### 4.3 Probe C — `countPrimaryStudiesRecent` NEW — **PASS: 1235**

```
ProbeC countPrimaryStudiesRecent NEW (NOT systematic[sb], 3-year window, datetype=pdat):
  status=200  count=1235  (expected non-zero)
  Control OLD (AND NOT systematic[sb], 3-year):  count=172
  AC-recent (non-zero): ✅ PASS
  NEW (1235) > OLD (172): ✓ YES  (7.2x ratio — consistent with field growth)
```

The fixed form returns 1235 recent primary studies (2023–2026) vs 172 recent SRs with the OLD
form. The ratio (7.2x) is consistent with PubMed's field distribution for this topic: far more
primary studies than systematic reviews published annually.

**AC-recent: PASS** (1235 > 0; NEW > OLD confirmed).

---

### 4.4 Probe D — `fetchPrimaryStudiesForScreening` NEW (AC-screen)

#### D-incorrect (relevance sort — harness design error)

```
Probe D [incorrect, relevance sort]: status=200 total=3481 returned=20
  PMIDs: 36115372, 36503403, 22265700, 32282177, 35506356, 35460140, 38692776,
         36333079, 35659076, 33821446, 27136449, 38404423, 41957444, 32880197,
         39504928, 36764792, 26065131, 26378738, 31029185, 36150799
  SR PMID 22631616 in results: ✓ NO
  Spot-check (all 20 PMIDs via ESummary):
    14 × Review (narrative), 1 × Practice Guideline, 1 × Editorial,
    1 × Network Meta-Analysis [SR-type], 0 × RCT found
```

With relevance sort, the top 20 results are all secondary literature — review articles dominate
"best match" scoring for this well-studied topic. No RCTs appear in the first 20. This is a
property of PubMed's relevance ranker, not of the binary NOT fix itself, and does not reflect
production behavior. One result (PMID 39504928, Network Meta-Analysis) appears to have evaded
the `systematic[sb]` filter — see F2 below.

#### D-corrected (no sort — production match)

```
Probe D [corrected, no sort = date-descending, newest-first]:
  PMIDs: 42591116, 42588085, 42586102, 42574225, 42574103, 42571404,
         42559833, 42556814, 42545950, 42545904, 42544969, 42539544,
         42534165, 42531372, 42529673, 42527422, 42525367, 42523963,
         42518639, 42517266
  SR PMID 22631616 in results: ✓ NO  (2012 paper; far below newest-first window)
  Pub-type breakdown (ESummary):
    3 × Randomized Controlled Trial:  42574103, 42556814, 42527422
    7 × plain Journal Article (no secondary type)
    7 × Review (narrative)
    1 × Review | Video-Audio Media
    1 × Review | Case Reports
    0 × Systematic Review or Meta-Analysis
```

With the correct no-sort (date-descending) order — matching `fetchPrimaryStudiesForScreening`'s
actual `esearch()` call without a sort argument:

- SR PMID (22631616) is absent ✓
- 3/20 results are RCTs ✓
- No results tagged as Systematic Review or Meta-Analysis ✓
- 7/20 are narrative reviews (not SRs under `systematic[sb]`) — see F2

**AC-screen: PASS** (SR absent; 3 RCTs found; no formal SRs in spot-check).

---

### 4.5 Probe E — Disjoint set check — **PASS**

```
ProbeE Disjoint (retmax=1000 per form):
  NOT-form: total=3481 returned=1000
  AND-form: total=320  returned=320
  In both: 0   NOT-only: 1000   AND-only: 320
  AC-no-inversion (0 overlap): ✅ PASS
```

Identical disjoint-set result to validation 006 probe B2. The 0-overlap pattern confirms binary
NOT is honoured by PubMed for all three fixed functions (which all produce this query form) and
has not regressed since handoff 106.

---

### 4.6 Probe F — Recall, screening form retmax=2000

```
ProbeF Recall (screening form, retmax=2000, relevance):
  total=3481  returned=2000  hits=4/5  recall=80%
  missed: 1888345 (McCluskey 1991 — RC2 synonym gap, carried)
    PMID 16785771 (Wu 2006):        rank  851/2000
    PMID 10086433 (Morin 1999):     rank 1191/2000
    PMID 15451764 (Jacobs 2004):    rank 1600/2000
    PMID 16804151 (Sivertsen 2006): rank 1631/2000
    PMID 1888345  (McCluskey 1991): NOT FOUND
```

Unchanged from validation 006 probe B (80%, rank positions ±10 from API non-determinism).
The screening form (no-sort in production) with retmax=2000 is used here with relevance sort
because the production limit (default 500, max 10000) would retrieve the truth papers anyway
via sequential date ordering. The 80% recall ceiling is unchanged — blocked by McCluskey 1991
RC2 (validation 006 F5, carried).

Note: production `fetchPrimaryStudiesForScreening` uses no-sort + limit≤10000. At limit=10000
all 3481 results are returned, so all 4 retrievable truth papers would appear. This probe confirms
the function is correctly scoped.

---

### 4.7 Probe G — Generalisation ("exercise depression")

```
ProbeG countPrimaryStudies ("exercise depression"):
  OLD (AND NOT systematic[sb]): count=1921
  NEW (NOT systematic[sb]):     count=30711
  Ratio NEW/OLD = 16.0x
  NEW ≥ 1000 (primary study range): ✓ YES
```

A completely different clinical topic shows the same fix behaviour: the NEW form returns 16x
more results than the OLD SR-only count. The 30711 primary-study count is consistent with
exercise and depression being one of the most-studied behavioural medicine intersections.

---

## 5. Findings

| # | Severity | Finding |
|---|----------|---------|
| F1 | **Harness note** | Probe D used relevance sort; corrected to no-sort to match `fetchPrimaryStudiesForScreening`'s production `esearch()` call. Future harness runs should mirror the sort argument (or its absence) from the production function signature. |
| F2 | **Medium — New** | Narrative reviews pass through `NOT systematic[sb]`. In the corrected (date-sorted) Probe D, 7/20 results are narrative review articles. `systematic[sb]` specifically targets systematic reviews and meta-analyses; it does not exclude narrative reviews, practice guidelines, or editorials. In the relevance-sorted set, PMID 39504928 (a Network Meta-Analysis) also passed through, suggesting some NMAs may not be indexed under `systematic[sb]`. The screening workbench delivers a mixed primary/review feed. Recommend: add `NOT review[pt]` as a secondary filter, or display article types to users in the screening UI so reviewers can rapidly identify non-primary records. |
| F3 | **High — Carried (006 F2)** | OpenAlex CRIT-1 (`api_key` 401) — unchanged, not in scope for this brief. |
| F4 | **High — Carried (006 F3)** | EuropePMC date-sorted truncation — unchanged. |
| F5 | **Medium — Carried (006 F5)** | McCluskey 1991 (PMID 1888345) not retrievable from any source; RC2 synonym gap. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 007 |
|-------|-------------|------------------------------|
| `countPrimaryStudies` returns primary study count | `claimed (handoff 107)` | **`verified (validation 007)`** — 3481 primary studies vs 320 SRs (OLD form); 10.9x ratio consistent with 006 baseline |
| `countPrimaryStudiesRecent` returns primary study count | `claimed (handoff 107)` | **`verified (validation 007)`** — 1235 recent primaries vs 172 recent SRs (OLD form) |
| `fetchPrimaryStudiesForScreening` returns primary studies (not SRs) | `claimed (handoff 107)` | **`verified (validation 007)`** — SR PMID absent; 3 RCTs in first 20 (date sort); 0 formal SRs in spot-check |
| AC-count (≥3000) | `claimed (handoff 107)` | **`verified (validation 007)`** — 3481 ✅ |
| AC-recent (non-zero) | `claimed (handoff 107)` | **`verified (validation 007)`** — 1235 ✅ |
| AC-screen (SR absent + ≥1 RCT) | `claimed (handoff 107)` | **`verified (validation 007)`** — SR absent ✓; 3 RCTs in first 20 ✓ |
| AC-no-inversion (0 overlap) | `claimed (handoff 107)` | **`verified (validation 007)`** — 0 overlap confirmed |
| All four `AND NOT systematic[sb]` sites fixed | `claimed (handoff 107)` | **`verified (validation 007)`** — disjoint sets confirmed for all three new sites; fetchPrimaryStudyIds (006) unchanged |
| Screening feed is "primary studies only" | `not claimed` | **`contradicted (validation 007 F2)`** — 7/20 date-sorted results are narrative reviews; `NOT systematic[sb]` does not exclude non-SR review articles |
| OpenAlex CRIT-1 resolved | `open (006)` | `still open` |
| EuropePMC pagination (006 F3) | `open` | `still open` |
| McCluskey 1991 retrievability | `unverified (006 F5)` | `still unverified` |

---

## 7. Reproduction

```bash
# Full harness (live-network; requires NCBI_API_KEY in .env.local):
cd /Users/dharmayudesai/blindspot
node spec/validation/007-harness.mjs

# Corrected Probe D (no-sort, production-matching):
node -e "
const ncbiKey = require('fs').readFileSync('.env.local','utf8')
  .split('\n').reduce((a,l)=>{const m=l.match(/^([A-Z_0-9]+)=(.+)$/);
  if(m)a[m[1]]=m[2].trim();return a},{}).NCBI_API_KEY||'';
async function run(){
  const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  url.searchParams.set('db','pubmed');
  url.searchParams.set('term','(cognitive behavioral therapy insomnia) NOT systematic[sb]');
  url.searchParams.set('retmax','20'); url.searchParams.set('retmode','json');
  if(ncbiKey) url.searchParams.set('api_key',ncbiKey);
  const j = await (await fetch(url.toString())).json();
  console.log(j.esearchresult.idlist.join(','));
} run();
"

# Expected output (as of 2026-08-15):
#   ProbeA (OLD AND NOT, count): 320          [SR range; control]
#   ProbeB (NEW NOT,    count): 3481          [primary range; AC-count PASS ≥3000]
#   ProbeC (recent count NEW): 1235  OLD: 172 [AC-recent PASS; NEW > OLD]
#   ProbeD corrected (no sort, top 20): 3 RCTs [AC-screen PASS]
#   ProbeE disjoint: 0 overlap (NOT=1000, AND=320) [AC-no-inversion PASS]
#   ProbeF recall (screening form, 2000): 4/5 80%
#   ProbeG generalisation (exercise depression): OLD=1921, NEW=30711

# Gold SR:  Mitchell 2012 (PMID 22631616)
# Truth set: 16804151, 15451764, 10086433, 16785771, 1888345
```

---

## 8. Recommended next steps

1. **Dev — Filter coverage (F2):** `NOT systematic[sb]` passes through narrative reviews, editorials,
   and some NMAs. `fetchPrimaryStudiesForScreening` returns a mixed feed (3 RCTs + 7 narrative reviews
   in first 20). Recommend adding `NOT review[pt]` as a secondary filter or surfacing article type
   in the screening UI so reviewers can rapidly skip non-primary records.

2. **Dev — Probe D sort audit:** Confirm that `fetchPrimaryStudiesForScreening` intentionally uses
   default (date) sort. If large-limit calls (e.g. limit=10000) are expected to return the full result
   set, sort does not matter — but if a 500-record default is used with a screening UI, the date sort
   means the newest records appear first, which may or may not be the desired screening order. Consider
   documenting the intended sort behaviour in a code comment.

3. **Tester (validation 008):** Add second SR truth set (recent, 2020–2023) as recommended in 006 §8.
   The corrected Probe D provides the template for a screening-form recall check against a second SR.

4. **Dev/Ops — Carried:** CRIT-1 (OpenAlex key), EPMC cursor pagination (F3), synonym expansion (F5).

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC-count (≥3000) | ✅ **PASS — 3481** | countPrimaryStudies verified; 10.9x improvement over OLD form |
| AC-recent (non-zero) | ✅ **PASS — 1235** | countPrimaryStudiesRecent verified; 7.2x improvement over OLD form |
| AC-screen | ✅ **PASS** | SR PMID absent; 3 RCTs in first 20 (production sort); no formal SRs |
| AC-no-inversion | ✅ **PASS — 0 overlap** | Disjoint sets confirmed; binary NOT honoured for all three sites |
| All four sites fixed | ✅ **CONFIRMED** | Three new sites + fetchPrimaryStudyIds (006) = all four call sites fixed |
| Stage 3 production union recall ≥95% | ❌ **FAIL — 80%** | Ceiling unchanged; blocked by EPMC (F4), McCluskey RC2 (F5), CRIT-1 (F3) |

**New finding requiring attention:** F2 — `NOT systematic[sb]` does not exclude narrative reviews.
7/20 date-sorted screening results are review articles (not systematic reviews). This is a filter
coverage gap independent of the binary NOT fix.

**Harness design error (self-reported):** The initial Probe D used relevance sort; corrected to
no-sort to match production. The error inflated the apparent proportion of review articles in top
results. The corrected probe shows the production behaviour is better but still includes reviews.

**Overall:** All four brief 007 ACs pass. Handoff 107's three-site binary-NOT fix is independently
verified: correct counts (~10x improvement), correct recent counts (~7x improvement), and correct
screening feed (SR-excluded; RCTs present in the top results). All four `AND NOT systematic[sb]`
correctness defects reported in validation 006 F4 are now resolved at the code level.

**Session completed:** 2026-08-15
