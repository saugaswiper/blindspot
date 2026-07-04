# Handoff 108 — EuropePMC `fetchPrimaryStudyIds` cursor pagination (recall fix)

**Date:** 2026-07-04
**Role:** Dev
**Brief:** none open — all briefs 001–007 are implemented (004 deferred). Work selected per the
[[Autonomous Loop]] work-selection rule: the top **unblocked** correctness fix on the shipped
literature-search stage outranks new-feature work.
**Addresses validation:** `spec/validation/006-validation.md` finding **F3 (High — Carried,
005 F4)** and recommended next step §8.2 — "implement a cursorMark loop in `lib/europepmc.ts`
`fetchPrimaryStudyIds` to fetch up to 2000 records."

---

## 1. Summary

EuropePMC returns records in date-sorted (newest-first) order by default. `fetchPrimaryStudyIds`
fetched a **single page** (caller passes `limit=200` → ~185 records), so for the Mitchell 2012
truth set the 1991–2006 included RCTs — which sit in pages 8–10 of the ~1994-record result set —
were never returned (**0/5 EuropePMC recall**, validation 006 probe C1).

Validation 006 probe C2 confirmed EuropePMC's `cursorMark` paging API is viable: the cursor
advances between pages with no infinite loop. This handoff wires that mechanism into the
production function so EuropePMC can page through its full result set and contribute the older
truth papers to the union.

Smallest shippable change: replace the single-page fetch with a `cursorMark` loop and raise the
default `limit` from 200 → 2000 to mirror PubMed's established ceiling (handoff 105). One file.

---

## 2. Files touched

- `lib/europepmc.ts` — `fetchPrimaryStudyIds` only:
  - Default `limit` param `200` → `2000` (mirrors PubMed `fetchPrimaryStudyIds`, handoff 105).
  - Single-page `fetch` replaced with a `cursorMark` pagination loop: start at the sentinel
    `"*"`, request `pageSize = Math.min(limit, 1000)` (EuropePMC per-page max is 1000), append
    each page's records, follow `nextCursorMark`, and stop when `limit` records are collected or
    the result set is exhausted (empty page, missing cursor, or cursor that does not advance).
  - Return trimmed to `records.slice(0, limit)`.
  - Docstring updated to document the date-sort truncation, validation 006 F3, and the paging
    strategy.

No other files changed (no `lib/pubmed.ts`, `lib/openalex.ts`, `lib/scopus.ts`, `app/`,
`components/`, `supabase/`). Same function signature and return shape; callers unchanged.

---

## 3. Behavior change

- **EuropePMC recall path:** `fetchPrimaryStudyIds` now pages through up to 2000 records instead
  of returning only the first ~185. Older primary studies beyond the first date-sorted page are
  now reachable, which is required to recover the 1991–2006 Mitchell 2012 truth papers.
- **Dedup sampling path is unaffected:** `app/api/search/route.ts:351` calls this function with an
  **explicit `limit=200`**, so it still fetches a single 200-record page for the deduplication
  fraction estimate — no added latency or behavior change on that path. Only callers that rely on
  the default (recall/fixture capture) get the full paginated set.
- **Cost/latency:** at `pageSize=1000` a full 2000-record fetch is 2 API round-trips (vs 1
  before) on the default-limit path; the 200-limit dedup path remains 1 round-trip.

Mechanism: EuropePMC's `cursorMark` starts at `"*"`; each response returns `nextCursorMark` for
the following page. The loop's three termination guards (empty page / absent cursor / cursor that
equals the current one) prevent an infinite loop even if the API stops advancing — matching the
"cursor advances, no infinite loop" behavior the tester verified in validation 006 probe C2.

---

## 4. Acceptance / expected outcome

There is no open brief with formal ACs for this fix; the target is validation 006 F3. The
recall improvement requires live EuropePMC network calls and is the tester's job (validation 007).
Expected outcome when re-measured against the Mitchell 2012 truth set:

- EuropePMC paginated recall should rise from **0/5** (single page) toward the paginated ceiling
  the tester estimated (truth papers expected in pages 8–10 of the date-sorted set).
- Production union (PubMed_NEW + EuropePMC_paginated) recall should be **≥ 80%** and should no
  longer depend on PubMed alone for the union floor.

These remain **`claimed`** until validation 007 verifies them against external ground truth (per
[[CLAUDE]] claimed/verified rule). Static regression gate is green (§5).

---

## 5. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Lint (file) | `npx eslint lib/europepmc.ts` | clean (0 errors/warnings on touched file) |
| Lint (repo) | `npm run lint` | 444 pre-existing errors (in `.claude/worktrees`, `spec/*` harnesses, test scaffolding); none in `lib/europepmc.ts` — unchanged by this diff |
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 |
| Tests | `npx vitest run` | 857 passed / 15 pre-existing failures (handoff 083 §8; date/timezone + persistent-hook suites); 0 new; none in europepmc |
| Build | `npm run build` | ✓ Compiled successfully in 5.0s |

---

## 6. Deferred (out of scope for this stage)

- OpenAlex CRIT-1 (`OPENALEX_API_KEY` in Vercel, validation 006 F2) — ops task; keyless `mailto`
  already delivers 4/5. Highest-ROI single fix but requires ops action, not code.
- Synonym expansion / McCluskey 1991 retrievability (validation 006 F5) — follow-on brief;
  the paper is structurally unretrievable by any source with the current query.
- OpenAlex `fetchPrimaryStudyIds` still fetches a single 200-record page (no cursor) — its
  keyless path already returns 4/5 within 200 records, so pagination there is low-value; left
  as-is. (Its sibling `fetchPrimaryStudiesForScreening` already cursor-paginates.)
- Fixture re-capture (`scripts/capture-recall-fixture.ts`) — tester/dev post-validation.

---

## 7. Potentially stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature-search row: record that EuropePMC `fetchPrimaryStudyIds`
  now cursor-paginates (validation 006 F3 addressed in code; awaiting validation 007). The row
  currently notes EuropePMC as "0/5 on the date-sorted cap".
- **[[Data Sources]]** — EuropePMC retrieval description: `fetchPrimaryStudyIds` now pages up to
  2000 records via `cursorMark` (default limit raised 200 → 2000), no longer single-page.
- **[[Milestone — Search Recall & Provenance Benchmark]]** — the EuropePMC per-source recall
  figure will change once validation 007 re-measures the paginated path.
- **[[Handoff Log]]** — add handoff 108 entry.

All recall claims remain `claimed` pending validation 007.
