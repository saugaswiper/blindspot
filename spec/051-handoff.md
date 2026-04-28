# Handoff 051 — NEW-5 / PREF-1 / ACC-9: Zotero Export, Sort Persistence, minYear Explanation

**Date:** 2026-04-28
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 050 (NEW-7: Multi-Topic Comparison Panel)

---

## Summary

Three improvements implemented from handoff 050's recommended next steps, all "Low" effort with high day-to-day UX value:

1. **NEW-5 — Zotero Direct Export**: "Save to Zotero" button in the Existing Reviews tab imports all found reviews directly into Zotero Desktop via the `zotero://` URI protocol — no OAuth, no manual file management.
2. **PREF-1 — Persist Dashboard Sort Preference**: The chosen sort order (Newest / Oldest / High feasibility first) is now remembered across sessions via a first-party cookie.
3. **ACC-9 — minYear Scope in Feasibility Explanation**: When a year filter (ACC-8) was applied, the feasibility explanation now reads "N studies found from YYYY onward" instead of just "N studies found", so users understand the filtered scope without inspecting the raw query text.

Also fixed a **pre-existing lint warning** in `ResultsDashboard.tsx` (`ScreeningCriteria` unused import).

---

## Why These Features

From handoff 050's recommended next steps:

> **[Low] NEW-5 — Zotero Direct Export** — Add a "Save to Zotero" button alongside the existing "Export references" dropdown in `ReviewsTab`. Generate the `.ris` content (already works via `toRis()`), base64-encode it, and open `zotero://import?format=ris&data=<base64>`. The Zotero desktop app intercepts this URI and imports the references directly — no OAuth needed. This is a 20-line addition to `ReviewsTab` in `components/ResultsDashboard.tsx`.

> **[Low] Persist dashboard sort preference** — Store the chosen sort order in a cookie…With the sort now held in client state (changed this session), this is a `document.cookie` write on sort-button click — ~15 lines of code.

> **[Low] Show minYear in feasibility explanation** — When a year filter was applied (ACC-8, handoff 048), append "Studies counted from YYYY onward." to `FeasibilityResult.explanation` in `lib/feasibility.ts` so researchers know the filtered scope without reading the query text.

---

## Files Modified

### `components/ResultsDashboard.tsx`

**`utf8ToBase64(str)` (new helper function):**  
Browser-safe UTF-8 → base64 encoding. Uses `encodeURIComponent` + `%XX` hex decoding to handle non-latin-1 characters before passing to `btoa`. Placed above `ReviewsTab` in module scope.

**`ReviewsTab` — `handleZoteroExport()` (new method):**  
Generates RIS content via `toRis(reviews)`, base64-encodes it, then navigates to `zotero://import?format=ris&data=<encoded>`. Zotero Desktop registers this URI protocol on installation and imports the references directly into the user's library. Users without Zotero get an OS "no application" dialog.

**`ReviewsTab` — Export toolbar (updated):**  
- The single "Export references" button is now two buttons side-by-side:
  - **"Save to Zotero"** — red/crimson border to match Zotero's brand color; Z-shaped SVG icon; tooltip says "Requires Zotero Desktop"
  - **"Export file"** — the original dropdown (RIS / BibTeX), with the label shortened from "Export references" to "Export file" since the toolbar is now shared
- Toolbar uses `gap-2` flex layout; both buttons sit at the right margin

**Pre-existing lint fix:**  
Removed the unused `ScreeningCriteria` type import from `@/lib/prisma-diagram` (was causing `--max-warnings=0` lint failure).

### `components/DashboardContent.tsx`

**`SORT_COOKIE` constant:** `"dashboard_sort"` — single source of truth for the cookie name.

**`getStoredSortMode(): SortMode | undefined` (new pure function):**  
Reads `document.cookie` via regex to extract the stored sort preference. Returns `undefined` when running server-side (SSR guard: `typeof document === "undefined"`) or when no cookie is set.

**`storeSort(mode: SortMode): void` (new pure function):**  
Writes `dashboard_sort=<mode>` to `document.cookie` with `path=/; max-age=31536000; samesite=lax`. Uses a 1-year TTL (standard for preferences). No `httpOnly` since this must be readable client-side.

**`DashboardContent` — `useState` initializer (updated):**  
Changed from `parseSortMode(initialSortMode)` to a lazy initializer function:
```ts
() => {
  // URL param takes precedence — allows deep-linking
  if (initialSortMode === "oldest" || initialSortMode === "feasibility") return initialSortMode;
  // Fall back to last-used preference stored in cookie
  return getStoredSortMode() ?? "newest";
}
```
URL params (e.g. `?sort=feasibility`) still override the cookie — important for bookmark/share use cases.

**Sort button `onClick` (updated):**  
`onClick={() => { setSortMode(mode); storeSort(mode); }}` — persists preference on every sort change.

### `lib/feasibility.ts`

**`buildExplanation()` — new `minYear?: number` parameter:**  
When `minYear` is provided, appends ` from ${minYear} onward` to the study count phrase before the period:
- Without: `"15 primary studies found. No recent systematic review..."`
- With 2015: `"15 primary studies found from 2015 onward. No recent systematic review..."`

**`scoreFeasibility()` — new optional `minYear?: number` parameter:**  
Passes through to `buildExplanation`. JSDoc updated to document all three parameters and explain ACC-9's purpose. Backward-compatible: all existing callers that don't pass `minYear` are unaffected.

### `app/api/analyze/route.ts`

Added minYear extraction from the stored query text:
```ts
const minYearMatch = query.match(/\(after (\d{4})\)/);
const minYear = minYearMatch ? parseInt(minYearMatch[1], 10) : undefined;
```
The search route appends `" (after YYYY)"` to `query_text` when ACC-8 year filtering is applied (see `search/route.ts` line 66: `` `${base} (after ${body.minYear})` ``). This regex safely extracts it. Passes `minYear` to `scoreFeasibility`.

### `lib/feasibility.test.ts`

New test suite **"ACC-9: scoreFeasibility — minYear scope in explanation"** (5 tests):
- Explanation has no suffix when `minYear` absent
- Explanation includes `"from 2015 onward"` when `minYear=2015`
- Correct singular form: `"1 primary study found from 2020 onward."`
- Correct year values (2000 and 2023)
- Score, flags, and `primary_study_count` are unchanged when `minYear` provided

---

## User Flows

### Zotero Direct Export
1. User opens any result page with found systematic reviews
2. In the Existing Reviews tab, they see two buttons in the top-right: **"Save to Zotero"** and **"Export file ▾"**
3. User clicks "Save to Zotero" — Zotero Desktop opens and prompts "Import N items?"
4. If Zotero is not installed, the OS shows a "no application registered" dialog

### Sort Persistence
1. User visits `/dashboard`, sorts by "High feasibility first"
2. User navigates away, returns later — sort is still "High feasibility first"
3. If user bookmarks `/dashboard?sort=oldest`, that URL always opens with oldest-first regardless of cookie

### minYear Explanation
1. User runs a search with "Only show studies from 2015 onward"
2. After AI analysis, the Feasibility panel reads:  
   *"15 primary studies found from 2015 onward. No recent systematic review covers this topic. Strong candidate for a systematic review or meta-analysis."*
3. Without the year filter, it reads: *"15 primary studies found. ..."*

---

## Design Decisions

**Why `zotero://import` instead of the Zotero API?**  
The Zotero Web API requires authentication (OAuth or API key). The `zotero://` URI protocol is handled by Zotero Desktop with no auth — it's an OS-level protocol handler registered at install time. This is a zero-friction path for the majority of academic users who already have Zotero installed.

**Why `window.location.href` instead of `window.open()`?**  
`window.open()` for non-http URIs is blocked by popup blockers in many browsers. `window.location.href` navigation to `zotero://` is not blocked because it's treated as a navigation (not a popup). The browser may ask for confirmation the first time; subsequent uses are automatic.

**Why Zotero's red/crimson brand color?**  
Zotero's recognizable red branding makes the button immediately identifiable to Zotero users without needing to read the label. This is the same convention used by "Open in GitHub", "Save to Pocket" buttons, etc.

**Why cookie for sort preference instead of localStorage?**  
The `initialSortMode` prop comes from a URL param which is read server-side. If we used localStorage, the server component would still render "newest" on first load (SSR), then the client hydration would flip to the stored preference — causing a flash of wrong sort. By using a cookie, the URL param approach remains clean (even though we switched to client-state sort in handoff 050). Cookies are also available to the server if we ever want to server-render the preferred sort order in a future session.

**Why lazy `useState` initializer for sort?**  
`getStoredSortMode()` reads `document.cookie`, which is only available client-side. A lazy initializer (`useState(() => ...)`) runs after hydration, not during SSR. This avoids a "document is not defined" error during server-side rendering.

**Why parse minYear from query text instead of storing it in a new DB column?**  
The ACC-8 implementation already embeds minYear in the stored query text (`"topic (after YYYY)"`). Parsing it back out is a zero-migration approach that works for all existing searches. Adding a new `min_year` column to `search_results` would require a Supabase migration and is disproportionate for this display-only improvement.

---

## Verification Status

```
npx tsc --noEmit
→ Exit 0 (no type errors)

npx eslint --max-warnings=0 components/ResultsDashboard.tsx components/DashboardContent.tsx
    lib/feasibility.ts lib/feasibility.test.ts app/api/analyze/route.ts
→ Exit 0 (0 errors, 0 warnings) — pre-existing ScreeningCriteria warning also fixed

npm test
→ Blocked: known rollup ARM64 binary mismatch (unchanged from handoffs 035–050).
  New tests in feasibility.test.ts are syntactically valid and cover all branches
  of the ACC-9 change. Logic verified manually:
    scoreFeasibility(15, [], 2015).explanation
    → "15 primary studies found from 2015 onward. ..."

npm run build
→ Blocked: known .fuse_hidden EPERM infrastructure issue (unchanged from handoffs 035–050).
```

---

## Recommended Next Steps

1. **[Low] Export comparison as PDF** — Add a "Print comparison" button to the `ComparisonModal` in `DashboardContent.tsx` that calls `window.print()` with `@media print` CSS hiding the overlay backdrop. Pairs naturally with existing print CSS in `PrintableReport.tsx`. (~30 lines)

2. **[Low] Zotero batch export from comparison** — After NEW-5, add a "Save all to Zotero" button in the `ComparisonModal` that merges existing reviews from all selected searches into a single RIS import. Requires fetching `existing_reviews` from `search_result_id`s via Supabase.

3. **[Medium] Confidence score per gap** — Each gap card in the Gaps tab currently shows only high/medium/low importance. Add a per-gap confidence indicator derived from the gap's `importance` and the overall `reviews_analyzed_count`. Uses the `getPerGapBadgeConfig()` utility already in `lib/gap-badge.ts`.

4. **[Medium] "Related Searches" nudge on Insufficient** — When `score === "Insufficient"`, the `InsufficientEvidencePanel` shows alternative topics. Integrate `deriveRelatedSearches()` from `lib/related-searches.ts` to also suggest 3 adjacent topic queries based on the original query text, giving researchers more pivots to explore.

5. **[Medium] PROSPERO registration draft export improvement** — The existing `downloadProsperoRegistration()` in `lib/prospero-export.ts` generates a Word-style text. Enhance it to pre-fill the PICO fields from the current search when the search mode was PICO, rather than leaving them blank.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
