# Handoff 086 — Per-Record Provenance (Milestone Stage 1, part 3)

**Date**: 2026-06-15
**Previous handoff**: spec/085-handoff.md
**Brief**: `[[Milestone — Search Recall & Provenance Benchmark]]` — acceptance criterion **#3**
**Owner stage**: Search (Stage 1) in `[[Roadmap & Status]]`

---

## 1. Summary

Delivers the **data layer** of criterion #3: every deduplicated search record now carries the
full set of sources that found it (`sources: string[]`), so the result is auditable and the
per-source breakdown is trustworthy. The route's anonymous dedup was replaced with a
provenance-aware version that preserves existing behaviour exactly and adds the attribution.

UI surfacing of provenance is **not** done here — it's DESIGNER territory (no design spec
exists yet); flagged in §6. The data is already exportable since it rides on `existing_reviews`.

**Status**: ✅ tsc clean · ✅ new files + route lint-clean · ✅ build succeeds · ✅ 8 new tests
pass · full suite 837 pass (was 829) with the same 15 pre-existing unrelated failures — **no
regression**. Not committed (DEV role).

---

## 2. What changed and why

### `lib/provenance.ts` (new)
`dedupeReviewsWithProvenance(sources: NamedSource[])` — deduplicates review records across
named sources and records, per unique record, every source that returned it. Matching is
identical to the old route dedup (normalized title → normalized DOI via `lib/study-id.ts` →
trimmed PMID; first source wins the canonical record), so dedup counts and kept records are
unchanged — only `sources` is added. Exports `NamedSource`, `DedupeWithProvenanceResult`.

### `app/api/search/route.ts` (modified)
- Removed the local `dedupeReviews` + `DedupeResult` (and the now-unused `normalizeDoi` import);
  the call site uses `dedupeReviewsWithProvenance([...])` with explicit source names
  (PubMed, OpenAlex, Europe PMC, Scopus, Semantic Scholar, Cochrane).
- `existing_reviews` records now include `sources`, which flows into the stored result payload
  automatically (spread through the existing mapping).

### `types/index.ts` (modified)
`ExistingReview` gains `sources?: string[]` (full auditable provenance; `source` remains the
canonical/first source). Optional → backward-compatible with records saved before this.

### `lib/provenance.test.ts` (new, 8 tests)
Distinct-record attribution; cross-source merge by PMID / normalized DOI / normalized title;
canonical = first source; no duplicate source names; title→DOI→PMID precedence on a 3-way
bridge; empty input.

---

## 3. Files touched

| File | Type |
|---|---|
| `lib/provenance.ts` | new |
| `lib/provenance.test.ts` | new (8 tests) |
| `app/api/search/route.ts` | modified (delegates dedup; removes local impl) |
| `types/index.ts` | modified (`ExistingReview.sources?`) |

No new routes, env vars, or DB schema. `search_results.existing_reviews` JSONB now contains a
`sources` array per record (additive; no migration).

---

## 4. New / changed behavior

- Stored search results now record per-record provenance (`sources`). No visible UI change yet.
- Internal refactor: cross-source review dedup is now `lib/provenance.ts` (was inline in route).

---

## 5. Addresses

Brief `[[Milestone — Search Recall & Provenance Benchmark]]` criterion **#3** (per-record
provenance, auditable + exportable) — data layer + export payload done; UI pending (§6). No
validation finding or design spec applies (none on file: `spec/validation/` and `spec/design/`
are empty as of this handoff).

---

## 6. Recommended next steps
- **DESIGNER**: spec a provenance affordance in the Existing Reviews tab (and screening rows,
  which reuse `ExistingReview`) — e.g. small source chips per record showing `sources`. Then
  DEV implements to that spec in design tokens.
- **Export**: include `sources` (and, once wired, the retraction flag from handoff 085) in the
  citation/CSV export path so provenance + retraction status travel with the data.
- Pairs naturally with wiring `lib/retractions.ts` (handoff 085 §6): one record annotation pass.

---

## 7. Concepts a reader would need a wiki page for
- **Per-record provenance** — what `sources` means, how it's derived during dedup, how it makes
  the per-source breakdown auditable.

---

## 8. Wiki pages now stale or to update (for the librarian)
- **`[[Milestone — Search Recall & Provenance Benchmark]]`** — #3 data layer delivered; UI/export
  display pending. (Running status: #1 done · #2/#2b pending fixtures · #3 data done, UI pending ·
  #4 source built, wiring pending · #5 holds.)
- **`[[Data Sources]]`** — the per-source breakdown is now backed by real per-record provenance
  (`ExistingReview.sources`), not just aggregate counts.
- **`[[Data Model]]`** — `ExistingReview` gained `sources?: string[]`.

No new wiki/code discrepancies this turn. (Prior open item: brief still references a
nonexistent `lib/per-source-count.ts` — handoff 084 §8.)

---

## 9. Test / lint / build status
```
tsc --noEmit:   0 errors
ESLint:         0 problems (new files + route)
Build:          ✓ Compiled successfully
New tests:      8 pass (lib/provenance.test.ts)
Full suite:     837 pass / 15 fail  (+8 vs 829; same pre-existing unrelated failures)
```

**Session completed**: 2026-06-15
