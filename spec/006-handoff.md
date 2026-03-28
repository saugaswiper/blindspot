# Handoff: Shareable Result Links (No-Auth Public View)
**Date:** 2026-03-28
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **Shareable Result Links** — improvement #2 from the market research report (`spec/004-market-research.md`).

Previously, sharing a Blindspot result required the recipient to sign in. Now, result owners can toggle a "Share" button that generates a public read-only URL. Anyone with the link can view the full result — existing reviews, gap analysis, feasibility score, and study design — without creating an account. Non-authenticated viewers see a branded CTA banner prompting them to sign up.

### Why This Feature
Low effort + high growth impact. Every shared link is a viral distribution event: a PhD student shares their analysis with their advisor, who then signs up and runs their own searches. Each share expands Blindspot's reach without paid marketing.

---

## Files Created / Modified

```
supabase/migrations/003_shareable_results.sql  — NEW: is_public column + public RLS policies
app/api/share/[id]/route.ts                    — NEW: POST endpoint to toggle is_public
app/results/[id]/page.tsx                      — MODIFIED: fetch is_public + user_id; pass isOwner/isPublic props
components/ResultsDashboard.tsx                — MODIFIED: Share button, CTA banner, non-owner action gating
types/index.ts                                 — MODIFIED: added is_public field to SearchResult
```

---

## Database Migration (`003_shareable_results.sql`)

Must be run in Supabase Dashboard → SQL Editor before deploying.

### Changes
1. **`ALTER TABLE search_results ADD COLUMN is_public boolean NOT NULL DEFAULT false`**
   - All existing results default to private; no breaking change.

2. **`CREATE POLICY "search_results_select_public"`**
   - `FOR SELECT USING (is_public = true)` — allows any user (including anonymous with the anon key) to read public results. Works alongside `search_results_select_own`.

3. **`CREATE POLICY "searches_select_via_public_result"`**
   - Allows the `searches` row (which contains `query_text`) to be read by public viewers through the associated result's `is_public` flag. Without this, public viewers would see a blank topic heading.

4. **Partial index on `search_results(id) WHERE is_public = true`**
   - Efficient lookups for the small set of public results.

---

## API Route (`app/api/share/[id]/route.ts`)

**`POST /api/share/:id`**

Toggles `is_public` on a `search_result`. Auth required; non-owners are blocked by Supabase RLS (the SELECT policy for owners won't return the row, resulting in a 404).

| Field | Details |
|---|---|
| Auth | Required (401 if not signed in) |
| Input validation | `id` must be a valid UUID (Zod) |
| Ownership | Enforced implicitly by `search_results_select_own` RLS — non-owners get 404 |
| Response | `{ is_public: boolean }` |
| Error handling | Returns friendly `userMessage` from `toApiError` |

---

## ResultsDashboard Changes

### New props
| Prop | Type | Default | Description |
|---|---|---|---|
| `isOwner` | `boolean?` | `false` | Shows Share button; shows/hides action buttons |
| `isPublic` | `boolean?` | `false` | Initial share state from server |

### Share button (owners only)
- Appears top-right of the results header, next to "Topic searched"
- Toggles appearance: grey border "Share" ↔ blue filled "Shared"
- On enable: copies current URL to clipboard → shows "Link copied!" toast (auto-dismisses in 4 s)
- On disable: shows "Link removed. This report is now private." toast
- Clipboard API failure falls back gracefully ("Sharing enabled. Copy this page URL…")

### CTA banner (non-owners viewing a public result)
- Dark navy banner above the results card
- Copy: "You're viewing a shared Blindspot report. Sign up free to run your own systematic review gap analysis."
- CTA button → `/signup`

### Non-owner action gating
- "Run AI Gap Analysis" button: hidden for non-owners. Non-owners with no analysis see "Sign up free to run AI analysis" → `/signup` instead.
- "Download PDF" button: visible to all (downloading a shared public report is fine).

---

## Results Page Changes (`app/results/[id]/page.tsx`)

- Fetches user and result in parallel with `Promise.all` (minor perf win)
- Adds `is_public` and `searches.user_id` to the Supabase select query
- Computes `isOwner = user?.id === searchData?.user_id`
- Handles migration lag: `(result.is_public as boolean | undefined) ?? false`
- Passes `isOwner` and `isPublic` to `ResultsDashboard`

### Access rules (enforced by Supabase RLS)
| Viewer | Result private | Result public |
|---|---|---|
| Owner | ✅ sees result, Share button | ✅ sees result, Share button (Shared state) |
| Other signed-in user | 404 (notFound) | ✅ sees result, CTA banner |
| Anonymous | 404 (notFound) | ✅ sees result, CTA banner |

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing warning: `ReviewSkeleton` unused)
- [x] `npx tsc --noEmit` — 0 errors from changed files (1 pre-existing `.next` cache error for `email-report/route.js`, unrelated)
- [ ] `npm test` — cannot run: pre-existing cross-platform rollup native binary issue (macOS modules on Linux; see `005-handoff.md`)
- [ ] `npm run build` — cannot run: same cross-platform issue; Next.js SWC binary unavailable

---

## Decisions Made

- **Toggle rather than separate "enable/disable"**: simpler UX — one button shows current state and acts as toggle.
- **Clipboard copy on share**: most discoverable UX for "now share the link" — no separate "copy link" button needed.
- **Non-owners see 404 for private results**: preserves privacy. No "this result exists but is private" leakage.
- **`searches_select_via_public_result` policy**: avoids denormalizing `query_text` into `search_results`. Cleaner schema at the cost of one extra RLS policy.
- **No new test file**: the new logic is UI state management (Share toggle, toast) and a thin API route — both are better tested via integration/e2e than unit tests. The API route has no non-trivial pure logic to unit-test.

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue (from `005-handoff.md`) must be resolved before `npm test` and `npm run build` can run. Delete `node_modules` + `package-lock.json` and re-install on the deployment platform.
- The `.next/dev/types/validator.ts` cache error (references a deleted `email-report/route.js`) should be resolved by running `rm -rf .next && npm run build` on the target machine.

---

## Next Recommended Features (from `spec/004-market-research.md`)

1. **ClinicalTrials.gov prominent display** (#4) — `clinicalTrialsCountVal` is already computed in `app/api/search/route.ts` but not stored separately. Needs a new `clinical_trials_count integer` column in `search_results` + migration + display in the header metrics row.
2. **PROSPERO registry check** (#5) — Query `https://www.crd.york.ac.uk/prospero/` search and surface a warning banner if matches are found. High credibility win.
3. **Email alerts / living search** (#6) — Cron job that diffs PubMed results for saved searches and emails users when new reviews appear.
4. **PRISMA flow diagram** (#7) — SVG/HTML diagram of records identified/screened/included, using counts already collected during search.
