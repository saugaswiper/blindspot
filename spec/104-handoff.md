# Handoff 104 — Full-Text Retrieval: UI Surface + Persistence (AC5 / AC-persist)

**Date:** 2026-06-23
**Brief:** `spec/briefs/003.md` (Full-Text Retrieval: UI Surface and Persistence)
**Addresses:** Brief 003 acceptance criteria **AC5**, **AC5-state**, **AC5-404**, **AC-persist**, **AC7**
**Stage:** 3 (full-text retrieval) — close-out: surfaces + persists the resolution layer

---

## What this run did (one scoped stage)

Brief 003 asks to surface the already-live `/api/fulltext` resolution chain in the screening
workbench and make the resolved URL durable. This run delivers the full non-deferred scope
(AC5 UI + AC-persist) in a **single file** — much smaller than the brief's three-file plan —
because two of the brief's assumptions diverge from the code, and **the code wins**
(per wiki `CLAUDE.md`):

1. **No relational `screening_results` table.** Brief 003 specs a migration
   (`024_fulltext_columns.sql`) adding columns and a `screening/save` route edit. But
   screening results are persisted as a **JSON blob** on `search_results.screening_result`
   (see `app/api/screening/save/route.ts` — it `update({ screening_result: sr })` wholesale).
   The "`screening_results` table (one-result-per-search limit)" is itself a *deferred
   non-blocker* in the Roadmap. So the migration and save-route edits are **not needed and
   would be wrong**: persisting the three `fulltext_*` fields onto the `ScreeningDecision`
   objects and re-saving the blob (the exact pattern `handleOverride` already uses for human
   verdicts) makes them durable for free. **No migration was created; no save-route change.**

2. **The screening UI is `components/ScreeningPanel.tsx`, not `ResultsDashboard.tsx`.**
   Brief 003 names `ResultsDashboard.tsx`, but that component contains no screening-decision
   render path (no `human_decision`/`criterion_results`/`ScreeningDecision` references). The
   include-verdict rows render in `ScreeningPanel.tsx` → `ScreeningResultsTable`.

Net: AC5 and AC-persist collapse into one coherent change in `ScreeningPanel.tsx`.

## Behavior

On screening result rows whose **effective verdict is `include`** (AI `include` or a human
override to `include`, via the existing `effectiveDecision`), a **"Get full text ↓"** button
now appears in the per-row action line (next to the Why?/verdict controls). Clicking it:

- Shows a spinner ("Resolving full text…") and disables the button while in flight
  (AC5-state — double-click is also guarded in `handleGetFulltext`).
- `POST /api/fulltext { doi, pmid }`:
  - **200** → stores `fulltext_url` / `fulltext_source` / `fulltext_fetched_at` on the
    decision, recomputes the result blob, and fire-and-forget saves it via
    `/api/screening/save` (same best-effort pattern as overrides). The button is replaced by
    a labeled chip **"Full text · via {Source} ↗"** linking to the resolved URL (AC5). Source
    display labels: Unpaywall / OpenAlex / Europe PMC / PubMed Central / Upload — mapped at
    render time; the DB stores the raw union value.
  - **404** → a static muted note **"No open-access version found"** (AC5-404). Upload
    fallback (AC6) is intentionally **deferred to brief 004**.
  - **error / no identifier** → a **"Retry full text"** button.
- **Hydration (AC-persist):** rows loaded from the DB whose decision already carries a
  non-null `fulltext_url` render the chip **immediately on mount** — no `/api/fulltext`
  call. Because the chip's URL/source come from the persisted `screening_result` blob, the
  chip survives a full page reload.

`exclude` / `uncertain` rows are unchanged. All styling uses design tokens
(`--success`, `--success-bg`, `--accent`, `--muted`, `--border`) — no hardcoded colors.

## Files touched

| File | Change |
|------|--------|
| `components/ScreeningPanel.tsx` | Import `FulltextSource`. Add `FULLTEXT_SOURCE_LABELS` map + `FulltextControl` component (chip / 404 note / button+spinner). Add `onResolveFulltext` prop + per-row `fulltextState` + `handleGetFulltext` to `ScreeningResultsTable`; render `FulltextControl` on `verdict === "include"` rows. Add `handleResolveFulltext` to the parent panel (calls `/api/fulltext`, writes the three fields onto the decision, persists the blob) and wires it into the table. |

**No** migration, **no** `app/api/screening/save/route.ts` change, **no** `lib/fulltext.ts`,
`app/api/fulltext/route.ts`, or `types/index.ts` change (the `fulltext_*` fields and
`FulltextSource` were already typed by brief 001).

## Gate results

- `npx tsc --noEmit --skipLibCheck` → **clean** (AC-persist-column / AC7 typecheck pass).
- `npm test` (`vitest run`) → **15 failed / 857 passed**, identical to the documented
  pre-existing baseline (Roadmap "15 pre-existing unrelated unit-test failures"; handoff
  083 §8) — **0 new failures** (AC7). Failures are in `study-design`, protocol-filename,
  etc. — unrelated to screening/fulltext. `lib/fulltext.test.ts` passes.
- `npm run build` → **✓ Compiled successfully**; `/api/fulltext` and `/api/screening/save`
  routes present.
- `npx eslint components/ScreeningPanel.tsx` → **clean** (0 problems). NB: repo-wide
  `npm run lint` reports ~444 pre-existing errors in untouched files (e.g. test/type
  fixtures using `@ts-ignore`, `HeroSourceLogos.tsx`); none introduced by this run
  (git tree was clean at start).

## Deferred (not in this run)

- **AC6 / upload fallback** — brief 003 already defers this to **brief 004** (needs a
  Supabase Storage bucket). The 404 path shows a static note, not an upload control.
- The migration `024_fulltext_columns.sql` and `screening/save` edit named in brief 003 are
  **dropped as inapplicable** (see divergence #1) — not deferred, not needed.

## Verification for the tester (validation 004)

- **AC5:** screen a gap to produce ≥1 `include` row with a known-OA DOI → click
  "Get full text" → expect a `Full text · via {Source} ↗` chip with a working href.
- **AC5-state:** spinner visible during the call; no second request on rapid double-click.
- **AC5-404:** a paywalled/no-OA DOI → "No open-access version found" note (no toast/crash).
- **AC-persist:** after resolution, reload the workbench → chip still rendered; confirm
  **no `/api/fulltext` call** fires on reload for already-resolved rows (DevTools Network).
- **AC7:** `npx tsc --noEmit --skipLibCheck` + `npx vitest run` — 15 pre-existing failures
  unchanged.

The full-text retrieval methodology claim ("OA URLs surfaced with persisted provenance")
stays **`claimed`** until validation 004 verifies it.

## Now-stale wiki pages (for the librarian)

- **`Roadmap & Status`** — the Full-text retrieval row says "AC5/AC6 UI/persistence
  deferred"; AC5 + persistence are now shipped (AC6 still deferred → brief 004). Update the
  stage line and the handoff pointer to 104.
- **`Briefs/` mirror of brief 003** (if mirrored) — should note that the migration +
  save-route items were dropped as inapplicable (JSON-blob persistence model), and that the
  UI shipped in `ScreeningPanel.tsx`, not `ResultsDashboard.tsx`.
- Any **Full-Text Retrieval / Screening feature page** — add that included rows now expose a
  "Get full text" → source-chip flow with persisted provenance.
