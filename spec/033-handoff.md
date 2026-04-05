# Handoff 033 — NEW-1: Persistent PROSPERO Indicator on Summary

**Date:** 2026-04-05
**Automation:** Blindspot daily-improver agent

---

## What Was Built

**NEW-1 — Persistent PROSPERO Indicator on Summary**: The PROSPERO registry check result is now always visible as a compact badge in the results summary metrics row — even when no matches were found.

### Before

The PROSPERO check only surfaced a yellow warning banner when registrations were found (`count > 0`). When no registrations were found (`count === 0`), nothing was shown. Researchers had no way to confirm that the PROSPERO check had run and returned a clean result without digging into a tab or wondering if it was checked at all.

```
[Primary studies: 47]  [Existing reviews: 12]  [Registered trials: 3]  [Feasibility: High]
```
→ No PROSPERO status visible when count = 0.

### After

A compact badge in the metrics row always shows the PROSPERO status when the check data is present:

```
[Primary studies: 47]  [Existing reviews: 12]  [Registered trials: 3]  [PROSPERO: ✓ No match]  [Feasibility: High]
     registry check

```
Or when matches found:

```
[PROSPERO: ⚠ 3 matches]
     registry check
```

Both states link directly to the PROSPERO search results for the topic.
The existing yellow warning banner below is still shown when count > 0 to provide the detailed message and action link.

---

## Why This Feature

From `spec/026-market-research.md` — NEW-1 (priority #11):

> "The PROSPERO check (built in handoff 013) shows a one-time result, buried in a tab. Researchers want a persistent indicator visible on the results summary (not buried in a tab). Show a pinned badge on the result summary card: 'PROSPERO: No match found' or '⚠ 2 possible matches' — always visible without navigating to a tab."

From `spec/032-handoff.md` recommended next features:

> "**NEW-1 — Persistent PROSPERO indicator on summary** — Low effort, discoverability win. PROSPERO check (handoff 013) shows a one-time result, buried in a tab. Pinned badge on the result summary card: 'PROSPERO: No match found' or '⚠ 2 possible matches'. Always visible without navigating to a tab."

This solves two problems:
1. **Discoverability**: Researchers couldn't see PROSPERO was checked without navigating to the Gap Analysis tab
2. **False confidence gap**: A clean PROSPERO check (`0 matches`) gave no visible signal — the absence of the yellow banner wasn't obviously meaningful. Now `✓ No match` is explicit confirmation that the check ran and returned clean.

This directly serves **clinical researchers** and **systematic review team leads** — personas who specifically cited PROSPERO check visibility as a trust signal.

---

## Technical Architecture

### New function: `formatProsperoStatus`

Added to `lib/prospero.ts`:

```typescript
export function formatProsperoStatus(count: number): { label: string; hasMatch: boolean } {
  if (count === 0) return { label: "No match", hasMatch: false };
  if (count === 1) return { label: "1 match", hasMatch: true };
  return { label: `${count} matches`, hasMatch: true };
}
```

This provides a compact label for the badge (vs. `formatProsperoWarning()` which produces a full sentence for the detail banner).

### Pre-computed in `ResultsDashboard`

Added `prosperoStatus` derived value before the `return` statement:

```typescript
const prosperoStatus =
  prosperoRegistrationsCount !== null && prosperoRegistrationsCount !== undefined
    ? formatProsperoStatus(prosperoRegistrationsCount)
    : null;
```

Null when the PROSPERO check was not run (pre-v013 results or API failure). In that case the badge is not rendered (consistent with how `clinicalTrialsCount` is handled).

### Badge in metrics row

Added after the ClinicalTrials.gov count block and before the Feasibility block in the `grid cols-2 sm:flex` row:

```tsx
{prosperoStatus !== null && (
  <div>
    <p className="text-xs uppercase tracking-[0.15em] mb-1" style={{ color: "var(--muted)" }}>PROSPERO</p>
    <a
      href={`https://www.crd.york.ac.uk/prospero/display_record.php?RecordID=&SearchTerm=${encodeURIComponent(query)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${
        prosperoStatus.hasMatch
          ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700"
          : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
      }`}
      title={...}
      aria-label={`PROSPERO registry check: ${prosperoStatus.label}`}
    >
      <span aria-hidden="true">{prosperoStatus.hasMatch ? "⚠" : "✓"}</span>
      {prosperoStatus.label}
    </a>
    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>registry check</p>
  </div>
)}
```

Color semantics:
- **No match** (`count === 0`) → emerald/green pill: `✓ No match` — signals clear
- **Matches found** (`count > 0`) → yellow/amber pill: `⚠ N matches` — signals caution

Both states link to PROSPERO search results pre-filled with the user's topic query.

### PROSPERO detail banner unchanged

The existing yellow warning banner at `prosperoRegistrationsCount > 0` is preserved. It provides:
- Full sentence explanation: "⚠ 1 systematic review may already be registered on PROSPERO for this topic."
- "Check PROSPERO registry" link

The comment on the banner was updated to document the two-layer architecture (compact badge + detail banner).

### Dark mode

Badge uses dark-mode-aware Tailwind classes (`dark:bg-yellow-900/30`, `dark:text-yellow-300`, etc.) consistent with the existing PROSPERO banner and other metric badges in the component.

### Mobile responsiveness

The metrics row uses `grid grid-cols-2 sm:flex sm:flex-wrap` — the new PROSPERO badge is a standard grid cell that wraps naturally on narrow screens (≤ 375px).

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `lib/prospero.ts` | MODIFIED | +18 lines: added `formatProsperoStatus()` export |
| `lib/prospero.test.ts` | MODIFIED | +28 lines: 4 new tests for `formatProsperoStatus()` |
| `components/ResultsDashboard.tsx` | MODIFIED | +30 lines: import, `prosperoStatus` derived var, metric badge block, comment update |

---

## Verification

### ESLint (`npx eslint components/ResultsDashboard.tsx lib/prospero.ts lib/prospero.test.ts`)

```
✓ 0 errors, 1 pre-existing warning (ScreeningCriteria unused import — not introduced by this PR)
```

### TypeScript (`npx tsc --noEmit`)

```
✓ 0 errors (exit code 0)
```

### Unit Tests

The rollup binary issue that blocks vitest continues to exist (documented since handoff 026). Tests were written but could not be executed in the sandbox.

Tests added to `lib/prospero.test.ts`:
- `formatProsperoStatus(0)` → `{ label: "No match", hasMatch: false }` ✓
- `formatProsperoStatus(1)` → `{ label: "1 match", hasMatch: true }` ✓
- `formatProsperoStatus(2)` → `{ label: "2 matches", hasMatch: true }` ✓
- `formatProsperoStatus(42)` → `{ label: "42 matches", hasMatch: true }` ✓

---

## User Experience

### Scenario 1 — No PROSPERO matches (most common)

Researcher searches "CBT for insomnia in adults". PROSPERO returns 0 matches.

**Before:** No PROSPERO indicator visible in the summary. Researcher might wonder: "Did Blindspot even check PROSPERO?"

**After:** Green `✓ No match` badge appears in the metrics row next to Feasibility. Researcher can see at a glance: "PROSPERO was checked, no conflicts found. I can proceed."

### Scenario 2 — PROSPERO matches found

Researcher searches "mindfulness for workplace stress". PROSPERO returns 3 matches.

**Before:** Yellow warning banner shown below the metrics, after the feasibility explanation. Somewhat visible but easy to scroll past.

**After:** Yellow `⚠ 3 matches` badge in the metrics row (prominent, above the fold) **plus** the yellow detail banner below. Double signal — impossible to miss.

### Scenario 3 — Pre-v013 result (no PROSPERO data)

Researcher views an old cached result from before PROSPERO integration was added.

**After:** `prosperoStatus === null` → badge not rendered. No degradation vs. current behavior.

---

## Next Recommended Features

From `spec/026-market-research.md` and `spec/032-handoff.md`:

1. **UI-3 — Stale Cache Warning** — Medium effort, accuracy impact.
   - Show "Last updated [date]" on results (already have `created_at` in the data)
   - If > 30 days old, show "Refresh" button that re-runs the search with same params

2. **ACC-5 — Enhanced "No SR Possible" Terminal State using per-source counts** — Low effort.
   - Surface the per-source breakdown in the InsufficientEvidencePanel:
   - "Blindspot searched PubMed (N), OpenAlex (N), Europe PMC (N) and found N total primary studies."

3. **NEW-3 — Boolean search operators in simple search box** — Low-medium effort.
   - Allow `AND`, `OR`, `NOT`, `"phrases"` in the simple search box
   - `lib/boolean-search.ts` already has parsing logic

---

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
