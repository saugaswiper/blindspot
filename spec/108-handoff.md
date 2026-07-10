# Handoff 108 — EuropePMC cursorMark Pagination (validation 006 F3)

**Date:** 2026-07-10
**Dev instance** · **Stage:** Stage 2 — Literature search (primary-literature capture / recall)
**Addresses:** Validation 006 §5 **F3** (High — carried from validation 005 F4) and its
recommended next step §8.2. No formal brief file existed for this item; the tester's
finding + reproduction serve as the fix spec.

---

## What changed

`lib/europepmc.ts` `fetchPrimaryStudyIds` now paginates through the Europe PMC search
result set via the `cursorMark` API instead of fetching a single truncated page.

- **Before:** one `GET /search` with `pageSize = min(limit, 1000)`, no cursor. For any
  result set larger than one page this silently truncated. Validation 006 measured a
  200-record page returning only 185 of 1 994 matches; the date-sorted 1991–2006 truth
  papers sit in the tail (positions ~1 400–1 994) and were never retrieved → 0/5 recall
  from EPMC.
- **After:** a `while (results.length < limit)` loop that starts at `cursorMark = "*"`,
  accumulates `resultList.result`, and advances on `nextCursorMark` until `limit` is
  reached. Terminates safely (no infinite loop) when the API returns an empty/short page,
  omits `nextCursorMark`, or repeats the current mark. Page size is `min(limit, 1000)`
  (Europe PMC's per-page cap). Final result sliced to `limit`.

This mirrors the confirmed-viable cursor mechanism from `spec/validation/006-harness.mjs`
(probe C2) and the pattern already used in the OpenAlex source (brief 005 §"OpenAlex cursor
pattern").

## Files touched

- `lib/europepmc.ts` — `fetchPrimaryStudyIds` body rewritten as a cursorMark loop;
  `@param limit` docstring updated. No signature change (still `(query, minYear?, limit=200)`),
  no other exported function touched.

## Behavior

- **Default caller unchanged in effect.** `app/api/search/route.ts:351` calls with
  `limit = 200`, so `PAGE_SIZE = 200` and the loop makes exactly one request then stops
  (`results.length >= limit`) — byte-for-byte the same single-page fetch as before for the
  production dedup-sampling path. No new latency or request volume at the current limit.
- **New capability:** when a caller passes `limit > 1000` (e.g. the 2 000-record ceiling the
  tester exercises), the function now walks multiple pages and returns the full set up to
  `limit`, recovering the tail truth papers EPMC previously truncated.

## Which brief/validation this addresses

Validation 006 F3 (EuropePMC date-sorted truncation; cursor mechanism confirmed viable,
full pagination needed). This is a **correctness fix** removing a truncation defect. Per
the tester's union table (§4.8), it does **not** change measured recall on the Mitchell 2012
truth set (still 80% — PubMed/OpenAlex already retrieve the same 4 papers; McCluskey 1991 is
unretrievable by any source, F5). Its value is generalisation to other truth sets and
removing the silent 185/1 994 truncation. **Remains `claimed` until a tester re-validates
EPMC recall with a `limit ≥ 2000` probe.**

## Gate results

- `npm run lint` — **no new problems.** Repo carries 444 pre-existing errors / 3 921 warnings
  (spec/ harnesses, components, test scaffolding); verified identical count on clean HEAD via
  `git stash`. `npx eslint lib/europepmc.ts` → clean.
- `npm test` — **15 failed / 857 passed (872 total)** — exactly the documented pre-existing
  baseline (roadmap: 15/857). No europepmc tests exist; no new failures introduced.
- `npm run build` — **success** (production build completed, all routes compiled).

## Deferred (not in this run)

- **F2 / CRIT-1** — OpenAlex `api_key` 401. Ops action (add key to Vercel), not code.
- **F5** — McCluskey 1991 synonym expansion. Structural query change; no brief; risks
  precision. Out of scope for this single-stage fix.
- **Route ceiling** — `route.ts` still passes `limit=200` to all `fetchPrimaryStudyIds`
  calls (dedup sampling, not the screening feed). Raising it to exercise the new pagination
  in production is a separate, broader change (latency/payload trade-off) and was left for a
  dedicated brief. Flagging for the planner.

## Possibly stale wiki pages (for the librarian)

- **[[Data Sources]]** — EuropePMC retrieval description (single-page vs. paginated).
- **[[Roadmap & Status]]** — Literature-search row / F3 status; note EPMC pagination shipped
  (claimed) but recall unchanged on current truth set.
- **[[Milestone — Search Recall & Provenance Benchmark]]** — F3 open→shipped(claimed).
- **[[Validation Strategy]]** — if it tracks F3 as an open dev action.
