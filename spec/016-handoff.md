# Handoff: Protocol Draft Storage (Persist Across Page Refresh)
**Date:** 2026-03-30
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **Protocol Draft Storage** — the top-priority low-effort improvement identified in `spec/015-handoff.md`.

Previously, when a user clicked "Generate Protocol" on the Gap Analysis tab, Blindspot called Gemini, displayed the Markdown draft on-screen, and promptly **forgot it**. Any page refresh, navigation away, or tab close meant the draft was silently lost — the user had to re-generate (another ~20-second Gemini call) to get it back.

Blindspot now **persists every generated protocol draft** in the `search_results` table. On subsequent visits the stored draft is displayed immediately without any additional API call or Gemini usage.

---

## Why This Feature

**User pain**: Generating a protocol is the end of a long workflow (search → feasibility score → AI gap analysis → generate protocol). Losing it on refresh is a jarring experience, particularly for PhD students and clinical researchers who may switch tabs mid-workflow.

**Zero repeated AI cost**: Re-generation makes a full Gemini API call (~$0.002 per protocol). Storage eliminates that cost for returning visitors.

**Works with existing auth and RLS**: The `search_results` table is already RLS-protected. The new `protocol_draft` column inherits all existing policies with no new grants required.

**Enables future features**: Storing the protocol draft makes it available server-side for future features such as emailing the draft, exporting it as a DOCX/PDF, or pre-populating a PROSPERO registration form.

---

## Files Created / Modified

```
supabase/migrations/006_protocol_draft.sql   — NEW: ALTER TABLE adds protocol_draft text column

lib/protocol-storage.ts                      — NEW: deriveProtocolFilename(), hasStoredProtocol()
                                                     (filename logic extracted from ProtocolBlock,
                                                      now independently testable)

lib/protocol-storage.test.ts                 — NEW: 22 vitest unit tests (16 smoke-tested via Node.js)

app/api/generate-protocol/route.ts           — MODIFIED: after generating, UPDATE search_results
                                                     SET protocol_draft = protocol (best-effort;
                                                     storage failure still returns protocol to client)

app/results/[id]/page.tsx                    — MODIFIED: SELECT includes protocol_draft; passes
                                                     protocolDraft prop to ResultsDashboard

components/ResultsDashboard.tsx              — MODIFIED (6 changes):
                                                     1. Import deriveProtocolFilename + hasStoredProtocol
                                                     2. Add protocolDraft?: string | null to Props
                                                     3. Destructure protocolDraft = null
                                                     4. Pass protocolDraft to GapsTab
                                                     5. GapsTab accepts + forwards protocolDraft to ProtocolBlock
                                                     6. ProtocolBlock: accepts initialProtocol prop;
                                                        state initialized from stored draft;
                                                        uses deriveProtocolFilename for download;
                                                        adds Regenerate button to replace stored draft
```

---

## Data Flow

```
User visits /results/[id]
    ↓
app/results/[id]/page.tsx  — SELECT protocol_draft FROM search_results
    ↓
ResultsDashboard(protocolDraft = "# My Protocol …" | null)
    ↓
GapsTab(protocolDraft)
    ↓
ProtocolBlock(initialProtocol = stored text | null)
    ↓
  if hasStoredProtocol(initialProtocol):
      status = "done", protocol = initialProtocol   ← shows draft instantly, no API call
  else:
      status = "idle"                                ← shows "Generate Protocol" CTA

─── On Generate ───────────────────────────────────────────────────────────────
ProtocolBlock.handleGenerate()
    ↓
POST /api/generate-protocol  { resultId }
    ↓
generateProtocol(prompt)     [Gemini 2.0 Flash]
    ↓
UPDATE search_results SET protocol_draft = protocol WHERE id = resultId  ← NEW
    ↓
Response.json({ protocol })
    ↓
setProtocol(data.protocol); setStatus("done")

─── On Regenerate ─────────────────────────────────────────────────────────────
"Regenerate" button click → setStatus("idle"); setProtocol(null)
    ↓
User clicks "Generate Protocol" again → flow above repeats
    ↓
Supabase row overwritten with new draft
```

---

## Database Migration

**File:** `supabase/migrations/006_protocol_draft.sql`

```sql
ALTER TABLE search_results
  ADD COLUMN IF NOT EXISTS protocol_draft text;
```

- **Nullable**: NULL for all existing rows (pre-migration). The UI treats NULL as "no draft yet" and shows the generate-prompt CTA unchanged.
- **No RLS change needed**: `protocol_draft` inherits the existing `search_results` RLS policies. Only the row's owner can read or write it (SELECT/UPDATE policies require `searches.user_id = auth.uid()`).
- **No index needed**: The column is read once per page load for a single known `id`. No range scans.

---

## `lib/protocol-storage.ts`

### `deriveProtocolFilename(protocol: string): string`

Extracts the first ATX-level-1 heading (`# Heading`) from a Markdown string, converts it to a filesystem-safe slug, and appends `.md`.

| Input | Output |
|-------|--------|
| `"# A Systematic Review of CBT for Insomnia\n..."` | `"a-systematic-review-of-cbt-for-insomnia.md"` |
| `"# 2025 Review of Vitamin D3"` | `"2025-review-of-vitamin-d3.md"` |
| `"No heading here"` | `"protocol.md"` |
| `""` | `"protocol.md"` |
| `"## Only sub-heading"` | `"protocol.md"` |
| `"# ---!!!---"` (all punctuation) | `"protocol.md"` |

Previously this logic was inline in `ProtocolBlock.handleDownload`. Extracting it makes it independently testable and removes 9 lines of inline logic from the component.

### `hasStoredProtocol(draft: string | null | undefined): draft is string`

A type-narrowing guard that returns `true` only when a draft is a non-empty, non-whitespace-only string. Used in two places:
1. `ProtocolBlock` — to decide initial `status` / `protocol` state
2. Anywhere else that needs to distinguish "has a draft" from "null/empty"

---

## `components/ResultsDashboard.tsx` — ProtocolBlock changes

### New prop: `initialProtocol?: string | null`

```tsx
function ProtocolBlock({ resultId, initialProtocol = null }: {
  resultId: string;
  initialProtocol?: string | null;
})
```

### State initialization change

```tsx
// Before:
const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
const [protocol, setProtocol] = useState<string | null>(null);

// After:
const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
  hasStoredProtocol(initialProtocol) ? "done" : "idle"
);
const [protocol, setProtocol] = useState<string | null>(
  hasStoredProtocol(initialProtocol) ? initialProtocol : null
);
```

No `useEffect` needed — lazy state initializers run once on mount with the correct value.

### New Regenerate button

A "↻ Regenerate" button appears in the header bar alongside Copy and Download when `status === "done"`. Clicking it resets the block to idle state, allowing users to discard a stored draft and generate a fresh one. The next generation overwrites the stored draft in Supabase.

### Download uses `deriveProtocolFilename`

```tsx
// Before: 9-line inline slug logic
// After:
function handleDownload() {
  if (!protocol) return;
  downloadTextFile(deriveProtocolFilename(protocol), protocol, "text/markdown");
}
```

---

## Unit Tests (22 checks in `lib/protocol-storage.test.ts`)

### `deriveProtocolFilename` (14 tests)
- Simple heading → clean slug
- No ATX heading → `"protocol.md"`
- Empty string → `"protocol.md"`
- H2-only document → `"protocol.md"` (only H1 used)
- Slug truncated to ≤ 60 characters
- Punctuation replaced with hyphens; no `:`/`&`/`(`/`)`
- Leading/trailing hyphens stripped from slug
- All-punctuation heading → `"protocol.md"` (slug collapses to empty)
- Consecutive non-alphanum chars collapsed to single hyphen (no double hyphens)
- Numbers in title preserved
- First `#` heading used, not later ones
- Whitespace-only heading text → `"protocol.md"`
- All input variants produce a string ending in `.md`

### `hasStoredProtocol` (8 tests)
- Non-empty string → `true`
- Single character → `true`
- `null` → `false`
- `undefined` → `false`
- Empty string → `false`
- Whitespace-only string → `false`
- String with leading/trailing whitespace + content → `true`
- TypeScript type narrowing guard: narrows `string | null` to `string`

**Smoke test result:** 16/16 passed via Node.js `--experimental-transform-types`

---

## Decisions Made

- **Best-effort storage**: If `UPDATE search_results SET protocol_draft = protocol` fails (network error, RLS edge case), the API still returns `{ protocol }` to the client. A `console.warn` is emitted. The user sees their draft — they just won't have it on refresh. This avoids a confusing error message for an action the user didn't explicitly request.
- **No re-serve from cache**: The API always generates a fresh protocol on explicit user request, even if `protocol_draft` already has a value. Re-serving the stored draft from the API would add complexity; the "Regenerate" button in the UI provides the way to replace it.
- **Regenerate button**: Resets ProtocolBlock to idle state, letting the user generate a new draft. The next generation call will overwrite the stored draft in Supabase. This is simpler than a "Are you sure?" confirmation and avoids a UI blocker.
- **`useState` lazy initializer over `useEffect`**: Initializing state from `initialProtocol` via the `useState` initializer argument is idiomatic React. No `useEffect` sync is needed — the prop is only ever read on first mount (SSR-rendered page load).
- **No `isStoredDraft` indicator badge**: An earlier draft of this feature included a "Saved" badge on the header bar to indicate a loaded-from-storage draft. It was dropped: the draft content is self-evident, the Regenerate button communicates that replacement is available, and a badge adds visual noise without user action value.

---

## Backward Compatibility

- **Existing rows**: `protocol_draft IS NULL` for all pre-migration rows. The UI shows the "Generate Protocol" CTA unchanged. `hasStoredProtocol(null) === false` guards this path.
- **No API signature change**: `/api/generate-protocol` still accepts `{ resultId }` and returns `{ protocol }`. The Supabase `UPDATE` is an internal side effect.
- **Public viewer path**: `ProtocolBlock` is only rendered for `isOwner === true`. Public viewers never see the block and are not affected.

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **16/16 passed** (inline Node.js verification of all pure functions)
- [x] Vitest test file written — 22 tests covering all pure functions
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as all prior deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists. Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **Supabase migration**: `006_protocol_draft.sql` must be run in the Supabase Dashboard → SQL Editor before deploying. It is a pure additive migration (`ADD COLUMN IF NOT EXISTS`) — safe to run on a live database.

---

## Next Recommended Features

1. **Email alerts / living search** — Weekly email digest when new reviews appear on saved topics. Highest-retention feature remaining from all market research reports. Needs: Vercel cron + diff logic comparing current PubMed/OpenAlex results to stored results + Resend/Postmark email template. Medium effort.

2. **Deduplication count transparency** — Count cross-database duplicates during the search pipeline, store in `search_results`, display as "N duplicates removed" in PRISMA Identification counts. Enables true PRISMA 2020-compliant counts. Low effort.

3. **Dark mode** — Implement via Tailwind `dark:` variant + `next-themes`. The navy color scheme is already present. Medium effort.

4. **Shortcut discoverability tooltip** — One-time localStorage-gated tooltip ("Press ? for shortcuts") on the Results page first visit. Very low effort; improves discoverability of keyboard shortcuts from `015-handoff.md`.

5. **Protocol draft versioning** — Allow users to save multiple named protocol drafts per result (e.g. "Draft 1", "Draft 2"). Requires a separate `protocol_drafts` junction table. Medium effort; valuable for iterative refinement.
