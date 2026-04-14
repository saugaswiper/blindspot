# Handoff 043 — Per-Gap Evidence Badge Extended to Moderate Feasibility

**Date:** 2026-04-11
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 042 (Per-gap low-confidence badge + dashboard sort control)

---

## Summary

Extended the per-gap evidence quality badge — introduced in handoff 042 for `Low` feasibility only — to also cover `Moderate` feasibility (6–10 primary studies), with a visually distinct, subtler treatment.

Key outcomes:
- Researchers working with borderline evidence (6–10 studies) now see a `◑ Moderate evidence` badge on every gap card, providing lightweight context without the alarming page-level amber banner reserved for `Low` feasibility.
- The badge config logic was extracted from `ResultsDashboard.tsx` into a new, tested pure function `getPerGapBadgeConfig` in `lib/gap-badge.ts`, making the rendering logic testable in isolation and the component code easier to read.
- 18 unit tests cover all feasibility tiers, boundary values, singular/plural study counts, and tooltip content expectations.

---

## Problem

Handoff 042 noted as highest-priority recommended next step:

> **[High] Per-gap confidence on individual gaps for Moderate feasibility** — Currently the `◔ Low confidence` badge only appears for `Low` feasibility (3–5 studies). Handoff 041's amber banner also applies only to Low. Consider whether a subtler visual treatment (e.g., no banner, but a `◔ Moderate confidence` in gray) should appear for Moderate (6–10 studies). The Cochrane threshold is 5–6; at 6, AI gap analysis is borderline. Requires a design decision on threshold philosophy.

The gap: researchers with a topic returning 8 primary studies (Moderate feasibility) saw **no per-gap caveat** — their gap cards were visually identical to those based on 40 or 400 studies (High feasibility). The AI's gap-finding on 8 studies is borderline reliable per Cochrane guidance, but nothing in the UI communicated this.

The design decision: **no top-of-tab banner for Moderate** (the amber banner is reserved for Low, where the evidence base is dangerously thin). Instead, a per-gap badge provides proportionate, unobtrusive context at the point of consumption.

---

## What Was Built

### 1. `lib/gap-badge.ts` — New pure helper module

**Purpose:** Encapsulates the badge config derivation logic, making it testable and keeping `ResultsDashboard.tsx` clean.

**Export:** `getPerGapBadgeConfig(feasibilityScore, primaryStudyCount) → PerGapBadgeConfig | null`

**Tier logic:**

| Feasibility | Studies  | Badge label          | Icon variant | Returns |
|-------------|----------|----------------------|--------------|---------|
| `Low`       | 3–5      | "Low confidence"     | `"low"` (◔)  | config  |
| `Moderate`  | 6–10     | "Moderate evidence"  | `"moderate"` (◑) | config |
| `High`      | 11+      | —                    | —            | null    |
| `Insufficient` | 0–2  | —                    | —            | null    |
| `null`      | —        | —                    | —            | null    |

**Design notes:**
- `Low` badge: gray-100 background with gray-500 text — muted, matches the existing "low importance" badge style, consistent with handoff 042 implementation.
- `Moderate` badge: stone-50 background with stone-400 text — lighter/subtler than the Low badge, visually indicating "worth noting" rather than "urgent warning".
- Tooltip for `Low`: references "exploratory, not authoritative" — aligns with Cochrane Handbook language about sparse evidence.
- Tooltip for `Moderate`: references "Cochrane's threshold" and "preliminary" — communicates the borderline nature without overstating risk.
- `Insufficient` → `null`: Gap analysis never runs for Insufficient (ACC-1 gate); this path is unreachable in practice but handled defensively.

### 2. `lib/gap-badge.test.ts` — 18 unit tests

Tests cover:
- `Low` feasibility: label, icon variant, singular/plural interpolation in tooltip and ariaLabel, "exploratory" keyword in tooltip, className existence.
- `Moderate` feasibility: label, icon variant, singular/plural interpolation, "Cochrane" keyword in tooltip, "preliminary" keyword, className distinctness from Low.
- `High` feasibility: null at boundary (11 studies) and above.
- `Insufficient` feasibility: null at 0 and 2 studies.
- `null` feasibility: null returned.
- Boundary table test (`it.each`): covers all tier edges (Low 3/5, Moderate 6/10, High 11).

### 3. `components/ResultsDashboard.tsx` — Updated per-gap badge rendering

**Import added:** `import { getPerGapBadgeConfig } from "@/lib/gap-badge";`

**Changed block:** The `visibleGaps.map(...)` section previously had a simple `{feasibilityScore === "Low" && (...)}` conditional rendering the ◔ badge. This is replaced with an IIFE:

```tsx
{(() => {
  const badge = getPerGapBadgeConfig(feasibilityScore, primaryStudyCount);
  if (!badge) return null;
  return (
    <span className={`... ${badge.className}`} title={badge.tooltip} aria-label={badge.ariaLabel}>
      <svg ...>
        {badge.iconVariant === "low" ? (
          /* ◔ upper-right quadrant path */
        ) : (
          /* ◑ right half path */
        )}
      </svg>
      {badge.label}
    </span>
  );
})()}
```

**SVG icons:**
- `◔` (low): `<path d="M12 12 L12 3 A9 9 0 0 1 21 12 Z">` — from center, up to top, arc clockwise to right, back to center (upper-right quadrant filled). Same geometry as handoff 042.
- `◑` (moderate): `<path d="M12 3 A9 9 0 0 1 12 21 Z">` — from top, arc clockwise to bottom, straight line back to top (right half filled). The Z closes with a straight line from bottom (12,21) to the path start (12,3), creating the vertical diameter that completes the semicircle.

Both icons share a `<circle cx="12" cy="12" r="9" />` outline.

---

## Files Modified/Created

```
lib/gap-badge.ts              — NEW: getPerGapBadgeConfig helper + PerGapBadgeConfig interface
                                (+97 lines)

lib/gap-badge.test.ts         — NEW: 18 unit tests for getPerGapBadgeConfig
                                (+160 lines)

components/ResultsDashboard.tsx — Updated per-gap badge block in visibleGaps.map
                                  Replaced feasibilityScore === "Low" conditional with
                                  getPerGapBadgeConfig IIFE supporting both Low and Moderate
                                  (+1 import, +27 lines net replacing 21)
```

---

## User Experience

### Before (handoff 042 state)

**Gap Analysis — Low feasibility (4 studies):**
```
⚠ Limited evidence base (4 primary studies)    ← amber banner

[Overall assessment]

Identified Gaps
┌──────────────────────────────────────────────────┐
│ POPULATION   high   ◔ Low confidence             │
│ No studies in pediatric populations...           │
└──────────────────────────────────────────────────┘
```

**Gap Analysis — Moderate feasibility (8 studies):**
```
[Overall assessment]

Identified Gaps
┌──────────────────────────────────────────────────┐
│ POPULATION   high                                │
│ No studies in pediatric populations...           │
└──────────────────────────────────────────────────┘
← No evidence quality indicator. Looks identical to High feasibility.
```

### After (this handoff)

**Gap Analysis — Low feasibility (4 studies):** *(unchanged)*
```
⚠ Limited evidence base (4 primary studies)

Identified Gaps
┌──────────────────────────────────────────────────┐
│ POPULATION   high   ◔ Low confidence             │
│ No studies in pediatric populations...           │
└──────────────────────────────────────────────────┘
```

**Gap Analysis — Moderate feasibility (8 studies):** *(new)*
```
[Overall assessment — no amber banner]

Identified Gaps
┌──────────────────────────────────────────────────┐
│ POPULATION   high   ◑ Moderate evidence          │
│ No studies in pediatric populations...           │
└──────────────────────────────────────────────────┘
```

Hovering `◑ Moderate evidence` shows: "Based on 8 primary studies — near Cochrane's threshold for reliable gap analysis. Treat individual gaps as preliminary"

**Gap Analysis — High feasibility (25 studies):** *(unchanged — no badge)*
```
[Overall assessment]

Identified Gaps
┌──────────────────────────────────────────────────┐
│ POPULATION   high                                │
│ No studies in pediatric populations...           │
└──────────────────────────────────────────────────┘
```

---

## Design Decisions

**Why no top-of-tab banner for Moderate:** The amber banner (added in handoff 041) is a page-level alert, appropriate only when the evidence base is clearly insufficient for reliable AI pattern-finding (Low tier, 3–5 studies). At 6–10 studies (Moderate), AI gap analysis is borderline but acceptable — a Cochrane reviewer would proceed with caveats, not stop. A banner would be alarmist. The per-gap badge provides the proportionate signal: present, visible, but unobtrusive.

**Why stone/muted for Moderate vs gray for Low:** The Low badge uses `bg-gray-100 / text-gray-500` — a neutral, muted tone that reads as "this is caveated information." The Moderate badge uses `bg-stone-50 / text-stone-400` — slightly warmer and even more muted, signaling "context, not concern." The visual hierarchy is intentional: Low > Moderate in urgency.

**Why extract `getPerGapBadgeConfig` instead of inline conditional:** The previous `{feasibilityScore === "Low" && (...)}` was a single-case check that could be read inline. Adding Moderate support would create a nested conditional inside an already-complex map callback. Extracting to a pure function: (a) makes both variants testable without mounting React; (b) documents the tier logic in one canonical place with comments; (c) makes the JSX in `visibleGaps.map` easier to read.

**Why IIFE (`(() => { ... })()`) instead of extracted component:** The badge depends on two props that are already in `GapsTab` scope (`feasibilityScore`, `primaryStudyCount`). Extracting a `PerGapBadge` component would require threading both props through — adding a new component for what is effectively a 15-line conditional span. The IIFE is idiomatic React for inline conditional rendering of slightly complex markup.

**Why `◑` right-half-filled for Moderate:** The existing feasibility icon for Moderate is `◑` (right half filled). Using the same icon for the per-gap badge creates visual consistency with the feasibility score display in the results header. The progression `○ → ◔ → ◑ → ●` (Insufficient → Low → Moderate → High) is now consistent across the UI.

---

## Accessibility

- `aria-label` on the badge span announces the study count and tier to screen readers: e.g., "Moderate evidence — 8 primary studies analyzed"
- The SVG icon has `aria-hidden="true"` — the `aria-label` on the parent span conveys the full meaning
- The badge is inline in the flex header row of the gap card, announced as part of the gap card's header content when the card is reached by keyboard/screen reader
- Both badge variants have `title` attributes for sighted mouse users (hover tooltip)

---

## Verification Status

```
npx eslint lib/gap-badge.ts lib/gap-badge.test.ts components/ResultsDashboard.tsx
→ Exit 0 (0 errors, 0 warnings from new code)
  1 pre-existing warning: 'ScreeningCriteria' unused import in ResultsDashboard
  (line 19, present since handoff 034, unrelated to this session)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–042).
  18 unit tests were written for getPerGapBadgeConfig in lib/gap-badge.test.ts.
  All test cases were reviewed manually for correctness.
  The component change (ResultsDashboard.tsx) is React rendering logic; no new
  unit-testable pure functions were added in the component itself.

npm run build
→ Not attempted: same .fuse_hidden / EPERM infrastructure issue as previous sessions.
```

---

## Recommended Next Steps

1. **[High] Supabase telemetry for PRISMA rate validation** — Log `afterDedup`, `tier`, and `included` per search to a `search_telemetry` table. After 50+ real searches, validate whether the ÷2 to ×2 confidence interval (handoff 038) captures the true included count in production. Requires a Supabase migration (new table + RLS policy + insert in `app/api/search/route.ts`).

2. **[Medium] Moderate feasibility top-of-tab notice (optional)** — The design decision in this handoff was to show only the per-gap badge for Moderate, with no banner. After observing researcher feedback, consider whether a very mild informational callout (blue, not amber) at the top of the Gaps tab for Moderate would be useful: "Based on 8 primary studies — borderline sufficient for AI gap analysis per Cochrane guidelines." This is a design call, not a technical blocker.

3. **[Medium] Persist dashboard sort preference** — The sort parameter approach (handoff 042) is stateless. A researcher who always wants "High feasibility first" must click the sort link on every visit. Consider persisting sort preference in a `user_preferences` Supabase table (or as a cookie) so the chosen sort is remembered between sessions.

4. **[Low] Animate badge appearance on tab switch** — When a user switches to the Gaps tab on a Low/Moderate result, the per-gap badges appear synchronously. A subtle fade-in (50ms stagger per gap card) would draw attention to the badges without being distracting, reinforcing that they are contextual metadata.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
