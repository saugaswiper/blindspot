# Handoff 088 — Retraction Check Wired Into Search (Milestone Stage 1, part 5)

**Date**: 2026-06-15
**Previous handoff**: spec/087-handoff.md
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]` — criterion **#4** (retraction awareness)
**Owner stage**: Search (Stage 1) in `[[Roadmap & Status]]`

---

## 1. Summary
`lib/retractions.ts` is now called from the search route, so displayed records carry live
retraction/withdrawal status. Completes criterion #4 end-to-end (source → wired → exported via
the N1 note added in handoff 087). Retraction status now persists on `existing_reviews` and
flows to the result page and RIS export.

**Status**: ✅ tsc · ✅ lint · ✅ build · full suite 841 pass / 15 pre-existing fail — no regression. Not committed.

## 2. Changes
- `app/api/search/route.ts`:
  - After the displayed `existingReviews` set is built (capped ≤50), calls
    `checkRetractions(...)` on those records (bounded DOI count), then attaches
    `retraction` to any flagged record via `retractionMap` + `normalizeDoi`.
  - Wrapped in try/catch on top of `checkRetractions`'s own never-throw contract — a Crossref
    outage cannot block search; flags are advisory, records are never removed.
  - Imports: re-added `normalizeDoi` from `@/lib/study-id`; added `checkRetractions`, `retractionMap` from `@/lib/retractions`.

## 3. Files touched
| File | Type |
|---|---|
| `app/api/search/route.ts` | modified (retraction check + imports) |

No new modules, env vars (optional `CROSSREF_MAILTO` already documented, handoff 085), or DB schema.
`existing_reviews` JSONB now may include a `retraction` object per record (additive, backward-compatible).

## 4. Behavior
A search whose displayed reviews include a retracted/withdrawn record now stores and returns
that record with `retraction: { type, label, noticeDoi? }`. Surfaces today in the RIS export
(N1 note). No dedicated UI badge yet — DESIGNER item (handoff 086 §6 / 087 §6).

Latency: up to ~50 Crossref lookups (concurrency 5) run after dedup, before save. Bounded and
isolated; failures degrade to "not flagged".

## 5. Addresses
Brief criterion **#4** — now fully wired (source built 085, export sink 087, route wiring here).
No validation/design spec on file (`spec/validation/`, `spec/design/` empty).

## 6. Wiki updates (librarian)
- `[[Milestone — Search Recall & Provenance Benchmark]]` — #4 complete end-to-end (UI badge still pending, designer).
- `[[Data Sources]]` — **Crossref** is now a live source (retraction checking), keyless, optional `CROSSREF_MAILTO`.
- `[[Data Model]]` — `existing_reviews` records may include `retraction` (after `sources?`, handoffs 086–087).
- `[[API Routes]]` — `/api/search` now performs a retraction pass on displayed reviews.
- No new wiki/code discrepancies. (Open: brief's nonexistent `lib/per-source-count.ts`, handoff 084 §8.)

## 7. Next
- DESIGNER: retraction/provenance badge in Existing Reviews + screening UI.
- Criterion #2/#2b (measured ≥95% recall) still needs real fixture capture (handoff 084 §6; needs network + CRIT-1 OpenAlex key).
- Optional: cache Crossref results (`lib/cache.ts`) — retraction status is stable.

## 8. Test / lint / build
```
tsc: 0 errors · ESLint: 0 · build: ✓ compiled · full suite: 841 pass / 15 pre-existing fail (no regression)
```

**Session completed**: 2026-06-15
