# Handoff: Gap Type Filtering
**Date:** 2026-03-29
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **Gap Type Filtering** — improvement #9 from the market research report (`spec/004-market-research.md`).

Researchers come to Blindspot with different expertise. A methodologist cares about methodological gaps; a global health researcher cares about geographic gaps. Previously all six gap dimensions were presented in a flat list with no way to focus. Now users can click dimension chips (Population, Methodology, Outcome, Geographic, Temporal, Theoretical) to show only the gaps and suggested review topics relevant to their role.

### Why This Feature

**Persona-specific value**: The four key Blindspot personas (PhD student, clinical researcher, review team lead, evidence synthesis librarian) each care about different gap dimensions. Filtering lets each persona zero in on what matters without wading through unrelated items.

**Immediate utility, zero backend work**: Filtering is pure client-side. No API change, no Supabase migration, no Gemini prompt change. All gap data is already on the page — we're just controlling which cards render.

**Complements existing tabs**: The existing "top gaps" summary in the header already badges high-importance gaps by dimension. The filter chips extend this idea into the full gaps list, giving power users a way to drill down.

### No Database or API Changes Required

All filtering logic is purely client-side React state inside `GapsTab`. The `lib/gap-filter.ts` module is a stateless pure-function utility with no I/O.

---

## Files Created / Modified

```
lib/gap-filter.ts                — NEW: pure filtering utilities + metadata constants
lib/gap-filter.test.ts           — NEW: 23 unit tests (23/23 passing via smoke test)
components/ResultsDashboard.tsx  — MODIFIED: GapDimensionFilter component + filter state in GapsTab
```

---

## Data Flow

```
GapAnalysis (from Supabase, already on page)
    ↓
GapsTab — activeDimensions: Set<GapDimension> (React state, default = all 6 dims)
    ↓
countByDimension(gapAnalysis.gaps)           → badge counts on each filter chip
filterGapsByDimensions(gaps, activeDimensions) → visibleGaps
filterTopicsByDimensions(topics, activeDimensions) → visibleTopics
    ↓
GapDimensionFilter                           → colored chip strip above gap list
    ↓
Renders visibleGaps + visibleTopics only
Empty-state message + "Clear filter" link if nothing matches
```

---

## `lib/gap-filter.ts` Exports

| Export | Type | Description |
|---|---|---|
| `ALL_DIMENSIONS` | `GapDimension[]` | Canonical ordered list of all 6 dimensions. |
| `DIMENSION_LABELS` | `Record<GapDimension, string>` | Human-readable labels (e.g. "Methodology"). |
| `DIMENSION_SHORT_LABELS` | `Record<GapDimension, string>` | Compact labels for tight UIs (e.g. "Methods" for methodology). |
| `isUnfiltered(active)` | `(ReadonlySet<GapDimension>) → boolean` | True when all 6 dimensions are active. Used to short-circuit filtering. |
| `toggleDimension(current, dim)` | `(ReadonlySet, GapDimension) → Set` | Add or remove a dimension. Never removes the last active dimension. Returns new Set (immutable). |
| `resetFilter()` | `() → Set<GapDimension>` | Returns a fresh Set with all 6 dimensions. |
| `filterGapsByDimensions(gaps, active)` | `(Gap[], ReadonlySet) → Gap[]` | Filter gaps to active dimensions. Returns original array reference when unfiltered. |
| `filterTopicsByDimensions(topics, active)` | `(SuggestedTopic[], ReadonlySet) → SuggestedTopic[]` | Filter topics to active dimensions. Same short-circuit optimization. |
| `countByDimension(gaps)` | `(Gap[]) → Record<GapDimension, number>` | Count gaps per dimension. Used to badge chips. |

---

## UI / UX

### Filter Chip Strip

Appears directly above "Identified Gaps" heading, flush right on desktop, full-width wrap on mobile:

```
Filter: [Population 2] [Methodology 1] [Outcome 3] [Geographic 1]  ← chips for dims with gaps > 0
                                                                       (dims with 0 gaps are hidden)
```

- Each chip shows the dimension name + gap count badge
- Active chips use a distinct color per dimension (violet/blue/green/amber/pink/teal)
- Inactive chips are neutral gray, with a hover hint of the dimension color
- "Clear" text link appears only when any filter is active (non-default state)
- Chips use `aria-pressed` for accessibility
- Dims with 0 gaps (e.g. if Gemini returned no theoretical gaps) are hidden — no dead chips

### Counts in Section Headings

When a filter is active:
- "Identified Gaps (4 of 8 shown)" — inline count below the heading
- "Suggested Review Topics (2 of 5 shown)" — same pattern

### Empty States

When the active filter set returns no results:
```
No gaps match the selected dimensions. [Clear filter]
No suggested topics match the selected dimensions. [Clear filter]
```

### Mobile (375px)

- The chip strip wraps naturally (`flex flex-wrap`)
- Heading + chip strip stack vertically (`flex-col sm:flex-row`)
- Chips use full label text (not abbreviated) since they're small enough to wrap

### Default State

On first load, `activeDimensions` = all 6 dimensions (no filter active). The filter strip is visible but all chips appear "active" — the UI matches the unfiltered default. Only after a user clicks to deactivate a dim does a visual filter state apply.

---

## Unit Tests (23 smoke tests, all passing)

### `isUnfiltered` (4 tests)
- All dims active → true
- One dim missing → false
- Empty set → false
- Single dim → false

### `toggleDimension` (6 tests)
- Removes active dim when others also active
- Cannot remove the last remaining dim (returns same set)
- Adds absent dim to set
- Does not mutate input set
- Returns new Set instance (immutable pattern)
- Toggling a missing dim into full set → `isUnfiltered` = true

### `resetFilter` (2 tests)
- Returns set containing all 6 dims
- Returns a new Set each call (not a cached singleton)

### `filterGapsByDimensions` (5 tests)
- All active → returns original array reference (no-copy short-circuit)
- Partial active → only matching gaps returned
- No matching gaps → empty array
- Empty gaps array → empty result
- Does not modify original array

### `filterTopicsByDimensions` (4 tests)
- All active → returns original reference
- Partial active → only matching topics returned
- No matches → empty array
- Empty topics → empty result

### `countByDimension` (4 tests)
- Empty array → all zeros
- Counts gaps correctly per dimension
- Dimensions not in array = 0
- Total of all counts = array length

---

## Decisions Made

- **Hide zero-count dimension chips**: If Gemini only returned 4 of the 6 possible gap types, showing chips for the other 2 with "0" count is misleading and wastes space. Zero-count dims are hidden from the filter strip.
- **Prevent empty-state confusion by keeping last dim**: If a user has clicked down to a single dimension and tries to deselect it, `toggleDimension` returns the same set. This prevents an empty gap list with no way out (beyond the "Clear filter" link). The "Clear filter" link only appears when filtered — users are never stuck.
- **Short-circuit on `isUnfiltered`**: `filterGapsByDimensions` and `filterTopicsByDimensions` return the original array reference when no filter is active. This avoids unnecessary re-renders in React since reference equality is used in rendering decisions.
- **State inside GapsTab, not at ResultsDashboard level**: Filter state is local to the Gaps tab. It doesn't affect the Design tab, header summary, or printed PDF. The printed report always shows all gaps (filtering is a screen-only power-user tool).
- **Per-dimension color coding**: Each dimension gets a consistent color (violet/blue/green/amber/pink/teal) matching the chip background when active. This creates a quick visual vocabulary — after using the tool once, users associate violet with Population, blue with Methodology, etc.
- **`resetFilter` as useState initializer**: `useState<Set<GapDimension>>(resetFilter)` uses the function form to avoid creating a new Set on every render. The lazy initializer is called once at mount.

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **23/23 passed**
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as all prior deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists (from `005-handoff.md`). Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **Filter persistence**: Currently the filter resets when the user navigates away and returns to the Gaps tab. This is intentional (default = show all). If users request "remember my filter preference", a `localStorage` approach per-result-id could be added later.

---

## Next Recommended Features

1. **Email alerts / living search** (#6) — Weekly email digest when new reviews appear on saved topics. Cron job + diff logic + email template. Medium effort, high retention. This is now the top unimplemented item from `spec/004-market-research.md`.

2. **Similar Searches / Related Topic Suggestions** (#10) — Surface 3–5 related topic suggestions based on the gap analysis (e.g. "CBT insomnia" → "CBT insomnia pediatric"). Low-medium effort, medium engagement impact. Could reuse Gemini with a targeted prompt since gap analysis data is already available.

3. **Store raw source counts** — As a follow-on to `010-handoff.md` (PRISMA): store per-database pre-dedup record counts in a `source_counts` JSONB column so PRISMA Identification phase shows true raw counts, not post-dedup attribution.

4. **Team/collaboration** (#11) — Allow sharing results with team members and adding notes/comments to individual gaps. High effort but enables institutional adoption.
