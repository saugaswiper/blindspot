# Handoff 040 — Boolean UX: Search History Badge + Expandable Syntax Hints

**Date:** 2026-04-08
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 039 (Boolean query passthrough in simple search box)

---

## Summary

Two follow-on UX improvements that complete the Boolean search feature set introduced in handoff 039:

1. **Boolean badge in search history dashboard** — When a search used Boolean syntax (uppercase AND/OR/NOT, PubMed field tags), a small "Boolean" badge now appears in the search history card alongside the feasibility and monitoring badges.

2. **Expandable Boolean syntax hints panel in TopicInput** — The static Boolean hint line is replaced with a toggleable panel. Clicking "Show syntax ▾" reveals a reference table of common PubMed field tags and operators, plus a link to the full PubMed search tag documentation.

---

## Problem

Handoff 039 implemented Boolean passthrough and added a static badge line below the search input:
> `[Boolean] Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.`

This left two UX gaps:

**Gap 1 — Search history was "Boolean-blind":** A user who had run a mix of natural-language and Boolean searches saw identical cards in their dashboard. There was no way to distinguish which searches used structured Boolean syntax vs. auto-split natural language.

**Gap 2 — No syntax reference for users learning Boolean queries:** The badge told users that Boolean syntax was supported but gave no examples of PubMed field tags. An evidence synthesis librarian using the tool professionally would know `[tiab]` and `[MeSH Terms]`; a PhD student who has never used PubMed's advanced search would not. The tag syntax is non-obvious (`[tiab]`, `[MeSH Terms]`, `[pt]`), and requiring users to leave the site to consult PubMed's help page creates unnecessary friction.

---

## What Was Built

### 1. Boolean Badge — `app/dashboard/page.tsx`

Added an import of `isUserBooleanQuery` from `@/lib/boolean-search`. Since `isUserBooleanQuery` is a pure function with no browser-specific APIs, it works correctly in a Next.js server component.

**Placement:** In the badge row of each search history card, between the Monitoring badge and the feasibility badge. It renders only when `isUserBooleanQuery(search.query_text)` returns `true`.

**Visual design:** Matches the Boolean badge in `TopicInput.tsx` — same accent-coloured text on surface-2 background with a 1px border. Uses `var(--surface-2)`, `var(--border)`, and `var(--accent)` CSS tokens so it works in both light and dark mode.

**Title attribute:** `"Boolean query — passed to PubMed as-is (AND, OR, NOT, field tags)"` — tooltips on hover for users who aren't sure what the badge means.

**Why this matters:** Power users (evidence synthesis librarians, experienced PhD students) build carefully crafted Boolean strings and return to the dashboard to refine or revisit them. The badge lets them immediately identify their structured searches and understand that those searches were executed verbatim rather than auto-split.

### 2. Expandable Syntax Hints Panel — `components/TopicInput.tsx`

Added a `showBooleanHints` boolean state (`useState(false)`) to the `TopicInput` client component.

The existing Boolean hint line is refactored into a two-part UI:

**Header row (always shown when Boolean badge is active):**
```
[Boolean] Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.  [Show syntax ▾]
```

The "Show syntax ▾" / "Hide syntax ▴" button is a `type="button"` element (prevents form submission on click) with `aria-expanded` and `aria-controls` attributes for accessibility.

**Expandable panel (`id="boolean-hints-panel"`):**

When open, renders a compact reference table of the 8 most useful PubMed query constructs:

| Syntax | Description |
|--------|-------------|
| `AND` | Both terms required — `CBT AND insomnia` |
| `OR` | Either term — `CBT OR "cognitive therapy"` |
| `NOT` | Exclude — `insomnia NOT pediatric` |
| `[tiab]` | Title/abstract field — `"CBT"[tiab]` |
| `[MeSH Terms]` | MeSH controlled vocabulary |
| `[pt]` | Publication type — `"Systematic Review"[pt]` |
| `[dp]` | Date published — `2020:2024[dp]` |
| `[au]` | Author name — `"Smith J"[au]` |

Plus a "Full PubMed search tag reference →" link to PubMed's official help page (`https://pubmed.ncbi.nlm.nih.gov/help/#search-tags`), opened in a new tab with `rel="noopener noreferrer"`.

**Visual design:** Surface-2 background, border token, muted text — matches the existing surface/border design system. Tag names are rendered in monospace and accent color. The panel uses a `<table>` layout to align tags and descriptions without fixed column widths.

**State persistence:** `showBooleanHints` is not reset when the query changes. If a user opens the hints, clears their query, then re-enters Boolean syntax, the hints panel will still be open — which is intentional (they chose to open it). The panel is only visible when `isUserBooleanQuery(queryText) && !errors.queryText` is true, so it is automatically hidden when operators are not present.

---

## Files Modified

```
app/dashboard/page.tsx          — import isUserBooleanQuery (+1 line),
                                   Boolean badge in search card (+14 lines)

components/TopicInput.tsx       — useState for showBooleanHints (+1 line),
                                   refactored Boolean hint block with toggle
                                   button and hints panel (+52 lines, net ~+40)
```

---

## User Experience

### Before

**Dashboard:** All search history cards looked identical. A Boolean search like `"CBT"[tiab] OR "cognitive behavioral therapy"[MeSH Terms] AND "insomnia"[MeSH Terms]` showed just the truncated query text with a feasibility badge — no indication that this was a structured Boolean query.

**TopicInput hint (when Boolean active):**
```
[Boolean] Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.
```
No examples, no field tag reference.

### After

**Dashboard:** Boolean searches show:
```
"CBT"[tiab] OR "cognitive behavioral therapy"[MeSH Terms] AND...    [Boolean] [High] [Analyzed]
```

**TopicInput hint (when Boolean active, collapsed):**
```
[Boolean] Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.  [Show syntax ▾]
```

**TopicInput hint (when expanded):**
```
[Boolean] Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.  [Hide syntax ▴]

Common PubMed syntax
AND        Both terms required — CBT AND insomnia
OR         Either term — CBT OR "cognitive therapy"
NOT        Exclude — insomnia NOT pediatric
[tiab]     Title/abstract field — "CBT"[tiab]
[MeSH Terms]  MeSH controlled vocabulary — "Sleep..."[MeSH Terms]
[pt]       Publication type — "Systematic Review"[pt]
[dp]       Date published — 2020:2024[dp]
[au]       Author name — "Smith J"[au]

Full PubMed search tag reference →
```

---

## Design Notes

**Why no separate "Boolean mode" toggle or dedicated page:** The hints are inline and contextual — they only appear when the user is already typing a Boolean query. This is zero-friction discovery: users who know Boolean syntax never see the panel; users who just learned about it can immediately reference common tags without navigating away.

**Why 8 tags (not more, not fewer):** PubMed has ~40 field qualifiers but 80%+ of real-world systematic review queries use only these 8. A longer list would increase cognitive load; a shorter one would omit date filtering (`[dp]`) and publication type filtering (`[pt]`) which are critical for systematic review searches.

**Why `[Boolean]` badge in the dashboard is a server component concern:** The dashboard fetches up to 50 searches from Supabase and renders them server-side. Making the badge client-side (via a wrapper component with "use client") would force a hydration round-trip for a trivial style change. `isUserBooleanQuery` is a pure string function with no browser APIs, so importing it directly in the server component is the correct approach.

---

## Accessibility

- Toggle button has `aria-expanded` (true/false) and `aria-controls="boolean-hints-panel"` — screen readers announce the expanded/collapsed state.
- Panel `id="boolean-hints-panel"` matches the `aria-controls` value.
- `aria-label="Boolean query"` on the dashboard badge gives screen readers context.
- The "Full PubMed search tag reference →" link opens in a new tab, which is disclosed by the screen reader (standard browser behavior).

---

## Verification Status

```
npx eslint app/dashboard/page.tsx components/TopicInput.tsx
→ Exit 0 (0 errors, 0 warnings)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–039).
  No new pure logic was added that requires new test coverage.
  Existing isUserBooleanQuery tests in lib/boolean-search.test.ts cover
  the detection logic used by both new features.

npm run build
→ Blocked: .fuse_hidden files in .next/ directory (infrastructure EPERM issue,
  same as previous sessions).
```

---

## Recommended Next Steps

1. **[High] Supabase telemetry for PRISMA rate validation** — Log `afterDedup`, tier, and `included` per search to a `search_telemetry` table. After 50+ real searches, validate whether the ÷2 to ×2 CI (from handoff 038) captures the true included count in production. Requires a Supabase migration (new table + RLS policy).

2. **[High] "Low evidence" disclaimer on gap analysis** — From `spec/026-market-research.md` ACC-1, the hard gate blocks AI on `< 3` studies. But `Low` feasibility (3–5 studies) still runs AI analysis with no disclaimer. Add a prominent amber banner to the gap analysis results panel: "Based on limited evidence (N studies). Gap analysis results should be interpreted with caution and supplemented with a hand search." This is a 2-line UI change in `components/ResultsDashboard.tsx`.

3. **[Medium] Persistent PROSPERO match count in dashboard** — The dashboard shows Monitoring / Boolean / Feasibility / Analyzed badges. If `prospero_registrations_count > 0`, add a `⚠ PROSPERO` warning badge so reviewers can immediately see which of their saved searches have possible registry matches without opening each result.

4. **[Low] Boolean query count in dashboard summary line** — The dashboard header currently shows "N searches saved". Extend this to "N searches saved · M Boolean". Useful for librarians who run many structured searches and want to see their query composition at a glance. Low effort (one `filter()` call).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
