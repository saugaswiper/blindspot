# Handoff 108 — Full-Text Upload Fallback: Storage bucket + upload route (Brief 004, AC6 backend)

**Date:** 2026-08-10
**Role:** Dev
**Brief:** `spec/briefs/deferred-004-upload-fallback.md` (Brief 004 — AC6 user-upload fallback)
**Stage:** 3 (full-text retrieval) — final close-out item, the last open AC from the stage.

---

## 1. Summary

Brief 004 is the only unimplemented brief left (001–003 shipped in handoffs 102–104;
005–007 in 105–107). It has **three** items — a Storage-bucket migration, a multipart
upload path in `/api/fulltext`, and an "Upload PDF" UI control. Per the loop's
one-scoped-stage / smallest-shippable rule I implemented the **backend** (migration +
upload route), which is independently shippable and testable via the API. The **UI control
is deferred to a follow-on** (see §6).

The backend satisfies **AC6-upload** (upload path returns a URL), **AC6-mime** (non-PDF
rejected 400), and **AC6-migration** (idempotent bucket creation). AC6 (control visible on
404) and AC6-persist (chip survives reload) are the UI items and remain deferred.

---

## 2. Files touched

| File | Action | What changed |
|------|--------|--------------|
| `supabase/migrations/024_fulltext_upload_bucket.sql` | **CREATE** | Creates the `fulltext-uploads` Storage bucket (`public = true`) via `INSERT INTO storage.buckets ... ON CONFLICT (id) DO NOTHING` — idempotent. |
| `app/api/fulltext/route.ts` | **EDIT** | Added a `multipart/form-data` branch (`handleUpload`) alongside the unchanged JSON OA-resolution path. Validates `file` (must be a `File`, `type === "application/pdf"`), `search_id`, `pmid_or_doi`; stores to `fulltext-uploads/{search_id}/{pmid_or_doi}.pdf` (slashes in a DOI → `_`) via the service-role client with `upsert: true`; returns `{ fulltext: { url, source: "user_upload" }, fetched_at }`. |

No changes to `lib/fulltext.ts`, `lib/fulltext.test.ts`, `app/api/screening/save/route.ts`,
`types/index.ts`, or any UI file.

### Deviations from the brief (code wins)

1. **Migration numbered `024`, not `025`.** The brief assumed brief 003's
   `024_fulltext_columns.sql` existed, but handoff 104 dropped it as inapplicable (screening
   persists as a JSONB blob on `search_results.screening_result`, not a relational
   `screening_results` table). So `024` was the next contiguous number; using `025` would
   leave an orphan gap. Documented in the migration header.

2. **Upload response is the minimal `{ url, source }`, not a full `FulltextResult`.** A user
   upload has no open-access colour status, so fabricating `oa_status`/`content_type` would
   misrepresent it. Only `url`/`source` are persisted onto the screening decision + rendered
   in the chip (per handoff 104), so the minimal shape is correct and honest. This matches
   the response shape the brief itself specifies.

3. **No route-level auth added.** The existing JSON path has no auth, and the brief defers
   access-controlled Storage to "a later security pass" (Scope/Out). The upload path stays
   consistent — public bucket, service-role write. Flagged for the future security pass.

---

## 3. Behavior change

- `POST /api/fulltext` with `Content-Type: multipart/form-data` now stores a reviewer-supplied
  PDF and returns its public Storage URL with `source: "user_upload"`. The existing JSON
  (`{ doi?, pmid? }`) OA-resolution path is byte-for-byte unchanged.
- Validation: missing `file`/`search_id`/`pmid_or_doi` → 400; non-PDF MIME → 400; Storage
  error → 500.
- **Prerequisite:** migration `024` must be applied to the Supabase project before the upload
  path works (the bucket must exist). This is an ops step, like every prior migration.

---

## 4. Acceptance criteria (brief 004)

| AC | Status | Note |
|----|--------|------|
| AC6-migration | **claimed** (static) | `ON CONFLICT (id) DO NOTHING` — re-runnable. Verify by applying twice. |
| AC6-upload | **claimed** | Live: `POST` multipart PDF → 200 `{ fulltext: { url, source: "user_upload" }, fetched_at }`. Tester's job (needs applied migration + Storage). |
| AC6-mime | **claimed** | Live: non-PDF → 400. |
| AC6 (UI control visible) | **deferred** | Follow-on — UI in `ScreeningPanel.tsx` (not `ResultsDashboard.tsx`; see handoff 104). |
| AC6-persist | **deferred** | Follows the UI item; reuses the handoff-104 chip + JSON-blob save flow. |
| AC7 (no regression) | **PASS** | See §5. |

All correctness claims stay **`claimed`** until the tester verifies them against a live
Supabase project (validation NNN).

---

## 5. Gate results

| Gate | Command | Result |
|------|---------|--------|
| Lint (touched) | `npx eslint app/api/fulltext/route.ts` | clean (0 problems) |
| Types | `npx tsc --noEmit --skipLibCheck` | exit 0 |
| Tests | `npx vitest run` | 860 passed / 12 failed — all pre-existing & unrelated (boolean-search-builder, cache-freshness, cache-topic-search, keyboard-shortcuts, protocol-storage, study-design, use-persistent-*); `lib/fulltext.test.ts` passes; **0 new failures**. (Baseline drifted from the documented 15/857 — fewer failures now, none in touched code.) |
| Build | `npm run build` | ✓ Compiled successfully; `/api/fulltext` route present |

NB: repo-wide `npm run lint` still reports the ~444 pre-existing errors in untouched files
(documented in handoffs 104/107); none in `app/api/fulltext/route.ts`.

---

## 6. Deferred (out of scope this run)

- **AC6 UI control + AC6-persist** — the "Upload PDF" file input on 404 rows in
  `components/ScreeningPanel.tsx` (replace the handoff-104 "No open-access version found"
  static note), spinner, POST multipart, then reuse the existing chip + JSON-blob save flow
  to render `via Upload` and persist. The next dev run should pick this up as the smallest
  next stage. **Note:** the brief names `ResultsDashboard.tsx`, but the screening UI lives in
  `ScreeningPanel.tsx` (per handoff 104 divergence #2) — target that file.
- Signed / access-controlled Storage URLs — brief-deferred security pass.
- Route-level auth on the upload path — flagged above; future security pass.

---

## 7. Potentially stale wiki pages (for the librarian)

- **[[Roadmap & Status]]** — Full-text retrieval row: AC6 backend (upload route + bucket) now
  shipped (handoff 108); AC6 UI still deferred. Add handoff-108 pointer.
- **[[Data Sources]]** / any Full-Text Retrieval feature page — `/api/fulltext` now has a
  `user_upload` multipart path → `fulltext-uploads` Storage bucket.
- **[[Handoff Log]]** — add handoff 108.
- Brief 004 mirror (if any) — note migration renumbered 024, upload UI target is
  `ScreeningPanel.tsx`, and UI is deferred to a follow-on.
