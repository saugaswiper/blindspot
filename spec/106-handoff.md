# Handoff 106 — PubMed primary-study filter fix (`AND NOT systematic[sb]` → `NOT systematic[sb]`)

**Date:** 2026-06-24
**Role:** Dev
**Brief:** `spec/briefs/005.md` (Stage 2/3 literature search recall)
**Addresses validation:** `spec/validation/005-validation.md` finding **F1 (CRITICAL)** — the
root-cause-corrected fix the 005 report demanded. Supersedes the wrong root cause (RC1
date-truncation) that handoff 105 implemented against (which the tester measured as zero-effect).

---

## 1. Summary

`fetchPrimaryStudyIds` in `lib/pubmed.ts` was issuing `(${query}) AND NOT systematic[sb]`.
Validation 005 (F1) proved PubMed's Automatic Term Mapping (ATM) **silently drops the `NOT`**
from `AND NOT systematic[sb]`, translating it to `AND "systematic"[Filter]` — i.e. it returned
**only systematic reviews**, the exact inverse of intent. Measured: the `AND NOT systematic[sb]`
and `AND systematic[sb]` result sets were 313/313 identical for the Mitchell 2012 query.

Fix: use PubMed's **binary** `NOT` operator (`(${query}) NOT systematic[sb]`) instead of the
malformed `AND NOT`. PubMed honours binary `NOT`; the systematic-review exclusion now works.

This is the single highest-value, smallest-diff fix that moves the validation 005 FAIL. The
already-shipped handoff-105 changes (relevance sort + 2000-record ceiling) are **retained and
now load-bearing** — see §4.

---

## 2. Files touched

| File | Change |
|------|--------|
| `lib/pubmed.ts` | `fetchPrimaryStudyIds` (the recall path): query string `(${query}) AND NOT systematic[sb]${datePart}` → `(${query}) NOT systematic[sb]${datePart}`. Comment block updated to document the F1 root cause and why the 2000 ceiling is required. One-line code change. |

No other files changed. `esearch` signature, `sort`/`retmax` plumbing (handoff 105) untouched.

---

## 3. Behavior (live-network verification, before merge)

I verified the fix directly against NCBI ESearch (not just unit tests), because handoff 105
shipped an unvalidated fix that the tester later measured as zero-effect.

Query: `cognitive behavioral therapy insomnia`, truth set = Mitchell 2012 (PMIDs 16804151,
15451764, 10086433, 16785771, 1888345).

| Query form | ESearch translation | count | truth hits (retmax=2000, relevance) |
|------------|--------------------|-------|--------------------------------------|
| `... AND NOT systematic[sb]` (old/broken) | `... AND "systematic"[Filter]` (NOT dropped) | 313 (SRs only) | 0/5 |
| `... NOT systematic[sb]` (new/fixed) | binary NOT honoured | **3421** (primary studies included) | **4/5** |

Truth-paper relevance positions after the fix: 855, 1179, 1583, 1619 — all beyond the old
200-record cap, so the handoff-105 2000-ceiling + relevance sort **is** required to reach them.
The two fixes compound: filter fix makes the papers present in the set; the ceiling makes them
fetched.

5th paper (1888345, McCluskey 1991) is **not in the topic set at all** — it predates "cognitive
behavioral therapy" terminology and matches only "behavioral therapy". That is RC2 / synonym
expansion (brief 006), out of scope here. Ceiling for this fix is therefore 4/5 = 80% on PubMed
alone, which **beats** brief 005 AC-pubmed (≥3/5) and AC-union (≥60%).

---

## 4. Acceptance criteria status (brief 005)

| AC | Bar | This handoff |
|----|-----|--------------|
| AC-pubmed | PubMed 0/5 → ≥3/5 | ✅ **4/5** measured live (see §3) |
| AC-union | union ≥60% | ✅ likely met (PubMed 4/5 alone = 80%); tester to confirm via harness |
| AC-regression | no new test failures, tsc clean | ✅ 15/872 pre-existing failures unchanged; tsc clean |
| AC-europepmc | EPMC pagination + valid sort | ⬜ **deferred** (see §6) |
| AC-fixture | commit Mitchell fixture | ⬜ **deferred** (see §6) |
| AC-benchmark | recall-benchmark reports ≥60% | ⬜ **deferred** (depends on AC-fixture) |

Per the loop's one-scoped-stage rule, I shipped only the critical blocker (F1). The remaining
ACs are follow-up items, listed in §6.

---

## 5. Gate results

- `npx eslint lib/pubmed.ts` → **clean (exit 0)**. (`npm run lint` reports 444 *pre-existing*
  errors in unrelated files — none in the touched file; unchanged by this diff.)
- `npx tsc --noEmit --skipLibCheck` → **clean**.
- `npx vitest run` → **857 passed, 15 failed** — exactly the pre-existing failures documented in
  handoff 083 §8; **zero new failures**. `lib/primary-study-count.test.ts` (15) and
  `lib/recall-benchmark.test.ts` (14) both pass.
- `npm run build` → **succeeds**.

---

## 6. Deferred (follow-up, not in this run)

1. **Same bug in 3 sibling functions** — `lib/pubmed.ts` still uses the broken `AND NOT
   systematic[sb]` in `countPrimaryStudies` (line ~124), `fetchPrimaryStudiesForScreening`
   (line ~234), and `countPrimaryStudiesRecent` (line ~285). These were explicitly **out of
   brief 005 scope** (count functions + screening fetcher), but they share the F1 defect: they
   currently count/fetch **systematic reviews** as if they were primary studies. `countPrimaryStudies`
   feeds the feasibility/pre-review-decision feature, so this is a real correctness bug worth a
   dedicated brief. **Recommend a follow-up brief to apply the same `AND NOT` → `NOT` fix there**,
   with the same live-network verification. (Note: the screening fetcher is what populates the
   screening workbench — fixing it may change screening inputs, so it needs its own validation.)
2. **EuropePMC pagination + valid sort (F4/F5)** — brief 005 AC-europepmc. The brief's
   `sort=RELEVANCE` is broken (validation 005 F5 returns 0 results); a valid EPMC sort token must
   be identified first. EPMC's date-sorted 200-cap is a genuine RC1 barrier there.
3. **OpenAlex CRIT-1 (F2)** — ops task (add `OPENALEX_API_KEY` to Vercel). Validation 005 measured
   OpenAlex keyless at 4/5 = 80% on the correct production query — **highest-ROI single fix**, but
   it is a human/ops action, not code.
4. **Mitchell 2012 recall fixture (AC-fixture/AC-benchmark)** — capture via
   `scripts/capture-recall-fixture.ts` once EPMC + OpenAlex paths are also fixed, so the committed
   `perSource` reflects real multi-source output rather than PubMed-only.
5. **McCluskey 1991 synonym expansion (F7 / brief 006)** — last-mile for 5/5.

---

## 7. Stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature search row still says "🔴 FAIL (0%) … `fetchPrimaryStudyIds`
  returns SR IDs not primary IDs (PubMed ATM inverts `AND NOT systematic[sb]`)". The PubMed filter
  defect (F1) is now **fixed in code** (pending tester re-validation). PubMed alone measured 4/5
  pre-merge; production union still gated on CRIT-1 (OpenAlex). Keep the claim `claimed`/`measured`
  until validation 006 verifies.
- **[[Data Sources]]** — if it documents the PubMed primary-study query, the exclusion syntax is now
  `(query) NOT systematic[sb]` (binary NOT), and the `AND NOT systematic[sb]` form is documented as
  broken (ATM drops the NOT).
- **[[Milestone — Search Recall & Provenance Benchmark]]** — root cause is the PubMed filter
  inversion (F1), not date-truncation (the superseded 004 RC1).

---

## 8. Notes

- Methodology claim (recall figure) stays **`claimed`/`measured`** until the tester re-runs the
  005 harness against this fix and reports validation 006. Per the loop rules, only the tester
  flips `claimed → verified`.
- No commit/push performed — the runner handles git.
