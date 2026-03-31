# Handoff: Similar Searches / Related Topic Suggestions
**Date:** 2026-03-29
**Session tool:** Automated daily-improver agent
**Written by:** Blindspot daily-improver agent

---

## What Was Built

Implemented **Similar Searches / Related Topic Suggestions** — improvement #10 from the market research report (`spec/004-market-research.md`).

After running an AI gap analysis, researchers see a new **"Explore Related Topics"** section at the bottom of the results page. It surfaces 3–4 related search queries derived directly from the gap analysis's `suggested_topics` — one click pre-fills the search box on the Blindspot home page and the user can immediately run a new search on an adjacent topic.

### Why This Feature

**Pivot without retyping**: Researchers often discover their initial topic is either too well-studied or too narrow. Until now, they'd have to close the results page, return to the home page, and manually type a new query. Related Searches eliminates that friction — a single click takes them to the search page with the query pre-filled.

**Zero new API calls**: All data is already on the page from the gap analysis. The `suggested_topics` in `GapAnalysis` each have a `pubmed_query` field. Blindspot's `deriveRelatedSearches()` utility cleans those queries to plain language and surfaces them as clickable cards.

**Engagement and retention**: Seeing relevant adjacent topics encourages a second search in the same session, increasing time-on-site and repeat usage — the same mechanism that drives engagement on search engines' "Related searches" and Google Scholar's "Related articles".

**No backend or database changes**: The feature is entirely client-side. `deriveRelatedSearches()` is a pure function operating on data that's already available in `ResultsDashboard`.

---

## Files Created / Modified

```
lib/related-searches.ts         — NEW: cleanPubMedQuery, truncateLabel, extractSnippet, deriveRelatedSearches
lib/related-searches.test.ts    — NEW: 32 vitest-compatible unit tests (32/32 passing via Node.js smoke test)
components/ResultsDashboard.tsx — MODIFIED: RelatedSearchCard, RelatedSearchesSection components + render call
components/TopicInput.tsx       — MODIFIED: pre-populate query from ?q= URL param via useSearchParams()
app/page.tsx                    — MODIFIED: wrap <TopicInput> in <Suspense> (required by Next.js for useSearchParams)
```

---

## Data Flow

```
GapAnalysis.suggested_topics[]         [already on page from Supabase]
    ↓
deriveRelatedSearches(gapAnalysis, 4)  [lib/related-searches.ts]
    — sort by feasibility (high first)
    — clean each pubmed_query via cleanPubMedQuery()
    — skip queries < 5 chars or duplicate (case-insensitive)
    — return up to 4 RelatedSearch objects
    ↓
RelatedSearchesSection                  [components/ResultsDashboard.tsx]
    — renders 2-column grid of RelatedSearchCard components
    — each card links to /?q=<encodeURIComponent(search.query)>
    ↓
TopicInput (on home page)               [components/TopicInput.tsx]
    — useSearchParams().get("q") pre-fills the query input on page load
    — user clicks "Find Research Gaps" to run the new search
```

---

## `lib/related-searches.ts` Exports

| Export | Type | Description |
|---|---|---|
| `RelatedSearch` | Interface | `{ query, label, snippet, gapType, feasibility }` — one related search suggestion. |
| `cleanPubMedQuery(raw)` | `(string) → string` | Strips PubMed field qualifiers (`[MeSH Terms]`, `[tiab]`, `[pt]`), Boolean operators, parentheses, and quotes. Collapses whitespace. Returns plain-language query. |
| `truncateLabel(text, maxChars?)` | `(string, number?) → string` | Truncates at word boundary, appending "…". Default maxChars = 60. |
| `extractSnippet(rationale, maxChars?)` | `(string, number?) → string` | Extracts the first sentence (period/!/?) of a rationale string. Falls back to 120-char truncation if no sentence boundary found within limit. |
| `deriveRelatedSearches(gapAnalysis, maxSuggestions?)` | `(GapAnalysis|null, number?) → RelatedSearch[]` | Main entry point. Sorts suggested_topics by feasibility (high → moderate → low), cleans each pubmed_query, deduplicates (case-insensitive), and returns up to `maxSuggestions` (default 4) results. Returns `[]` for null input. |

---

## UI / UX

### "Explore Related Topics" Section

Appears below the tab panel (above the sources disclaimer) **only when gap analysis has been run** and has at least one suggested topic. If gap analysis hasn't been run yet, the section is absent — users aren't shown an empty state.

```
Explore Related Topics          Click to search on Blindspot →

[Population | High feasibility]  ›    [Methodology | Moderate feasibility] ›
  keyword1 keyword2 keyword3            keyword4 keyword5 keyword6
  First sentence of rationale…         First sentence of rationale…

[Outcome | High feasibility]     ›    [Geographic | Low feasibility]    ›
  keyword7 keyword8 keyword9            keyword10 keyword11 keyword12
  First sentence of rationale…         First sentence of rationale…
```

### Related Search Cards

Each card (`RelatedSearchCard`):
- 2-column grid on sm+ screens; single column on mobile (375px)
- Dimension badge (color-coded, matching the Gap Analysis tab's `gap-filter.ts` color vocabulary: violet/blue/green/amber/pink/teal)
- Feasibility badge (green/amber/gray)
- Query label in medium-weight text (truncated at 60 chars)
- Snippet — first sentence of the topic's rationale
- Right-chevron icon that animates to blue on hover

Clicking any card navigates to `/?q=<encodeURIComponent(query)>` — a standard `<a>` href (not `router.push`), so middle-click / right-click / Ctrl+click all work as expected for opening in a new tab.

### TopicInput Pre-Population

`TopicInput` now reads `?q=` from the URL via `useSearchParams()` and uses it as the initial value of the query text field. The user sees the query pre-filled and can edit it before clicking "Find Research Gaps".

Next.js App Router requires any component using `useSearchParams()` to be wrapped in a `<Suspense>` boundary in the parent. `app/page.tsx` now wraps `<TopicInput>` in:

```tsx
<Suspense fallback={<div className="h-24 bg-gray-50 rounded-lg animate-pulse" />}>
  <TopicInput />
</Suspense>
```

The fallback is a subtle loading skeleton that matches the surrounding card's height, preventing layout shift.

### Mobile (375px)

- Card grid uses `grid-cols-1` on mobile, `sm:grid-cols-2` on desktop
- Card text wraps naturally — no overflow or truncation issues
- Chevron icon is always `shrink-0` so it doesn't collapse
- "Explore Related Topics" heading + subtext stacks on small screens

---

## Query Cleaning Details

`cleanPubMedQuery()` handles both:
1. **Full PubMed syntax**: `"insomnia"[MeSH Terms] AND "elderly"[tiab]` → `insomnia elderly`
2. **Gemini's typical output**: `"ketamine elderly depression treatment"` → `ketamine elderly depression treatment`

Steps (in order):
1. Strip field qualifiers: `/\[[\w\s]+\]/gi` (matches `[MeSH Terms]`, `[tiab]`, `[pt]`, `[tw]`, etc.)
2. Strip Boolean operators (whole-word): `/\b(AND|OR|NOT)\b/g`
3. Strip quotes and punctuation: `["'()[\]]`
4. Collapse runs of whitespace to single space
5. Trim leading/trailing whitespace

---

## Unit Tests (32 smoke tests, all passing)

Tested via Node.js inline smoke test (same approach as all prior sessions — vitest is blocked by cross-platform rollup binary issue).

### `cleanPubMedQuery` (13 tests)
- Plain keywords preserved; [MeSH Terms], [tiab], [pt] stripped; AND/OR/NOT removed; parens removed; quotes stripped; whitespace collapsed; empty input; operator-only input; mixed qualifiers+words.

### `truncateLabel` (4 tests)
- Short text unchanged; word-boundary truncation with ellipsis; default maxChars=60; empty string.

### `extractSnippet` (5 tests)
- First sentence extracted at period; long-sentence fallback truncation; full text when shorter than limit; exclamation mark; question mark.

### `deriveRelatedSearches` (10 tests)
- Null input → `[]`; empty topics → `[]`; respects maxSuggestions default (4); respects custom maxSuggestions; feasibility sort order (high → moderate → low); case-insensitive deduplication; skips short cleaned queries (< 5 chars); correct field mapping; post-cleaning deduplication; does not mutate input array.

---

## Decisions Made

- **`<a href>` not `router.push`**: Using a regular anchor lets users Ctrl+click / middle-click to open searches in new tabs. Researchers often want to compare multiple related topics side-by-side without losing the current results page.
- **Shown only when gap analysis is complete**: The `suggested_topics` are only available after AI analysis. Showing the section without them would require a separate API call. Instead, the section is conditionally rendered when `localGapAnalysis.suggested_topics.length > 0`.
- **Max 4 suggestions**: 4 is enough to cover all major gap dimensions without overwhelming users. The grid shows 2 per row on desktop which is visually clean.
- **Feasibility sort priority**: High-feasibility topics are shown first because they represent the most actionable pivots for users. This maximises the chance that the first suggestion a user sees is one they'd actually want to pursue.
- **Color vocabulary from gap-filter.ts**: The dimension colors in `RelatedSearchCard` match `gap-filter.ts`'s color scheme (violet=population, blue=methodology, etc.). This creates a consistent visual language across the Gaps tab and the Related Searches section.
- **Snippet = first sentence**: The full rationale can be 2-3 sentences long. The first sentence is usually the most informative ("This review is needed because..."). Extracting it via punctuation detection is more reliable than character-count truncation.
- **Suspense fallback is height-matched**: The `h-24` fallback prevents the page from jumping when `TopicInput` hydrates. Without it, the search box area would briefly be empty then pop in.

---

## Backward Compatibility

- Results **without** gap analysis (phase 1 or 2 results, or results where the user hasn't clicked "Run AI Gap Analysis") show no Related Searches section. The conditional `localGapAnalysis && localGapAnalysis.suggested_topics.length > 0` guards this.
- The `?q=` URL param is **optional** in `TopicInput`. If absent (direct navigation to `/`), `searchParams.get("q")` returns `null`, and `useState` initialises with `""` as before.

---

## Verification Status

- [x] `npm run lint` — 0 errors (1 pre-existing `ReviewSkeleton` warning, unrelated)
- [x] `npx tsc --noEmit` — 0 errors
- [x] Smoke tests — **32/32 passed** (cleanPubMedQuery, truncateLabel, extractSnippet, deriveRelatedSearches logic)
- [ ] `npm test` — blocked by cross-platform rollup native binary issue (same as all prior deployments)
- [ ] `npm run build` — blocked by cross-platform SWC binary issue (same as previous deployments)

---

## Open Questions / Blockers

- The `node_modules` cross-platform issue persists (from `005-handoff.md`). Fix: `rm -rf node_modules package-lock.json && npm install` on the deployment platform (Linux arm64).
- **Query quality**: The `pubmed_query` field is a short keyword string from Gemini. In most cases it's a clean 3-5 word query that works well in the search box. In rare cases (especially for theoretical gap types) the keywords may be abstract. If users report confusing suggestions, consider using the `title` field instead of `pubmed_query` as the search string.
- **URL state persistence**: Filter state on the Gaps tab currently resets when the user navigates to a Related Search and returns (browser back). This is by design — each results page is a fresh view.

---

## Next Recommended Features (from `spec/004-market-research.md`)

1. **Email alerts / living search** (#6) — Weekly email digest when new reviews appear on saved topics. Cron job + diff logic + Resend email template. Medium effort, high retention. This is now the top unimplemented high-impact item.

2. **Store raw source counts** — Per-database pre-deduplication record counts stored in a `source_counts` JSONB column during search. Enables truly accurate PRISMA Identification phase numbers (follow-on to `010-handoff.md`).

3. **Team/collaboration** (#11) — Allow sharing results with team members, adding notes/comments to gaps, assigning gap topics. High effort, enables institutional adoption.

4. **Cochrane Library direct search** (#13) — Add direct Cochrane API integration for more authoritative systematic review discovery. Medium effort, high clinical credibility.
