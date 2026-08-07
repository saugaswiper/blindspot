# Handoff 108 — Full-Text Retrieval AC6: user-upload backend (bucket + upload route)

**Date:** 2026-08-06
**Brief:** `spec/briefs/deferred-004-upload-fallback.md` (Brief 004 — AC6 user-upload fallback)
**Stage in pipeline:** 3 (full-text retrieval) — final close-out item
**Branch:** (runner handles git)

---

## Summary

Shipped the **backend half** of AC6 (user-upload fallback for the full-text retrieval
stage): a Supabase Storage bucket and a `multipart/form-data` upload path on
`/api/fulltext`. When automated open-access resolution dead-ends on a paywalled study, the
API can now accept a reviewer-uploaded PDF, store it, and return a `user_upload` result with
the same shape the automated chain produces.

The brief lists three interdependent pieces (bucket migration, upload route, `ResultsDashboard`
UI). Per the one-scoped-stage / smallest-shippable rule this run ships the two backend pieces
(fully gate-verifiable, satisfy AC6-upload, AC6-mime, AC6-migration). The **`ResultsDashboard`
"Upload PDF" UI (AC6 visible control, AC6-persist) is deferred** to a follow-up run — see
"Deferred" below.

---

## Changes

### 1. `supabase/migrations/024_fulltext_upload_bucket.sql` — CREATE
Creates the `fulltext-uploads` Storage bucket (public-read), idempotent via
`ON CONFLICT (id) DO NOTHING` (satisfies AC6-migration).

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('fulltext-uploads', 'fulltext-uploads', true)
ON CONFLICT (id) DO NOTHING;
```

**Deviation from brief:** the brief named this file `025_fulltext_upload_bucket.sql`, assuming
a `024_fulltext_columns.sql` from brief 003 existed. It does **not** — brief 003's persistence
was implemented via the `search_results.screening_result` **JSON blob**, not a separate
`screening_results` table with columns, so no migration 024 was ever created. `024` was the
next free number; I used it to avoid a phantom gap. (Highest pre-existing migration was
`023_screening_results.sql`.)

### 2. `app/api/fulltext/route.ts` — EDIT
`POST` now dispatches on `Content-Type`:
- `multipart/form-data` → new `handleUpload()`: validates `file` is a `File` with
  `type === "application/pdf"` (400 otherwise), requires non-empty `search_id` and
  `pmid_or_doi` fields (400 otherwise), flattens `/`→`_` in the identifier, uploads to
  `fulltext-uploads/{search_id}/{pmid_or_doi}.pdf` via the **service-role** client
  (`createServiceRoleClient` from `lib/supabase/service.ts`, `upsert: true`), then returns
  `{ fulltext: { url, source: "user_upload", content_type: "pdf" }, fetched_at }` (200).
- anything else → `handleResolve()`: the **unchanged** Brief 001 JSON OA-resolution path,
  just refactored into a named helper. Same request schema, same 200/404/400 contract.

No changes to `lib/fulltext.ts`, `lib/fulltext.test.ts`, `app/api/screening/save/route.ts`,
or `types/index.ts` (fulltext fields + `FulltextSource` incl. `"user_upload"` already exist,
`types/index.ts:381–398`).

---

## Behavior

- A reviewer's uploaded PDF is stored and surfaced with the same `user_upload` provenance an
  automated hit would carry. Persistence flows through the existing screening-save path (the
  `ScreeningDecision.fulltext_url/_source/_fetched_at` fields ride inside the
  `search_results.screening_result` JSON blob) — no save-route change needed.
- Non-PDF uploads and missing `search_id`/`pmid_or_doi` are rejected with 400 (AC6-mime).
- The JSON OA-resolution path is byte-for-byte equivalent in behavior to before.

---

## Which brief / validation this addresses

- **Brief 004 (deferred-004)** AC6-upload, AC6-mime, AC6-migration — backend implemented.
- AC6 (UI control visible), AC6-persist (chip survives reload), AC7 (full-run regression) —
  the UI half is **deferred** (below); the tester's validation of AC6-upload/mime/migration
  can proceed against this backend once the bucket migration is applied and
  `SUPABASE_SERVICE_ROLE_KEY` is present in the runtime env.

---

## Gate results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit --skipLibCheck` | ✅ clean |
| `npm run lint` | ⚠️ exit 1 — **444 errors / 4365 problems, identical with and without this change** (verified via `git stash` baseline). All in pre-existing test/harness files; the two touched files are lint-clean. **Zero new lint issues.** |
| `npm test` (`npx vitest run`) | ⚠️ 12 failed / 860 passed — all 12 in pre-existing unrelated modules (`boolean-search-builder`, `cache-freshness`, `cache-topic-search`, `keyboard-shortcuts`, `protocol-storage`, `study-design`, `use-persistent-*`). None touch fulltext/the API route. **Zero new failures.** |
| `npm run build` | ✅ exit 0 — compiled successfully; `/api/fulltext` route present in output. |

Lint and test were **already red on `main` before this change** (long-standing baseline; the
15-pre-existing-failures note in handoff 083 §8). This run adds nothing to either count.

---

## Deferred (next run)

**`ResultsDashboard.tsx` "Upload PDF" UI (AC6 visible control + AC6-persist).** Replace the
handoff-104 AC5-404 "No open-access version found" static note with a
`<input type="file" accept="application/pdf">` control that POSTs `multipart/form-data`
(`file`, `search_id`, the row's `pmid`/`doi`) to `/api/fulltext`, shows a spinner, and on
success saves `fulltext_url` + `fulltext_source: "user_upload"` + `fulltext_fetched_at` onto
the decision (existing save flow) and renders the `via Upload` chip. `ResultsDashboard.tsx` is
~3,000 lines — keep the edit surgical, at the existing 404-fallback render site. This is the
only remaining piece to fully close AC6 and the full-text retrieval stage.

---

## Now-stale wiki pages (for the librarian)

- **Roadmap & Status** — "Full-text retrieval" row still reads "AC1–7 verified except AC6
  (deferred → brief 004)". AC6 backend now shipped (this handoff); UI half still open. Update
  the row and re-open brief 004 as "in progress (backend done, UI deferred)".
- **Full-text retrieval feature page** (if one exists under `Features/`) — should note the
  `/api/fulltext` multipart upload path + `fulltext-uploads` bucket, and that persistence is
  via the `search_results.screening_result` JSON blob (not a `screening_results` table — a
  common misreading the briefs 002/003/004 carried).
- **Data Model / migrations page** — record `024_fulltext_upload_bucket.sql` and the note that
  brief 003's assumed `024_fulltext_columns.sql` was never created (blob-based persistence).

Methodology claim status unchanged — nothing here is a recall/accuracy claim; no
`claimed`→`verified` flip. AC6-upload/mime/migration remain `claimed` until the tester
validates them.
