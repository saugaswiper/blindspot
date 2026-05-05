# Handoff 055 — CRIT-1 OpenAlex API Key + ACC-11 INPLASY + NEW-11 S2 Hardening + ACC-13 Borderline Note + UI-5 PICO Display

**Date**: 2026-05-03
**Previous handoff**: spec/054-handoff.md
**Status**: Implemented and verified (TypeScript clean, ESLint 0 errors)

---

## 1. Summary

Five improvements from `spec/054-market-research.md` implemented in one session:

| ID | Item | Priority | Files changed |
|---|---|---|---|
| CRIT-1 | OpenAlex API key migration (mailto= → api_key=) | Critical | `lib/openalex.ts`, `lib/topic-broadening.ts`, `.env.example` |
| ACC-11 | INPLASY registry check | High | `lib/inplasy.ts` (new), `supabase/migrations/017_inplasy_count.sql` (new), `app/api/search/route.ts`, `components/ResultsDashboard.tsx`, `app/results/[id]/page.tsx` |
| NEW-11 | Semantic Scholar rate-limit hardening | High | `lib/semanticscholar.ts` |
| ACC-13 | Borderline study count note in study design | Low | `lib/study-design.ts` |
| UI-5 | PICO pre-fill display on results page | Medium | `app/results/[id]/page.tsx`, `components/ResultsDashboard.tsx` |

---

## 2. CRIT-1 — OpenAlex API Key Migration

### What changed
`lib/openalex.ts` and `lib/topic-broadening.ts` used `mailto=` (OpenAlex polite pool), discontinued on 2026-02-13. All requests now require `api_key=` instead.

### Changes

**`lib/openalex.ts`**:
- Renamed `EMAIL` → `OPENALEX_API_KEY`; reads `process.env.OPENALEX_API_KEY` with fallback to `process.env.OPENALEX_EMAIL` for backward compatibility
- All three `url.searchParams.set("mailto", EMAIL)` calls → `url.searchParams.set("api_key", OPENALEX_API_KEY)`

**`lib/topic-broadening.ts`**:
- Same rename pattern
- `openAlexHeaders()` now returns a plain `User-Agent` header (the mailto= User-Agent pattern is obsolete)
- All `url.searchParams.set("mailto", EMAIL)` calls → `url.searchParams.set("api_key", OPENALEX_API_KEY)`

**`.env.example`**:
- Replaced `OPENALEX_EMAIL=...` with `OPENALEX_API_KEY=...` and link to `openalex.org/settings/api`

### Action required for deployment
1. Get a free key at `https://openalex.org/settings/api`
2. Add `OPENALEX_API_KEY=<your-key>` to Vercel environment variables
3. Remove the old `OPENALEX_EMAIL` variable from Vercel (optional; the fallback reads it if `OPENALEX_API_KEY` is absent)

The `.env.local` file still has `OPENALEX_EMAIL=19dbd1@queensu.ca`. This will continue to work as a fallback until the Vercel variable is set.

---

## 3. ACC-11 — INPLASY Registry Check

### What was built
`lib/inplasy.ts` — new module following the same pattern as `lib/osf-registry.ts`:
- `searchINPLASY(query)` — queries `https://inplasy.com/wp-json/wp/v2/posts?search=<query>&per_page=1`; reads `X-WP-Total` response header for the count; graceful degradation (returns 0) on any failure
- `formatINPLASYStatus(count)` — returns `{ label, hasMatch }` for the compact badge
- `formatINPLASYWarning(count)` — returns the warning banner text

**`supabase/migrations/017_inplasy_count.sql`** — adds `inplasy_count integer` column to `search_results`.

**`app/api/search/route.ts`** — INPLASY search runs in parallel with PROSPERO/OSF in the `Promise.allSettled` batch; stored as `inplasy_count` in `searchData`.

**`components/ResultsDashboard.tsx`**:
- `inplasyCount` prop added to `Props` and function signature
- Compact badge in the registry panel (between OSF and Feasibility)
- Detail banner when `inplasyCount > 0` (same yellow warning style as PROSPERO/OSF)

**`app/results/[id]/page.tsx`** — fetches `inplasy_count` from DB and passes as `inplasyCount` prop.

### Migration needed
Apply `supabase/migrations/017_inplasy_count.sql` to production:
```sql
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS inplasy_count integer;
```
The API route handles missing columns gracefully (the column defaults to NULL).

---

## 4. NEW-11 — Semantic Scholar Rate-Limit Hardening

`lib/semanticscholar.ts` — added `fetchWithRetry()` helper:
- On HTTP 429: waits 1s, 2s, 4s (exponential backoff), retries up to 3 times
- If all retries exhausted: logs a warning and returns `null`
- `searchExistingReviews()` checks for `null` response and returns `[]` (empty array) instead of throwing
- Non-429 errors still throw as before so the search route can log them correctly

This prevents a Semantic Scholar rate-limit from blocking the main search response.

---

## 5. ACC-13 — Borderline Study Count Note in Study Design

`lib/study-design.ts` — added `borderlineNote` text to two rationale strings:

- **Low score (3–5 studies)**: when `count >= 5 && count <= 7`, appends: *"Note: with N primary studies, this topic is near the Low/Moderate boundary. If your database searches surface additional studies during your review, a systematic review may become feasible."*

- **Moderate score (6–10 studies)**: when `count >= 9 && count <= 12`, appends: *"Note: with N primary studies, this topic is near the Moderate/High boundary. If additional studies are found during your search, a full meta-analysis may be feasible."*

The borderline zones are ±2 of each threshold (Low/Moderate threshold at 6, Moderate/High at 11). No API or logic changes — pure rationale text enhancement.

---

## 6. UI-5 — PICO Pre-fill Display on Results Page

PICO fields have been stored in the `searches` table since handoff 052 but were never surfaced on the results page.

**`app/results/[id]/page.tsx`**:
- Expanded the `searches` sub-select to include `pico_population, pico_intervention, pico_comparison, pico_outcome`
- Builds a `picoFields` object from the fetched data and passes it as a new `picoFields` prop

**`components/ResultsDashboard.tsx`**:
- `picoFields` prop added (type: `{ population, intervention, comparison, outcome } | null`, defaults to `null`)
- A `<details>` collapsible block renders immediately below the `<h1>` query title
- Only rendered when at least one PICO field is non-null and non-empty
- Four labeled pills: **P:** population · **I:** intervention · **C:** comparison · **O:** outcome
- Uses CSS variables for theming (dark-mode compatible); `group-open:hidden` toggle arrow

---

## 7. Verification

```
npx tsc --noEmit  → clean (0 errors)
npx eslint ...    → 2 pre-existing warnings only (FEASIBILITY_BADGE unused, unrelated to this PR)
npm test          → blocked by known rollup ARM64 binary mismatch (pre-existing, not introduced here)
npm run build     → same known blocker
```

---

## 8. Next Steps

1. **Apply migration 017** to production Supabase: `ALTER TABLE search_results ADD COLUMN IF NOT EXISTS inplasy_count integer;`
2. **Set `OPENALEX_API_KEY` in Vercel** (free key from `openalex.org/settings/api`) — highest urgency; the 100 free test credits may already be partially consumed
3. **ACC-12 — Gap Analysis Freshness Indicator** — the AI gap analysis is cached permanently; add `gap_analysis_generated_at` column + "Refresh analysis" button for results older than 6 months
4. **NEW-8 — Living Systematic Review Detection** — add `AND "living systematic review"[tiab]` PubMed count variant; show informational banner when count > 0
5. **ACC-15 — Cross-Source Confidence Score** — CV-based "Sources agree/vary/disagree" indicator using already-stored per-source counts
6. **EuropePMC field-restriction** — deferred from handoff 054; investigate title/abstract-only query rewriting to reduce overcounting
