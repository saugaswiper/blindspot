# Handoff 108 — EuropePMC cursor pagination for `fetchPrimaryStudyIds` (brief 005 residual / validation 006 F3)

**Date:** 2026-08-09
**Role:** Dev
**Brief:** `spec/briefs/005.md` — "Search Recall: Relevance Sort + Comprehensive Pagination"
(the **EuropePMC** item, `AC-europepmc`).
**Addresses validation:** `spec/validation/006-validation.md` finding **F3 (High — Carried,
005 F4)** — EuropePMC `fetchPrimaryStudyIds` still on the old single-page, 200-record path,
returning 0/5 on the Mitchell 2012 truth set. Cursor mechanism confirmed viable in validation
006 probe C2 (nextCursorMark advances, no infinite loop).

---

## 1. Summary

Brief 005 lists five edits. Handoff 105 shipped only the PubMed relevance-sort fix and
**explicitly deferred** the EuropePMC and OpenAlex pagination (handoff 105 §"Deferred"). Handoffs
106–107 fixed PubMed filter inversion only. The EuropePMC portion — an open validation FAIL
(006 F3) — was never picked up. Per the loop's work-selection rule (a fix-brief item for a
validation FAIL outranks feature work; one scoped stage per run), this run implements the
**single smallest shippable residual: EuropePMC cursor pagination**.

`lib/europepmc.ts` `fetchPrimaryStudyIds` previously issued one `/search` call
(`pageSize=min(limit,1000)`, no deep-paging), so with the production 200-record window the
1991–2006 Mitchell truth papers — buried past the first page of a ~1 994-record result set —
were never fetched → 0/5 recall (validation 004/005/006 C1).

The fix replaces the single fetch with a **cursorMark deep-pagination loop** up to a `limit`
ceiling (default raised 200 → 2000 per brief), so a high-limit caller (harness, capture script,
recall pipeline) retrieves the complete result set and recovers the older truth papers.

OpenAlex pagination, the Mitchell fixture commit, and the `recall-benchmark.test.ts` guard flip
(the other brief-005 residuals) are **deferred** — see §6.

---

## 2. Files touched

- `lib/europepmc.ts` — one function rewritten plus a one-field interface addition:
  - `EuropePMCResponse` interface: added `nextCursorMark?: string` (the deep-paging token
    Europe PMC returns on the `/search` endpoint).
  - `fetchPrimaryStudyIds`: default `limit` `200 → 2000`; single fetch → cursorMark loop.
    Loop starts at `cursorMark="*"`, requests `pageSize=min(limit-collected, 1000)` per page,
    accumulates PMIDs/DOIs, and advances `cursorMark` to the response's `nextCursorMark`. Stops
    when the ceiling is reached, a page is empty, or the cursor stops advancing (Europe PMC
    echoes the same `nextCursorMark` on the final page). A `maxPages = ceil(limit/1000)+3`
    guard makes an infinite loop impossible even if the cursor misbehaves. Result is
    `.slice(0, limit)`-capped.

No other files changed. `app/`, `components/`, routes, `lib/openalex.ts`, `lib/pubmed.ts`,
`lib/scopus.ts`, tests, and fixtures were **not** touched (brief 005 excludes `app/`/route
changes; the 200-record dedup call in `app/api/search/route.ts:351` is intentional and stays).

---

## 3. Behavior change

- **High-limit callers** (`scripts/capture-recall-fixture.ts --limit 2000`, the recall
  validation harness, any future recall pipeline): EuropePMC now returns the full result set up
  to 2 000 records instead of a single ~200/1000-record page. On the Mitchell 2012 query
  (~1 994 total records) the loop makes 2 requests and collects the entire set, so the
  previously-buried 1991–2006 truth papers are now retrievable. **Expected: EuropePMC hits/truth
  0/5 → up to 4/5** (McCluskey 1991 remains unretrievable per validation 006 F5 / RC2) — to be
  confirmed by the tester in validation 007.
- **Production dedup call** (`route.ts` passes `limit=200`): behavior is effectively unchanged —
  the loop makes a single page-1 request of ≤200 records via `cursorMark="*"`, same records used
  for cross-source overlap estimation. No added wall-clock latency for the common path.

Union-recall note (validation 006 §4.8): on *this* truth set EuropePMC adds 0 net papers because
the 4 it can recover are the same 4 PubMed already returns. The fix still matters — it resolves
the F3 FAIL, removes a source-level 0/5 correctness defect, and raises recall on any future truth
set where EuropePMC (a PubMed superset + European literature) holds papers the others miss.

---

## 4. Deviation from the brief (documented for the librarian/tester)

Brief 005 step (2) for EuropePMC said "add `url.searchParams.set("sort", "RELEVANCE")`". **This
run does not add an explicit `sort` param.** Rationale:

1. **Correctness is guaranteed by full pagination, not sort order.** With the ceiling (2 000) ≥
   total (~1 994), the loop fetches the *entire* result set, so every retrievable truth paper is
   collected regardless of ordering. Sort only matters when the window is smaller than the set.
2. **cursorMark deep-paging was verified to work *without* a sort param** in validation 006 probe
   C2 (cursor advances, no infinite loop). Europe PMC's default `/search` ordering is relevance
   score — you obtain relevance ranking by *omitting* `sort`. `RELEVANCE` is not a documented
   Europe PMC sort keyword (its sort fields are `P_PDATE_D`, `CITED`, `AUTH_FIRST`, …); passing an
   unverified value risked altering or breaking cursor paging with no live-network way to confirm
   here.

The brief's intent — recover the buried truth papers via relevance-ranked, comprehensive
pagination — is met. If the tester finds the default ordering leaves a gap at limits *below* the
total, adding a validated sort field is a clean follow-up.

The brief's `page=2&pageSize=1000` fallback was also unnecessary: validation 006 C2 already
confirmed `nextCursorMark` is present and advances, so the cursor path is used directly.

---

## 5. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 (clean) |
| Lint (file) | `npx eslint lib/europepmc.ts` | exit 0 (0 errors/warnings) |
| Lint (repo) | `npm run lint` | pre-existing errors only; `lib/europepmc.ts` not among them — unchanged by this diff |
| Tests | `npm test` (`npx vitest run`) | 860 passed / 12 failed (872 total). All 12 are pre-existing failures in unrelated files (`boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`, `protocol-storage`, `study-design`, `use-persistent-*`); the count sits at 12–15 run-to-run because several are date/time-sensitive. **No EuropePMC test exists; zero new failures.** |
| Build | `npm run build` | ✓ Compiled successfully in 4.1s |

Live-network ACs (AC-europepmc: ≥1 000 records, hits 0/5 → ≥2/5; AC-union) require calls to the
Europe PMC API and are the tester's job in validation 007; this handoff makes the code change
that satisfies them. The recall claim stays **`claimed`** until verified against external ground
truth (per [[CLAUDE]] claimed/verified rule).

---

## 6. Deferred (out of scope this run — remaining brief 005 residuals + carried findings)

- **OpenAlex `fetchPrimaryStudyIds` cursor pagination + limit 2000** (brief 005) — same pattern,
  separate source; next dev run. CRIT-1 (`api_key` 401) also gates OpenAlex's production
  contribution (validation 006 F2, ops task).
- **Mitchell 2012 fixture commit into `REAL_RECALL_FIXTURES`** (brief 005 AC-fixture) — should be
  captured via `scripts/capture-recall-fixture.ts` *after* the OpenAlex fix lands, so the
  `perSource` JSON reflects all fixed sources at once (avoids a premature partial capture).
- **`recall-benchmark.test.ts` `toEqual([])` guard flip** (brief 005 AC-benchmark) — must land
  together with the fixture commit or the suite breaks; deferred with it.
- **Synonym expansion / McCluskey 1991** (validation 006 F5, RC2) — follow-on brief.
- **OpenAlex CRIT-1** (validation 006 F2) — ops task, not code.

---

## 7. Potentially stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Literature-search row: record that EuropePMC `fetchPrimaryStudyIds`
  now uses cursorMark deep-pagination (was single-page 200-record, 0/5). Brief 005 is no longer
  PubMed-only; the EuropePMC residual (006 F3) is now addressed in code (validation pending).
- **[[Data Sources]]** — EuropePMC `fetchPrimaryStudyIds` behavior: cursorMark loop up to a
  2 000-record ceiling; production dedup call still 200 (route-level, intentional).
- **[[Milestone — Search Recall & Provenance Benchmark]]** — the EPMC date-truncation root cause
  (006 F3) now has a code fix; awaiting tester re-measurement (validation 007).
- **[[Handoff Log]]** — add handoff 108.

All recall/correctness claims remain `claimed` pending validation 007.
