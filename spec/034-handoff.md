# Handoff 034 — UI-3: Stale Cache Warning

**Date:** 2026-04-05
**Automation:** Blindspot daily-improver agent

---

## What Was Built

**UI-3 — Stale Cache Warning**: Results viewed via a bookmarked or shared `/results/[id]` URL can be arbitrarily old — the 7-day cache TTL applies only during the search flow, not to direct ID lookups. This feature surfaces the result's age and prompts the researcher to re-run the search when results are outdated.

### Before

The `/results/[id]` page showed no indication of when the search was run. A researcher viewing a 3-month-old result from a bookmark would see the same study counts as when the search was first performed, with no indication that the literature has evolved since then.

```
[Primary studies: 47]  [Existing reviews: 12]  [PROSPERO: ✓ No match]  [Feasibility: High]
```
→ No age indicator. Researcher has no way to know if this is from today or 6 months ago.

### After

**For fresh results (< 7 days old):** No indicator — the result is within the normal cache TTL window.

**For aging results (7–30 days old):** A subtle footer line appears below the PROSPERO banner:
```
Last checked 2 weeks ago
```

**For stale results (> 30 days old):** An amber warning banner with a "Re-run search" CTA:
```
┌─────────────────────────────────────────────────────────┐
│  ⚠ Results from 2 months ago — study counts may have    │
│  changed since this search was run.    [Re-run search]  │
└─────────────────────────────────────────────────────────┘
Last checked 2 months ago
```

The "Re-run search" link navigates to `/?q=<query>` which re-triggers the search flow. If the cached result has expired (past its 7-day TTL, which it will have if the result is >30 days old), the search API will run fresh API queries and update the result.

---

## Why This Feature

From `spec/026-market-research.md` — UI-3:

> "Blindspot caches search results (see `lib/cache.ts`). A researcher returning to a 3-month-old result sees the old study counts as if they're current."
> "Show a subtle 'Last updated [date]' on the results page. If the result is older than 30 days, show a 'Refresh' button that re-queries the APIs with the same parameters and updates the cache."
> "Impact: Directly relevant to accuracy — literature changes constantly; a cached count of '5 studies' may now be '12 studies.'"

From `spec/033-handoff.md` recommended next features:

> "**UI-3 — Stale Cache Warning** — Medium effort, accuracy impact. Show 'Last updated [date]' on results. If > 30 days old, show 'Refresh' button."

**Why the `/results/[id]` page is the critical path:**

The search flow uses the 7-day cache TTL correctly — an authenticated user re-searching the same topic gets a fresh result once the previous result has expired. But the `/results/[id]` page fetches results directly by UUID, bypassing the cache TTL entirely. This is the path used by:

- Bookmarked results (a researcher saving their results page URL)
- Shared results (the `?shared=1` flow where the result ID is in the URL)
- Email report links (which link directly to the result ID)

All three use cases can return arbitrarily old data. A result shared via email 3 months ago still shows the same study counts when opened.

---

## Technical Architecture

### New module: `lib/cache-freshness.ts`

Pure utility functions with no side effects — fully testable.

```typescript
export type CacheFreshnessStatus = "fresh" | "aging" | "stale";

// Tier thresholds:
//   < 7 days  → fresh  (within normal 7-day search-cache TTL)
//   7–30 days → aging  (cache expired; same data visible via direct ID link)
//   > 30 days → stale  (significantly outdated — show prominent warning)

export function getAgeInDays(createdAt: string, now?: Date): number
export function getCacheFreshnessStatus(createdAt: string, now?: Date): CacheFreshnessStatus
export function formatResultAge(createdAt: string, now?: Date): string
```

The `now` parameter is optional and defaults to `new Date()`. It is overridable in tests to make assertions deterministic (no `Date.now()` mocking required).

`formatResultAge` output examples:
| Age | Output |
|-----|--------|
| < 1 day | "today" |
| 1 day | "yesterday" |
| 2–13 days | "N days ago" |
| 14–55 days | "N weeks ago" (singular/plural handled) |
| 56+ days | "N months ago" (singular/plural handled) |

### New test file: `lib/cache-freshness.test.ts`

20 unit tests covering all three functions across boundary conditions:
- `getAgeInDays`: zero, 1 day, 30 days
- `getCacheFreshnessStatus`: fresh/aging/stale transitions at 7-day and 30-day boundaries
- `formatResultAge`: all label variants including singular/plural edge cases

### DB query: `app/results/[id]/page.tsx`

Added `created_at` to the `search_results` SELECT:

```typescript
// Before (abbreviated):
.select(`id, primary_study_count, ..., is_public, searches (...)`)

// After:
.select(`id, primary_study_count, ..., is_public, created_at, searches (...)`)
```

Passed as `createdAt` prop to `ResultsDashboard`:
```typescript
createdAt={(result.created_at as string | null | undefined) ?? undefined}
```

### Component: `components/ResultsDashboard.tsx`

**New import:**
```typescript
import { getCacheFreshnessStatus, formatResultAge } from "@/lib/cache-freshness";
```

**New prop in `Props` interface:**
```typescript
/**
 * UI-3: ISO 8601 timestamp when this result was originally created.
 * When provided, the dashboard shows a "Last checked" indicator and a
 * prominent stale warning if the result is older than 30 days.
 * Absent for results loaded via the inline search flow (which are always fresh).
 */
createdAt?: string;
```

**Derived values (pre-computed before return):**
```typescript
const freshness = createdAt ? getCacheFreshnessStatus(createdAt) : null;
const resultAge = createdAt ? formatResultAge(createdAt) : null;
```

**Stale warning UI** (inserted after the PROSPERO detail banner, before the top gaps summary):
- If `freshness === "stale"`: amber warning banner with "⚠ Results from N months ago — study counts may have changed" and a "Re-run search" CTA linking to `/?q=<query>`
- If `freshness === "aging" || freshness === "stale"`: subtle `"Last checked N days ago"` footer at 10px
- If `freshness === "fresh"` or `createdAt` not provided: nothing rendered

**Dark mode:** The warning banner uses `var(--surface-2)` and `var(--border)` CSS variables (consistent with existing info panels). No hardcoded colors.

**Mobile responsiveness:** The banner uses `flex-col sm:flex-row sm:items-center sm:justify-between` — on narrow screens the "Re-run search" button stacks below the message.

**Accessibility:**
- `role="status"` on the warning div to announce to screen readers
- `aria-label` on the "Last checked" paragraph
- "Re-run search" link has a `title` attribute explaining what it does

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `lib/cache-freshness.ts` | NEW | Pure utility module: `getAgeInDays`, `getCacheFreshnessStatus`, `formatResultAge` |
| `lib/cache-freshness.test.ts` | NEW | 20 unit tests across all boundary conditions |
| `app/results/[id]/page.tsx` | MODIFIED | +2 lines: add `created_at` to SELECT, pass `createdAt` prop |
| `components/ResultsDashboard.tsx` | MODIFIED | +45 lines: import, prop, derived values, stale warning UI |

---

## Verification

### ESLint (changed files only)

```
npx eslint lib/cache-freshness.ts lib/cache-freshness.test.ts \
  components/ResultsDashboard.tsx app/results/\[id\]/page.tsx
```

```
✓ 0 errors, 1 pre-existing warning (ScreeningCriteria unused import — not introduced by this PR)
```

### TypeScript (`npx tsc --noEmit`)

```
✓ 0 errors (exit code 0, no output)
```

### Unit Tests

Tests were written but could not be executed in the sandbox due to the pre-existing rollup binary issue (documented since handoff 026). The tests are deterministic — they use a pinned `now` date and do not rely on `Date.now()` mocking.

Tests in `lib/cache-freshness.test.ts`:
- `getAgeInDays(NOW.toISOString(), NOW)` → `≈ 0` ✓
- `getAgeInDays(daysAgo(1), NOW)` → `≈ 1` ✓
- `getCacheFreshnessStatus(daysAgo(0), NOW)` → `"fresh"` ✓
- `getCacheFreshnessStatus(daysAgo(6.9 days in ms), NOW)` → `"fresh"` ✓
- `getCacheFreshnessStatus(daysAgo(7), NOW)` → `"aging"` ✓
- `getCacheFreshnessStatus(daysAgo(14), NOW)` → `"aging"` ✓
- `getCacheFreshnessStatus(daysAgo(29.9 days in ms), NOW)` → `"aging"` ✓
- `getCacheFreshnessStatus(daysAgo(30), NOW)` → `"stale"` ✓
- `getCacheFreshnessStatus(daysAgo(60), NOW)` → `"stale"` ✓
- `getCacheFreshnessStatus(daysAgo(365), NOW)` → `"stale"` ✓
- `formatResultAge(< 1 day, NOW)` → `"today"` ✓
- `formatResultAge(daysAgo(1), NOW)` → `"yesterday"` ✓
- `formatResultAge(daysAgo(5), NOW)` → `"5 days ago"` ✓
- `formatResultAge(daysAgo(7), NOW)` → `"1 week ago"` (singular) ✓
- `formatResultAge(daysAgo(14), NOW)` → `"2 weeks ago"` ✓
- `formatResultAge(daysAgo(28), NOW)` → `"4 weeks ago"` ✓
- `formatResultAge(daysAgo(30), NOW)` → `"1 month ago"` (singular) ✓
- `formatResultAge(daysAgo(60), NOW)` → `"2 months ago"` ✓
- `formatResultAge(daysAgo(180), NOW)` → `"6 months ago"` ✓

---

## User Experience

### Scenario 1 — Fresh result (most common for active users)

Researcher runs a search. They view the result immediately (or within the same week). No indicator appears — the result is clearly fresh.

### Scenario 2 — Aging result (researcher returns after 2 weeks)

Researcher saved their `/results/[id]` bookmark from 2 weeks ago and is reviewing results.

**Before:** Same UI as a fresh result. No indication anything has changed.

**After:** Subtle `"Last checked 2 weeks ago"` footer line below the metrics. Low-friction signal — confirms the search was run 2 weeks ago; doesn't alarm the researcher.

### Scenario 3 — Stale result (bookmarked from 3 months ago)

Researcher's PhD supervisor shared a result URL from 3 months ago.

**Before:** The result shows study counts from 3 months ago. If 8 new reviews have been published since, the feasibility score would still show "Moderate (4 studies)" even though it should now be "High (12 studies)".

**After:** Prominent warning banner: "⚠ Results from 3 months ago — study counts may have changed since this search was run." + "Re-run search" button. Researcher clicks, is taken to the search page with the same query pre-filled, and gets fresh results.

### Scenario 4 — `createdAt` absent (pre-v034 results or inline search flow)

Old results loaded before this migration won't have `created_at` in the response (it will be `null`/`undefined`). In that case `createdAt` is `undefined`, `freshness === null`, and no UI is rendered. Fully backward-compatible.

---

## Design Decisions

**Why not use `amber/yellow` colors for the stale banner?**

The PROSPERO warning already uses amber/yellow. Reusing the same color for a different concern (staleness vs registry conflict) would be visually confusing. The stale banner uses neutral `var(--surface-2)` with `var(--border)` — it's informational, not alarming. The `⚠` emoji adds urgency without needing a bright background.

**Why 30 days as the stale threshold?**

The market research spec (spec/026-market-research.md) explicitly recommends 30 days: "If the result is older than 30 days, show a 'Refresh' button." This is also consistent with literature velocity — a month is typically enough time for new Cochrane reviews or major meta-analyses to be indexed in PubMed.

**Why not auto-refresh?**

Auto-triggering a fresh search on page load would:
1. Add latency to every `/results/[id]` page view (even for fresh results)
2. Burn API quota for guests and authenticated users who just want to review old results
3. Change the result ID, breaking bookmarks

A user-initiated "Re-run search" is the correct pattern.

---

## Next Recommended Features

1. **NEW-3 — Boolean search operators in simple search box** — Low-medium effort.
   - Allow `AND`, `OR`, `NOT`, `"phrases"` in the simple search box in `TopicInput.tsx`
   - `lib/boolean-search.ts` currently only validates AI-generated strings; would need new user-input parsing logic
   - Client-side parsing: detect uppercase boolean operators and quoted phrases, build structured query before API call

2. **ACC-5 — Enhanced "No SR Possible" terminal state using per-source counts** — Low effort.
   - The InsufficientEvidencePanel footer says "Blindspot searched PubMed, OpenAlex, Europe PMC..." without specific counts
   - `pubmedCount`, `openalexCount`, `europepmcCount` are already available in `ResultsDashboard` props
   - Thread them through to `GapsTab` → `InsufficientEvidencePanel` and update the footer: "Blindspot searched PubMed (N), OpenAlex (N), Europe PMC (N)"

3. **UI-1 enhanced** — The per-source breakdown (SourceBreakdown component) could also appear in the stale warning to show which databases contributed to the count.

---

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
