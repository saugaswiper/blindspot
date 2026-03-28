# Handoff: Citation Export (RIS / BibTeX)
**Date:** 2026-03-28
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **RIS / BibTeX citation export** for the Existing Reviews tab — improvement #3 from the market research report (`spec/004-market-research.md`).

Researchers who find existing systematic reviews in Blindspot can now download all listed references in one click as either:
- **RIS (.ris)** — imports into Zotero, Mendeley, EndNote
- **BibTeX (.bib)** — imports into LaTeX/Overleaf, JabRef

### Why This Feature
Low effort + immediate workflow value. After identifying existing reviews, users need to import them into a reference manager to start reading. Previously there was no way to do this without copying each citation manually. Now they click "Export references" → pick format → get a file.

---

## Files Created / Modified

```
lib/citation-export.ts            — NEW: pure functions for RIS + BibTeX generation + download trigger
lib/citation-export.test.ts       — NEW: 38 vitest unit tests covering both formats and buildBibKey
components/ResultsDashboard.tsx   — MODIFIED: ReviewsTab now has Export references dropdown button
```

### `lib/citation-export.ts`

Three exported functions:

| Function | Description |
|---|---|
| `toRis(reviews)` | Converts `ExistingReview[]` → RIS format string (CRLF line endings per spec) |
| `toBibtex(reviews)` | Converts `ExistingReview[]` → BibTeX format string |
| `downloadTextFile(content, filename, mimeType)` | Client-only: triggers browser file download |

Internal helper `buildBibKey(review, index)` is also exported for testing.

**Key implementation details:**
- RIS records: `TY  - JOUR` … `ER  - ` with CRLF separators, blank line between records
- Handles optional fields gracefully (no DOI → PubMed URL fallback, no PMID → omit `AN` field, etc.)
- `https://doi.org/` prefix stripped from DOI before inserting into `DO` field (RIS spec expects raw DOI)
- BibTeX cite keys: `firstwordoftitle_year` (lowercase, alphanumeric, max 34 chars)
- BibTeX field values escaped: `{`, `}`, `\` → `\{`, `\}`, `\textbackslash{}`
- Newlines sanitised from all RIS field values to prevent broken records

### `components/ResultsDashboard.tsx`

Added to the `ReviewsTab` component:
- "Export references" button in top-right of the tab (with a download icon)
- Dropdown with two options: "RIS (.ris)" and "BibTeX (.bib)", each with a subtitle listing compatible tools
- Dropdown is managed with local `useState` (no new props needed)
- Button is only visible when there are reviews (empty-state path unchanged)
- Mobile-responsive: button is `inline-flex` with small text, fits at 375px

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing warning: `ReviewSkeleton` unused, unrelated to this change)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Logic smoke tests — **28/28 passed** (see below)
- [ ] `npm test` — **cannot run**: pre-existing issue: `node_modules` was installed on macOS; rollup's linux-arm64-gnu `.node` binary is a macOS Mach-O file. Vitest requires rollup native. Not caused by this change.
- [ ] `npm run build` — **cannot run**: same cross-platform issue; Next.js tries to download `@next/swc-linux-arm64-gnu` and network access is blocked.

### Smoke Test Note

Since `npm test` cannot run in this environment, logic was verified by running an equivalent Node.js test script (`/tmp/test-citation.mjs`) directly against the compiled function logic. All 28 assertions passed:
- 15 RIS tests (record shape, field correctness, DOI handling, multi-record, newline sanitisation)
- 8 BibTeX tests (entry shape, DOI strip, PMID note, brace escaping)
- 5 `buildBibKey` tests (key format, special chars, empty title fallback, zero-year `nd`, length cap)

The vitest test file (`lib/citation-export.test.ts`) contains the canonical tests and will run on the developer's Mac where the native rollup binary is available.

---

## Decisions Made

- **RIS over BibTeX as primary**: RIS is more universally supported (Mendeley, EndNote, Zotero all accept it); BibTeX added as a second option for LaTeX users.
- **No API route needed**: Export is 100% client-side — we already have all review data in the component props. No server round-trip.
- **Dropdown instead of two buttons**: Keeps the UI clean; easily extensible (could add CSV later).
- **`downloadTextFile` kept as client-only utility**: Documented in JSDoc; should never be called in server components.
- **`buildBibKey` exported for testability**: Pure function, easy to unit-test in isolation.

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue will need resolution by the next developer running in this environment. To fix: delete `node_modules` + `package-lock.json`, then run `npm install` on the target Linux arm64 machine, or use Docker to match the deployment platform.

---

## Next Recommended Features (from `spec/004-market-research.md`)

1. **Search history dashboard** (#1 by retention impact — low effort, data already in Supabase)
2. **Shareable result links** (#2 by growth impact — low effort, just needs RLS update)
3. **ClinicalTrials.gov prominent display** (#4 — data may already be fetched, just needs UI)
4. **PROSPERO registry check** (#5 — medium effort, high credibility)
