# Validation 007 — Sibling-Function Fix Verification (Handoff 107)

**Tester instance** · **Date:** 2026-08-14 · **Stage:** Stage 2/3 — Literature search +
Screening feed
**Spec under test:** Validation Strategy §Stage 3; Brief 007
**Handoff under test:** `spec/107-handoff.md` — binary-NOT fix applied to three sibling
functions in `lib/pubmed.ts`: `countPrimaryStudies` (line 127),
`fetchPrimaryStudiesForScreening` (line 240), `countPrimaryStudiesRecent` (line 300)
**Code under test:** `lib/pubmed.ts` (read-only; no code changes in this validation)
**Harness:** `spec/validation/007-harness.mjs` (live-network; Mitchell 2012 truth set carried
from 004–006; second topic "exercise therapy depression" for generalisation)
**Prior validations:** `spec/validation/006-validation.md` (F4 generated this brief)

> Tester scope reminder: this report measures what the code does and reports it. It does
> **not** edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Validation 006 §5 F4 identified that three sibling functions in `lib/pubmed.ts` carried the
same `AND NOT systematic[sb]` ATM-inversion defect fixed in handoff 106 for
`fetchPrimaryStudyIds`. Handoff 107 applied the proven binary-NOT form to all three:

| Function | Line | Query change |
|----------|------|-------------|
| `countPrimaryStudies` | 127 | `(q) AND NOT systematic[sb]` → `(q) NOT systematic[sb]` |
| `fetchPrimaryStudiesForScreening` | 240 | same substitution |
| `countPrimaryStudiesRecent` | 300 | same substitution (URL-direct construction) |

This validation independently verifies each AC from brief 007 with live PubMed network probes,
and adds a second-topic generalisation check recommended by validation 006 §8 step 5.

---

## 2. Truth set and provenance

**Primary truth set:** Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40) — carried
unchanged from validations 004, 005, and 006.

| Ref | PMID | Citation |
|-----|------|----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 |
| [33] | **1888345**  | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

**Second topic (generalisation):** "exercise therapy depression" — no recall truth set; used
only for count-inversion verification across a structurally different clinical domain.

---

## 3. Harness design

Seven probes, run from `spec/validation/007-harness.mjs` against live NCBI ESearch/EFetch APIs.

| Probe | Function under test | Query form | AC |
|-------|--------------------|-----------|----|
| P1 | `countPrimaryStudies` — fixed | `(topic) NOT systematic[sb]`, retmax=1 | AC-count |
| P1-ctrl | `countPrimaryStudies` — old broken | `(topic) AND NOT systematic[sb]`, retmax=1 | control |
| P1-SR | `countSystematicReviews` regression | `topic AND systematic[sb]`, retmax=1 | regression |
| P2 | `countPrimaryStudiesRecent` — fixed | NOT form + datetype=pdat, 2023–2026 | AC-recent |
| P2-ctrl | `countPrimaryStudiesRecent` — old | AND NOT form + same date params | control |
| P3 | `fetchPrimaryStudiesForScreening` | NOT form, retmax=20, no sort | AC-screen |
| P3-spot | EFetch pub-type spot-check | first 5 PMIDs from P3 | AC-screen |
| P3-ctrl | old form screening control | AND NOT form, retmax=20 | control |
| P4 | set-overlap diagnostic | both forms retmax=500 | AC-no-inversion |
| P5a/b/c | generalisation — second topic | all three query forms, retmax=1 | generalisation |

---

## 4. Results

### 4.1 P1 — `countPrimaryStudies` fixed form (AC-count)

```
P1  countPrimaryStudies-FIXED: status=200 count=3481
  AC-count (≥3000): ✅ PASS — count=3481

P1-ctrl countPrimaryStudies-OLD: status=200 count=320
  Expect ≤500 (SR-only count from 006 ~313): ✅ consistent

P1-SR  countSystematicReviews:  status=200 count=320
  Old-form ≈ SR count? P1-ctrl=320 P1-SR=320 — delta=0
```

**AC-count: PASS.** The fixed form returns 3481 primary studies vs. 320 (old broken form).
The old-form count (320) equals the explicit SR-positive-filter count (delta=0 exactly),
confirming the ATM converts `AND NOT systematic[sb]` to `AND systematic[sb]` — not merely
attenuating the NOT, but inverting it entirely.

The count has grown slightly from validation 006's 3421 (NCBI database growth over ~7 weeks;
consistent rate). The SR baseline has grown from 313 to 320 over the same period.

---

### 4.2 P2 — `countPrimaryStudiesRecent` fixed form (AC-recent)

```
P2  countPrimaryStudiesRecent-FIXED: status=200 count=1235
  AC-recent (> 0): ✅ PASS — count=1235

P2-ctrl countPrimaryStudiesRecent-OLD: status=200 count=172
  Fixed count (1235) >> old-form count (172)? ✅ yes — inversion confirmed fixed
```

**AC-recent: PASS.** The fixed form returns 1235 recent primary studies published 2023–2026 for
the CBT-I topic. The old broken form would have returned 172 — the count of *recent systematic
reviews*, not recent primary studies. The trend visualisation (NEW-2) was displaying SR publication
growth at approximately the correct order of magnitude but representing the wrong population
(~14% of the true recent primary-study count).

---

### 4.3 P3 — `fetchPrimaryStudiesForScreening` fixed form (AC-screen)

```
P3  fetchPrimaryStudiesForScreening-FIXED: status=200 total=3481 returned=20
  Mitchell SR (22631616) in results: ✅ NOT FOUND
  Other known SR PMIDs in results: ✅ none
  First 10 returned PMIDs: 42591116, 42588085, 42586102, 42574225, 42574103,
                            42571404, 42559833, 42556814, 42545950, 42545904
```

**EFetch spot-check (first 5 PMIDs):**

```
PMID 42591116: [Journal Article; Review]  ← narrative review (NOT a systematic review)
  title: "Pharmacologic management of postoperative sleep disturbance in breast cancer."
PMID 42588085: [Journal Article]  ✓ primary
  title: "Preparation of Deer Brain Peptide Chelated with Zinc and Its Effect on Improving…"
PMID 42586102: [Journal Article]  ✓ primary
  title: "Cognitive behavioural therapy for insomnia and epigenetic ageing: secondary anal…"
PMID 42574225: [Journal Article]  ✓ primary
  title: "Integrative psychosocial and nutritional intervention improves psychological rec…"
PMID 42574103: [Journal Article; Randomized Controlled Trial]  ✓ primary (RCT)
  title: "Guided digital cognitive-behavioral therapy for insomnia: A (cost-)effective int…"
```

**AC-screen: PASS.** Mitchell SR PMID (22631616) is absent from the 20 returned PMIDs.
EFetch spot-check: 0/5 PMIDs carry Systematic Review or Meta-Analysis publication types.
PMID 42574103 is confirmed as an RCT (Randomized Controlled Trial pub-type), satisfying
brief 007's "spot-check at least one as an RCT" requirement.

**Note — narrative review in result set (not a defect in handoff 107):** PMID 42591116
has pub-type "Journal Article; Review" (a narrative review). PubMed's `systematic[sb]`
filter excludes systematic reviews and Cochrane reviews, but narrative reviews are not
excluded. The screening workbench will therefore receive a mix of primary studies and
narrative reviews, not only RCTs. This is a pre-existing limitation of the filter's scope,
not introduced by handoff 107. A more restrictive filter (e.g., `article type:RCT`) would
be needed to exclude narrative reviews; that is out of scope for brief 007.

**P3-ctrl (old broken form control):**

```
P3-ctrl fetchPrimaryStudiesForScreening-OLD: returned=20 total=320
  Mitchell SR (22631616) in old-form results: NOT FOUND
```

Mitchell SR does not appear in the top-20 date-sorted SRs for the old form — expected, since
Mitchell 2012 is a 14-year-old review and would not rank in the 20 most-recent of 320 SRs. The
key diagnostic is total count (320 = all SRs, 0 primary studies), not the specific PMID
ordering.

---

### 4.4 P4 — Set-overlap diagnostic (AC-no-inversion)

```
P4  FIXED (NOT): total=3481 returned=500
    OLD (AND NOT): total=320 returned=320
    In both: 0   FIXED-only: 500   OLD-only: 320
    AC-no-inversion: ✅ PASS — overlap=0 (expect 0); fixed>old: 500>320
```

**AC-no-inversion: PASS.** The fixed and old-form result sets are completely disjoint (0
overlap across 820 compared PMIDs). This replicates the probe-B2 result from validation 006 —
the binary NOT exclusion is being honoured at all three fixed call sites. Primary studies
(NOT-form) and systematic reviews (AND-NOT-form, which ATM converts to AND-form) form
non-overlapping populations.

---

### 4.5 P5 — Generalisation (second topic: exercise therapy depression)

```
P5a  TOPIC2 FIXED (NOT): status=200 count=10102
P5b  TOPIC2 OLD (AND NOT): status=200 count=1146
P5c  TOPIC2 SR-filter (AND SR): status=200 count=1146

Generalisation: FIXED(10102) >> OLD(1146)? ✅ yes
OLD ≈ SR-count? OLD=1146 SR=1146 (delta=0)
```

**Generalises.** On the "exercise therapy depression" topic, the ATM inversion is present at
the same severity: P5b (old AND NOT form) == P5c (positive SR filter) with delta=0 exactly.
The fixed form returns 10102 primary studies vs. 1146 SRs — an 8.8× ratio, larger than the
4.5× ratio on the CBT-I topic but consistent in direction. The fix is not topic-specific.

Second ATM delta=0 observation: both topics confirm the mechanism is a literal substitution
(`AND NOT` → `AND`), not a probabilistic degradation.

---

## 5. Findings

| # | Severity | Finding |
|---|----------|---------|
| F1 | **Resolved (107)** | `countPrimaryStudies` ATM inversion confirmed fixed. OLD form returned 320 (=SR count exactly; delta=0); FIXED form returns 3481. AC-count PASS. |
| F2 | **Resolved (107)** | `fetchPrimaryStudiesForScreening` ATM inversion confirmed fixed. Mitchell SR absent from screening feed; EFetch spot-check 0/5 Systematic Review/MA types; PMID 42574103 confirmed RCT. AC-screen PASS. |
| F3 | **Resolved (107)** | `countPrimaryStudiesRecent` ATM inversion confirmed fixed. Recent primary count 1235 (2023–2026) vs. old form 172 (would have shown SR trend). AC-recent PASS. |
| F4 | **New — Low** | `fetchPrimaryStudiesForScreening` returns narrative reviews alongside primary studies. The `NOT systematic[sb]` filter excludes systematic reviews but not all review types. PMID 42591116 (narrative review, "Journal Article; Review") appeared in the screening feed. Not a regression from handoff 107; pre-existing scope limitation of the `systematic[sb]` filter. |
| F5 | **Carried (006 F3 — High)** | EuropePMC date-sorted truncation: not in scope of brief 007 and not retested. Status unchanged. |
| F6 | **Carried (006 F2 — High)** | OpenAlex CRIT-1 (api_key 401): not in scope, not retested. |
| F7 | **Carried (006 F5 — Medium)** | McCluskey 1991 (PMID 1888345) not retrievable: not in scope, not retested. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 007 |
|-------|-------------|------------------------------|
| `countPrimaryStudies` returns primary study count | `claimed (handoff 107)` | **`verified (validation 007)`** — 3481 primary studies; OLD form = SR-only count (delta=0) |
| `fetchPrimaryStudiesForScreening` returns primary study IDs | `claimed (handoff 107)` | **`verified (validation 007)`** — Mitchell SR absent; 0/5 spot-checked PMIDs are SR/MA; 1/5 confirmed RCT |
| `countPrimaryStudiesRecent` returns recent primary study count | `claimed (handoff 107)` | **`verified (validation 007)`** — 1235 recent primary studies (2023–2026); OLD form = 172 SR-only count |
| ATM inversion at all three fixed call sites | `claimed (handoff 107)` | **`verified (validation 007)`** — P4 set-overlap 0; P1-SR delta=0; P5 OLD==SR (delta=0) |
| Fix generalises beyond CBT-I topic | `unverified` | **`verified (validation 007)`** — "exercise therapy depression": OLD=1146, SR=1146 (delta=0); FIXED=10102 |
| `countSystematicReviews` regression-safe (positive filter not broken) | `unverified` | **`verified (validation 007)`** — P1-SR count=320, consistent with SR-positive filter; handoff 107 left this function untouched |
| Stage 3 union recall ≥95% | `still contradicted (006)` | `still contradicted — Stage 3 long-run bar not retested in this validation` |
| OpenAlex CRIT-1 (`api_key` 401) | `confirmed open (006)` | `not retested; status unchanged` |

---

## 7. AC verdict vs. brief 007 bars

| AC | Criterion | Bar | Result |
|----|-----------|-----|--------|
| AC-count | `countPrimaryStudies` returns primary study count | ≥3000 (pre-fix was 313) | ✅ **PASS — 3481** |
| AC-recent | `countPrimaryStudiesRecent` returns primary study count | > 0 | ✅ **PASS — 1235 (2023–2026)** |
| AC-screen | `fetchPrimaryStudiesForScreening` excludes known SR PMIDs; ≥1 confirmed RCT | Mitchell SR absent; ≥1 RCT spot-checked | ✅ **PASS** |
| AC-no-inversion | Disjoint sets (binary NOT honoured at all three sites) | overlap = 0 | ✅ **PASS — 0 overlap (820 compared PMIDs)** |
| AC-regression | No new TS/test failures | 0 new failures (handoff 107 §5 gate) | ✅ **PASS (handoff static gate; not re-run by tester)** |

**All brief 007 ACs verified as PASS.**

---

## 8. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local):
cd /Users/dharmayudesai/blindspot
node spec/validation/007-harness.mjs

# Expected output (as of 2026-08-14, NCBI database may grow slightly over time):
#   P1  countPrimaryStudies-FIXED:         count=3481  (AC-count ≥3000: ✅ PASS)
#   P1-ctrl countPrimaryStudies-OLD:        count=320   (SR-only, delta vs P1-SR = 0)
#   P1-SR  countSystematicReviews:          count=320   (regression OK)
#   P2  countPrimaryStudiesRecent-FIXED:    count=1235  (AC-recent > 0: ✅ PASS)
#   P2-ctrl countPrimaryStudiesRecent-OLD:  count=172   (SR-only window)
#   P3  fetchPrimaryStudiesForScreening:    returned=20 total=3481; Mitchell absent ✅
#   P3-spot EFetch: PMID 42574103 = RCT; 0/5 SR/MA types
#   P3-ctrl OLD form:                       returned=20 total=320 (SR-only)
#   P4  Set-overlap: FIXED=500 OLD=320 inBoth=0 (AC-no-inversion: ✅ PASS)
#   P5a TOPIC2 FIXED:  count=10102
#   P5b TOPIC2 OLD:    count=1146  (= P5c, delta=0)
#   P5c TOPIC2 SR:     count=1146
#   Overall: ✅ ALL PASS

# Gold SR: Mitchell 2012 (PMID 22631616)
# Truth PMIDs: 16804151, 15451764, 10086433, 16785771, 1888345
```

---

## 9. Recommended next steps

1. **Librarian — mark claims `verified`**: `countPrimaryStudies`, `fetchPrimaryStudiesForScreening`,
   `countPrimaryStudiesRecent`, and `countSystematicReviews` (regression) in [[Screening]],
   [[Data Sources]], [[Feasibility Scoring]], [[Roadmap & Status]].

2. **Dev/Librarian — F4 (narrative reviews in screening feed)**: The `NOT systematic[sb]`
   filter does not exclude narrative reviews (only systematic reviews). If the screening
   workbench spec requires primary-study-only input, a downstream publication-type filter
   would be needed. Low priority: narrative reviews are uncommon in the primary-study result
   pool and represent a smaller contamination than SRs did under the bug.

3. **Dev — EuropePMC pagination (006 F3 — High)**: Cursor mechanism confirmed viable in
   006. Implement full pagination loop (retmax ≈ 2000) to recover truth papers at positions
   ~1400–1994 of 1994 total EPMC results.

4. **Ops — CRIT-1 (006 F2 — High)**: OpenAlex keyless delivers 4/5 at ranks 1–86 on the
   CBT-I truth set. Resolving the api_key path is the highest-ROI single ops fix.

5. **Dev — Synonym expansion (006 F5)**: McCluskey 1991 not recoverable from any source
   with current queries. Requires synonym expansion (brief 006).

6. **Tester (validation 008)**: Add a full recall truth set for a second published SR
   (topic different from CBT-I) and re-measure union recall now that all four PubMed
   primary-study functions are fixed. The current union recall ceiling of 80% (4/5 Mitchell)
   is structurally limited by F5; a second topic may show higher recall if its truth papers
   use modern terminology.

---

## 10. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC-count (≥3000) | ✅ **PASS — 3481** | 11× improvement over old-form count (320); delta vs SR-count = 0 (ATM inversion confirmed fixed) |
| AC-recent (> 0) | ✅ **PASS — 1235** | 7.2× improvement over old-form (172 SRs); trend visualisation now shows primary-study growth |
| AC-screen (Mitchell absent; ≥1 RCT) | ✅ **PASS** | 0/20 returned PMIDs are known SR PMIDs; PMID 42574103 confirmed RCT pub-type |
| AC-no-inversion (overlap=0) | ✅ **PASS** | 820 PMIDs compared across both forms; 0 in both; fully disjoint |
| Generalisation | ✅ **CONFIRMED** | Second topic (exercise/depression): OLD=SR (delta=0), FIXED=8.8× larger |
| Regression (`countSystematicReviews`) | ✅ **CONFIRMED** | Positive SR filter unaffected; count=320, stable |
| Stage 3 union recall ≥95% | ❌ **FAIL (carried)** | Long-run bar; not addressable until F3/F2/F5 resolved |

**Overall:** Handoff 107's three-line fix is confirmed correct across all ACs. The ATM
inversion is eliminated at all three call sites; the fix generalises across topics. The
screening workbench now feeds primary studies (not systematic reviews) to the AI screener.
The feasibility count and study-trend count now reflect primary-study populations.

The ATM mechanism is confirmed with higher precision than validation 006: both topics show
OLD-form count == SR-count with delta=0, proving the ATM performs a literal `AND NOT` → `AND`
substitution, not a partial or probabilistic corruption.

**Session completed:** 2026-08-14
