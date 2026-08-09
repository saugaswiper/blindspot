# Handoff 108 — Full-Text Retrieval AC6: Upload Fallback (Backend Slice)

**Date:** 2026-08-08
**Brief:** `spec/briefs/deferred-004-upload-fallback.md` (Brief 004 — AC6 User-Upload Fallback)
**Stage:** 3 (full-text retrieval) — final close-out item, backend half
**Model:** Opus (dev)

---

## Scope of this run — ONE shippable slice

Brief 004 lists three items: (1) the Storage-bucket migration, (2) the `/api/fulltext`
multipart upload path, and (3) the `ResultsDashboard` "Upload PDF" UI control. Per the
one-scoped-stage rule, this run ships the **backend slice** (items 1 + 2) — a coherent,
independently testable unit that the UI depends on. **Item 3 (the UI control) is DEFERRED
to a follow-on run** (see Deferred below).

The backend slice delivers AC6-upload, AC6-mime, and AC6-migration. AC6 (control visible)
and AC6-persist (chip survives reload) require the UI item and are **not** delivered here.

---

## Changes

### 1. `supabase/migrations/025_fulltext_upload_bucket.sql` — CREATE
Creates the `fulltext-uploads` Storage bucket, `public = true`, via
`INSERT INTO storage.buckets (id, name, public) VALUES ('fulltext-uploads','fulltext-uploads', true) ON CONFLICT (id) DO NOTHING;`
— exactly the SQL the brief specifies. Idempotent: `ON CONFLICT (id) DO NOTHING` lets it
run twice without error (AC6-migration).

> **Naming note:** the brief names this file `025_...`. The previous highest migration is
> `023_screening_results.sql`, so **`024` is an unused gap**. I kept the brief's explicit
> `025` filename so the tester's AC6-migration reference (`025_fulltext_upload_bucket.sql`)
> resolves. Supabase applies migrations in lexical order, so the gap is harmless. Flagging
> for the librarian in case a `024` was expected from another brief that never landed.

### 2. `app/api/fulltext/route.ts` — EDIT
Added a `multipart/form-data` branch alongside the existing JSON path. `POST` now dispatches
on `Content-Type`:
- **`multipart/form-data`** → `handleUpload()`: parses `FormData`; requires `file`,
  `search_id`, `pmid_or_doi`; validates `file instanceof File` and `file.type ===
  "application/pdf"` (else 400 with a descriptive message); stores to
  `fulltext-uploads/{search_id}/{pmid_or_doi}.pdf` (DOI slashes → `_`) via the
  **service-role** client (`createServiceRoleClient` from `@/lib/supabase/service`) with
  `upsert: true`; returns `{ fulltext: { url, source: "user_upload" }, fetched_at }` (200)
  using `getPublicUrl`.
- **anything else** → `handleResolve()`: the original OA-resolution logic, moved verbatim
  into a helper. **Behaviour unchanged** for existing JSON callers.

The shared `try/catch` → `toApiError` wrapper is preserved for both paths.

## Files touched
- `supabase/migrations/025_fulltext_upload_bucket.sql` (new)
- `app/api/fulltext/route.ts` (edited — refactor into `handleResolve`/`handleUpload`)

No other files changed. `lib/fulltext.ts`, `app/api/screening/save/route.ts`,
`components/ResultsDashboard.tsx` untouched (UI deferred).

## Behavior
- Existing JSON `POST /api/fulltext` (OA resolution) is byte-for-byte equivalent in behaviour.
- New: a multipart POST with a real PDF + `search_id` + `pmid_or_doi` stores the file and
  returns its public Supabase Storage URL tagged `source: "user_upload"`.
- Non-PDF MIME or a missing field returns 400 (AC6-mime).
- The `user_upload` value already exists in the `FulltextSource` union
  (`types/index.ts:398`); no type change needed.

---

## Which brief / validation this addresses
- **Brief 004 (deferred-004), items 1 + 2** — the backend for AC6.
- Depends on nothing from validation 006 (that report covered Stage 3 search recall, a
  separate track). This is the last full-text-retrieval close-out per the Roadmap
  ("AC1–7 verified except AC6 (deferred → brief 004)").

## Gate results
| Gate | Result |
|------|--------|
| `npx tsc --noEmit --skipLibCheck` | ✅ exit 0 |
| `npx eslint app/api/fulltext/route.ts` | ✅ exit 0 (touched file clean) |
| `npm run lint` (whole repo) | ⚠️ 444 pre-existing errors in unrelated files (test harnesses' `@ts-ignore`, etc.) — **none introduced by this change**; touched file is clean |
| `npx vitest run` | ✅ 860 passed / 12 pre-existing failures (unrelated: boolean-search-builder, cache-freshness, cache-topic-search, keyboard-shortcuts, protocol-storage, study-design, use-persistent-*). `lib/fulltext.test.ts` 13/13 pass. Zero new failures (down from the 15 documented in handoff 083 §8, as more tests were added). |
| `npm run build` | ✅ exit 0, "Compiled successfully"; `/api/fulltext` in route tree |

Note: no live upload probe (AC6-upload end-to-end) was run — it requires
`SUPABASE_SERVICE_ROLE_KEY` + a live project and the `025` migration applied. The tester
should apply `025` then run the AC6-upload / AC6-mime / AC6-migration probes.

---

## Deferred (still open on Brief 004)
- **Item 3 — `components/ResultsDashboard.tsx` UI**: replace the AC5-404 "No open-access
  version found" note (added in handoff 104) with an "Upload PDF" file input that POSTs
  multipart to `/api/fulltext`, shows a spinner, and on success saves `fulltext_url` +
  `fulltext_source: "user_upload"` + `fulltext_fetched_at` via the existing save route and
  renders a `via Upload` chip. This delivers **AC6** (control visible) and **AC6-persist**
  (survives reload). Next dev run.
- Security pass: signed/access-controlled Storage URLs (brief 004 Scope/Out — public URLs
  for now).

## Now-stale wiki pages (for the librarian)
- **[[Roadmap & Status]]** — the full-text-retrieval row still reads "AC1–7 verified except
  AC6 (deferred → brief 004)". AC6's backend is now shipped (still `claimed`, pending the UI
  item + tester validation); update once the UI ships and the tester verifies.
- **[[Full-Text Retrieval]]** (or equivalent Features page) — should note the new
  `user_upload` source and the `/api/fulltext` multipart path; and the `fulltext-uploads`
  Storage bucket under [[Architecture]]/[[Data Model]] / migrations list (023 → 025).
- Any page listing `/api/fulltext` as "JSON-only, no DB write" — the upload path now writes
  to Storage (still no `screening_results` write here; that stays in the save route).

Methodology/behaviour claims remain **`claimed`** until the tester validates AC6-upload /
AC6-mime / AC6-migration (and AC6/AC6-persist once the UI lands).
