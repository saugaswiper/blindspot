# Handoff 108 — EuropePMC cursorMark pagination in `fetchPrimaryStudyIds`

**Date:** 2026-07-12
**Role:** Dev
**Addresses validation:** `spec/validation/006-validation.md` finding **F3 (High — carried from 005 F4)**
— EuropePMC date-sorted truncation: production returns 185 records (single page), 0/5 recall on
the Mitchell 2012 truth set because the 1991–2006 papers sit deep (~pages 8–10) in a ~1994-record
set. Validation 006 §4.5 confirmed the cursorMark mechanism is viable (cursor advances, no infinite
loop) but that full pagination is required to reach them. This handoff implements that pagination.

No open brief in `spec/briefs/` was unimplemented (001–007 are all shipped/superseded — see §7;
`deferred-004` is ops-blocked on a Supabase Storage bucket). Per the loop's work-selection rule
("a fix for a validation FAIL outranks feature work; skip ops-blocked items, take the highest-value
unblocked one"), the tester's explicit dev recommendation #2 (F3, unblocked, scoped) was selected
over CRIT-1/F2 (ops) and F5 synonym expansion (unscoped/research).

---

## 1. Summary

`lib/europepmc.ts` `fetchPrimaryStudyIds` previously issued a **single** `search` request with
`pageSize = min(limit, 1000)`. EuropePMC caps `pageSize` at 1000, so any request for a set larger
than one page — or one whose relevant records sit beyond the first page under EuropePMC's default
ordering — silently truncated. That is validation 006 F3.

The fix replaces the single request with a **cursorMark pagination loop**: `cursorMark=*` starts the
cursor, and each response's `nextCursorMark` drives the next page until `limit` records are
collected or the result set is exhausted. This is the standard EuropePMC deep-paging API and the
exact mechanism validation 006 §4.5 (probe C2) confirmed works.

Smallest shippable diff: one function body in one file. No signature, caller, or type changes.

---

## 2. Files touched

- `lib/europepmc.ts` — `fetchPrimaryStudyIds` only:
  - Replaced the single `fetch` with a `while (results.length < limit)` cursorMark loop.
  - Each iteration sets `cursorMark` on the query URL; reads `nextCursorMark` + `resultList.result`
    from the response.
  - Termination guards (prevent infinite loop): stop when the page is shorter than `pageSize`
    (end of results), or `nextCursorMark` is absent/equal to the current cursor.
  - Returns `results.slice(0, limit)`.
  - Added an explanatory comment referencing validation 006 F3.

No other files changed. No changes to `search()`, `countPrimaryStudies`, `searchExistingReviews`,
or `countSystematicReviews` in the same file, nor to `lib/pubmed.ts`, `app/`, `components/`,
`supabase/`.

---

## 3. Behavior change

- **Recall-fixture capture (the exercised consumer):** `scripts/capture-recall-fixture.ts` passes
  its `--limit` (default 500, settable to 2000) straight through to `europepmcIds`. With a single
  page this could never reach EuropePMC's deep truth papers; with cursor pagination and
  `--limit 2000` the capture now retrieves up to 2000 records across pages, so the EuropePMC recall
  measurement becomes honest (previously capped at one page). This is the direct value of the fix:
  it unblocks accurate Stage-3 recall benchmarking for EuropePMC.
- **Production search route (`app/api/search/route.ts:351`):** calls with `limit = 200` for
  cross-source **dedup overlap estimation** (intentional; ~±5% precision). Because 200 ≤ one page,
  the loop makes exactly **one** request and the short-page guard exits immediately — **behavior and
  latency are identical to before**. No production regression, no extra network round-trips for the
  200-record path.

Mechanism: EuropePMC's `cursorMark` is a stable deep-paging token. Unlike offset paging it does not
skip/duplicate records under concurrent index updates, so paging to record ~1994 is reliable.

---

## 4. Scope

### In
- cursorMark pagination for `fetchPrimaryStudyIds` up to the caller's `limit`.

### Out / deferred
- Raising the production **recall** limit for EuropePMC (the 200 dedup call is intentional; a
  dedicated recall caller would pass a higher limit) — no such production recall path exists yet.
- EuropePMC **sort** tuning (relevance vs date) — not needed once the full set is paged; left as-is.
- OpenAlex CRIT-1 / `OPENALEX_API_KEY` (validation 006 F2) — ops task.
- Synonym expansion / McCluskey 1991 retrievability (validation 006 F5) — follow-on brief; the only
  truth paper missed by all sources, and the only remaining path to >80% on Mitchell 2012.
- Re-capturing the Mitchell 2012 fixture with `--limit 2000` — tester/dev post-validation step.

---

## 5. Acceptance criteria

There is no brief-defined AC for F3; the tester's F3 recommendation is the target ("implement a
cursorMark loop … to fetch up to 2000 records"). Live-network recall verification is the tester's
job in the next validation. Static gate:

- **AC-regression — PASS.** `npx tsc --noEmit --skipLibCheck` exits 0. `npx vitest run` shows
  15 failures / 857 passed — identical to the documented pre-existing baseline (handoff 083 §8);
  zero new failures. `npx eslint lib/europepmc.ts` is clean.

The recall claim ("EuropePMC contributes deep primary studies to the union") stays **`claimed`**
until the tester re-captures the fixture and measures it against external ground truth (per
[[CLAUDE]] claimed/verified rule). Note: validation 006 §4.8 measured **0 additive recall** from
EuropePMC on the Mitchell 2012 set (its retrievable papers overlap PubMed's), so this fix is
expected to help **generalization to other topics** (EuropePMC is a PubMed superset with European
literature) and **fixture honesty**, not the Mitchell 2012 number.

---

## 6. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Lint (file) | `npx eslint lib/europepmc.ts` | clean (0 errors/warnings on touched file) |
| Lint (repo) | `npm run lint` | 444 pre-existing errors, none in `lib/europepmc.ts` — unchanged by this diff |
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 |
| Tests | `npx vitest run` | 857 passed / 15 pre-existing failures (handoff 083 §8); 0 new |
| Build | `npm run build` | ✓ Compiled successfully in 7.1s |

---

## 7. Brief status at time of this run (why F3 was chosen)

| Brief | Status |
|-------|--------|
| 001, 002 | Full-text resolution chain — shipped (handoffs 102–103) |
| 003 | Full-text UI surface + persistence — shipped (handoff 104) |
| deferred-004 | Upload fallback — **ops-blocked** (needs Supabase Storage bucket) |
| 005 | PubMed relevance sort + 2000-record ceiling — shipped (handoff 105); filter fix (106) |
| 006 | PubMed SR-exclusion filter — **superseded**: goal met via binary `NOT systematic[sb]` (handoffs 106/107), verified at 80% by validation 006. Re-applying its `[pt]` string would churn a verified fix; not implemented. |
| 007 | Sibling `AND NOT` sites — shipped (handoff 107) |

No unimplemented unblocked brief → fell back to the top unblocked validation FAIL (F3).

---

## 8. Potentially stale wiki pages (for the librarian)

- **[[Data Sources]]** — EuropePMC `fetchPrimaryStudyIds` now deep-pages via cursorMark up to the
  caller's `limit` (was a single ≤1000-record page). Note the production dedup path (200) is
  unchanged.
- **[[Roadmap & Status]]** — Literature-search row / validation 006 F3: cursorMark pagination now
  implemented (was "cursor mechanism viable but not implemented"). Recall claim remains `claimed`
  pending tester re-capture; Mitchell 2012 additive recall still expected 0 (papers overlap PubMed).
- **[[Milestone — Search Recall & Provenance Benchmark]]** — EuropePMC recall measurement is no
  longer single-page-capped; fixture should be re-captured with `--limit 2000`.
- **[[Handoff Log]]** — add handoff 108 entry.

All correctness/recall claims remain `claimed` pending the next validation.
