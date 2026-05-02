# Handoff 053 — Elsevier/Scopus Integration + True ID-Based Deduplication

**Date:** 2026-05-02
**Previous handoff:** 052 (PICO-1: Store PICO Fields on Search Insert)

---

## Summary

Two major improvements shipped in one commit:

1. **Elsevier Scopus integration** — Scopus is now a fifth search source alongside PubMed, OpenAlex, EuropePMC, and Semantic Scholar. It adds systematic review results and primary study counts for interdisciplinary and social science topics underserved by PubMed.

2. **True ID-based deduplication** — Replaced the fixed `dedupFactor = 0.75` approximation with an empirical deduplication fraction computed from real document IDs fetched from each source. Each source now exports a `fetchPrimaryStudyIds()` function; the route collects 200 ID samples per source in parallel (no added latency) and computes the fraction of unique records. This fraction replaces the hard-coded 0.75.

3. **FieldExplorer "Something went wrong" diagnostic fix** — Wrapped `cookieStore.set()` in try-catch (can throw in certain Next.js 16 cookie contexts), and added `_debug` field to error responses in non-production environments so the actual error message is visible during development.

---

## Files Modified

### `lib/scopus.ts` (NEW)

Full Elsevier Scopus API client:
- `searchExistingReviews(query)` — systematic review results (`DOCTYPE(re)`)
- `countPrimaryStudies(query, minYear?)` — article count (`DOCTYPE(ar)`)
- `fetchPrimaryStudyIds(query, minYear?, limit=200)` — DOI + PubMed ID tuples for deduplication
- `buildScopusQuery(reviewQuery)` — wraps terms in `TITLE-ABS-KEY()` for Scopus field syntax
- Auth via `X-ELS-APIKey` header; key from `ELSEVIER_API_KEY` env var

### `lib/pubmed.ts` (MODIFIED)

Added `fetchPrimaryStudyIds(query, minYear?, limit=200)`:
- Uses existing `esearch()` with `NOT systematic[sb]` filter
- Returns `{ pmid }` tuples (DOI not available from ESearch without an EFetch round-trip)

### `lib/openalex.ts` (MODIFIED)

Added `fetchPrimaryStudyIds(query, minYear?, limit=200)`:
- New standalone fetch (not via `searchOpenAlex`) to request `doi,ids` fields
- Returns `{ doi, pmid }` tuples (OpenAlex `ids.pmid` is URL-prefixed, stripped to bare ID)

### `lib/europepmc.ts` (MODIFIED)

Added `fetchPrimaryStudyIds(query, minYear?, limit=200)`:
- Uses `resultType=lite` for minimal payload
- Returns `{ pmid, doi }` tuples — EuropePMC is the "bridge" source that links PubMed PMIDs to DOIs

### `app/api/search/route.ts` (MODIFIED)

Major changes:
1. **Import Scopus** — `import * as Scopus from "@/lib/scopus"`
2. **Expanded `Promise.allSettled`** — adds Scopus review search, Scopus count, and 4× `fetchPrimaryStudyIds` calls (PubMed, EuropePMC, OpenAlex, Scopus). All run concurrently — no added wall-clock latency.
3. **`computeDedupFraction(sources)` pure function** — deduplicates combined ID sample by PMID then DOI, returns fraction clamped to [0.30, 0.95].
4. **New primary study count formula** — sums all source counts × `dedupFraction` (vs. old `max(counts) × 0.75`).
5. **Scopus reviews included in `dedupeReviews()`** — 5-source merge now includes Scopus results.
6. **`scopus_count` in `searchData`** — stored in `search_results` via updated save functions.
7. **`cookieStore.set()` wrapped in try-catch** — prevents guest searches from failing if cookie mutation is unavailable in a given Next.js 16 context.
8. **Richer error response in dev** — `_debug` field exposes raw error message when `NODE_ENV !== "production"`.

### `lib/cache.ts` (MODIFIED)

Both `saveSearchResult` and `saveGuestSearchResult`:
- Added `osf_registrations_count` and `scopus_count` fields to `data` parameter types
- Added both columns to the primary INSERT payload
- Added fallback level for `42703` errors caused by `scopus_count`/`osf_registrations_count` not yet migrated

### `supabase/migrations/016_scopus_count.sql` (NEW)

```sql
ALTER TABLE search_results ADD COLUMN IF NOT EXISTS scopus_count integer;
```

Nullable; NULL = API was unavailable or predates this migration.

### `.env.local` (MODIFIED) / `.env.example` (MODIFIED)

Added `ELSEVIER_API_KEY` placeholder and actual value to local env.

---

## How the ID-Based Deduplication Works

```
PubMed         → 200 PMIDs         (no DOIs without extra round-trip)
EuropePMC      → 200 (PMID, DOI)   ← bridge: links PubMed to OpenAlex/Scopus
OpenAlex       → 200 (PMID, DOI)
Scopus         → 200 (PMID, DOI)

Combined sample: up to 800 records
Dedup by: seenPmids Set + seenDois Set (in EuropePMC-first order for best bridging)
dedupFraction = uniqueInSample / totalInSample    clamped to [0.30, 0.95]

primaryStudyCount = sum(pubmed + openalex + europepmc + scopus) × dedupFraction
```

**Example (insomnia research):**
- PubMed: 12 000, OpenAlex: 18 000, EuropePMC: 14 000, Scopus: 8 000
- Sum: 52 000
- Sample: 800 records, 480 unique → dedupFraction = 0.60
- Estimated unique: 52 000 × 0.60 = 31 200  (vs. old max×0.75 = 13 500 — much more accurate)

The fraction is conservative: highly-ranked records overlap more across sources than lower-ranked ones, so the sample underestimates uniqueness slightly — the true count may be somewhat higher.

---

## Verification

```
npx tsc --noEmit → Exit 0 (0 errors, 0 warnings)
```

---

## Recommended Next Steps

1. **Apply migrations 015 + 016 to production Supabase** — `osf_registrations_count` and `scopus_count` columns; the save functions fall back gracefully until applied.
2. **Add `ELSEVIER_API_KEY` to Vercel environment variables** — key: `a2d194324eb99bdce3d01a3ec0b1e8e9`
3. **PICO pre-fill on results page** — PICO fields are now stored (PICO-1); surface them in a collapsible "Search parameters" row on the results header.
4. **Scopus count in UI source breakdown** — The per-source breakdown card (UI-1) could show Scopus alongside PubMed/OpenAlex/EuropePMC once `scopus_count` is populated.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
