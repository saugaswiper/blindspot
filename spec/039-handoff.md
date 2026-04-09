# Handoff 039 — Boolean Query Passthrough in Simple Search Box

**Date:** 2026-04-07
**Automation:** Blindspot daily-improver agent
**Previous handoff:** 038 (PRISMA included-count confidence interval display)

---

## Summary

Implemented **NEW-3 from `spec/026-market-research.md`**: Boolean search operator support in the simple search box.

Power users (librarians, systematic reviewers) can now type PubMed Boolean syntax directly into the search box — `AND`, `OR`, `NOT`, quoted phrases, and PubMed field tags like `[MeSH Terms]` and `[tiab]` — and the query is passed verbatim to the APIs without the auto-splitting logic rewriting it.

A real-time "Boolean" badge appears below the input when operators are detected, so users immediately see that advanced mode is active.

---

## Problem

Before this change, the `buildReviewQuery()` function in `app/api/search/route.ts` always split the user's input on natural-language connector words (`for`, `in`, `with`, `and`, `of`, etc.) and rebuilt it as a simple AND query. This was correct for natural-language input like `"CBT for insomnia in elderly"` → `"CBT" AND "insomnia" AND "elderly"`.

But if a user typed a deliberate Boolean string like `"CBT"[tiab] OR "cognitive behavioral therapy"[MeSH Terms]`, the splitter would rewrite it incorrectly. Advanced users — particularly evidence synthesis librarians and PhD students with PubMed experience — had no way to leverage their Boolean expertise.

---

## What Was Built

### 1. `isUserBooleanQuery()` — `lib/boolean-search.ts`

New exported pure function:

```typescript
export function isUserBooleanQuery(input: string): boolean
```

**Returns `true`** when the input contains:
- Uppercase `AND`, `OR`, or `NOT` as whole words
- PubMed field-tag brackets: `[MeSH Terms]`, `[tiab]`, `[tw]`, `[pt]`, `[Title/Abstract]`, `[Publication Type]`

**Returns `false`** for:
- Lowercase `and` (natural-language connector — unchanged auto-split behaviour)
- `And`, `aNd`, mixed-case variants (not intentional operator syntax)
- `and` as a substring of another word (`randomized`)
- Plain natural-language queries with no operators

**Rationale for uppercase-only trigger:** Lowercase `and` is extremely common in natural-language research topics ("CBT for insomnia and anxiety", "physical activity and diabetes"). Treating it as a Boolean operator would change behaviour for the vast majority of normal queries. Users who know PubMed Boolean syntax use uppercase operators — this is PubMed's own convention.

### 2. `buildReviewQuery()` — `app/api/search/route.ts`

Added an early-return path for user Boolean queries:

```typescript
if (isUserBooleanQuery(raw)) return raw;
```

When the user has entered explicit Boolean syntax, their query is passed verbatim to PubMed, OpenAlex, EuropePMC, and Semantic Scholar. The auto-splitting and auto-quoting logic is bypassed entirely.

The natural-language auto-split path (splitting on `for`, `in`, `with`, `and`, etc.) remains unchanged for all queries without uppercase operators.

### 3. `filterByRelevance()` — `app/api/search/route.ts`

Added an early-return guard for queries containing `OR` or `NOT`:

```typescript
if (/\b(OR|NOT)\b/.test(reviewQuery)) return reviews;
```

**Why this matters:** The existing `filterByRelevance()` function requires ALL AND-joined concepts to appear in every returned review's title/abstract. This is correct for AND-only queries (`"CBT" AND "insomnia"` → both concepts must appear). But for `OR` queries (`"CBT" OR "cognitive therapy"`) and `NOT` queries (`depression NOT seasonal`), the AND-all model would incorrectly discard reviews that match only one branch of an OR, or that correctly exclude the NOT-ed concept. For these queries, the API's own relevance ranking is authoritative and the client-side filter is skipped.

### 4. Boolean badge — `components/TopicInput.tsx`

Real-time visual indicator: when `isUserBooleanQuery(queryText)` returns true, a small `Boolean` badge and helper text appear below the search input:

```
[Boolean]  Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.
```

Styled to match the existing surface/border/accent tokens (works in both light and dark mode). Only shown when no validation error is present (errors take priority).

### 5. Unit tests — `lib/boolean-search.test.ts`

New `describe("isUserBooleanQuery", ...)` suite with **16 tests** covering:

**Positive cases (should return true):**
- Uppercase `AND`, `OR`, `NOT` as standalone operators
- Multi-operator query
- `[MeSH Terms]`, `[tiab]`, `[pt]` field tags
- Full realistic PubMed query with brackets and operators

**Negative cases (should return false):**
- Lowercase `and` only (natural language)
- Natural-language query with no operators
- Single keyword
- Empty string
- Whitespace-only string
- `AND` as a substring of another word (e.g. `"randomized"`)
- Mixed-case `And` (not intentional operator syntax)
- `OR` as a substring of another word (e.g. `"order"`)

---

## Files Modified

```
lib/boolean-search.ts          — isUserBooleanQuery() function (+35 lines),
                                  module docstring update (+2 lines)

app/api/search/route.ts        — import isUserBooleanQuery (+1 line),
                                  buildReviewQuery(): Boolean passthrough path (+6 lines),
                                  filterByRelevance(): OR/NOT early-return guard (+5 lines)

components/TopicInput.tsx      — import isUserBooleanQuery (+1 line),
                                  Boolean badge below input (+14 lines)
```

## Files Modified (tests)

```
lib/boolean-search.test.ts     — import isUserBooleanQuery (+1 line),
                                  describe("isUserBooleanQuery") suite (+63 lines, 16 tests)
```

---

## User Experience

### Before

A user typed: `"CBT"[tiab] OR "cognitive behavioral therapy"[MeSH Terms] AND "insomnia"[MeSH Terms]`

Result: the auto-splitter rewrote this (splitting on `OR`, `AND`, and the natural-language `or`) into an incorrect multi-part AND query, discarding the user's carefully constructed PubMed syntax.

### After

The same input triggers the `isUserBooleanQuery` guard. The search box shows:

```
[Boolean]  Query passed to PubMed as-is — AND, OR, NOT and field tags are supported.
```

The query is forwarded verbatim to all four search APIs. PubMed's native query parser handles it exactly as it would in the PubMed search box, including MeSH term expansion and field restrictions.

This particularly benefits the **Evidence Synthesis Librarian** persona (from `spec/004-market-research.md`) who constructs structured Boolean searches professionally and expects their syntax to be respected.

---

## Design Notes

**Why no UI mode toggle:** The feature is purely detection-based — no user action required. Power users who know Boolean syntax get it automatically; users who type natural language see no change. This avoids UI clutter and the cognitive overhead of a "switch modes" toggle.

**Why only uppercase triggers:** PubMed's own documentation uses uppercase AND/OR/NOT as the canonical form. Librarians and database searchers type it this way by convention. Lowercase connectors (`and`, `or`) are ambiguous — they appear in hundreds of valid research topics. The uppercase requirement is both PubMed-conventional and prevents false positives.

**`filterByRelevance` for pure AND Boolean queries:** AND-only Boolean queries (e.g., `CBT AND insomnia NOT pediatric`) — wait, `NOT` triggers the early return. For AND-only queries like `CBT AND insomnia`, the `extractQueryConcepts` AND-splitter still works correctly, so the existing relevance filter fires as normal. No special handling needed for pure AND.

---

## Verification Status

```
npx eslint lib/boolean-search.ts lib/boolean-search.test.ts components/TopicInput.tsx app/api/search/route.ts
→ Exit 0 (0 errors, 0 warnings)

npx tsc --noEmit
→ Exit 0 (no type errors)

npm test
→ Blocked: known rollup ARM64 binary mismatch (same as handoffs 035–038).
  Tests written and type-checked; will execute once environment resolves.

npm run build
→ Blocked: .fuse_hidden files in .next/ directory (infrastructure EPERM issue,
  same as previous sessions).
```

---

## Recommended Next Steps

1. **[High] Supabase telemetry for PRISMA rate validation** — Log `afterDedup`, `tier`, and `included` per search to a `search_telemetry` table. After 50+ real searches, compare CI coverage against PROSPERO-registered reviews. Validates the ÷2 to ×2 CI range from handoff 038 against real-world data.

2. **[Medium] Confidence score for gap analysis** — From `spec/026-market-research.md` item 8 (NEW). Add an "analyzed N abstracts" count alongside the gap analysis and a per-gap confidence indicator. Makes AI output more transparent and trustworthy.

3. **[Medium] Boolean query indicator in search history** — The search history dashboard (handoff 009) currently shows the raw query text. For Boolean queries, add a small badge so users can distinguish natural-language from Boolean searches at a glance.

4. **[Low] Boolean input syntax hints** — When the `Boolean` badge is active, surface a small expandable help panel listing common PubMed field tags (`[tiab]`, `[MeSH Terms]`, `[pt]`) with one-line explanations. Helps intermediate users learn the syntax.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
