# Handoff: PRISMA 2020 Flow Diagram
**Date:** 2026-03-29
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **PRISMA 2020 Flow Diagram** — improvement #7 from the market research report (`spec/004-market-research.md`) and the top-recommended feature from `spec/009-handoff.md`.

Journals and funders now expect systematic reviews to include a PRISMA 2020 flow diagram documenting the search process. Blindspot now generates one automatically from its search results — giving researchers a head start on their review protocol and making Blindspot outputs directly usable in formal submissions.

### Why This Feature

**Institutional credibility**: PRISMA 2020 compliance is required by major systematic review journals (Cochrane, JAMA, BMJ, etc.). Covidence charges institutional pricing specifically because it generates PRISMA outputs. Blindspot now offers this for free.

**Closes a protocol gap**: Until now, researchers had to manually count records and draw the flow diagram themselves. Blindspot already has all the data (per-source review counts, primary study counts, trials, PROSPERO). Surfacing it as a PRISMA diagram takes zero extra API calls.

**Immediately usable**: The diagram is rendered in a dedicated tab on every results page (no AI analysis required — it's based on the search results themselves). It also appears in the printed PDF report.

### No Database Migration Required

The PRISMA diagram is computed entirely from data already stored in the `search_results` table (`existing_reviews`, `primary_study_count`, `clinical_trials_count`, `prospero_registrations_count`). No new columns, no migration.

---

## Files Created / Modified

```
lib/prisma-diagram.ts           — NEW: computePrismaData, formatCount, hasPrismaData + PrismaData type
lib/prisma-diagram.test.ts      — NEW: 23 vitest unit tests (18/18 passing via smoke test)
components/ResultsDashboard.tsx — MODIFIED: added "PRISMA Flow" tab + PrismaFlowTab component
components/PrintableReport.tsx  — MODIFIED: added PRISMA section in printed PDF report
app/globals.css                 — MODIFIED: screen CSS (.prisma-*) + print CSS (.report-prisma-*)
```

---

## Data Flow

```
existingReviews[]                 [ResultsDashboard props / PrintableReport props]
    ↓  (each review has source?: string)
computePrismaData(reviews, primaryStudyCount, clinicalTrialsCount, prosperoCount)
    ↓
PrismaData {
  sources: [{ name: "PubMed", count: N }, …],  // 4 known sources + any extras
  reviewsRetrieved: N,                          // total post-dedup reviews
  databasesSearched: 4,
  primaryStudyCount: N,
  clinicalTrialsCount: N | null,
  prosperoCount: N | null,
}
    ↓
PrismaFlowTab (screen)            → new "PRISMA Flow" tab in ResultsDashboard
PrintableReport PRISMA section    → appears in every printed PDF report
```

---

## `lib/prisma-diagram.ts` Functions

| Function | Description |
|---|---|
| `computePrismaData(reviews, primaryStudyCount, clinicalTrialsCount?, prosperoCount?)` | Builds `PrismaData` from the stored results. Counts reviews by source field. Always emits all 4 known databases in canonical order (PubMed, OpenAlex, Europe PMC, Semantic Scholar), then any unexpected source names. |
| `formatCount(n)` | Returns localized number string or `"N/A"` for null. Used in the diagram when a data source was unavailable. |
| `hasPrismaData(data)` | Runtime guard: returns true if `reviewsRetrieved` is a number. Protects against future API contract changes. |

---

## PRISMA Data Caveat

Blindspot deduplicates reviews cross-database *before* storing them (using title, DOI, and PMID). This means each stored review has the source of the **first database that found it**. Per-database counts in the diagram therefore reflect post-deduplication attribution, not the raw number of records each database returned. A note in the UI explains this to researchers. This is honest and appropriate — the numbers are still useful for documenting the search strategy.

---

## UI / UX

### New "PRISMA Flow" Tab

A fourth tab added to the `ResultsDashboard` tab strip:
- **Always visible**: shown regardless of whether AI gap analysis has been run (it's based on search data only)
- **Identification phase**: 4 database boxes in a 2×2 grid (mobile) / 4-column row (desktop), each showing the database name and deduplicated review count attributed to it
- **Screening phase**: "After deduplication" box showing `reviewsRetrieved`
- **Included phase**: "Systematic reviews retrieved" box with prominent count
- **Background Evidence Context**: horizontal row of cards showing primary studies, registered trials (if available), and PROSPERO registrations (if available; links to PROSPERO search if count > 0)
- **Reference + disclaimer**: Page MJ et al. BMJ 2021;372:n71 + plain-language note that this is a scoping search

### Mobile (375px)

- Database boxes use `grid-cols-2` on mobile, `sm:grid-cols-4` on desktop
- Screening and Included boxes use `w-full sm:w-2/3` — full width on mobile, centered 2/3 on desktop
- Context row uses `grid-cols-1 sm:grid-cols-3`

### Screen CSS (`.prisma-*` classes in `globals.css`)

Added to the non-print section:
- `.prisma-flow-diagram`: container
- `.prisma-phase-label`: badge-style phase labels (IDENTIFICATION / SCREENING / INCLUDED)
- `.prisma-box`, `.prisma-box-source`, `.prisma-box-process`, `.prisma-box-included`, `.prisma-box-context`: flow boxes with colour-coded borders
- `.prisma-box-label`, `.prisma-box-sublabel`, `.prisma-box-count`, `.prisma-box-count-large`, `.prisma-box-note`: typography within boxes
- `.prisma-arrow`: centered arrow between phases

### PrintableReport PDF Section

A new `<section className="report-prisma-section">` appears after "Existing Systematic Reviews" and before the footer:
- Uses inline CSS computed via the IIFE pattern already present in the report
- Shows all 4 phases in print-friendly style
- Background evidence context row with trial/PROSPERO counts if available
- Reference line: "Page MJ, et al. BMJ 2021;372:n71"

### Print CSS (`.report-prisma-*` classes in `globals.css`)

Added inside the `@media print` block:
- `.report-prisma-section`: section container
- `.report-prisma-phase`: uppercase phase label
- `.report-prisma-sources-row`: flex row for database boxes
- `.report-prisma-source-box`: individual database box (bordered)
- `.report-prisma-arrow`: print-friendly arrow
- `.report-prisma-box`, `.report-prisma-box-included`: screening/included boxes
- `.report-prisma-context`, `.report-prisma-context-row`, `.report-prisma-context-box`: background evidence section
- `.report-prisma-dedup-note`: italic note about deduplication
- `.report-prisma-reference`: PRISMA citation line

---

## Unit Tests (18 smoke tests, all passing)

### `computePrismaData` (12 tests)
- Empty reviews → all known sources have count 0
- Counts reviews by source correctly
- `reviewsRetrieved` = array length
- `undefined` source → attributed to "Other"
- All 4 known sources always present in output
- `primaryStudyCount` preserved
- `clinicalTrialsCount` null preserved / value preserved
- `prosperoCount` null preserved / value preserved
- `databasesSearched` always 4
- Unknown source appended after all known sources

### `formatCount` (3 tests)
- null → "N/A"
- 0 → "0"
- 42 → "42"

### `hasPrismaData` (3 tests)
- Valid data → true
- `reviewsRetrieved = 0` → true
- `reviewsRetrieved = undefined` → false

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing warning: `ReviewSkeleton` unused, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **18/18 passed** (all `computePrismaData`, `formatCount`, `hasPrismaData` logic)
- [x] Code review — all 5 changed files cross-checked for consistency
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as previous deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as previous deployments)

---

## Decisions Made

- **New tab (not embedded in another tab)**: PRISMA flow is a distinct output that researchers want to access quickly and share with advisors. A dedicated "PRISMA Flow" tab gives it the prominence it deserves and doesn't bury it in "Gap Analysis" (which requires AI to be run first).
- **Always visible (no AI required)**: The diagram is based solely on search results, which are always available. Making it visible without AI analysis means even users who haven't run gap analysis get immediate value from this tab.
- **Post-dedup counts with explicit note**: Since Blindspot stores deduplicated reviews, each with a `source` attribution to the first database that found it, per-database counts reflect post-dedup attribution. The UI and PDF both include a brief note explaining this. This is the honest representation of what Blindspot's search produces.
- **4 known databases always shown**: Even if a database returned 0 reviews (e.g. due to API downtime), its box is shown with n = 0. This makes it clear which databases were searched, which is required for PRISMA compliance.
- **Background evidence context below the flow**: Primary studies, trials, and PROSPERO counts are contextual (not part of the review screening flow itself) so they're shown in a separate "Background Evidence Context" section below the main flow boxes, separated by a dashed border.
- **PRISMA reference included**: Page MJ et al. BMJ 2021;372:n71 is the canonical PRISMA 2020 reference. Including it in the UI and PDF helps researchers cite it correctly in their protocol.
- **Print CSS separate from screen CSS**: Screen styles use utility-class-friendly `.prisma-*` classes. Print styles use the `.report-prisma-*` convention matching existing print CSS patterns in the codebase.

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue (from `005-handoff.md`) must be resolved before `npm test` and `npm run build` can run on Linux arm64.
- **PRISMA accuracy caveat**: Blindspot's flow diagram represents a scoping search, not a full systematic review. Researchers need to acknowledge in their methods that they conducted additional searches beyond Blindspot's automated scan. The disclaimer in the UI and PDF covers this.
- **Future improvement**: Store raw per-database counts (pre-dedup) in a new JSONB column (e.g. `source_counts`) during the search. This would allow true PRISMA Identification counts showing exactly how many records each database returned before deduplication. Low priority now since the current implementation is already useful and honest.

---

## Next Recommended Features (from `spec/004-market-research.md`)

1. **Email alerts / living search** (#6) — Weekly email digest when new reviews appear on saved topics. Cron job + diff logic + email template. Medium effort, high retention. All prior top-priority features have now been implemented.

2. **Gap type filtering** (#9) — Let users toggle which gap dimensions to emphasize (population, methodology, outcome, geographic, temporal, theoretical). Low effort, medium impact for power users.

3. **Similar Searches / Related Topic Suggestions** (#10) — Surface 3–5 related topic suggestions based on the gap analysis. Low-medium effort, medium engagement impact.

4. **Store raw source counts** — As a follow-on to this PRISMA work: store per-database pre-dedup counts in `source_counts` JSONB during search. Enables accurate PRISMA Identification phase counts.
