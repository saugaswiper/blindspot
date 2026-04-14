# Handoff 042 — Per-Gap Low-Confidence Badge + Dashboard Sort Control

**Date:** 2026-04-10
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 041 (Low-evidence disclaimer + dashboard PROSPERO badge + Boolean count)

---

## Summary

Two improvements that complete items called out in handoff 041's recommended next steps:

1. **Per-gap low-confidence badge in Gap Analysis** — When `feasibilityScore === "Low"` (3–5 primary studies), each individual gap card now shows a `◔ Low confidence` badge alongside the dimension label and importance badge. This complements the overall amber banner (added in handoff 041) by making the caution actionable at the per-gap level.

2. **Sort control for search history dashboard** — The "My Searches" page now has Newest / Oldest / High feasibility first sort links, driven by a `?sort=` URL parameter. Researchers with many saved searches can now surface their best-scoring topics instantly.

---

## Problem

### Problem 1 — Amber banner without per-gap signal

Handoff 041 added a prominent amber banner at the top of the Gaps tab whenever `feasibilityScore === "Low"`. The banner warns about the overall analysis, but every individual gap card still renders identically — dimension label, importance badge, description — with no indication that this specific gap was inferred from a very thin evidence base.

A researcher can (and likely will) scroll past the banner and engage with individual gaps without remembering the caveat. The per-gap badge keeps the caution visible at the point of consumption of each gap, not only at the top of the page.

The Cochrane Handbook is explicit: individual gap findings from fewer than 5–6 studies should be treated as exploratory hypotheses, not research priorities. The per-gap badge operationalises this guidance at the correct granularity.

### Problem 2 — No way to sort saved searches by quality

From handoff 041 recommended next steps (#4, Low priority):

> Add a sort control to the dashboard ("Newest · Oldest · High feasibility first"). Researchers with many saved searches want to quickly find their best candidates. The feasibility score is already available in the current query.

The dashboard always renders searches newest-first (the database default). A researcher who has run 20–30 searches over time — some with High feasibility, some Insufficient — had no way to quickly identify which of their saved topics are worth pursuing. They had to visually scan all cards looking for the green "High" badge.

"High feasibility first" directly answers the question "which of my searches should I invest in?", which is Blindspot's core value proposition.

---

## What Was Built

### 1. Per-gap low-confidence badge — `components/ResultsDashboard.tsx`

**Where:** Inside the `visibleGaps.map(...)` block in `GapsTab`, added after the existing importance badge.

**Trigger condition:** `feasibilityScore === "Low"` — the same condition that triggers the amber banner. This means:
- `Insufficient` feasibility → gap analysis never runs (ACC-1 gate), so the badge is never shown
- `Low` feasibility (3–5 studies) → amber banner + per-gap badge (both shown)
- `Moderate` feasibility (6–10 studies) → no banner, no badge (evidence is borderline sufficient)
- `High` feasibility (11+ studies) → no banner, no badge

**Visual design:**
- Same muted gray used for the "low importance" badge (`bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700`)
- Consistent styling with the importance badge to keep the header row visually cohesive
- Custom SVG icon: a circle with the upper-right quadrant filled — representing "partial/incomplete" evidence (conceptually equivalent to the Unicode ◔ character, but rendered as a crisp 10px SVG)
- `gap-0.5` between the icon and label for compact presentation

**Tooltip:** `"Based on only N primary study/studies — this gap should be treated as exploratory, not authoritative"` — interpolates the actual study count from `primaryStudyCount`, making the warning concrete rather than generic.

**ARIA:** `aria-label="Low confidence — only N primary study/studies analyzed"` — screen readers announce this alongside the dimension and importance labels.

**Why not a warning triangle:** The amber banner already uses a warning triangle for the overall alert. Using the same icon at the per-gap level would create visual noise (a triangle on every single card). The partial circle (◔) is semantically distinct — it represents incomplete evidence rather than a warning, which is the correct framing: this gap isn't wrong, it's just based on limited data.

**Why not change the card background/border color:** The `IMPORTANCE_STYLES` map already styles the card border and background by importance level. Overriding those colors for Low feasibility would lose the importance signal, which is still meaningful even with limited evidence. The badge is additive — it adds the confidence signal without removing the importance signal.

### 2. Sort control — `app/dashboard/page.tsx`

**Mechanism:** URL search parameter `?sort=newest|oldest|feasibility`. Reading `searchParams` as a Next.js 15+ async prop (`Promise<{ sort?: string }>`), consistent with the existing pattern in `app/alerts/unsubscribed/page.tsx`.

**Sort modes:**
- `newest` (default, no param needed) — preserves existing behavior; `created_at` descending
- `oldest` — `created_at` ascending
- `feasibility` — descending by feasibility rank (High=4 > Moderate=3 > Low=2 > Insufficient=1 > null=0), with newest-first as a stable tiebreak within each tier

**Sort implementation:** In-memory sort after the Supabase fetch (which always returns newest-first up to 50 results). Sorting by `feasibility_score` in Supabase on a joined table (`search_results`) would require a view or a raw query; in-memory sort on ≤50 rows is negligible and simpler.

**UI:** Three pill-shaped sort links above the search card list:
- Renders only when `searches.length > 1` — no point showing sort controls for a single result
- Active sort: accent-tinted pill (matches the "Analyzed" badge styling used elsewhere)
- Inactive sorts: muted surface-2 pill (matches secondary button styling)
- Canonical URL for "Newest": `/dashboard` (no param) — keeps the default URL clean and prevents `?sort=newest` from being the canonical URL (SEO hygiene, though dashboard is auth-gated)

**`parseSortMode` helper:** A pure function that sanitises the raw URL param, returning `"newest"` for any unknown/missing value. This prevents type errors and injection of arbitrary sort keys.

**`FEASIBILITY_RANK` map:** Defined as `Partial<Record<FeasibilityScore, number>>` to avoid exhaustiveness requirements (all four keys are populated, but TypeScript strict mode doesn't require it). Null/undefined feasibility → 0 (sorted to bottom of "High feasibility first" view — correct, since a search with no result yet should not surface above scored results).

**Accessibility:**
- Sort control group has `role="group"` and `aria-label="Sort searches by"`
- Active link has `aria-current="page"` (technically "state" would be more semantically precise, but `aria-current="page"` is universally supported and conveys "this is the current selection")

---

## Files Modified

```
components/ResultsDashboard.tsx   — Per-gap low-confidence badge in GapsTab visibleGaps.map
                                    (+27 lines, 0 new imports)

app/dashboard/page.tsx            — PageProps type with async searchParams
                                    parseSortMode helper function
                                    FEASIBILITY_RANK map
                                    sortMode derived from searchParams
                                    sortedSearches in-memory sort
                                    Sort controls UI above card list
                                    Render from sortedSearches instead of searches
                                    (+74 lines net, +1 type, 0 new imports)
```

---

## User Experience

### Before

**Gap Analysis (Low feasibility):**
```
⚠ Limited evidence base (4 primary studies)    ← amber banner (added handoff 041)

[Overall assessment]

Identified Gaps
┌─────────────────────────────────────────────────┐
│ POPULATION   high                               │
│ No studies in pediatric populations...          │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ METHODOLOGY  medium                             │
│ All studies used self-report measures only...   │
└─────────────────────────────────────────────────┘
```
After scrolling past the amber banner, no per-gap caution is visible.

**Dashboard:**
```
My Searches
12 searches saved · 4 Boolean

[list always newest-first, no sort control]
```

### After

**Gap Analysis (Low feasibility, e.g. 4 primary studies):**
```
⚠ Limited evidence base (4 primary studies)

[Overall assessment]

Identified Gaps
┌─────────────────────────────────────────────────┐
│ POPULATION   high   ◔ Low confidence            │
│ No studies in pediatric populations...          │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ METHODOLOGY  medium   ◔ Low confidence          │
│ All studies used self-report measures only...   │
└─────────────────────────────────────────────────┘
```
Hovering the ◔ badge shows: "Based on only 4 primary studies — this gap should be treated as exploratory, not authoritative."

**Dashboard:**
```
My Searches
12 searches saved · 4 Boolean

Sort: [Newest]  Oldest  High feasibility first

[card list]
```

Clicking "High feasibility first":
```
Sort:  Newest   Oldest  [High feasibility first]

CBT for insomnia                                    [High] [Analyzed]
Exercise and depression                             [High] [Analyzed]
Mediterranean diet cardiovascular                   [Moderate] [Analyzed]
Zinc supplementation COVID                          [Low] [Analyzed]
Astrology and health outcomes                       [Insufficient] [No analysis]
...
```

---

## Design Notes

**Per-gap badge placement:** After the importance badge (not before). Importance is the primary metadata signal for each gap; confidence is a modifier of how much to trust it. Reading order: "POPULATION [high importance] [low confidence]" correctly frames confidence as a qualifier on the importance claim.

**Sort control URL design:** "Newest" links to `/dashboard` (no query param) rather than `/dashboard?sort=newest`. This means the canonical URL for the default view remains clean. If a user bookmarks `/dashboard?sort=feasibility`, the sort preference is preserved on reload, which is a lightweight form of preference persistence without needing any database state.

**Why not server-side Supabase sort for feasibility:** The `feasibility_score` column is on `search_results`, a has-one relation to `searches`. Supabase's `.order()` with `foreignTable` works on to-many joins but the result ordering behavior when the join value is null is not predictable across Supabase/Postgres versions. In-memory sort of ≤50 rows is ~0ms and deterministic.

**Why hide sort controls with ≤1 result:** A single search card makes sort irrelevant and the controls add visual noise for new users who are still in their first search. The `searches.length > 1` guard mirrors common patterns in list UIs (e.g., Gmail hides sort when the inbox has 0 or 1 message).

---

## Accessibility

### Per-gap badge
- `aria-label` on the badge span announces the study count to screen readers
- The SVG icon has `aria-hidden="true"` — the aria-label on the parent span conveys the full meaning
- The badge is inline in the flex header row, announced as part of the gap card's header content

### Sort controls
- `role="group"` + `aria-label="Sort searches by"` groups the controls for screen readers
- `aria-current="page"` on the active sort link indicates the current selection
- All three sort options are always rendered (no hidden state), so keyboard navigation cycles through all options regardless of current selection

---

## Verification Status

```
npx eslint app/dashboard/page.tsx components/ResultsDashboard.tsx
→ Exit 0 (0 errors, 0 warnings from new code)
  1 pre-existing warning: 'ScreeningCriteria' unused import in ResultsDashboard
  (line 18, present since handoff 034, unrelated to this session)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–041).
  No new pure logic functions were added; all new code is React rendering
  conditionals and a pure parseSortMode helper. parseSortMode is simple enough
  (3 values, one default) that a formal test would be a test of JavaScript
  string equality, not application logic.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] Per-gap confidence on individual gaps for Moderate feasibility** — Currently the `◔ Low confidence` badge only appears for `Low` feasibility (3–5 studies). Handoff 041's amber banner also applies only to Low. Consider whether a subtler visual treatment (e.g., no banner, but a `◔ Moderate confidence` in gray) should appear for Moderate (6–10 studies). The Cochrane threshold is 5–6; at 6, AI gap analysis is borderline. Requires a design decision on threshold philosophy.

2. **[High] Supabase telemetry for PRISMA rate validation** — Log `afterDedup`, `tier`, and `included` per search to a `search_telemetry` table. After 50+ real searches, validate whether the ÷2 to ×2 CI from handoff 038 captures the true included count in production. Requires a Supabase migration (new table + RLS policy + insert in `app/api/search/route.ts`).

3. **[Medium] PROSPERO count in results header** — The PROSPERO match count is surfaced in the dashboard (handoff 041), but in the results page itself it appears only in the PROSPERO detail banner (handoff 013). Add the count to the results summary header alongside "Primary studies" and "Existing reviews" for immediate visibility on the results page without scrolling.

4. **[Low] Persist sort preference in user profile** — The URL parameter approach is stateless. A researcher who always wants "High feasibility first" must click the sort link every time they visit `/dashboard`. Consider persisting sort preference in a `user_preferences` Supabase table (or as a cookie) so the chosen sort is remembered between sessions.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
