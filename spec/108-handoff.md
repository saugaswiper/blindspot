# Handoff 108 — Full-text upload fallback: Storage bucket + `/api/fulltext` upload path (backend slice of Brief 004)

**Date:** 2026-08-17
**Role:** Dev
**Brief:** `spec/briefs/deferred-004-upload-fallback.md` (Brief 004 — Stage 3 full-text retrieval, AC6 user-upload fallback)
**Addresses:** Roadmap "AC1–7 verified except AC6 (deferred → brief 004)". Brief 004 was
unblocked once the search-recall FAIL (validation 004/005) closed — validation 006 verified
80% recall (handoff 106–107), so the deferred upload-fallback brief is now the
lowest-numbered unimplemented brief.

---

## 1. Summary

Implemented the **backend half** of Brief 004's AC6 user-upload fallback: the Supabase
Storage bucket and the `multipart/form-data` upload path in `/api/fulltext`. When automated
OA resolution dead-ends, a reviewer can now upload a PDF that is stored with `user_upload`
provenance and returned in the same response shape the screening save route already persists
(`fulltext_url` / `fulltext_source` / `fulltext_fetched_at`).

Per the loop's "one smallest shippable slice" rule, this run ships the independently
testable, low-risk backend (migration + API route). The **UI wiring in
`components/ResultsDashboard.tsx` is deferred** to a follow-on run (see §6) — it is the
larger, riskier change (that file is ~3,000 lines) and depends on this backend existing.

## 2. Files touched

- **CREATE `supabase/migrations/024_fulltext_upload_bucket.sql`** — creates the
  `fulltext-uploads` Storage bucket (`public = true`), idempotent via
  `on conflict (id) do nothing`.
  - **Deviation from brief:** the brief named `025_fulltext_upload_bucket.sql`, but the
    latest existing migration is `023_screening_results.sql` — no `024` exists. Used the
    sequential `024` to avoid a gap in the migration series. Same content, same bucket id.
- **EDIT `app/api/fulltext/route.ts`** — added a `multipart/form-data` branch alongside the
  unchanged JSON OA-resolution path:
  - New `handleUpload(request)` helper: parses `FormData`; requires `file`
    (`application/pdf`), `search_id`, and `pmid_or_doi`; stores to
    `fulltext-uploads/{search_id}/{safeId}.pdf` via the **service-role** client
    (`createServiceRoleClient` from `lib/supabase/service.ts`); returns
    `{ fulltext: { url, source: "user_upload" }, fetched_at }` from `getPublicUrl`.
  - `POST` now dispatches on `Content-Type`: `multipart/form-data` → `handleUpload`;
    anything else → the existing JSON path (untouched). Outer try/catch → `toApiError`
    unchanged.
  - Identifier sanitization: `pmid_or_doi` is collapsed to URL-safe chars
    (`replace(/[^A-Za-z0-9._-]/g, "_")`) so DOI slashes can't create sub-path ambiguity
    (e.g. `10.1000/xyz` → `10.1000_xyz.pdf`).
  - `upsert: true` on upload so re-uploading the same study is idempotent (no
    "already exists" error).

No other files changed. `lib/fulltext.ts`, `lib/fulltext.test.ts`,
`app/api/screening/save/route.ts` untouched (per brief).

## 3. Behavior

- **New:** `POST /api/fulltext` with a PDF multipart body → 200 `{ fulltext: { url,
  source: "user_upload" }, fetched_at }`; the URL is a public Supabase Storage URL.
- **Validation:** missing `file`/`search_id`/`pmid_or_doi`, or a non-`application/pdf`
  `file`, → 400 with a descriptive message. Storage/upload failures → 500.
- **Unchanged:** the JSON `{ doi?, pmid? }` OA-resolution path (200/404/400) is byte-for-byte
  the same code path.

## 4. Acceptance criteria (Brief 004)

Backend ACs are code-satisfied here; live verification is the tester's job (validation).

| AC | Status | Notes |
|----|--------|-------|
| AC6-upload (upload path returns URL) | **claimed** | Code returns `{ fulltext: { url, source: "user_upload" }, fetched_at }` on a valid PDF multipart POST. Needs a live PDF POST to confirm the public URL resolves. |
| AC6-mime (non-PDF rejected) | **claimed** | `file.type !== "application/pdf"` → 400. |
| AC6-migration (bucket creation idempotent) | **claimed** | `on conflict (id) do nothing`; running twice is a no-op. Needs a live `supabase db push` to confirm. |
| AC6 (upload control visible on 404) | **deferred** | UI slice — `ResultsDashboard.tsx`, not in this run. |
| AC6-persist (chip survives reload) | **deferred** | UI slice — depends on AC6 UI + existing save route. |
| AC7 (no regression) | **PASS** | See gates below. |

All correctness claims stay `claimed` until a tester validation confirms them against a live
Supabase instance (per [[CLAUDE]] claimed/verified rule).

## 5. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 |
| Lint (touched) | `npx eslint app/api/fulltext/route.ts` | clean, exit 0 |
| Tests | `npx vitest run` | 860 passed / 12 failed — all 12 in pre-existing unrelated files (boolean-search-builder, cache-freshness, cache-topic-search, keyboard-shortcuts, protocol-storage, study-design, use-persistent-*); **0 new**, fewer than the documented 15-failure baseline (handoff 083 §8) |
| Build | `npm run build` | ✓ Compiled successfully; `/api/fulltext` route builds |

## 6. Deferred (follow-on brief/run)

- **AC6 + AC6-persist UI wiring in `components/ResultsDashboard.tsx`** — replace the AC5-404
  "No open-access version found" static note (handoff 104) with an "Upload PDF" file input:
  POST `multipart/form-data` (`file` + `search_id` + row `pmid`/`doi`) to `/api/fulltext`,
  spinner while in-flight, on success save via the existing save path + render a `via Upload`
  source chip, on error show an inline note. The backend this UI calls is now in place.
- Signed/access-controlled Storage URLs (public for now), multi-file/ZIP upload, in-app PDF
  viewer/extraction — all out of scope per brief.

## 7. Potentially stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — full-text row "AC1–7 verified except AC6 (deferred → brief 004)":
  AC6 backend (bucket + upload API) now shipped (handoff 108); AC6 UI still deferred.
- **[[Data Sources]]** / any full-text-retrieval page — `/api/fulltext` now has a second
  (multipart upload) path producing `user_upload` provenance, not just the OA chain.
- **[[Handoff Log]]** — add handoff 108.
- **[[Data Model]]** — a new `fulltext-uploads` Storage bucket (migration 024) exists.

All AC6 correctness claims remain `claimed` pending tester validation against live Supabase.
