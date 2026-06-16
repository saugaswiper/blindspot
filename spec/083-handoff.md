# Handoff 083 — Screening v2: Unlimited Pipeline, Human-in-the-Loop & Active Learning

**Date**: 2026-06-15
**Session type**: Iterative feature expansion (multi-commit)
**Previous handoff**: spec/082-handoff.md (2026-06-15)
**Focus**: Major expansion of the AI literature-screening feature first shipped in handoff 080

> **For the librarian:** This handoff supersedes large parts of **Handoff 080 — AI-Powered
> Literature Screening Feature**. Several "Known Limitations" documented in 080 (50-record
> cap, single Gemini call, existing-reviews-only, no reason codes) are now **obsolete**. See
> §9 for the list of wiki pages that are likely stale.

---

## 1. Summary

The screening feature has grown from a single-call, ≤50-review prototype into a
production-grade systematic-review screening workbench. The work, informed by
`spec/screening-market-analysis.md` (competitive analysis of Rayyan, Covidence,
DistillerSR, ASReview), now covers the entire Tier 1 + Tier 2 backlog.

Headline changes since handoff 080:

1. **Screens primary studies, not just existing reviews** — fetched live from PubMed +
   OpenAlex + Scopus with cross-source deduplication.
2. **Effectively unlimited volume** — a chunked, client-orchestrated pipeline replaces the
   single synchronous request, so screening thousands of articles never hits a serverless
   timeout.
3. **Chain-of-thought + reason codes + confidence** per decision.
4. **Human-in-the-loop** — per-record verdict overrides (RAISE compliance), a "needs review"
   triage queue, and CSV/RIS export.
5. **Active-learning refine loop** — the AI re-screens undecided records using the reviewer's
   verified verdicts as calibration examples.
6. **Workbench UX** — search, sort, keyboard speed mode, resume-on-failure, incremental rendering.
7. **Design-token alignment** + **unit test coverage** for the screening core.

**Status**: ✅ TypeScript clean (0 errors); ✅ screening files lint-clean; ✅ production build
succeeds; ✅ 28 new screening unit tests pass. ⚠ 15 pre-existing unit-test failures in
unrelated modules (see §8).

**Commits this session** (on `main`): `aaae9a2`, `2f9f730`, `4b3b062`, `cd1470a`, `c277d27`,
`27732a4`, `5f619c9`.

---

## 2. New User-Facing Behavior

On any gap-topic card (owner only), after gap analysis:

- The CTA now reads **"Screen ~N primary studies for this gap"** (estimate; was "Screen N reviews").
- Clicking **Approve & Screen** runs the chunked pipeline with a **real progress bar**
  ("Screening 600 / 1,000…"), not a fixed animation.
- Results table adds:
  - **Reason-code badges** on excluded records (wrong population, wrong intervention, etc.).
  - **Confidence dots** (high/medium/low).
  - **Per-criterion reasoning table** under each row ("Why?").
  - **One-click verdict buttons** (Include/Exclude/Uncertain) at row level — a human override
    that supersedes the AI everywhere and is persisted; the AI's original verdict is retained
    and labelled "AI said: …".
  - **"Needs review" filter** — uncertain or low-confidence records not yet human-verified.
  - **Search box** (title/journal) and **sort dropdown** (screening order / needs-review first /
    lowest confidence first / newest first).
  - **Keyboard speed mode**: `j`/`k` or arrows navigate, `y`/`n`/`u` set verdict, `r` toggles reasoning.
  - **"↻ Re-screen N with your feedback"** (appears after ≥3 human verdicts) — re-screens only
    the still-flagged records using verified decisions as calibration; refined rows get a
    "↻ re-screened" badge.
  - **Exports**: "↓ CSV" (full audit trail — AI/human/final decision, reason code, IDs) and
    "↓ RIS (included)" (final-included studies for Zotero/EndNote).
  - **Resume-on-failure**: if a chunk fails mid-run, the panel shows "Resume screening (N/M done)"
    instead of discarding progress.
  - **Incremental rendering**: 100 rows at a time with a "Show more" button.
- **"Adjust criteria & re-screen"** pre-fills the criteria editor with the last run's criteria
  and **carries the reviewer's existing verdicts over** to the new run (matched by PMID → DOI →
  title), so re-screening no longer discards human work.

---

## 3. Architecture — Chunked Pipeline

The old single-request `POST /api/screening/run` (fetch + screen + persist) was hard-capped by
the Vercel function timeout. It is now a three-call pipeline the client orchestrates:

```
ScreeningPanel.handleRun()
  1. POST /api/screening/fetch  { resultId, screenType }
        → fetchAllPrimaryStudiesForScreening(query)  (paginate ALL sources, dedup)
        → returns { records: ExistingReview[], total }
  2. for each 300-record chunk:
       POST /api/screening/run  { criteria, records, examples? }
        → runTitleAbstractScreening(records, criteria, examples)
        → returns { decisions: ScreeningDecision[] }      (client accumulates + progress bar)
  3. POST /api/screening/save  { resultId, screeningResult }
        → UPDATE search_results.screening_result            (persist once)
```

- Each request stays short → no timeout regardless of total volume.
- `export const maxDuration = 300` on `/fetch` and `/run` (clamped to plan limit on Vercel).
- Human overrides and refine results are persisted via the same `/save` route (fire-and-forget).
- `/run` also retains a **legacy single-shot mode** (`{ resultId, criteria, screenType }`, no
  `records`) for backward compatibility.

---

## 4. Files Created / Modified

### New files

| File | Purpose |
|---|---|
| `app/api/screening/fetch/route.ts` | POST — paginate & return all records to screen (`maxDuration=300`) |
| `app/api/screening/save/route.ts` | POST — persist an assembled/updated `ScreeningResult` |
| `lib/screening-utils.ts` | Pure helpers: `effectiveDecision`, `computeCounts`, `needsReview`, `sortDecisions`, `buildCsv`, `carryOverHumanVerdicts`; types `Verdict`, `SortMode` |
| `lib/screening-utils.test.ts` | 20 unit tests for the helpers |
| `lib/screening.test.ts` | 8 unit tests for multi-source fetch/dedup (sources mocked) |

### Modified files

| File | What changed |
|---|---|
| `lib/screening.ts` | `fetchAllPrimaryStudiesForScreening` (parallel 3-source fetch + dedup by PMID then DOI); `runTitleAbstractScreening` batches at 150 and accepts `examples`; calibrated prompt section; `screenBatch`/`mapDecision` persist `abstract_snippet`; model + token + max-records config; RAISE sensitivity rule in prompt |
| `app/api/screening/run/route.ts` | Chunk mode (`{ criteria, records, examples }`) + legacy mode; `maxDuration=300`; `MAX_CHUNK_RECORDS=500`; examples capped at 25 |
| `lib/pubmed.ts` | `fetchPrimaryStudiesForScreening` — ESearch up to 10k PMIDs + batched EFetch (200/call) |
| `lib/openalex.ts` | `fetchPrimaryStudiesForScreening` — cursor pagination (200/page) |
| `lib/scopus.ts` | `fetchPrimaryStudiesForScreening` — `start`-offset pagination (200/page); `scopusSearch` gained a `start` param |
| `components/ScreeningPanel.tsx` | Entire workbench UI (chunk orchestration, overrides, refine, search/sort, keyboard mode, resume, paging, exports, design tokens); imports helpers from `lib/screening-utils.ts` |
| `types/index.ts` | Added `ScreeningReasonCode`, `CalibrationExample`; extended `ScreeningDecision` (`reason_code`, `confidence`, `criterion_results`, `abstract_snippet`, `human_decision`, `human_decided_at`, `refined`) and `ScreeningResult` (`screen_type`) |
| `app/globals.css` | Semantic status tokens `--success/--danger/--warning` (+ `-bg` pairs, light/dark) |
| `vitest.config.ts` | Exclude `**/.claude/**` so the nested worktree copy of the suite doesn't double-run |
| `spec/screening-market-analysis.md` | Improvement log entries dated 2026-06-09 → 2026-06-11 |

> **No new DB migration.** The richer `ScreeningResult` still serializes into the existing
> `search_results.screening_result` JSONB column (migration `023`, from handoff 080).

---

## 5. New Environment Variables

| Var | Default | Effect |
|---|---|---|
| `SCREEN_MAX_RECORDS` | `10000` | Upper bound on records pulled per source and in total for a screening fetch. Represents "all available articles"; lower it to cap cost/rate-limit usage. |
| `GEMINI_SCREENING_MODEL` | `gemini-2.5-flash` | Model used for screening. Set to `gemini-2.5-pro` for higher reasoning quality on complex criteria. |

Existing vars still required: `GEMINI_API_KEY` (screening), `NCBI_API_KEY` (PubMed, optional),
`OPENALEX_API_KEY` (OpenAlex), `ELSEVIER_API_KEY` (Scopus, optional — Scopus degrades gracefully
to empty if unset). Gemini `maxOutputTokens` raised 4096 → 65536 (Flash max) to avoid mid-batch
JSON truncation.

---

## 6. Data Model Changes (types only, no schema migration)

```typescript
// New
type ScreeningReasonCode =
  | "wrong_population" | "wrong_intervention" | "wrong_outcome" | "wrong_design"
  | "wrong_timeframe"  | "duplicate"          | "not_systematic_review"
  | "insufficient_data"| "off_topic";

interface CalibrationExample {           // sent to /run for the active-learning refine pass
  title: string; year?: number; abstract_snippet?: string;
  human_decision: "include" | "exclude" | "uncertain";
  ai_decision?: "include" | "exclude" | "uncertain";   // mismatch = a correction (strongest signal)
}

// Extended ScreeningDecision (additions)
reason_code?: ScreeningReasonCode;            // excludes only
confidence?: "high" | "medium" | "low";
criterion_results?: { criterion; type; met; note }[];   // per-criterion chain-of-thought
abstract_snippet?: string;                    // persisted so refine re-screens without refetch
human_decision?: "include" | "exclude" | "uncertain";   // override; supersedes `decision`
human_decided_at?: string;
refined?: boolean;                            // produced by a calibrated refine pass

// Extended ScreeningResult
screen_type?: "primary" | "reviews";          // default "primary"
```

**Key invariant** (enforced in `lib/screening-utils.ts` and under test): the human override
(`human_decision`) is the *effective* verdict everywhere — counts, filters, exports — while the
AI's original `decision` is preserved for audit.

---

## 7. Concepts a Reader Would Need a Wiki Page For

- **Screening pipeline (chunked)** — the fetch → run(×N) → save flow and why it exists (timeout avoidance / unbounded volume).
- **Multi-source primary-study fetch & deduplication** — PubMed/OpenAlex/Scopus pagination strategies; dedup by PMID then normalized DOI; source priority order.
- **Human-in-the-loop / RAISE compliance** — override model, needs-review triage, effective-vs-AI verdict.
- **Active-learning refine loop** — calibration examples, corrections-first ordering, what gets re-screened.
- **Screening exports** — CSV audit trail vs RIS (included) for full-text stage.
- **Screening reason codes & confidence** — PRISMA-aligned exclusion codes; confidence tiers.
- **Screening config** — `SCREEN_MAX_RECORDS`, `GEMINI_SCREENING_MODEL`, batch size 150, `maxDuration`.

---

## 8. Test / Lint / Build Status

```
TypeScript (npx tsc --noEmit):              0 errors
ESLint (screening files):                   0 problems
ESLint (npm run lint, repo-wide):           pre-existing warnings/errors, inflated by the nested
                                            .claude/worktrees/ copy; screening files are clean
Production build (npm run build):           ✓ Compiled successfully; all 4 /api/screening routes built
Screening unit tests (28):                  ✓ all pass (lib/screening-utils.test.ts, lib/screening.test.ts)
Full unit suite (npm test):                 789 pass / 15 fail
```

⚠ **15 pre-existing failures, NOT caused by this work**, in unrelated modules:
`lib/cache-freshness.test.ts` (7 — date-relative formatting), `lib/boolean-search-builder.test.ts`
(4), `lib/cache-topic-search.test.ts` (1), `lib/study-design.test.ts` (1),
`lib/protocol-storage.test.ts` (1), `lib/keyboard-shortcuts.test.ts` (1). Two files also collect
0 tests (`lib/use-persistent-filter.test.ts`, `lib/use-persistent-search-mode.test.ts`). These
fail on the same baseline without the screening changes and are tracked as a separate cleanup task.

---

## 9. Wiki Pages Likely Stale or Missing (for the librarian)

**Stale — built from handoff 080, now wrong:**
- Any "Literature Screening" / "AI Screening" feature page stating: a 50-record cap, a single
  Gemini call, "screens existing reviews", `maxOutputTokens: 4096`, or only two API routes
  (`/suggest`, `/run`). All four of these are now incorrect.
- Any list of `app/api/screening/*` routes — must add `/fetch` and `/save`.
- Any environment-variable / config page — must add `SCREEN_MAX_RECORDS` and
  `GEMINI_SCREENING_MODEL`.
- Any data-source page — OpenAlex/PubMed/Scopus now expose `fetchPrimaryStudiesForScreening`
  with pagination.

**Missing — no page exists yet:**
- Human-in-the-loop overrides / RAISE compliance for screening.
- Active-learning refine loop.
- Screening exports (CSV/RIS).
- Chunked screening pipeline architecture.

**Possible code-internal inconsistency to note (not a wiki issue):** `buildCriteriaPrompt` and
`buildScreeningPrompt` in `lib/screening.ts` still address the model as if screening "systematic
reviews", even though the default `screen_type` is now `"primary"` (primary studies). This is
prompt wording, not behavior — flagged here for a future dev to reconcile; **not changed in this
session** (out of scope, no functional bug observed).

---

## 10. Note on Repo State

Per the DEV/Librarian role split, this handoff file is the only artifact written this turn, and
it was **not committed** (commits/pushes only on explicit request). The seven feature commits
listed in §1 were already on `main` from the implementation sessions. This handoff documents
that already-committed work for ingest.

**Session completed**: 2026-06-15
