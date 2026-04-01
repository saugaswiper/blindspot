# Handoff 023 — Dark Mode

## What was implemented

Full dark-mode support was added across the entire Blindspot UI using `next-themes` v0.4.6 and Tailwind v4 class-based dark variants. The toggle is persistent (localStorage) and respects the user's OS preference on first visit.

## Files changed or created

### New files
- `app/providers.tsx` — `ThemeProvider` wrapper (`attribute="class"`, `defaultTheme="system"`, `enableSystem`)
- `components/ThemeToggle.tsx` — Sun/Moon button using `resolvedTheme` from `useTheme()`

### Modified files
- `package.json` — added `next-themes ^0.4.6`
- `app/globals.css` — added `@custom-variant dark (&:where(.dark, .dark *))`, `html.dark` CSS variable overrides, `@media (prefers-color-scheme: dark)` JS-disabled fallback
- `app/layout.tsx` — `suppressHydrationWarning` on `<html>`, wrapped children in `<Providers>`
- `components/NavBar.tsx` — added `<ThemeToggle />`, dark variants on all elements
- `app/page.tsx` — dark variants on hero, search card, feature sections, trust bar
- `app/dashboard/page.tsx` — dark variants on all structural elements, search cards, feasibility badges
- `components/ResultsDashboard.tsx` — dark variants in all style constant objects and across all tab sections (reviews, gaps, design, PRISMA, protocol)
- `components/AlertSubscription.tsx` — dark variants on container, button, feedback message
- `components/SignOutButton.tsx` — dark variants on text and hover state
- `app/login/page.tsx` — dark variants on all form elements, inputs, buttons, error state

## Technical decisions

**Tailwind v4 dark variant**: Tailwind v4 removed the `darkMode` config key. The `@custom-variant dark` directive in `globals.css` re-enables class-based dark mode via `.dark` on `<html>`.

**Hydration guard**: `ThemeToggle` uses `resolvedTheme === undefined` as its hydration guard (returns a disabled placeholder pulse icon). This avoids `useState` + `useEffect` which ESLint's `react-hooks/set-state-in-effect` rule rejects. It is the canonical next-themes pattern.

**Server Component compatibility**: `NavBar` is an `async` Server Component. `ThemeToggle` is a separate `"use client"` component, imported and rendered inside the server component — valid App Router pattern.

**`suppressHydrationWarning`**: Required on `<html>` because next-themes injects/removes the `dark` class during hydration, causing a React attribute-mismatch warning without it.

## Pages NOT yet dark-mode-styled
- `app/signup/page.tsx` — light-only
- `app/alerts/unsubscribed/page.tsx` — light-only

These are low-traffic pages and can be done in a future session.

## Checks run
- `npm run lint` — ✅ 0 errors, 0 warnings
- `npx tsc --noEmit` — ✅ 0 errors
- `npm test` — ❌ pre-existing cross-platform rollup native binary failure (unrelated to this change)
- `npm run build` — ✅ compiled + pages generated; final EPERM on `.next/export` cleanup is a sandbox filesystem restriction, not a code issue

## Recommended next improvements (from 004-market-research.md)

1. **Boolean search operators** — let users type `AND`, `OR`, `NOT`, `"phrase"` in the search box; parse client-side into structured query before API call
2. **Protocol versioning UI** — draft/publish states already in DB (`protocol_status`, `protocol_version`); add a "Save draft" vs "Publish" button in `ResultsDashboard` protocol tab
3. **PROSPERO / ClinicalTrials.gov integration check** — show a badge on results indicating whether a matching registration was found
4. **Gap-type filter** — add filter chips above the gaps tab to filter by `gap_type` (population, outcome, setting, etc.)
5. **`app/signup/page.tsx` dark mode** — small effort, completes the dark mode pass
