# Handoff 090 — Retraction Lookup Caching

**Date**: 2026-06-16
**Previous handoff**: spec/089-handoff.md
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]` — hardens criterion **#4** (retraction awareness)

---

## 1. Summary
Added an in-process TTL cache to the Crossref retraction lookup so stable retraction status
isn't re-fetched per search. Reduces Crossref load for popular DOIs; no DB, no schema.

**Status**: ✅ tsc · ✅ lint · ✅ 2 new tests (17 in file) · no regression. Not committed.

## 2. Changes
- `lib/retractions.ts`:
  - Module-level `Map<doi, {value, expires}>`, 24h TTL. `checkOne` returns a cached result when
    fresh; caches **successful** lookups only (both flagged and clean). Errors/4xx are **not**
    cached, so a transient outage can't poison a DOI as "clean".
  - New export `clearRetractionCache()` (test/maintenance hook).
- `lib/retractions.test.ts` — +2 tests: memoizes a hit (one fetch for two checks); does not cache
  errors (retry flags on the second call). `clearRetractionCache()` in `afterEach` keeps tests isolated.

## 3. Files touched
| File | Type |
|---|---|
| `lib/retractions.ts` | modified (cache + `clearRetractionCache`) |
| `lib/retractions.test.ts` | modified (+2) |

No routes, env vars, or DB schema. Cache is per server instance, in memory (lost on restart) —
intentional: retraction status changes rarely and a DB cache would need a migration.

## 4. Behavior
No user-facing change. Repeated searches touching the same retracted DOI now skip the Crossref
round-trip for 24h within a running instance.

## 5. Addresses
Brief criterion **#4** (perf hardening). No validation/design spec on file (`spec/validation/`, `spec/design/` empty).

## 6. Wiki updates (librarian)
- `[[Data Sources]]` — Crossref retraction lookups are cached in-process (24h TTL, successful results only).
- No new wiki/code discrepancies. (Open: brief's nonexistent `lib/per-source-count.ts`, handoff 084 §8.)

## 7. Next
- Criterion #2/#2b (measured ≥95% recall): real fixture capture (handoff 084 §6; needs network + CRIT-1 OpenAlex key).
- Retraction UI badge landed separately (handoff 089).

## 8. Test / lint / build
```
tsc: 0 · ESLint: 0 · retractions.test.ts: 17 pass (+2) · no regression
```
Build not re-run (pure lib change; no route/page/config).

**Session completed**: 2026-06-16
