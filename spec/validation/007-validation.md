# Validation 007 — Stage 2/3: countPrimaryStudies, fetchPrimaryStudiesForScreening, countPrimaryStudiesRecent (Handoff 107 Fix)

**Tester instance** · **Date:** 2026-07-10 · **Stage:** Stage 2 — Literature search (count/feasibility) + Stage 3 — Screening feed
**Spec under test:** Validation Strategy §Stage 3; Brief 007
**Handoff under test:** `spec/107-handoff.md` — binary-NOT fix in three sibling functions:
- `countPrimaryStudies` (line 124): `(${query}) AND NOT systematic[sb]` → `(${query}) NOT systematic[sb]`
- `fetchPrimaryStudiesForScreening` (line 234): same substitution
- `countPrimaryStudiesRecent` (line 293): same substitution
**Code under test:** `lib/pubmed.ts`
**Harness:** `spec/validation/007-harness.mjs` (live-network, Mitchell 2012 truth set + topic-2 count probe)
**Prior validation:** `spec/validation/006-validation.md`

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 106 fixed `fetchPrimaryStudyIds` only (validation 006 PASS). Validation 006 §5 F4 confirmed
three sibling functions still carried the same ATM-inversion defect. Handoff 107 applied the identical
binary-NOT substitution to the remaining three sites:

| Function | Line | Defect → Fix |
|----------|------|--------------|
| `countPrimaryStudies` | 124 | `AND NOT systematic[sb]` → `NOT systematic[sb]` |
| `fetchPrimaryStudiesForScreening` | 234 | same |
| `countPrimaryStudiesRecent` | 293 | same |

`fetchPrimaryStudyIds` (line 282, fixed in 106) was left untouched.
`searchExistingReviews`, `countSystematicReviews`, `countLivingReviews` use intentional positive
`systematic[sb]` filters and were correctly left untouched.

This validation independently measures all four ACs from brief 007 and adds a topic-2
count-level generalisation probe (per validation 006 §8 step 5, partial).

---

## 2. Truth set and provenance

**Primary (Mitchell 2012):** Unchanged from validations 004–006.  
Mitchell et al. 2012 (PMID 22631616, BMC Fam Pract 2012;13:40).  
Topic query: `cognitive behavioral therapy insomnia`.

The recall truth set (5 included RCTs) is carried from 006 but **not re-measured for recall in
this validation** — recall on `fetchPrimaryStudyIds` was verified in 006 (4/5, 80%) and handoff
107 did not touch that function. This validation targets the three functions handoff 107 fixed.

**Topic 2 (count-level generalisation):**  
Topic: `exercise type 2 diabetes`. No recall truth set; count-level inversion test only.
Full second-SR recall truth set is deferred (follow-on validation per §7 below).

---

## 3. Harness design

Seven probes, all live-network against NCBI EUtils. Each probe directly mirrors the production
API call pattern (same retmax, sort, datetype params as the TypeScript code).

| Probe | Function tested | Query | Controls |
|-------|-----------------|-------|----------|
| 1a | `countPrimaryStudies` (new) | `(topic) NOT systematic[sb]`, retmax=1 | — |
| 1b | `countPrimaryStudies` (OLD, control) | `(topic) AND NOT systematic[sb]`, retmax=1 | regression |
| 2a | `fetchPrimaryStudiesForScreening` (new) | `(topic) NOT systematic[sb]`, retmax=20, no sort | — |
| 2b | esummary spot-check | pub-type fetch for first 5 PMIDs from 2a | — |
| 2c/d | `fetchPrimaryStudiesForScreening` (OLD, control) | `AND NOT`, retmax=20; esummary spot | regression |
| 3a/b | `countPrimaryStudiesRecent` (new + OLD) | datetype=pdat, 2023–2026, retmax=1 each | regression |
| 4 | disjoint-set (AC-no-inversion) | retmax=100 each; set overlap | — |
| 5 | topic-2 count generalisation | `exercise type 2 diabetes`, retmax=1, both forms | — |

---

## 4. Results

### 4.1 Probe 1 — `countPrimaryStudies`

```
Probe1a countPS-NEW: status=200 count=3434
Probe1b countPS-OLD: status=200 count=317
ratio: 10.8x
AC-count (≥3000): ✅ PASS (3434)
```

The NEW form (`NOT systematic[sb]`) returns 3434 — in the same range as the 3421 measured
in validation 006 (±13, consistent with PubMed's ongoing indexing). The OLD broken form returns
317 (up from 313 in 006 — also indexing drift). The 10.8× ratio confirms the ATM inversion is
absent with binary NOT and present with `AND NOT`.

---

### 4.2 Probe 2 — `fetchPrimaryStudiesForScreening`

```
Probe2a screen-NEW: status=200 total=3434 returned=20
  Mitchell SR (22631616) in result: no (expected)
  PMIDs (first 5): 42426905, 42426835, 42416103, 42404114, 42383150
```

**esummary spot-check — NEW form (5 returned):**

| PMID | Date | Pub type | Classification |
|------|------|----------|----------------|
| 42426905 | 2026 Jul 9 | Journal Article | primary study |
| 42426835 | 2026 Jul 9 | Journal Article | primary study |
| 42416103 | 2026 Sep | Journal Article | primary study |
| 42404114 | 2026 | Journal Article | primary study |
| 42383150 | 2026 Aug | Journal Article | primary study |

0/5 are systematic reviews or meta-analyses. Titles confirm clinical/trial context (RCT protocol,
digital therapeutic study, acupuncture RCT protocol, pilot CBT trial).

**esummary spot-check — OLD broken form (5 returned):**

| PMID | Date | Pub type | Classification |
|------|------|----------|----------------|
| 42421223 | 2026 Jul 8 | Journal Article; Review | primary study (unexpected) |
| 42395307 | 2026 | Journal Article; Systematic Review; Network Meta-Analysis | **SR/MA** |
| 42388478 | 2026 | Journal Article; Systematic Review | **SR** |
| 42317719 | 2026 | Journal Article; Systematic Review | **SR** |
| 42252432 | 2026 Jun 8 | Journal Article; Systematic Review | **SR** |

4/5 are systematic reviews. One (42421223) is a Review (not flagged Systematic Review) — consistent
with a narrative review slipping through `systematic[sb]`. This matches the expected OLD-form
behaviour: the screening workbench was receiving SRs.

Note: Mitchell 2012 (PMID 22631616) does not appear in the first 20 of either form's result set
under default (date-descending) sort — it was published in 2012, so it sits far from the top of
either result set regardless of filter behaviour. The pub-type spot-check via esummary is the
definitive test.

```
AC-screen:
  count criterion (≥3000): PASS (3434)
  pubtype criterion (≤1 SR in top 5): PASS (0/5)
AC-screen: ✅ PASS
```

---

### 4.3 Probe 3 — `countPrimaryStudiesRecent` (datetype=pdat, 2023–2026)

```
Probe3a recentPS-NEW: status=200 count=1188
Probe3b recentPS-OLD: status=200 count=169
ratio: 7.0x
AC-recent (>0 AND NEW>OLD): ✅ PASS
```

The fixed form returns 1188 recent primary studies (2023–2026); the broken form returns 169
(recent SRs in the same period). The 7× ratio confirms the date-restricted filter behaves the
same way as the unrestricted form: `AND NOT` triggers ATM inversion; binary `NOT` does not.

---

### 4.4 Probe 4 — AC-no-inversion (disjoint-set, retmax=100)

```
NEW total=3434, ids=100 | OLD total=317, ids=100
Overlapping PMIDs: none
Counts differ: yes
AC-no-inversion: ✅ PASS
```

The 100-PMID result sets of the NEW and OLD forms share zero papers — fully disjoint, matching
the pattern established in validation 006 probe B2 for `fetchPrimaryStudyIds`. This confirms
the binary NOT is being honoured by PubMed for the `fetchPrimaryStudiesForScreening` query path
(same filter string; same PubMed behaviour).

---

### 4.5 Probe 5 — Topic 2 count-level generalisation (exercise type 2 diabetes)

```
Probe5a topic2-NEW: status=200 count=28512
Probe5b topic2-OLD: status=200 count=1352
ratio: 21.1x
AC-topic2 (NEW>OLD AND ≥1000): ✅ PASS
```

On a completely different clinical domain (exercise and T2D), the fix generalises: the NEW form
returns 28,512 primary studies; the OLD broken form returns 1,352 SRs. The 21× ratio is larger
than the CBT-insomnia ratio (10.8×), consistent with T2D having a proportionately larger primary
literature relative to its SR count.

**Limitation:** No recall truth set was built for topic 2. Full second-SR recall measurement
(does the fix recover the included studies of a 2020–2023 T2D SR?) is deferred to a follow-on
validation (see §7 F1).

---

## 5. Findings

| # | Severity | Finding |
|---|----------|---------|
| F1 | **Deferred — follow-on** | No recall truth set for second SR topic. Brief 007 /validation 006 §8 step 5 called for a second SR truth set (recent, 2020–2023) to check generalisation. This validation provides a count-level check only (topic 2 = exercise T2D). Full recall measurement — identify a 2020–2023 SR with known included studies, fetch its includes, run the search, measure recall — is a gap. Should be addressed in validation 008 or dedicated second-SR harness. |
| F2 | **Carried — open (006 F3)** | EuropePMC date-sorted truncation: recall 0/5 on Mitchell 2012. Not in scope for handoff 107; not re-measured here. Cursor mechanism confirmed viable in 006 C2. Fix: EPMC cursor pagination loop. |
| F3 | **Carried — open (006 F2)** | OpenAlex CRIT-1: `api_key` 401. Not re-measured here (OA not touched by handoff 107). |
| F4 | **Carried — open (006 F5)** | McCluskey 1991 (PMID 1888345) not retrievable from any source; pre-CBT-I terminology. Not in scope. |

No new failures introduced.

---

## 6. Claims status

| Claim | Prior status | Status after validation 007 |
|-------|-------------|------------------------------|
| `countPrimaryStudies` returns primary study count | `unverified (006 F4: AND NOT defect present)` | **`verified (validation 007)`** — 3434 primary studies vs 317 SRs (10.8× ratio); binary NOT honoured |
| `fetchPrimaryStudiesForScreening` returns primary studies | `unverified (006 F4: AND NOT defect present)` | **`verified (validation 007)`** — 0/5 SRs in top-5 esummary spot-check; total 3434 (not 317); ID sets disjoint |
| `countPrimaryStudiesRecent` returns primary study count | `unverified (006 F4: AND NOT defect present)` | **`verified (validation 007)`** — 1188 recent primary studies vs 169 recent SRs (7.0× ratio) |
| Screening workbench receives primary studies, not SRs | `contradicted (006 F4)` | **`verified (validation 007)`** — esummary confirms 0/5 SR-type papers in top results; OLD form showed 4/5 SRs |
| Fix generalises beyond CBT-insomnia topic | `claimed (handoff 107 — identical mechanism)` | **`verified (validation 007, count level)`** — exercise T2D: NEW=28,512 vs OLD=1,352 (21.1×); recall-level generalisation still deferred (F1) |
| `countPrimaryStudies` / `fetchPrimaryStudiesForScreening` / `countPrimaryStudiesRecent` defect (006 F4) | `open (claimed fixed in handoff 107)` | **`resolved — verified (validation 007)`** |
| `countPrimaryStudies` OLD count ~313 (SR-only) | `claimed (006 F4 code review)` | `confirmed: OLD=317 (indexing drift from 313; same SR-only set)` |

---

## 7. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local):
cd /Users/dharmayudesai/blindspot
node spec/validation/007-harness.mjs

# Expected output (as of 2026-07-10):
#   Probe1a countPS-NEW: count=3434   (≥3000 ✅)
#   Probe1b countPS-OLD: count=317    (SR-only, control)
#   Probe2a screen-NEW:  total=3434 returned=20, Mitchell SR absent
#   Probe2b esummary:    0/5 are SRs in top-5 NEW; 4/5 are SRs in top-5 OLD
#   Probe3a recentPS-NEW: count=1188 (2023–2026)
#   Probe3b recentPS-OLD: count=169  (control, ~7x smaller)
#   Probe4 disjoint: 0 overlap in 100-PMID samples
#   Probe5 topic2: NEW=28512 OLD=1352 (21.1×)
#   All ACs: ✅ PASS
```

Note on count drift: PubMed's live index means counts vary slightly between runs. The primary
diagnostic is the ratio (NEW/OLD >> 1) and the esummary pub-type spot-check, both of which are
robust to minor count drift.

---

## 8. Recommended next steps

1. **Validation 008 — Full second-SR recall truth set (F1):** Pick a published SR from 2020–2023
   in a different domain (e.g., exercise interventions for type 2 diabetes, or a Cochrane
   review with documented PRISMA includes), build a fixture of its included PMIDs, and run
   recall against the three search sources (PubMed_NEW, EPMC, OA_keyless). Target: demonstrate
   generalisation of the fix beyond the CBT-insomnia topic at the recall level, not just count.

2. **Dev — EuropePMC cursor pagination (006 F3):** Cursor mechanism confirmed viable in 006 C2.
   Implement full cursor loop in `lib/europepmc.ts` to fetch up to 2000 records. Expected to
   recover the 1991–2006 truth papers currently missed by date-sorted truncation.

3. **Ops — CRIT-1 (OpenAlex api_key 401):** OpenAlex keyless already returns 4/5 at high ranks.
   Highest-ROI fix remaining.

4. **Dev — Synonym expansion (McCluskey 1991, 006 F5):** Required to reach 5/5 ceiling.

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC-count (`countPrimaryStudies` ≥ 3000) | ✅ **PASS — 3434** | 10.8× improvement over OLD broken form (317 SRs) |
| AC-screen (screening feed = primary studies) | ✅ **PASS** | 0/5 SR pub types in top-5 NEW; 4/5 in top-5 OLD (control confirmed) |
| AC-recent (`countPrimaryStudiesRecent` > OLD) | ✅ **PASS — 1188 vs 169** | 7.0× improvement; date-restricted filter behaves same as unrestricted |
| AC-no-inversion (disjoint sets) | ✅ **PASS — 0 overlap** | 100-PMID samples fully disjoint (NEW ∩ OLD = ∅), counts differ |
| Topic-2 count generalisation | ✅ **PASS — 21.1×** | exercise T2D: 28,512 vs 1,352; fix generalises at count level |
| Recall-level second-SR generalisation | ⚠ **NOT TESTED** | F1 — deferred to validation 008 |
| EuropePMC (carried 006 F3) | ❌ **OPEN** | Not in handoff 107 scope |
| OpenAlex CRIT-1 (carried 006 F2) | ❌ **OPEN** | Not in handoff 107 scope |

**Overall:** All four brief 007 ACs are independently verified. The binary-NOT fix in the three
sibling functions is confirmed correct and consistent with the mechanism proven in handoff 106
/ validation 006: `AND NOT systematic[sb]` triggers PubMed ATM inversion (returns SRs);
`NOT systematic[sb]` is a boolean set-difference the ATM cannot silently rewrite (returns
primary studies). ID sets are fully disjoint (NEW ∩ OLD = ∅), ratio ~7–11× across date-
restricted and unrestricted queries.

The esummary spot-check provides the most direct evidence: the NEW screening-feed form returns
papers with pub types like "Journal Article" (RCT protocols, clinical trials); the OLD broken
form returns papers with pub types like "Systematic Review", "Network Meta-Analysis". This
matches exactly what the defect description predicted.

Count-level generalisation to a second domain (exercise, T2D) is verified (21.1× ratio).
Full recall-level generalisation to a second SR truth set is deferred.

**Session completed:** 2026-07-10
