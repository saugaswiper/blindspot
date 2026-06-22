# Handoff 102 — Full-Text Retrieval, Stage 1: OA Resolution Chain + API

**Date**: 2026-06-22
**Brief**: `spec/briefs/001.md` — Full-Text Retrieval (Open-Access PDF Resolution)
**Stage**: Pipeline 3 → 4 gate (after screening, before data extraction)
**Scope**: ONE scoped stage — the **backend resolution layer** only. UI + DB
persistence intentionally deferred to a follow-up (see §6).

---

## 1. What changed

Built the open-access full-text resolution chain and its API entry point. Given a
screened-in study's DOI and/or PMID, the chain resolves a non-paywalled full-text URL
through a ranked source list and returns it with provenance (which source, OA status,
PDF vs HTML).

Source chain (priority order):
1. **Unpaywall** (`api.unpaywall.org/v2/{doi}?email=`) — DOI-keyed, no API key.
2. **OpenAlex** `open_access.oa_url` — DOI-keyed; gracefully skipped on 401/403/404
   (CRIT-1 key issue is **not** a blocker — chain continues).
3. **Europe PMC** `…/MED/{pmid}/fullTextXML` — PMID-keyed, PMC-deposited green OA.
4. **PubMed Central** — PMID→PMCID via NCBI idconv, then the OA PDF path.

## 2. Files touched

| File | Action | Detail |
|------|--------|--------|
| `types/index.ts` | EDIT | Added `FulltextSource`, `FulltextOaStatus`, `FulltextContentType`, `FulltextFailureReason`, `FulltextResult`. Extended `ScreeningDecision` with `fulltext_url?`, `fulltext_source?`, `fulltext_fetched_at?` (all optional — back-compatible). |
| `lib/fulltext.ts` | CREATE | `resolveFulltext(doi?, pmid?): Promise<FulltextResolution>`. Pure of DB/cache side effects. Each source gates closed-access out; orchestrator re-gates as a backstop and aggregates a reason code on failure. |
| `app/api/fulltext/route.ts` | CREATE | `POST { doi?, pmid? }` → 200 `{ fulltext, fetched_at }` / 404 `{ error, reason }` / 400 on missing id or bad JSON. Zod-validated. No auth, no DB write (stateless lookup). |
| `lib/fulltext.test.ts` | CREATE | 11 unit tests (fetch stubbed). |

> **Contract note:** the brief's table says `resolveFulltext` returns `FulltextResult | null`.
> To satisfy AC3 (failed resolutions must carry a reason code), it returns a richer
> `FulltextResolution = { result: FulltextResult | null; reason?: FulltextFailureReason }`.
> This is a deliberate, documented deviation in service of the acceptance criteria.

## 3. Behavior

- First non-paywalled hit wins; sources tried sequentially in priority order.
- A thrown source is caught — one failure never blocks the rest of the chain.
- DOIs normalized (`doi.org` prefix stripped, lowercased) via existing `lib/study-id.ts`.
- Failure reason codes emitted by the lib: `paywalled` (a closed record was found),
  `source_error` (every applicable source threw), `all_sources_failed` (nothing found
  / no identifier). `no_doi` / `no_pmid` are in the union per the brief's contract but
  reserved (the route returns 400 when no identifier is supplied).
- **No paywalled URLs ever returned** (AC4): each source checks `is_oa` / `oa_status`,
  and `resolveFulltext` re-applies a `gate()` backstop before returning any result.

## 4. Acceptance criteria status

| # | Criterion | Status |
|---|-----------|--------|
| AC1 | OA resolution rate ≥70% on 20-study gold set | **Deferred to tester** — needs live-network or recorded-fixture corpus; this stage ships the mechanism, not the measured rate (stays `claimed`). |
| AC2 | p95 ≤ 3 s | Unit test asserts the chain completes within budget against stubbed fixtures; real-network p95 is the tester's to verify. |
| AC3 | Provenance / reason on every result | **Met** — `source` non-null on every success; reason code on every failure. |
| AC4 | No paywalled URLs | **Met** — gate exists at source level + orchestrator backstop; unit test asserts a closed record yields `null` + `paywalled`. |
| AC5 | Source badge in UI | **Deferred** (see §6) — backend exposes `fulltext_source`; UI chip not yet wired. |
| AC6 | User-upload dead-end prevention | **Deferred** (see §6) — `FulltextSource` includes `"user_upload"`; upload UI/flow not yet built. |
| AC7 | No screening regression | **Met** — `npx tsc --noEmit --skipLibCheck` clean; `npx vitest run` adds 11 passing tests, zero new failures. |

The **"beat Otto-SR"** edge (AC3 + AC5 provenance transparency) is half-delivered:
the data model and resolver expose exactly which source returned what; the visible
UI chip is the deferred half.

## 5. Gate results

- `npx tsc --noEmit --skipLibCheck` → **clean**.
- `npm run lint` → repo has 444 pre-existing errors in untouched files; **my 4 files
  lint clean** (`npx eslint` on them exits 0). No new errors introduced.
- `npm test` → **15 pre-existing failures unchanged** (documented in handoff 083 §8:
  cache-freshness, boolean-search-builder, study-design, persistent-filter hooks, etc.).
  `lib/fulltext.test.ts` passes **11/11**. 855 passed total → 870.
- `npm run build` → **succeeds**; `/api/fulltext` registered in the route manifest.

## 6. Deferred to a follow-up stage (brief 001 remainder)

Kept out to keep this diff small and the tree green:
- `components/ResultsDashboard.tsx` — "Get full text" button on `include` rows, source
  chip, and "Upload PDF" fallback (AC5, AC6). This is a ~3,000-line component flagged
  for splitting in the roadmap's deferred list; touching it is its own stage.
- `app/api/screening/save/route.ts` + Supabase migration — persist `fulltext_url` /
  `fulltext_source` / `fulltext_fetched_at` onto the `screening_results` row. Needs a
  column-addition migration; scoped separately to avoid coupling schema change with the
  resolver landing.

## 7. For the tester

`resolveFulltext(doi?, pmid?)` is the unit under test. It is network-pure given a
stubbed `fetch` (see `lib/fulltext.test.ts` for the routing harness). To verify AC1/AC2
against external truth: feed the PubMed Central gold set of 20 known-OA DOIs/PMIDs with
**real** network calls (no key required for Unpaywall/Europe PMC/PMC), assert ≥70%
non-null resolution and p95 ≤ 3 s. The OA-resolution-rate claim remains `claimed` until
that runs.

## 8. Possibly-stale wiki pages (for the librarian)

- **Roadmap & Status** — "Full-text retrieval (open-access PDFs, bulk upload)" row is
  `⬜ Not started`; this stage moves it to 🔄 partial (resolver + API shipped; UI +
  persistence pending). Keep the OA-resolution-rate as `claimed` (no tester verification yet).
- **index.md** — needs entries for new `lib/fulltext.ts` and `app/api/fulltext/route.ts`.
- **Otto-SR (Reference Target)** gap map — the full-text-retrieval parity row now has a
  partial implementation to reference.
