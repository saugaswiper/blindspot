# Handoff 041 — Low-Evidence Disclaimer + Dashboard PROSPERO Badge + Boolean Count

**Date:** 2026-04-09
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 040 (Boolean UX: search history badge + expandable syntax hints)

---

## Summary

Three small, high-integrity UI improvements that close gaps identified in handoffs 038–040:

1. **Low-evidence disclaimer banner in Gap Analysis** — When `feasibilityScore === "Low"` (3–5 primary studies), an amber warning banner now appears at the top of the Gap Analysis tab before the AI output, alerting researchers that results need supplementary hand search.

2. **PROSPERO badge in search history dashboard** — When a past search returned one or more PROSPERO registry matches, a yellow `⚠ PROSPERO` badge now appears in the card's badge row, surfacing registry risk without requiring the researcher to open each result.

3. **Boolean count in dashboard summary line** — The "N searches saved" subtitle now reads "N searches saved · M Boolean" when the user has any Boolean queries saved, giving librarians a quick composition view.

---

## Problem

### Problem 1 — No caution for Low-evidence gap analysis

From handoff 040 recommended next steps (#2, High priority):

> Add a prominent amber banner to the gap analysis results panel: "Based on limited evidence (N studies). Gap analysis results should be interpreted with caution and supplemented with a hand search." This is a 2-line UI change in `components/ResultsDashboard.tsx`.

The hard gate (ACC-1, handoff 026) already blocks AI for `Insufficient` (<3 studies). But `Low` feasibility (3–5 studies) still runs AI gap analysis with no disclaimer. Researchers viewing gap analysis on a topic with 4 primary studies see the same UI as one with 40 — no indication that the AI's pattern-finding is operating on a very thin evidence base.

The Cochrane Handbook notes that gap identification from fewer than 5–6 studies should be treated as exploratory, not authoritative. Without a visible disclaimer, researchers may overweight AI gaps on sparse topics.

### Problem 2 — PROSPERO matches invisible from dashboard

From handoff 040 recommended next steps (#3, Medium priority):

> If `prospero_registrations_count > 0`, add a `⚠ PROSPERO` warning badge so reviewers can immediately see which of their saved searches have possible registry matches without opening each result.

The PROSPERO check (handoff 013) was implemented and results are stored in `search_results.prospero_registrations_count`, but the dashboard card never surfaced this. A researcher returning to the dashboard after running 10 searches had no way to see at a glance which topics already had registered reviews in progress — they'd need to open each result individually.

### Problem 3 — Boolean count hidden from dashboard summary

From handoff 040 recommended next steps (#4, Low priority):

> Extend the dashboard header to "N searches saved · M Boolean". Useful for librarians who run many structured searches and want to see their query composition at a glance.

The dashboard header showed "N searches saved" — no indication of query type breakdown. Librarians who mix natural-language and Boolean searches (a growing use pattern since handoff 039) had no summary-level view of their usage.

---

## What Was Built

### 1. Low-evidence disclaimer — `components/ResultsDashboard.tsx`

**Where:** In the `GapsTab` function, at the top of the `return (...)` statement, before the `overall_assessment` blue block.

**Trigger:** `feasibilityScore === "Low"` — only shown when gap analysis is present AND the evidence base is sparse (3–5 studies).

**Visual design:** Amber background (`bg-amber-50 dark:bg-amber-900/25`) with amber border, matching the existing amber tokens used for `Moderate` feasibility UI throughout the app. Warning triangle SVG icon (Heroicons `exclamation-triangle`). `role="alert"` for screen readers.

**Copy:**
```
⚠ Limited evidence base (N primary studies)
Gap analysis results should be interpreted with caution. With fewer than 6 primary
studies, AI-identified gaps may not reflect the full research landscape. Supplement
with a hand search of grey literature and conference proceedings.
```

The study count is interpolated from `primaryStudyCount` (already available in `GapsTab`'s props), making the warning concrete rather than generic.

**Why not for `Moderate` (6–10 studies):** The Cochrane threshold for "sufficient evidence for a systematic review" is typically 5–6 studies. At 6+, an AI trained on systematic review literature can identify genuine patterns. Below 6, the signal-to-noise ratio is too low. Moderate (6–10) is borderline but acceptable; Low (3–5) is the threshold where active caution is warranted.

**Why at the top, before overall_assessment:** The disclaimer must be seen before the AI output, not after. If placed at the bottom, many users would read and act on the gap findings before noticing the caveat. Epistemic warnings belong at the point of first exposure.

### 2. PROSPERO badge — `app/dashboard/page.tsx`

**Data change:** Added `prospero_registrations_count` to the Supabase `.select()` call in `getSearches()`. The field exists on `search_results` (added in handoff 013) and was just not being fetched for the dashboard view.

**Extraction:** In the per-card render, `prosperoCount` is extracted with a typed cast (the Supabase return type for joined tables is not always fully typed for additional columns; the cast is safe because the field is an integer or null in the schema). `hasProsperoMatches` is `true` when `typeof prosperoCount === "number" && prosperoCount > 0`.

**Badge placement:** Between the Monitoring badge and the Boolean badge. Visual order reflects information priority: Monitoring (workflow state) → PROSPERO (risk signal) → Boolean (query style) → Feasibility (evidence) → Analysis status.

**Visual design:**
- Yellow (`bg-yellow-50 dark:bg-yellow-900/30`, `text-yellow-800 dark:text-yellow-300`, `border-yellow-300 dark:border-yellow-700`)
- Warning `⚠` prefix symbol (not an SVG icon, to keep badge width compact)
- Title tooltip: `"N PROSPERO registration(s) found — a review may already be in progress on this topic"`
- `aria-label` for screen readers

**Why yellow not amber:** Amber is already used for the `Moderate` feasibility badge, creating potential confusion if PROSPERO used the same hue. Yellow is distinct and carries the right "caution / attention required" connotation without implying severity on the feasibility scale.

### 3. Boolean count in dashboard summary — `app/dashboard/page.tsx`

**Implementation:** A `booleanCount` variable computed before the JSX return:
```typescript
const booleanCount = searches.filter((s) => isUserBooleanQuery(s.query_text)).length;
```

`isUserBooleanQuery` is already imported (added in handoff 040). No additional imports needed.

**Display:**
```
12 searches saved · 4 Boolean
```

The `· M Boolean` segment only renders when `booleanCount > 0`, keeping the line clean for users who only run natural-language queries.

---

## Files Modified

```
components/ResultsDashboard.tsx   — Low-evidence disclaimer banner in GapsTab
                                    (+37 lines, 0 new imports)

app/dashboard/page.tsx            — prospero_registrations_count added to Supabase query (+1 line)
                                    booleanCount computed (+1 line)
                                    "· M Boolean" appended to summary line (+3 lines)
                                    PROSPERO badge in card badge row (+16 lines)
```

---

## User Experience

### Before

**Gap Analysis (Low feasibility):**
```
[Overall assessment blue block]
  "The limited literature on this topic..."

Identified Gaps
  [population] High importance
  "No studies in pediatric populations..."
  [methodology] Medium importance
  ...
```
No indication that these AI gaps are based on only 3–5 studies.

**Dashboard card (with PROSPERO match):**
```
CBT for chronic pain                              [High] [Analyzed]
Mar 15, 2026
```
PROSPERO match is invisible.

**Dashboard summary:**
```
My Searches
12 searches saved
```

### After

**Gap Analysis (Low feasibility, e.g. 4 primary studies):**
```
⚠ Limited evidence base (4 primary studies)
  Gap analysis results should be interpreted with caution. With fewer than 6 primary
  studies, AI-identified gaps may not reflect the full research landscape...

[Overall assessment blue block]
  "The limited literature on this topic..."

Identified Gaps
  ...
```

**Dashboard card (with PROSPERO match):**
```
CBT for chronic pain                    ⚠ PROSPERO  [High] [Analyzed]
Mar 15, 2026
```
Hovering the badge shows: "2 PROSPERO registrations found — a review may already be in progress on this topic".

**Dashboard summary:**
```
My Searches
12 searches saved · 4 Boolean
```

---

## Design Notes

**Low-evidence banner: why "fewer than 6" in copy, not "3–5":** The copy says "fewer than 6 primary studies" rather than "3–5" because the threshold is the absolute ceiling of the Low tier. If the score is Low, the count is always 3–5, so "fewer than 6" is always accurate. It avoids teaching the exact tier thresholds to users, which would require additional explanation and could become stale if thresholds change.

**PROSPERO badge: why not show the count number prominently:** The count is in the tooltip. In the badge row, space is limited and showing a number (e.g., `⚠ PROSPERO 3`) risks being interpreted as a score. The presence of the badge is the important signal; the count is useful secondary detail accessible via hover.

**Boolean count: why no "0 Boolean" display:** When there are no Boolean searches, the line shows "N searches saved" without any Boolean reference. Adding "· 0 Boolean" would add noise for users who only use natural language. The count only appears when it's actionable information.

---

## Accessibility

- `role="alert"` on the low-evidence disclaimer ensures screen readers announce it when the Gaps tab becomes active (the element is rendered on tab activation, triggering the `alert` role announcement behavior).
- `aria-label="Limited evidence warning"` on the disclaimer element.
- PROSPERO badge has `aria-label="PROSPERO: N registration(s) found"`.
- Warning triangle SVG has `aria-hidden="true"` (decorative; the text conveys the meaning).

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
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–040).
  No new pure logic functions were added; all changes are React rendering
  conditionals. No new unit tests required.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] Supabase telemetry for PRISMA rate validation** — Log `afterDedup`, `tier`, and `included` per search to a `search_telemetry` table. After 50+ real searches, validate whether the ÷2 to ×2 CI from handoff 038 captures the true included count in production. Requires a Supabase migration (new table + RLS policy + insert in `app/api/search/route.ts`).

2. **[High] "Low confidence" gap indicator on individual gaps** — The ACC-3 confidence badge (handoff 028) shows overall analysis confidence. For `Low` feasibility results (now flagged with the disclaimer), add per-gap indicators: when `primaryStudyCount <= 5`, prefix each gap card with a small `◔ Low confidence` indicator so researchers can weigh individual gaps appropriately.

3. **[Medium] PROSPERO count in results header** — The PROSPERO match count is now surfaced in the dashboard, but in the results page itself it appears only in the PROSPERO detail banner (shown when `prospero_registrations_count > 0`, handoff 013). Add the count to the results summary header alongside "Primary studies" and "Existing reviews" for immediate visibility without scrolling.

4. **[Low] Sort search history by feasibility** — Add a sort control to the dashboard ("Newest · Oldest · High feasibility first"). Researchers with many saved searches want to quickly find their best candidates. The feasibility score is already available in the current query.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
