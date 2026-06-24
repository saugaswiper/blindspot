# Handoff 107 — Fix remaining `AND NOT systematic[sb]` sites in PubMed sibling functions

**Date:** 2026-06-24
**Role:** Dev
**Brief:** `spec/briefs/007.md` (Stage 2 literature search + Stage 3 screening feed)
**Addresses validation:** `spec/validation/006-validation.md` finding **F4 (Medium)** — the
three sibling functions that carried the same ATM-inversion defect that handoff 106 fixed in
`fetchPrimaryStudyIds` only.

---

## 1. Summary

Handoff 106 fixed the binary-`NOT` defect in **one** of four call sites (`fetchPrimaryStudyIds`,
line 276). Validation 006 §5 F4 confirmed the other three still used `AND NOT systematic[sb]`,
which PubMed's Automatic Term Mapping (ATM) silently translates to `AND "systematic"[Filter]` —
i.e. they were **counting/fetching systematic reviews**, the inverse of intent.

This handoff applies the proven binary-`NOT` form (`(query) NOT systematic[sb]`) to all three:

| Function | Line (pre-edit) | Defect it caused |
|----------|------|------------------|
| `countPrimaryStudies` | 124 | Feasibility display + cache showed SR count, not primary-study count |
| `fetchPrimaryStudiesForScreening` | 234 | **Screening workbench received systematic reviews** to screen, not primary studies |
| `countPrimaryStudiesRecent` | 293 | Study-count trend (NEW-2) showed SR growth, not primary-study growth |

`fetchPrimaryStudyIds` (line 276) was already fixed in handoff 106 and was left untouched.
`searchExistingReviews`, `countSystematicReviews`, `countLivingReviews` use intentional
**positive** `systematic[sb]` filters and were left untouched per the brief.

Smallest shippable diff: three filter-string substitutions plus clarifying comments. No
structural, signature, or caller changes.

---

## 2. Files touched

- `lib/pubmed.ts` — three substitutions:
  - Line 124 (`countPrimaryStudies`): `(${query}) AND NOT systematic[sb]${datePart}` → `(${query}) NOT systematic[sb]${datePart}`
  - Line 234 (`fetchPrimaryStudiesForScreening`): `(${query}) AND NOT systematic[sb]` → `(${query}) NOT systematic[sb]`
  - Line 293 (`countPrimaryStudiesRecent`): `(${query}) AND NOT systematic[sb]` → `(${query}) NOT systematic[sb]`
  - Added a one-line provenance comment at each site referencing validation 005 F1 / 006 F4.

No other files changed (no `lib/europepmc.ts`, `lib/openalex.ts`, `app/`, `components/`,
`supabase/`). The only remaining textual `AND NOT systematic[sb]` is in the explanatory comment
inside `fetchPrimaryStudyIds` (describes the historical defect; not an active query).

---

## 3. Behavior change

- **Screening workbench (Stage 3 feed):** `fetchPrimaryStudiesForScreening` now returns primary
  studies (RCTs/trials) for screening instead of systematic reviews. This was the
  highest-priority site — the screening workbench is the product beachhead.
- **Feasibility display + topic-count cache:** `countPrimaryStudies` now counts primary studies.
  Previously-cached SR counts self-correct on TTL eviction (next miss re-fetches the correct
  value); no explicit cache invalidation was needed or done (per brief Scope/Out).
- **Study-count trend (NEW-2):** `countPrimaryStudiesRecent` now counts recent primary studies.

Mechanism (same as handoff 106 / validation 006 probe B2): PubMed parses `(topic) AND NOT
systematic[sb]` as `(topic) AND [systematic]` (ATM drops the unary NOT); the binary form
`(topic) NOT systematic[sb]` is a boolean set-difference ATM cannot rewrite. Validation 006
confirmed the `AND NOT` and `NOT` result sets are fully disjoint (0 overlap).

---

## 4. Acceptance criteria (brief 007)

Live-probe ACs (AC-screen, AC-count, AC-recent, AC-no-inversion) require network calls to
PubMed and are the tester's job in validation 007; this handoff makes the code changes that
satisfy them. Static gate:

- **AC-regression — PASS.** `npx tsc --noEmit --skipLibCheck` exits 0. `npx vitest run` shows
  15 failures / 857 passed — identical to the documented pre-existing baseline (handoff 083 §8);
  zero new failures.

The recall/screening-correctness ACs stay **`claimed`** until the tester verifies them in
validation 007 against external ground truth (per [[CLAUDE]] claimed/verified rule).

---

## 5. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npx eslint lib/pubmed.ts` | clean (0 errors/warnings on touched file) |
| Lint (repo) | `npm run lint` | 444 pre-existing errors, none in `lib/pubmed.ts` — unchanged by this diff |
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 |
| Tests | `npx vitest run` | 857 passed / 15 pre-existing failures (handoff 083 §8); 0 new |
| Build | `npm run build` | ✓ Compiled successfully |

---

## 6. Deferred (out of scope per brief 007)

- EuropePMC cursor pagination (validation 006 F3) — follow-on brief.
- OpenAlex CRIT-1 (`OPENALEX_API_KEY` in Vercel, F2) — ops task.
- Synonym expansion / McCluskey 1991 retrievability (F5) — follow-on brief.
- Fixture re-capture (`scripts/capture-recall-fixture.ts`) — tester/dev post-validation.
- Cache invalidation for previously-cached SR counts — intentionally not done; self-corrects on TTL.

---

## 7. Potentially stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature-search row notes the PubMed filter fix at one site
  (handoff 106); should record that the three sibling functions are now fixed too (handoff 107).
- **[[Data Sources]]** — any description of `countPrimaryStudies` /
  `fetchPrimaryStudiesForScreening` / `countPrimaryStudiesRecent` filter behavior.
- **[[Screening]]** — the screening feed now sources primary studies, not SRs; note the F4 fix.
- **[[Handoff Log]]** — add handoff 107 entry.

All correctness claims remain `claimed` pending validation 007.
