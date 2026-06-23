# Handoff 103 — Full-Text Retrieval: Concurrent DOI Fanout (AC2 latency fix)

**Date:** 2026-06-23
**Brief:** `spec/briefs/002.md` (Full-Text Retrieval Stage 2)
**Addresses:** Validation 002 finding **F1** (AC2 latency fail) and **F2** (vacuous AC2 unit test)
**Stage:** 3 (full-text retrieval) — single scoped item from a 4-item brief

---

## What this run did (one scoped stage)

Brief 002 lists four items (latency fix, UI surface, upload fallback, persistence).
Per the loop's one-stage rule, this run implements **only the first/smallest shippable
item: the AC2 concurrent-fanout latency fix** and its non-vacuous unit test. The other
three items are **deferred** (see below).

The sequential source chain in `resolveFulltext` made the two DOI-keyed sources
(Unpaywall → OpenAlex) accumulate latency serially: an Unpaywall miss forced a full
serial OpenAlex call, which is what blew the 3 s bar (validation 002 F1). This run replaces
that with a **concurrent DOI fanout** that returns the first OA hit as soon as it arrives,
without waiting for slower misses. The PMID-keyed fallbacks (Europe PMC, PMC) stay
sequential and run only if the DOI fanout returns null — per the brief, they are cheap,
rarely needed, and not worth racing.

## Behavior

- **DOI sources raced concurrently.** Both `tryUnpaywall(doi)` and `tryOpenAlex(doi)` fire
  at once. A new `fanout()` helper resolves with the **first gated OA hit** the moment it
  lands; if neither hits, it resolves once **all** have settled, carrying the accumulated
  `paywalled` / `errored` signals so the reason codes (AC3) are unchanged.
- **Priority preserved in the common case.** When both sources resolve near-instantly,
  Unpaywall's promise (created first) settles first and wins — so Unpaywall stays primary.
  A slow Unpaywall *miss* no longer delays a faster OpenAlex *hit* (the latency win).
- **PMID fallbacks unchanged.** Europe PMC → PMC remain a sequential post-fanout chain.
- **OA gate (AC4) unchanged.** A closed-access result is still never surfaced.
- **Reason codes (AC3) unchanged.** `paywalled` / `source_error` / `all_sources_failed`
  resolve exactly as before; all existing reason-code tests pass untouched.

## Files touched

| File | Change |
|------|--------|
| `lib/fulltext.ts` | Replaced the sequential orchestrator loop with a concurrent DOI fanout (new `fanout()` helper + `FanoutOutcome` interface); PMID fallbacks kept sequential. Updated docstrings. **No** change to the source functions, OA gate, or reason-code logic. |
| `lib/fulltext.test.ts` | Added `delay?: number` to the fetch router's `Canned` type. Added two non-vacuous AC2 tests proving max-not-sum timing (a 400 ms Unpaywall miss never delays a 200 ms OpenAlex hit; both-slow case completes in ~max not ~sum). These tests **fail if the orchestrator is reverted to sequential**. The original (vacuous) latency test is retained. |

No other files touched. UI, routes, migration, and `types/index.ts` were intentionally
**not** modified this run.

## Gate results

- `npx eslint lib/fulltext.ts lib/fulltext.test.ts` — **clean** (0 errors, 0 warnings).
  (`npm run lint` repo-wide still reports the same ~444 pre-existing errors as before;
  none are in the files this run touched.)
- `npx tsc --noEmit --skipLibCheck` — **clean**.
- `npx vitest run lib/fulltext.test.ts` — **13/13 pass** (was 11; +2 new AC2 tests).
- `npx vitest run` (full suite) — **857 pass, 15 fail**. All 15 failures are the
  **pre-existing, unrelated** failures documented in handoff 083 §8
  (`boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`,
  `protocol-storage`, `study-design`, and three `use-persistent-*` hooks). **Zero new
  failures** → AC7 holds.
- `npm run build` — **succeeds** (`/api/fulltext` route compiles and is listed).

## Validation harness note (read before AC2 re-verification)

⚠ **The brief's instruction to "re-run `spec/validation/002-harness.mjs` unchanged" does
NOT actually verify this change.** The harness is a **standalone sequential mirror** of the
resolver ("mirrors lib/fulltext.ts logic exactly, no Next.js deps", harness line 54; its
orchestrator at line 154 is a sequential `for` loop). It does **not import** `lib/fulltext.ts`.

I re-ran it anyway: it reported **p50 128 ms / p95 1111 ms / 20/20 resolved** — under the
3 s bar — but that p95 drop versus validation 002 is **network variance** on the single
chain-fallthrough outlier (pmid 42256478, unpaywall miss → openalex hit), **not** the effect
of my code (the mirror is still sequential). Treat that p95 as non-probative.

**The real proof of the concurrent fanout is the new deterministic unit tests** (AC2-unit),
which inject per-source `setTimeout` delays and assert max-not-sum timing. For
**validation 003**, the tester should update `002-harness.mjs` to either (a) import the real
`resolveFulltext` or (b) mirror the concurrent fanout, so the real-network p95 reflects the
shipped code. Until then, AC2 stays **`claimed`**.

## Deferred (remaining brief 002 items — NOT done this run)

1. **AC5 — "Get full text" button + source chip** in `components/ResultsDashboard.tsx`.
2. **AC6 / AC6-upload — "Upload PDF" fallback** UI + the `multipart/form-data` upload path
   in `app/api/fulltext/route.ts` → Supabase Storage.
3. **AC-persist — persistence** of `fulltext_url` / `fulltext_source` / `fulltext_fetched_at`
   in `app/api/screening/save/route.ts` + the `supabase/migrations/` column migration.

Each is an independent shippable stage for a following dev run.

## Possibly-stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — the full-text retrieval row notes "AC2 fails latency bar (F1)".
  AC2 now has a structural concurrent-fanout fix + non-vacuous tests, but the claim must stay
  `claimed` until validation 003 verifies it against an updated harness. AC5/AC6/persistence
  remain deferred (accurate as written).
- Any page documenting `lib/fulltext.ts` as a "sequential ranked chain" — the DOI tier is now
  a concurrent fanout; the PMID tier remains sequential.
