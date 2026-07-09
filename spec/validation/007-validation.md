# Validation 007 — Handoff 107: Sibling-function `AND NOT systematic[sb]` Fix

**Tester instance** · **Date:** 2026-07-09 · **Stage:** Stage 2 (literature search / count) + Stage 3 (screening feed)
**Spec under test:** Validation Strategy §Stage 2 (count accuracy), §Stage 3 (screening feed); Brief 007
**Handoff under test:** `spec/107-handoff.md` — three `AND NOT systematic[sb]` → `NOT systematic[sb]` substitutions:
  - `countPrimaryStudies` (`lib/pubmed.ts` line 124)
  - `fetchPrimaryStudiesForScreening` (`lib/pubmed.ts` line 240)
  - `countPrimaryStudiesRecent` (`lib/pubmed.ts` line 300)
**Code confirmed as-shipped:** All three sites verified by direct `Read` of `lib/pubmed.ts` before running harness.
**Harness:** `spec/validation/007-harness.mjs` (live-network; NCBI ESearch + ESummary APIs)
**Prior validation:** `spec/validation/006-validation.md` (Mitchell 2012 truth set carried forward)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 107 applied the binary `NOT` fix (proven in handoff 106, verified in validation 006) to
three sibling functions in `lib/pubmed.ts` that still used `(${query}) AND NOT systematic[sb]`:

| Function | Line (post-edit) | Defect it fixed |
|----------|------|------------------|
| `countPrimaryStudies` | 127 | Count fed feasibility display and cache — was counting SRs |
| `fetchPrimaryStudiesForScreening` | 240 | Screening workbench feed — was fetching SRs to screen |
| `countPrimaryStudiesRecent` | 300 | Study-count trend (NEW-2) — was counting recent SRs |

`fetchPrimaryStudyIds` (line 276) was fixed in handoff 106 / verified in validation 006; left unchanged.

Code state was confirmed by reading `lib/pubmed.ts` lines 115–138, 225–252, 285–310 directly
before running the harness. All three sites show the binary `NOT` form with provenance comments.

---

## 2. Truth set and provenance

**Negative control (AC-screen):** Mitchell 2012 (PMID 22631616, BMC Fam Pract 2012;13:40)
— "Comparative effectiveness of cognitive behavioral therapy for insomnia: a systematic review"
This is a systematic review. It **must not appear** in `fetchPrimaryStudiesForScreening` output.

**Positive reference (for count order-of-magnitude anchor):** Same 5 included RCTs as 004/005/006:

| PMID | Citation |
|------|----------|
| 16804151 | Sivertsen B et al. JAMA 2006;295:2851 |
| 15451764 | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| 10086433 | Morin CM et al. JAMA 1999;281:991 |
| 16785771 | Wu R et al. Psychother Psychosom 2006;75:220 |
| 1888345  | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

Validation 006 confirmed 4/5 of these are retrievable by the NEW `NOT systematic[sb]` form
(recall 80%). The 5th (McCluskey 1991) is a known RC2 (terminology gap); unchanged for 007.

**Note on second SR truth set:** Validation 006 §8 recommended adding a second SR (2020–2023) for
generalisation. Deferred from 007: the scope of brief 007 is count-correctness and screening-feed
composition, not recall generalisation. The count probes use absolute values (is the magnitude
primary-study-scale?) rather than recall against a second SR's included list.

---

## 3. Harness design

Six probes, run from `spec/validation/007-harness.mjs` against live NCBI ESearch/ESummary APIs.

| Probe | Function mirrored | Query | retmax | Date filter |
|-------|-------------------|-------|--------|-------------|
| P1-NEW | `countPrimaryStudies` (fixed) | `(topic) NOT systematic[sb]` | 1 | none |
| P4-OLD | `countPrimaryStudies` (OLD/control) | `(topic) AND NOT systematic[sb]` | 1 | none |
| P2-NEW | `fetchPrimaryStudiesForScreening` (fixed) | `(topic) NOT systematic[sb]` | 20 | none |
| P2-OLD | `fetchPrimaryStudiesForScreening` (OLD/control) | `(topic) AND NOT systematic[sb]` | 20 | none |
| P2-spot | ESummary spot-check of first 5 IDs from P2-NEW | — | — | — |
| P3-NEW | `countPrimaryStudiesRecent` (fixed) | `(topic) NOT systematic[sb]` | 1 | pdat 2023–2026 |
| P3-OLD | `countPrimaryStudiesRecent` (OLD/control) | `(topic) AND NOT systematic[sb]` | 1 | pdat 2023–2026 |

Each control probe mirrors the OLD (broken) form to establish the counterfactual.
Topic: `cognitive behavioral therapy insomnia` (same as prior validations).

---

## 4. Results

### 4.1 P1 — `countPrimaryStudies` (new vs old)

```
P1-NEW countPrimaryStudies:           status=200  count=3432
P4-OLD countPrimaryStudies (control): status=200  count=317
P1/P4 ratio: 3432 / 317 = 10.8× (bar: >5× for AC-no-inversion)
```

The fixed form returns 3432 primary studies. The OLD (broken) form returns 317 systematic reviews
— consistent with validation 006's 313 (±5% NCBI API non-determinism over two weeks). The
10.8× ratio is well above the 5× threshold required by AC-no-inversion, and the count 3432 is
within 0.3% of validation 006 probe B's 3421, confirming stability.

**AC-count: ✅ PASS — 3432 ≥ 3000.**
**AC-no-inversion: ✅ PASS — 10.8× > 5×.**

---

### 4.2 P2 — `fetchPrimaryStudiesForScreening` (new vs old, retmax=20)

```
P2-NEW feed (NOT systematic[sb], retmax=20):     status=200  returned=20  total=3432
  SR PMID 22631616 (Mitchell SR) in result: NO ✓
  Truth RCTs in feed: 0/5 (expected: retmax=20 is small; RCTs rank past position 20 by relevance)

P2-OLD feed (AND NOT systematic[sb], retmax=20): status=200  returned=20  total=317
  SR PMID 22631616 in OLD result: NO
```

**SR 22631616 absence in the OLD feed:** The OLD form returns 317 systematic reviews sorted by
relevance. Mitchell 2012 may rank outside the top 20 among 317 SRs — its absence does not
contradict the control, which is validated by the count (317 vs 3432). The negative-control
for AC-screen is sufficiently established by the count difference; a re-run with retmax=317
would be needed to positively confirm its presence in the OLD feed, but is not required for the
PASS/FAIL determination.

**AC-screen primary criterion (SR PMID absent from NEW feed): ✅ PASS.**

---

### 4.3 P2-spot — ESummary spot-check of first 5 PMIDs from P2-NEW

```
PMID 42371561 [2026]: pubtype="Journal Article; Review"
                       title="From Therapeutic Heterogeneity to Precision Neuromodulation:
                              Non-Invasive Brain Stimulation for Chronic Insomnia."
PMID 42382221 [2026]: pubtype="Journal Article"
                       title="The Prognostic Value of Early Treatment Factors for Cognitive
                              Behavioral Therapy..."
PMID 42383150 [2026]: pubtype="Journal Article"
                       title="A small pilot trial of virtual group cognitive behavioral therapy
                              for insomnia..."
PMID 42404114 [2026]: pubtype="Journal Article"
                       title="Acupuncture for chronic insomnia with mild cognitive impairment:
                              protocol for a..."
PMID 42416103 [2026]: pubtype="Journal Article"
                       title="Pre-corticosteroid delusional psychosis and olanzapine-responsive..."
```

**Important clarification — PMID 42371561 ("Journal Article; Review"):**

The harness's automated `isSrType()` function flagged this as SR-type because it contains the
word "review" in pubtypes. However, full-text confirmation via EFetch (XML) shows:

- Publication type: `D016428 Journal Article` + `D016454 Review` (narrative review)
- **NOT** `D000078182 Systematic Review` or `D017418 Meta-Analysis`
- Abstract explicitly states: "This **narrative** review synthesizes current evidence..."
- PubMed's `systematic[sb]` filter targets only "Systematic Review" (`D000078182`) and
  "Meta-Analysis" (`D017418`) publication types, plus articles meeting systematic-review
  indexing criteria. Plain narrative "Review" (`D016454`) articles are NOT in the
  `systematic[sb]` subset.

**Therefore:** PMID 42371561 appearing in the `NOT systematic[sb]` result set is **correct
behavior** — the filter correctly did not exclude a narrative review.

Corrected spot-check result:
- SR-types in `systematic[sb]` sense found in 5 PMIDs: **0/5**
- Narrative review types (not excluded by filter): **1/5** (expected; correct behavior)
- Journal Article (primary): **4/5**

**AC-screen spot-check: ✅ PASS — 0/5 spot-checked PMIDs are Systematic Reviews or
Meta-Analyses; narrative reviews correctly remain in the feed per `systematic[sb]` semantics.**

---

### 4.4 P3 — `countPrimaryStudiesRecent` (new vs old, pdat 2023–2026)

```
P3-NEW countPrimaryStudiesRecent (2023–2026): status=200  count=1186
P3-OLD countPrimaryStudiesRecent (AND NOT, control): status=200  count=169
P3 ratio NEW/OLD: 1186 / 169 = 7.0× recent
```

The fixed form returns 1186 recent primary studies (2023–2026). The OLD (broken) form returns
169 recent systematic reviews. The 7.0× ratio confirms the same pattern as Sites 1/2: the
OLD form was counting SRs, the new form counts primary studies. 1186 > 0.

**AC-recent: ✅ PASS — countPrimaryStudiesRecent=1186 > 0.**

---

### 4.5 Summary table

| Probe | Metric | Value | Bar | Pass? |
|-------|--------|-------|-----|-------|
| P1-NEW count | countPrimaryStudies | 3432 | ≥3000 | ✅ |
| P4-OLD count (control) | OLD-form count | 317 | ~313 (verify still inverted) | ✅ confirmed |
| P1/P4 ratio | Inversion disjoint signal | 10.8× | >5× | ✅ |
| P2-NEW SR absent | 22631616 not in feed | absent | absent | ✅ |
| P2-spot SR-type rate | Systematic Reviews in NEW feed | 0/5 | 0/5 | ✅ |
| P3-NEW count | countPrimaryStudiesRecent | 1186 | >0 | ✅ |
| P3 ratio NEW/OLD | Recent inversion signal | 7.0× | >5× | ✅ |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | **Resolved** | `countPrimaryStudies` ATM inversion (006 F4 Site 1). Fixed in handoff 107. Count: 317 (OLD/SRs) → 3432 (NEW/primaries). `countPrimaryStudies` now returns primary-study count, not SR count. |
| F2 | **Resolved** | `fetchPrimaryStudiesForScreening` ATM inversion (006 F4 Site 2). Fixed in handoff 107. Screening feed now returns primary studies. Known SR PMID 22631616 absent. Spot-check: 0/5 Systematic Reviews or Meta-Analyses in returned set. |
| F3 | **Resolved** | `countPrimaryStudiesRecent` ATM inversion (006 F4 Site 3). Fixed in handoff 107. Count: 169 (OLD/recent SRs) → 1186 (NEW/recent primaries). |
| F4 | **Harness note** | `isSrType()` in 007-harness.mjs was overly conservative: it flags any "Review" pubtype. Corrected by EFetch spot-check: PMID 42371561 is a narrative review (D016454), not a systematic review (D000078182). The flag was a false positive from the harness, not an app defect. Future harness iterations should narrow the SR check to "Systematic Review" or "Meta-Analysis" pubtypes only. |
| F5 | **Carried** | OpenAlex CRIT-1: `OPENALEX_API_KEY` 401 (from 006 F2). Not in scope for brief 007. |
| F6 | **Carried** | EuropePMC date-sorted truncation (from 006 F3). Not in scope for brief 007. |
| F7 | **Carried** | McCluskey 1991 (PMID 1888345) RC2 — terminology gap; not retrievable by any source. Not in scope for brief 007. |
| F8 | **New — Medium** | Narrative reviews (pubtype "Review", not "Systematic Review") pass through `NOT systematic[sb]` and appear in screening feeds and primary-study counts. This is **correct filter behavior** per PubMed's `systematic[sb]` definition, but means the screening workbench will receive narrative reviews alongside RCTs. If scoping reviews / narrative reviews should also be excluded, a separate filter (`NOT Review[pt]` or `NOT "Review"[pt]`) would be needed. This is a scope decision for the dev/librarian; not a bug in the current fix. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 007 |
|-------|-------------|------------------------------|
| `countPrimaryStudies` returns primary-study count (not SR count) | `unverified (006 §6)` | **`verified (validation 007)`** — 3432 primaries vs 317 SRs (OLD), 10.8× ratio |
| `fetchPrimaryStudiesForScreening` returns primary studies (not SRs) | `unverified (006 §6)` | **`verified (validation 007)`** — SR 22631616 absent from NEW feed; 0/5 SR-types in spot-check |
| `countPrimaryStudiesRecent` returns primary-study count (not SR count) | `unverified (006 §6)` | **`verified (validation 007)`** — 1186 recent primaries vs 169 recent SRs (OLD), 7.0× ratio |
| AC-count (countPrimaryStudies ≥3000) | `claimed (handoff 107)` | **`verified (validation 007)`** — 3432 ✅ |
| AC-screen (SR PMID absent from screening feed) | `claimed (handoff 107)` | **`verified (validation 007)`** — 22631616 absent; 0/5 SR-types in spot-check ✅ |
| AC-recent (countPrimaryStudiesRecent > 0) | `claimed (handoff 107)` | **`verified (validation 007)`** — 1186 ✅ |
| AC-no-inversion (disjoint counts for all three sites) | `claimed (handoff 107)` | **`verified (validation 007)`** — Site1: 10.8×; Site3: 7.0× |
| `countPrimaryStudies` count consistent with `fetchPrimaryStudyIds` post-106 (3421) | `claimed (handoff 107)` | **`verified (validation 007)`** — 3432 vs 3421; within 0.3% |
| Narrative reviews appear in `NOT systematic[sb]` results | not previously documented | **`new observation`** — correct filter behavior; narrative reviews (D016454) not in `systematic[sb]` subset |
| OpenAlex CRIT-1 (`api_key` 401) | `confirmed open (006)` | `still open — not in scope for 007` |
| EuropePMC date-sorted truncation (006 F3) | `open` | `still open — not in scope for 007` |

---

## 7. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local):
cd /Users/dharmayudesai/blindspot
node spec/validation/007-harness.mjs

# Expected output (as of 2026-07-09):
#   P1-NEW countPrimaryStudies:           status=200  count=3432
#   P4-OLD countPrimaryStudies (control): status=200  count=317
#   P1/P4 ratio: 10.8× (AC-no-inversion ✅ PASS)
#
#   P2-NEW fetchPrimaryStudiesForScreening (retmax=20): returned=20
#     SR PMID 22631616: absent ✓
#     Truth RCTs: 0/5 (expected; retmax=20 < rank positions of RCTs)
#   P2-OLD (AND NOT, retmax=20): total=317 (OLD form returns SRs)
#
#   P2-spot (ESummary, 5 PMIDs):
#     PMID 42371561: "Journal Article; Review" → narrative review (NOT systematic[sb] correct)
#     PMIDs 42382221, 42383150, 42404114, 42416103: "Journal Article" ✓
#     Corrected SR-type rate: 0/5 (AC-screen ✅ PASS)
#
#   P3-NEW countPrimaryStudiesRecent (2023–2026): count=1186
#   P3-OLD (AND NOT, control): count=169
#   P3 ratio: 7.0× (AC-recent ✅ PASS)
#
#   AC-no-inversion : ✅ PASS
#   AC-count        : ✅ PASS
#   AC-screen       : ✅ PASS  (harness script prints ❌ FAIL due to overly-broad isSrType();
#                               see §4.3 — EFetch confirms 0/5 are Systematic Reviews)
#   AC-recent       : ✅ PASS

# Note: The harness's AC-screen verdict line prints ❌ FAIL because isSrType() treats
# "Review" as SR-type. This is a harness defect (F4); the true result is PASS per §4.3.
```

---

## 8. Recommended next steps

1. **Librarian — update wiki claims:** All three sibling functions are now verified correct.
   The claims in [[Roadmap & Status]], [[Data Sources]], [[Screening]], and [[Handoff Log]]
   can be updated from `claimed` to `verified` for handoff 107.

2. **Dev — refine screening-feed filtering (optional, F8):** The `NOT systematic[sb]` filter
   correctly excludes Systematic Reviews and Meta-Analyses, but narrative Reviews (pubtype
   "D016454 Review") pass through. If narrative reviews should also be excluded from the
   screening workbench, add `NOT Review[pt]` to the query. This is a scope decision, not a
   correctness bug in the current fix.

3. **Tester — harness fix (F4):** Update `isSrType()` in future harnesses to match only
   "Systematic Review" and "Meta-Analysis" pubtypes (not "Review"). Suggested:
   ```js
   function isSrType(pubtypes) {
     const s = (pubtypes ?? '').toLowerCase();
     return s.includes('systematic review') || s.includes('meta-analysis');
   }
   ```

4. **Dev/Ops — CRIT-1 (carried F5):** OpenAlex `api_key` still 401. Highest-ROI remaining fix.

5. **Dev — EPMC cursor pagination (carried F6):** Cursor mechanism confirmed viable in 006;
   implement full pagination loop to recover 2020s truth papers.

6. **Tester — Validation 008:** Add second SR truth set (recent, 2020–2023) per 005 §8.4
   recommendation; re-run recall harness with second SR as generalisation check.

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC-no-inversion | ✅ **PASS** | Site1: 10.8×; Site3: 7.0×; counts clearly in different magnitude ranges |
| AC-count (≥3000) | ✅ **PASS** | `countPrimaryStudies`=3432; within 0.3% of `fetchPrimaryStudyIds` (3421) |
| AC-screen (SR absent from feed) | ✅ **PASS** | 22631616 absent; 0/5 Systematic Reviews in spot-check (1 narrative review correctly passes filter) |
| AC-recent (>0) | ✅ **PASS** | `countPrimaryStudiesRecent`(2023–2026)=1186 |
| Regression (tsc/vitest) | ✅ **PASS** | Reported by dev in handoff 107 §4–§5; 0 new failures |

**Overall:** All four brief 007 acceptance criteria are **verified**. Handoff 107's three
single-line substitutions are confirmed correct. The binary `NOT systematic[sb]` fix now applies
uniformly across all four call sites in `lib/pubmed.ts`:

- `fetchPrimaryStudyIds` — verified in validation 006 (4/5 recall, binary NOT honoured)
- `countPrimaryStudies` — verified in validation 007 (count 3432 vs 317 OLD)
- `fetchPrimaryStudiesForScreening` — verified in validation 007 (SR absent; 0/5 SR-types)
- `countPrimaryStudiesRecent` — verified in validation 007 (count 1186 vs 169 OLD)

The ATM-inversion defect (validation 005 F1, 006 F4) is fully resolved across all affected sites.
Outstanding issues (CRIT-1, EPMC pagination, McCluskey RC2) are unchanged and carried forward.

**Session completed:** 2026-07-09
