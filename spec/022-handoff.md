# Handoff: Email Alerts Unsubscribe UI + Dashboard Alert Status
**Date:** 2026-03-31
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Two quality-of-life improvements that complete the email alerts system built in session 021:

1. **Email Alerts Unsubscribe UI** — the one-click unsubscribe link in weekly digest emails was silently broken. Users who clicked "Unsubscribe" were hitting a POST-only endpoint via GET, receiving no feedback and staying subscribed. This session adds a GET handler plus a proper `/alerts/unsubscribed` confirmation page.

2. **Dashboard Alert Status (Bell Icon)** — the "My Searches" dashboard showed feasibility scores and analysis status, but had no indication of which searches have active email monitoring. Users couldn't easily see or discover their alert subscriptions. This session adds a "🔔 Monitoring" badge to searches with active alerts.

---

## Why These Features

Both improvements directly support the **Email Alerts / Living Search** feature shipped in session 021 — the highest-retention driver from the market research.

### Unsubscribe UI

From spec/021-handoff.md recommendations:
> **Email alerts unsubscribe UI** — Currently `/api/alerts/unsubscribe?token=` just processes the unsubscribe server-side but the user lands on a raw JSON response. Add a proper `/alerts/unsubscribed` page with a confirmation message and "Re-subscribe" link. Low effort; improves email trust.

The root cause was more severe than the recommendation implied: the cron route generates **GET unsubscribe links** (`/api/alerts/unsubscribe?token=alertId`) but the route only handled **POST** requests. Users clicking the email link received no feedback and remained subscribed. This is an email trust issue — broken unsubscribe links are also a CAN-SPAM compliance concern.

### Dashboard Alert Status

From spec/021-handoff.md recommendations:
> **Dashboard alert subscription status** — The `My Searches` dashboard doesn't show whether each search has an alert subscription enabled. Add a small bell icon or "Monitoring" badge to searches that have active alerts. Very low effort; helps users discover and manage their subscriptions.

Without visibility into which searches have monitoring, users can't tell the difference between a "watched" search and one they've forgotten. The badge makes the alerts feature discoverable for users who may not remember whether they opted in.

---

## Files Created / Modified

```
app/api/alerts/unsubscribe/route.ts    — MODIFIED: added GET handler for one-click
                                         unsubscribe from email links. Uses service-role
                                         client (no auth required). Redirects to
                                         /alerts/unsubscribed on all outcomes.

app/alerts/unsubscribed/page.tsx       — NEW: confirmation page for email unsubscribes.
                                         Handles ?error=invalid|not_found|server.
                                         Shows success state (green ✓) or error state
                                         (amber ⚠) with appropriate CTAs.

app/dashboard/page.tsx                 — MODIFIED: added search_alerts join to query;
                                         renders "🔔 Monitoring" badge for searches
                                         with is_enabled=true alert subscriptions.
```

---

## Architecture

### Bug Fix: GET vs POST Mismatch

The cron route (`app/api/cron/send-alerts/route.ts`) generates unsubscribe URLs using:

```typescript
const unsubscribeUrl = `${APP_BASE_URL}/api/alerts/unsubscribe?token=${alert.id}`;
```

When a user clicks this link in their email, the browser makes a **GET** request to the route. Before this session, only a POST handler existed. The click silently failed — the user remained subscribed and saw no feedback.

#### New GET handler flow

```
User clicks unsubscribe link in email
  → GET /api/alerts/unsubscribe?token=<alertId>

1. Parse ?token as UUID (Zod validation)
   - Invalid format → redirect /alerts/unsubscribed?error=invalid

2. Service-role client: SELECT search_alerts WHERE id = token
   - Not found → redirect /alerts/unsubscribed?error=not_found

3. Service-role client: UPDATE search_alerts SET is_enabled=false
   - DB error → redirect /alerts/unsubscribed?error=server

4. Success → redirect /alerts/unsubscribed
```

Key design decisions:
- **Service role client** — user is unauthenticated (clicked a link from email). The alert UUID is the "bearer token" — sufficiently random to prevent guessing.
- **Idempotent** — calling unsubscribe on an already-disabled alert still succeeds and redirects to the success page (not `not_found`). The `not_found` error only fires if the alert row doesn't exist at all.
- **`Response.redirect(302)`** — uses the standard Route Handler response API rather than `redirect()` from `next/navigation` (which is designed for Server Components and throws internally).
- **`toAbsoluteUrl(req, path)`** — constructs the redirect URL from the incoming request's origin, so it works correctly on localhost, staging, and production without depending on `NEXT_PUBLIC_APP_URL`.

### New Page: `/alerts/unsubscribed`

Server Component. Reads `searchParams.error` to choose between two states:

| State | Condition | Heading | Icon |
|---|---|---|---|
| Success | no `?error=` | "You've been unsubscribed" | Green ✓ |
| Invalid link | `?error=invalid` | "Invalid unsubscribe link" | Amber ⚠ |
| Not found | `?error=not_found` | "Already unsubscribed" | Amber ⚠ |
| Server error | `?error=server` | "Something went wrong" | Amber ⚠ |

Success CTAs: "View my searches" → `/dashboard`, "Run a new search" → `/`
Error CTAs: "Manage alerts in dashboard" → `/dashboard`, "Back to home" → `/`

### Dashboard Alert Status

The `getSearches()` query in `app/dashboard/page.tsx` was extended to join `search_alerts`:

```typescript
search_alerts (
  is_enabled
)
```

In the render loop, the `alertRow.is_enabled` boolean drives a new badge that appears before the feasibility score:

```tsx
{hasActiveAlert && (
  <span
    className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1"
    title="Weekly email alerts active"
  >
    <span aria-hidden="true">🔔</span>
    <span>Monitoring</span>
  </span>
)}
```

The badge is indigo to distinguish it from the feasibility (green/amber/orange/red) and analysis status (blue) badges already present.

---

## Before / After

### Unsubscribe from email

**Before:**
```
User clicks "Unsubscribe" in email
  → GET /api/alerts/unsubscribe?token=abc...
  → 405 Method Not Allowed (no GET handler)
  → Browser shows error or blank page
  → User remains subscribed
```

**After:**
```
User clicks "Unsubscribe" in email
  → GET /api/alerts/unsubscribe?token=abc...
  → Alert disabled in Supabase
  → Redirect to /alerts/unsubscribed
  → User sees friendly confirmation page
  → Links to dashboard to re-subscribe if desired
```

### Dashboard

**Before:**
```
My Searches
  ┌─────────────────────────────────────────────────────────────┐
  │ CBT for insomnia in adults       Aug 15, 2025  [High] [Analyzed] │
  │ Ketamine for treatment-resistant  Sep 3, 2025  [Moderate] [Analyzed] │
  └─────────────────────────────────────────────────────────────┘
  No indication of which searches have active email monitoring.
```

**After:**
```
My Searches
  ┌─────────────────────────────────────────────────────────────┐
  │ CBT for insomnia in adults       Aug 15, 2025  [🔔 Monitoring] [High] [Analyzed] │
  │ Ketamine for treatment-resistant  Sep 3, 2025  [Moderate] [Analyzed] │
  └─────────────────────────────────────────────────────────────┘
  Bell badge visible for searches with active alerts.
```

---

## No Migration Required

No schema changes. The `search_alerts` table already exists from migration 008. The dashboard query now joins it but this is a read-only addition.

---

## Verification Status

- [x] **ESLint** — 0 errors, 0 warnings (`npm run lint`)
- [x] **TypeScript** — 0 errors (`npx tsc --noEmit`)
- [ ] `npm test` — blocked by pre-existing cross-platform rollup native binary issue (same as all prior sessions)
- [ ] `npm run build` — blocked by pre-existing cross-platform SWC binary issue (same as all prior sessions)

---

## Open Questions / Blockers

None. Both features are self-contained additions with no dependencies beyond what's already deployed.

---

## Next Recommended Features

1. **Dark mode** — Implement via Tailwind v4 `@custom-variant dark` + `next-themes`. Medium effort; high design impact. The WCAG contrast audit from session 019 ensures dark-mode colors will meet AA minimums.

2. **Protocol draft versioning** — Allow users to save multiple named versions per result (e.g., "Draft 1 — narrow PICO", "Draft 2 — broad scope"). Requires a `protocol_draft_versions` junction table or JSONB column. Medium effort; high value for iterative protocol refinement.

3. **Semantic HTML improvements** — Replace generic `<div>` wrappers in forms with `<section>`, `<fieldset>`, `<legend>`. Zero effort; improves screen reader navigation.

4. **Similar topic suggestions** — After showing results, surface 3–5 related searches (e.g., "CBT insomnia" → "CBT insomnia pediatric"). Can be AI-generated from the existing gap analysis. Low-medium effort; increases engagement and discovery.

5. **PROSPERO registration export** — After finding a viable gap, generate a pre-filled PROSPERO registration draft from the Blindspot report. Medium-high effort; closes the lifecycle loop from "found a gap" to "registering my review".

---

## Summary

| | |
|---|---|
| **New files** | `app/alerts/unsubscribed/page.tsx` |
| **Modified files** | `app/api/alerts/unsubscribe/route.ts`, `app/dashboard/page.tsx` |
| **Tests added** | None (new code is UI + route handler; pure logic is trivial URL construction) |
| **Bugs fixed** | 1 — GET vs POST mismatch on unsubscribe route caused email links to silently fail |
| **Risk** | Very low — additive only; no schema changes; existing POST handler unchanged |
| **Impact** | Email unsubscribe links now work correctly; dashboard shows monitoring status |
