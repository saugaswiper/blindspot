# Handoff 050 — NEW-7: Multi-Topic Comparison Panel ("Research Notebook")

**Date:** 2026-04-28
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 049 (ACC-7: OpenAlex Semantic Search Fallback)

---

## Summary

Implemented **NEW-7 — Multi-Topic Comparison Panel**. Researchers can now select 2–4 past searches on the My Searches dashboard and compare them side-by-side in a modal showing: Topic | Feasibility | Study Count | Trend | PROSPERO registrations | Date.

---

## Why This Feature

From handoff 049 recommended next steps ([Medium] priority, top of list):

> **NEW-7 — Multi-Topic Comparison Panel ("Research Notebook")** — Check-boxes on dashboard search cards + "Compare selected" side-by-side table (Topic | Feasibility | Study Count | Trend | PROSPERO | Date, max 4). Data is already in `search_results`; only the UI is new. High value for PhD student persona who runs 5–10 searches across candidate dissertation topics and currently compares them manually.

**Concrete problem it solves:** A PhD student choosing a dissertation topic runs 5–10 Blindspot searches — "CBT for insomnia", "CBT for insomnia in elderly", "mindfulness for insomnia", etc. — and then manually compares feasibility scores across separate tabs or browser history. The comparison panel gives them a structured side-by-side view without leaving the dashboard.

It also benefits:
- **Clinical researchers** comparing multiple PICO variations for grant applications
- **Review team leads** evaluating which of several candidate topics to assign to team members
- **Librarians** advising students on which topic variants have the best evidence base

---

## Architecture Decision: Server + Client Component Split

The My Searches page was previously a pure server component (`app/dashboard/page.tsx`). Adding interactive checkboxes and comparison state requires a client component. The pattern chosen:

- **`app/dashboard/page.tsx`** (server component): handles auth redirect, Supabase data fetch, and passes data as props. Auth and data fetching remain server-side — no change to the security model.
- **`components/DashboardContent.tsx`** (client component, `"use client"`): owns all interactive state (sort mode, selected search IDs, comparison modal visibility) and all UI rendering.

This is the idiomatic Next.js App Router approach. The sort controls were also converted from `<Link>` query-string navigation to client-side `useState` — this is strictly better: sort changes are instant (no round-trip) and the selection state is preserved when the user changes sort order.

---

## Files Modified

### `app/dashboard/page.tsx` (refactored)

- Removed all UI rendering code (moved to `DashboardContent`)
- Updated `getSearches()` query to also select `primary_study_count` and `recent_primary_study_count` from `search_results` — needed for the Trend column in the comparison table
- Passes `searches`, `initialSortMode`, and `booleanCount` as props to `DashboardContent`
- `FEASIBILITY_STYLES`, `FEASIBILITY_RANK`, `SortMode`, `parseSortMode` types/constants moved to `DashboardContent`

### `components/DashboardContent.tsx` (new, ~490 lines)

**Exported interface `DashboardSearch`:**  
The shape of each row returned by the dashboard Supabase query, including the new `primary_study_count` and `recent_primary_study_count` fields.

**`buildComparisonRows(searches, selectedIds)`** (pure function):  
Converts the selected `DashboardSearch[]` rows into `ComparisonRow[]` objects, calling `deriveStudyTrend()` from `types/index.ts` to compute the Trend value. Returns only selected rows, preserving original order.

**`ComparisonModal` component:**
- Overlay with click-outside-to-close and Escape key handler (via `useEffect`)
- Responsive table: Topic | Feasibility badge | Study count (formatted with `toLocaleString`) | Trend (↑/→/↓ with label) | PROSPERO warning badge | Date
- Topic column links to `/results/<id>` (closes modal on click)
- PROSPERO column shows yellow warning badge with count when `prosperoCount > 0`, "None" otherwise
- Trend column uses the same `deriveStudyTrend` logic and `TREND_ICONS`/`TREND_STYLES` maps
- Columns gracefully show "—" when data is null (e.g. old results without `primary_study_count`)
- Footer tip explaining the Trend calculation

**`CompareActionBar` component:**
- Fixed bottom-center floating bar (z-index 40) visible when 1+ searches selected
- Shows "{N} topic(s) selected", Clear button, and "Compare (N)" button
- Compare button is disabled (cursor-not-allowed, 40% opacity) when fewer than 2 are selected
- Styled with `var(--brand-surface)` background for high contrast against both light/dark modes

**`DashboardContent` component (main):**
- Client-side sort state (replaces URL-based `?sort=` param — same UX, no round-trip)
- `selectedIds: Set<string>` — the set of search IDs checked for comparison
- `MAX_SELECTIONS = 4` — enforced via disabled checkbox when limit reached
- Per-card checkboxes: only rendered when `searches.length >= 2` (no clutter for single-search users)
- Card highlight: selected cards get a 2px `var(--accent)` border + accent color shadow
- Tooltip on disabled checkbox: "Maximum N topics can be compared at once"
- Sub-headline shows "select up to 4 to compare" hint in italics when 2+ searches exist
- Sort controls changed from `<Link>` to `<button>` with `aria-pressed` — client-state sort is instant and preserves selection state

---

## User Flow

1. User opens `/dashboard` with 2+ past searches
2. Subtitle reads "5 searches saved · select up to 4 to compare"
3. User clicks the checkbox on the left of a search card — card highlights with amber border
4. User selects 1–3 more cards (up to 4)
5. A floating bar appears at the bottom: "3 topics selected [Clear] [Compare (3)]"
6. User clicks "Compare (3)" — a modal opens with a 3-column comparison table
7. Each column shows Feasibility badge, study count, trend arrow, PROSPERO indicator, date
8. User clicks a topic title in the table to open its full results page
9. User presses Escape or clicks outside the modal to dismiss it

---

## Design Decisions

**Why max 4 topics?**  
The comparison table on mobile (375px) needs to remain readable. At 4 topics in a horizontal-scrollable table, each column gets ~180–220px on a 375px screen after scrolling — acceptable. 5+ would make the table hard to use. The spec also specified max 4.

**Why `<button>` for sort instead of `<Link ?sort=...>`?**  
The previous URL-based sort required full page navigation on every sort click. The sort state is now held in `useState` — changes are instant and, more importantly, preserve the `selectedIds` state. If we used URL params, switching sort would clear the checkbox selection.

**Why no URL persistence of selected IDs?**  
Selection is ephemeral and intentionally per-session. Persisting selected IDs in the URL would make URLs long and confusing when shared. The comparison result can be shared by copying a screenshot or the comparison table text.

**Why show checkboxes only when `searches.length >= 2`?**  
Users with a single search get no clutter — the checkbox column doesn't render. The "select to compare" hint in the subtitle also only appears at 2+.

**Why display "—" instead of "0" for null study counts?**  
A count of "0" would be misleading — it could mean either "zero studies found" or "data unavailable." "—" accurately conveys "not available for this result." Old search results that predate the `primary_study_count` column addition will show "—" rather than false zeroes.

---

## Verification Status

```
node_modules/.bin/tsc --noEmit
→ Exit 0 (no type errors)

node_modules/.bin/eslint components/DashboardContent.tsx app/dashboard/page.tsx
→ Exit 0 (0 errors, 0 warnings)

npm test
→ Blocked: known rollup ARM64 binary mismatch (unchanged from handoffs 035–049).
  No new pure-logic lib files to test; comparison logic uses deriveStudyTrend
  from types/index.ts which is already tested in lib/study-trend.test.ts.

npm run build
→ Blocked: known .fuse_hidden EPERM infrastructure issue (unchanged from handoffs 035–049).
```

---

## Recommended Next Steps

1. **[Low] NEW-5 — Zotero Direct Export** — Add a "Save to Zotero" button alongside the existing "Export references" dropdown in `ReviewsTab`. Generate the `.ris` content (already works via `toRis()`), base64-encode it, and open `zotero://import?format=ris&data=<base64>`. The Zotero desktop app intercepts this URI and imports the references directly — no OAuth needed. This is a 20-line addition to `ReviewsTab` in `components/ResultsDashboard.tsx`.

2. **[Low] Persist dashboard sort preference** — Store the chosen sort order in a cookie (`Set-Cookie: dashboard_sort=feasibility; Path=/; Max-Age=31536000`). Read it in `DashboardContent` as the `initialSortMode` fallback. With the sort now held in client state (changed this session), this is a `document.cookie` write on sort-button click — ~15 lines of code.

3. **[Low] Show minYear in feasibility explanation** — When a year filter was applied (ACC-8, handoff 048), append "Studies counted from YYYY onward." to `FeasibilityResult.explanation` in `lib/feasibility.ts` so researchers know the filtered scope without reading the query text. Low effort, improves result clarity.

4. **[Medium] Export comparison as PDF** — Add a "Print comparison" button to the `ComparisonModal` that calls `window.print()` with a `@media print` CSS rule that hides the overlay backdrop and shows only the table. Pairs naturally with the existing print CSS in `PrintableReport.tsx`.

5. **[Medium] Zotero batch export from comparison** — After NEW-5 lands, add a "Save all to Zotero" button in the `ComparisonModal` that exports all existing reviews from all selected searches into a single `.ris` file. Requires fetching full `existing_reviews` from the selected `search_result_id`s.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
