# Handoff 087 — Provenance & Retraction in RIS Export (Milestone Stage 1, part 4)

**Date**: 2026-06-15
**Previous handoff**: spec/086-handoff.md
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]` — criteria **#3** (exportable provenance) and **#4** (retraction)
**Owner stage**: Search (Stage 1) in `[[Roadmap & Status]]`

---

## 1. Summary
RIS citation export now carries per-record provenance and retraction status, so both travel
into Zotero/EndNote/Mendeley. Completes the **exportable** half of criterion #3 and gives
criterion #4 its first consumer. Pure-function change; no UI, no network.

**Status**: ✅ tsc · ✅ lint · ✅ 4 new tests (37 in file) · full suite unaffected · no regression. Not committed.

## 2. Changes
- `lib/citation-export.ts` — `reviewToRisRecord`: `DB` field now uses `sources.join("; ")` when
  present (falls back to single `source`); adds an `N1` advisory note for retracted/withdrawn
  records, including the notice DOI when known.
- `types/index.ts` — `ExistingReview.retraction?: { type; label; noticeDoi? }` (advisory, structurally
  matches `RetractionFlag` from `lib/retractions.ts`; display/export only, never auto-removes).
- `lib/citation-export.test.ts` — +4 tests (sources→DB, single-source fallback, N1 retraction note, N1 omitted when clean).

## 3. Files touched
| File | Type |
|---|---|
| `lib/citation-export.ts` | modified |
| `lib/citation-export.test.ts` | modified (+4) |
| `types/index.ts` | modified (`ExistingReview.retraction?`) |

No routes, env vars, or DB schema.

## 4. Behavior
Exported RIS records show all contributing databases in `DB`, and a retraction note in `N1`.
Visible only once records are populated with `sources` (already wired, handoff 086) and
`retraction` (set when the retraction check is wired into the route — still pending, handoff 085 §6).

## 5. Addresses
Brief criteria **#3** (provenance now exportable) and **#4** (retraction now has an export sink).
No validation/design spec on file (`spec/validation/`, `spec/design/` empty).

## 6. Next
- Wire `lib/retractions.ts` into `app/api/search/route.ts` to populate `ExistingReview.retraction`
  on displayed records (handoff 085 §6) — then the N1 note appears in real exports.
- DESIGNER: provenance/retraction affordance in the Existing Reviews + screening UI (handoff 086 §6).

## 7. Wiki updates (librarian)
- `[[Milestone — Search Recall & Provenance Benchmark]]` — #3 export done; #4 export sink done, route wiring still pending.
- `[[Data Model]]` — `ExistingReview` gained `retraction?` (after `sources?` in handoff 086).
- No new wiki/code discrepancies. (Prior open: brief's nonexistent `lib/per-source-count.ts`, handoff 084 §8.)

## 8. Test / lint / build
```
tsc: 0 errors · ESLint: 0 · citation-export.test.ts: 37 pass (+4) · no regression
```
Build not re-run (pure lib + type only; no route/page/config change).

**Session completed**: 2026-06-15
