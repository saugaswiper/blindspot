# Validation 007 — Stage 3 Sibling-Function Fix: Handoff 107 (Three `AND NOT` Sites)

**Tester instance** · **Date:** 2026-08-09 · **Stage:** Stage 3 — Primary-literature capture (recall) + Stage 3 screening feed
**Spec under test:** Validation Strategy §Stage 3; Brief 007
**Handoff under test:** `spec/107-handoff.md` — binary-NOT fix applied to three sibling functions:
  `countPrimaryStudies` (line 127), `fetchPrimaryStudiesForScreening` (line 240),
  `countPrimaryStudiesRecent` (line 300)
**Code under test:** `lib/pubmed.ts` three call sites
**Harness:** `spec/validation/007-harness.mjs` (live-network, Mitchell 2012 truth set)
**Prior validation:** `spec/validation/006-validation.md` (F4 identified the three functions; this run resolves F4)

> Tester scope reminder: this report measures what the code does and reports it. It does **not**
> edit code or wiki. Fixes are for the dev; wiki reconciliation is for the librarian.

---

## 1. What was tested

Handoff 107 applied the proven binary-NOT form to three functions that validation 006 F4
identified as still carrying the `AND NOT systematic[sb]` ATM-inversion defect:

| Function | Line | Old query fragment | New query fragment |
|----------|------|-------------------|-------------------|
| `countPrimaryStudies` | 127 | `(q) AND NOT systematic[sb]` | `(q) NOT systematic[sb]` |
| `fetchPrimaryStudiesForScreening` | 240 | `(q) AND NOT systematic[sb]` | `(q) NOT systematic[sb]` |
| `countPrimaryStudiesRecent` | 300 | `(q) AND NOT systematic[sb]` | `(q) NOT systematic[sb]` |

`fetchPrimaryStudyIds` (line 282) was fixed in handoff 106 / validation 006 and was not
re-tested here. Functions with intentional positive `systematic[sb]` filters were not touched.

---

## 2. Truth set and provenance

Unchanged from validations 004, 005, and 006. Mitchell et al. 2012 (PMID 22631616,
BMC Fam Pract 2012;13:40) — "Comparative effectiveness of cognitive behavioral therapy
for insomnia: a systematic review."

| Ref | PMID | Citation |
|-----|------|----------|
| [29] | **16804151** | Sivertsen B et al. JAMA 2006;295:2851 |
| [30] | **15451764** | Jacobs GD et al. Arch Intern Med 2004;164:1888 |
| [31] | **10086433** | Morin CM et al. JAMA 1999;281:991 |
| [32] | **16785771** | Wu R et al. Psychother Psychosom 2006;75:220 |
| [33] | **1888345**  | McCluskey HY et al. Am J Psychiatry 1991;148:121 |

Known SR PMID used for screening-feed check: **22631616** (Mitchell 2012 — the gold SR
itself; must NOT appear in a correctly-filtered primary-study result).

Second SR truth set (validation 006 §8.5 recommended item): **deferred.** The 3-function
fix can be verified mechanically against counts and disjoint-set evidence, which does not
require a second truth set. A second SR is recommended for generalisation in a future run.

---

## 3. Harness design

Seven probes, run from `spec/validation/007-harness.mjs` against live NCBI APIs.

| Probe | Function proxied | Query / config | Primary claim |
|-------|-----------------|----------------|---------------|
| 1a | `countPrimaryStudies` OLD | `AND NOT systematic[sb]`, retmax=1 | Control: ~319 (SRs) |
| 1b | `countPrimaryStudies` NEW | `NOT systematic[sb]`, retmax=1 | AC-count: ≥3000 |
| 1c | `countPrimaryStudies` overlap | Both at retmax=200 | Disjointness: overlap=0 |
| 2a | `fetchPrimaryStudiesForScreening` NEW | `NOT systematic[sb]`, retmax=20, no sort | AC-screen: SR PMID absent; EFetch spot-check |
| 2b | `fetchPrimaryStudiesForScreening` recall | `NOT systematic[sb]`, retmax=500, relevance | Truth-set recall consistency check |
| 3a/3b | `countPrimaryStudiesRecent` OLD/NEW | pdat 2023–2026, retmax=1 | AC-recent: NEW > OLD > 0 |
| 3c | `countPrimaryStudiesRecent` overlap | Both at retmax=200 with pdat | Disjointness: overlap=0 |

---

## 4. Results

### 4.1 Probe 1 — AC-count (`countPrimaryStudies`)

```
Probe1a OLD: status=200 count=319
Probe1b NEW: status=200 count=3472
Probe1c overlap: OLD returned=200 NEW returned=200 both=0
  ✓ Sets disjoint — binary NOT honoured (no overlap between old and new forms)
AC-count: ✅ PASS — NEW count=3472 (bar: ≥3000; OLD was ~319)
```

The count jumps from 319 (systematic reviews, ATM-inverted) to 3472 (primary studies), a
10.9× increase. The figure is consistent with validation 006's measurement taken on 2026-06-24
(OLD=313, NEW=3421); the small increase (6 studies OLD, 51 studies NEW) reflects 6 weeks of
new PubMed indexing — not a code change.

The 200-record overlap check is fully disjoint (0 papers in common), replicating the
validation 006 probe B2 result for this function. Binary NOT is honoured.

---

### 4.2 Probe 2a — AC-screen (`fetchPrimaryStudiesForScreening`, prod limit)

```
Probe2a OLD: status=200 total=319 returned=20 SR PMID 22631616 in result: no  hits=0/5
Probe2a NEW: status=200 total=3472 returned=20 SR PMID 22631616 in result: ✓ no  hits=0/5
AC-screen (SR absent): ✅ PASS — Mitchell SR (22631616) absent from screening feed
```

The known SR PMID (22631616) is absent from both OLD and NEW top-20 results; this is expected
— with 319 SRs and default date sort, the 2012 SR is not among the 20 most-recent. The
diagnostic power here is the total count: OLD=319 (all SRs) vs NEW=3472 (primary studies),
with 0 overlap confirmed at retmax=200 (Probe 1c carries this for the screening function since
both use the same query form — the only difference is retmax and the absence of a sort).

**EFetch spot-check (PMID 42559833, first NEW result):**

```
1. Psychooncology. 2026 Aug;35(8):e70549. doi: 10.1002/pon.70549.

Efficacy of a Stepped-Care Approach to Cognitive-Behavioural Therapy for
Insomnia (Can-Sleep) in Adolescents and Young Adults With Cancer.

Maccora J(1), Ftanou M(2)(3), Vaughan E(2), Murnane A(4), Lewin J(4)(5), Berger
I(4), Wiley JF(1)(2), Jefford M(5)(6)(7), Hickey M(8), Goldin J(9), Thompson
K(4)(10).
```

This is a 2026 clinical trial (primary study, Psychooncology), not a systematic review.
Confirms the screening feed is now returning primary studies at its top positions.

**Truth-set hits (Probe 2a, retmax=20, no sort): 0/5.** Expected: the truth papers are from
1991–2006; with default date sort they fall far outside the first 20 results (the function
returns the 20 most-recently indexed records). This is not a defect in the fix — it is a
structural artefact of date-sorted retrieval and the small production limit.

---

### 4.3 Probe 2b — Screening recall with relevance sort (retmax=500)

```
Probe2b NEW recall: status=200 total=3472 returned=500 hits=0/5 recall=0%
  missed: 16804151, 15451764, 10086433, 16785771, 1888345
  All 5 truth PMIDs: NOT FOUND in 500 returned
```

**0% recall at retmax=500 with relevance sort.** This is structurally consistent with
validation 006: probe B (retmax=2000, relevance) placed truth papers at ranks 856, 1180, 1584,
1620 (all above position 500). A 500-record ceiling with relevance sort cannot reach them.
This is **not a regression** introduced by handoff 107 — the rank positions of the truth
papers are unchanged. The 2000-record ceiling is required to reach them (as validated in
006 probe B).

The production `fetchPrimaryStudiesForScreening` function uses default (date) sort with no
sort parameter. Under date sort, 1991–2006 truth papers would appear even later (near the end
of a 3472-record result set). This is a structural characteristic of how the function is
designed: the screening workbench operates on post-search results for reviewer action, so
recency-ordering is appropriate for the UX but poor for historical recall testing.

---

### 4.4 Probe 3 — AC-recent (`countPrimaryStudiesRecent`)

```
Probe3a OLD (pdat 2023–2026): status=200 count=171
Probe3b NEW (pdat 2023–2026): status=200 count=1226
Probe3c overlap (retmax=200 with pdat): OLD=171 NEW=200 both=0
  ✓ Sets disjoint — binary NOT honoured for recent filter too
AC-recent: ✅ PASS — NEW count=1226 OLD count=171 (NEW>0 AND NEW>OLD)
```

The recent count jumps from 171 (SRs published 2023–2026) to 1226 (primary studies
published 2023–2026), a 7.2× increase. The OLD form was returning a count of *recently
published systematic reviews*, the exact inverse of intent. The NEW form returns recent
primary studies — the correct input for the Study-Count Trend feature (NEW-2).

The pdat-filtered overlap check returns 0 (171 OLD IDs vs 200 NEW IDs fully disjoint),
confirming binary NOT is honoured in the date-filtered form as well.

---

### 4.5 Probe 4 — AC-no-inversion summary

```
countPrimaryStudies (Probe 1c):          OLD=200 NEW=200 overlap=0 → ✓ disjoint
countPrimaryStudiesRecent (Probe 3c):    OLD=171 NEW=200 overlap=0 → ✓ disjoint
fetchPrimaryStudiesForScreening (2a):    OLD=20  NEW=20  overlap=0 → ✓ disjoint
AC-no-inversion: ✅ PASS — all three function proxies return disjoint OLD/NEW sets
```

All three functions have fully disjoint OLD (AND NOT) and NEW (NOT) result sets. This is the
same pattern as validation 006 probe B2 (0 overlap for `fetchPrimaryStudyIds`), extending
that confirmation to all four call sites. Binary NOT is honoured globally in `lib/pubmed.ts`.

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | **Resolved (006 F4)** | `AND NOT systematic[sb]` ATM inversion in three sibling functions. All three now use binary NOT. Verified: OLD/NEW sets fully disjoint (0 overlap) for all three; count ratios ~10× (count) and ~7× (recent) confirm direction reversal. |
| F2 | **Informational** | `fetchPrimaryStudiesForScreening` recall on the 1991–2006 Mitchell truth set is 0% at any practically retrievable retmax via this function (truth papers are at relevance ranks 856–1620 per validation 006; the function's date sort pushes them further). Not a defect in handoff 107 — structural: the function is a screening feed, not a recall tool. The `fetchPrimaryStudyIds` path (retmax=2000, relevance) is the correct Stage 3 recall path. |
| F3 | **High — Carried (006 F3)** | EuropePMC date-sorted truncation: not retested this run (function was not modified in handoff 107). Status: unchanged from 006. Cursor pagination mechanism confirmed viable; full pagination of ~2000 records needed to recover 1991–2006 truth papers. |
| F4 | **High — Carried (006 F2)** | OpenAlex CRIT-1 (`api_key` 401): not retested this run (no OpenAlex changes in 107). Status: unchanged from 006. Keyless OA remains at 4/5 recall. |
| F5 | **Medium — Carried (006 F5)** | McCluskey 1991 (PMID 1888345) not retrievable by any source. RC2: pre-CBT-I terminology. Requires synonym expansion (brief 006). Ceiling for Mitchell 2012 SR = 4/5. |

---

## 6. Claims status

| Claim | Prior status | Status after validation 007 |
|-------|-------------|------------------------------|
| `countPrimaryStudies` returns primary study count | `unverified (006: carried AND NOT defect)` | **`verified (validation 007)`** — count=3472 vs OLD=319; disjoint sets confirm binary NOT honoured |
| `fetchPrimaryStudiesForScreening` returns primary studies | `unverified (006: carried AND NOT defect)` | **`verified (validation 007)`** — SR PMID absent; spot-check PMID is a primary study (2026 clinical trial); total=3472 vs OLD=319; disjoint |
| `countPrimaryStudiesRecent` returns recent primary study count | `unverified (006: carried AND NOT defect)` | **`verified (validation 007)`** — count=1226 vs OLD=171; disjoint sets; binary NOT honoured with pdat filter |
| All four `lib/pubmed.ts` primary-study call sites use binary NOT | `claimed (handoff 107)` | **`verified (validation 007)`** — Probes 1c, 2a, 3c: all disjoint; 106/006 verified fetchPrimaryStudyIds |
| Stage 3 production union recall ≥95% | `contradicted (006): 80%` | `still contradicted: ceiling 80% (McCluskey RC2; EPMC pagination; OpenAlex CRIT-1)` |
| EuropePMC truncation (006 F3) | `open` | `open — not retested (no EPMC changes in 107)` |
| OpenAlex CRIT-1 (006 F2) | `open` | `open — not retested (no OA changes in 107)` |

---

## 7. Reproduction

```bash
# Live-network harness (requires NCBI_API_KEY in .env.local):
cd /Users/dharmayudesai/blindspot
node spec/validation/007-harness.mjs

# Expected output (as of 2026-08-09):
#   Probe1a OLD: status=200 count=319
#   Probe1b NEW: status=200 count=3472
#   Probe1c overlap: OLD=200 NEW=200 both=0 → ✓ disjoint
#   AC-count: ✅ PASS — NEW=3472 (bar ≥3000)
#
#   Probe2a OLD: total=319 returned=20 SR absent
#   Probe2a NEW: total=3472 returned=20 SR absent → ✅ PASS
#   Spot-check PMID 42559833: Psychooncology 2026 (CBT-I cancer trial)
#   Probe2b recall: 0/5 (truth papers at ranks 856+ per 006; 500-record ceiling insufficient)
#
#   Probe3a OLD (pdat 2023–2026): count=171
#   Probe3b NEW (pdat 2023–2026): count=1226
#   Probe3c overlap: OLD=171 NEW=200 both=0 → ✓ disjoint
#   AC-recent: ✅ PASS — NEW=1226 vs OLD=171
#
#   AC-no-inversion: ✅ PASS — all three function proxies disjoint
#
# Gold SR: Mitchell 2012 (PMID 22631616)
# Truth PMIDs: 16804151, 15451764, 10086433, 16785771, 1888345
```

Minor count drift from 006 run (2026-06-24 → 2026-08-09): OLD 313→319, NEW 3421→3472.
Normal PubMed indexing growth over 6 weeks; not a code change.

---

## 8. Recommended next steps

1. **Librarian — Update wiki claims (per handoff 107 §7):**
   - **[[Roadmap & Status]]**: Record handoff 107 (all four `AND NOT` sites now fixed).
   - **[[Data Sources]]**: Update `countPrimaryStudies`, `fetchPrimaryStudiesForScreening`,
     `countPrimaryStudiesRecent` filter behavior descriptions.
   - **[[Screening]]**: Note the screening feed now returns primary studies (F4 resolved).
   - **[[Handoff Log]]**: Add handoff 107 entry.

2. **Dev — EuropePMC cursor pagination (F3):** Cursor mechanism confirmed viable (006 C2).
   Implement cursorMark loop in `lib/europepmc.ts` up to 2000 records. Truth papers expected
   in pages 8–10 of date-sorted set (~1400–1994).

3. **Ops — CRIT-1 (F4):** OpenAlex keyless delivers 4/5 at ranks 1–86. Rotating the API key
   or confirming the keyless `mailto` path in production remains highest-ROI ops fix.

4. **Dev — Synonym expansion (F5 / brief 006):** McCluskey 1991 unretrievable by any source.
   Requires query synonym expansion. Ceiling with current code = 4/5 (80%).

5. **Tester (future — Validation 008):** Add a second SR truth set (recent, 2020–2023, different
   clinical domain) to test generalisation of the binary-NOT fix beyond CBT insomnia. Run
   after any EPMC or OpenAlex changes to track recall trajectory.

---

## 9. Verdict

| Criterion | Result | Notes |
|-----------|--------|-------|
| AC-count (`countPrimaryStudies` returns ≥3000 primary studies) | ✅ **PASS — 3472** | OLD form returned 319 (SRs); 10.9× increase confirms fix |
| AC-screen (SR PMID absent from screening feed) | ✅ **PASS** | Mitchell SR (22631616) absent; spot-check PMID is a 2026 clinical trial |
| AC-recent (`countPrimaryStudiesRecent` returns primary count) | ✅ **PASS — 1226 vs 171** | 7.2× increase; disjoint with pdat filter |
| AC-no-inversion (all three functions disjoint) | ✅ **PASS** | 0 overlap across all three function proxies; binary NOT globally honoured |
| Stage 3 production union recall ≥95% | ❌ **FAIL — 80%** | Ceiling blocked by: EPMC pagination (F3), McCluskey RC2 (F5), OpenAlex CRIT-1 (F4) |

**Overall:** All four brief 007 acceptance criteria are met. Handoff 107's three binary-NOT
substitutions are confirmed correct. `countPrimaryStudies`, `fetchPrimaryStudiesForScreening`,
and `countPrimaryStudiesRecent` now exclude systematic reviews (not include them). All four
`lib/pubmed.ts` primary-study call sites have been verified to use binary NOT correctly,
completing the fix sequence that began in handoff 106 (validated in 006).

The Stage 3 long-run recall bar (≥95%) remains unmet — unchanged from validation 006.
The handoff 107 changes do not affect the recall ceiling; the bottleneck remains EPMC
pagination, OpenAlex CRIT-1, and McCluskey synonym coverage.

**Session completed:** 2026-08-09
