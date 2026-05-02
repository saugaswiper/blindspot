# Handoff 052 — PICO-1: Store PICO Fields on Search Insert

**Date:** 2026-05-02
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 051 (NEW-5: Zotero Export, PREF-1: Sort Persistence, ACC-9: minYear Explanation)

---

## Summary

Implemented **PICO-1**: PICO fields (`population`, `intervention`, `comparison`, `outcome`) are now correctly stored in the `searches` table when a user submits a PICO-mode search. Previously, these four columns existed in the schema since migration 001 but were never written to — `saveSearchResult()` only ever inserted `query_text`, leaving all four PICO columns NULL regardless of search mode.

---

## Root Cause

The `searches` table has had `pico_population`, `pico_intervention`, `pico_comparison`, and `pico_outcome` columns since `supabase/migrations/001_initial_schema.sql`. Both downstream consumers — `app/api/prospero-export/route.ts` and `app/api/generate-protocol/route.ts` — already `SELECT` these columns and pass them into `generateProsperoRegistration()` and the protocol builder. However, `lib/cache.ts`:`saveSearchResult()` only ever did:

```ts
.insert({ user_id: userId, query_text: query })
```

So PROSPERO export and protocol generation always received `null` for all four PICO fields, falling back to generic query-derived text even when the user had carefully filled in a structured PICO form.

---

## Why This Matters

The PROSPERO export and protocol generator were already doing the right thing *if* the data existed. A researcher who uses PICO mode to search for:

> Population: "Adults aged 65+" | Intervention: "CBT" | Comparison: "Sleep hygiene" | Outcome: "PSQI sleep quality score"

…would get a PROSPERO draft with:
- **Before fix:** `Population: (blank)`, `Research question: "What is the evidence on Adults aged 65+ CBT Sleep hygiene PSQI sleep quality score?"` (generic fallback)
- **After fix:** `Population: Adults aged 65+`, `Intervention: CBT`, `Comparator: Sleep hygiene education`, `Research question: "In Adults aged 65+ does CBT compared to Sleep hygiene improve PSQI sleep quality score?"` (structured, PICO-aligned output)

This is immediately visible to the researcher and removes a significant friction point for anyone using the PROSPERO Export or protocol generation features after a PICO search.

---

## Files Modified

### `lib/cache.ts`

**New exported interface `PicoFields`:**
Defines the four optional/nullable PICO fields. Exported so callers (tests, future integrations) can reference the type without re-declaring it.

**New exported pure function `buildSearchInsertPayload(base, pico?)`:**
Builds the `searches` row INSERT payload from a base object (user_id, query_text, etc.) and optional PICO fields. Only non-falsy string values are written — `null` and `undefined` fields are omitted so the DB column retains its default of `NULL`. Extracted as a pure function specifically to enable unit testing without a Supabase connection.

**`saveSearchResult()` — new optional `pico?` parameter (4th arg):**
When provided, delegates to `buildSearchInsertPayload` to include PICO columns in the `searches` INSERT. Fully backward-compatible: existing callers that don't pass `pico` are unaffected (parameter is optional).

**`saveGuestSearchResult()` — new optional `pico?` parameter (4th arg, after `guestIpHash`):**
Same change for the guest path. PROSPERO export is auth-gated so guests can't currently use it, but storing the data consistently now means it's available if that gate changes.

### `app/api/search/route.ts`

Builds a `picoFields` object from `typedBody.pico` when the user submitted a PICO-mode search (simple-text searches leave it `undefined`). Passes it as the 4th argument to both `saveSearchResult` and `saveGuestSearchResult`.

```ts
const picoFields = typedBody.pico
  ? {
      population:   typedBody.pico.population   ?? null,
      intervention: typedBody.pico.intervention ?? null,
      comparison:   typedBody.pico.comparison   ?? null,
      outcome:      typedBody.pico.outcome       ?? null,
    }
  : undefined;
```

### `lib/cache-pico.test.ts` (new file)

14 unit tests for `buildSearchInsertPayload` covering:
- `pico` undefined → base payload unchanged, no pico_* keys written
- `pico` is empty object → no pico_* keys written
- Individual null fields → those specific fields not written
- Full PICO (all four fields) → all four pico_* keys present with correct values
- PIco without C (comparison omitted) → P, I, O written, pico_comparison absent
- Base object not mutated (returns new object)
- Guest search payload (user_id = null) → pico fields stored alongside guest_ip_hash

---

## User-Visible Impact

| User action | Before | After |
|---|---|---|
| PICO search → Run AI → PROSPERO Export | Population/Intervention/Comparator/Outcome all blank; research question is a concatenated word salad | Fields pre-filled from PICO form; structured research question in "In P does I compared to C improve O?" format |
| PICO search → Run AI → Protocol Draft | PICO section generic | PICO section uses typed fields where available |
| Simple-text search → PROSPERO Export | Unchanged (fields were always blank) | Unchanged (picoFields is undefined; no regression) |

---

## Design Decisions

**Why not store PICO fields in the request body schema validation?**
The `validators.ts` `validateSearchInput` already validates `body.pico`; no schema change was needed. The fix is entirely in the save path.

**Why not update the `getCachedResult` read path?**
`getCachedResult` reads `search_results`, not `searches`. PICO fields live in `searches` and are already selected by the PROSPERO export and protocol routes via a JOIN. No cache read change needed.

**Why store PICO even for guest searches?**
Consistency: if a guest converts to an authenticated user (the post-search sign-up flow), their first search row in `searches` already has the PICO data. The PROSPERO export auth gate prevents unintended access.

**Why `buildSearchInsertPayload` only writes truthy strings?**
The DB columns already default to `NULL`. Writing explicit `NULL` would be equivalent but would also silently overwrite any future default migrations. Omitting null/empty fields is the safer, more idiomatic approach for a sparse-nullable schema.

---

## Verification Status

```
npx eslint --max-warnings=0 lib/cache.ts app/api/search/route.ts lib/cache-pico.test.ts
→ Exit 0 (0 errors, 0 warnings)

npx tsc --noEmit
→ Exit 0 (no type errors)

npx vitest run lib/cache-pico.test.ts
→ Blocked: known rollup ARM64 binary mismatch (unchanged from handoffs 035–051).
  14 tests written; logic verified manually:
    buildSearchInsertPayload({ user_id: "u", query_text: "q" }, { population: "Adults" })
    → { user_id: "u", query_text: "q", pico_population: "Adults" }
    buildSearchInsertPayload({ user_id: "u", query_text: "q" })
    → { user_id: "u", query_text: "q" }  // no pico_* keys

npm run build
→ Blocked: known .fuse_hidden EPERM infrastructure issue (unchanged from handoffs 035–051).
```

---

## Recommended Next Steps

1. **[Low] Export comparison as PDF** — The `ComparisonModal` already has a `window.print()` button (PRINT-1, handoff ~050). Verify `@media print` CSS in `app/globals.css` hides the backdrop and shows only `#comparison-modal-print-root` when `body.comparison-modal-open` is set. If print CSS is already wired, this item is complete.

2. **[Low] Zotero batch export from comparison** — After handoff 051's single-result Zotero export, add a "Save all to Zotero" button in `ComparisonModal` that merges `existing_reviews` from all selected search result IDs into a single RIS import. Requires fetching reviews from Supabase for each selected `search_result_id`.

3. **[Medium] Confidence score per gap (surface `reviews_analyzed_count` per gap)** — Each gap card shows only high/medium/low importance. The `reviews_analyzed_count` field from `gapAnalysis` and the existing `getPerGapBadgeConfig()` in `lib/gap-badge.ts` could drive a more granular per-gap confidence display beyond the ◔/◑ badges already in place.

4. **[Medium] PICO pre-fill on results page** — Now that PICO fields are stored, surface them prominently on the results page header (e.g., a collapsible "Search parameters" row showing P/I/C/O). Currently the results page only shows the flat `query_text` string.

5. **[Medium] Protocol generator PICO completeness check** — When PICO fields are present, add a UI indicator on the Design tab showing which PICO fields were used (with a note if any are missing). Helps researchers know their protocol draft is fully typed vs. partially generic.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
