# Brief 004 — Full-Text Retrieval: AC6 User-Upload Fallback

**Date:** 2026-06-23
**Stage in pipeline:** 3 (full-text retrieval) — final close-out item deferred from brief 002/003
**Status:** UNBLOCKED — Supabase credentials already in env; bucket created via migration SQL

---

## Goal

When automated OA resolution returns nothing, show the reviewer an "Upload PDF" control
instead of a dead end. Accept the upload in `/api/fulltext`, store it to Supabase Storage
(`fulltext-uploads` bucket), and persist the resulting URL + `user_upload` source onto the
`screening_results` row — exactly like an automated hit.

---

## Why now

Handoff 104 shipped AC5 (source chip) and AC-persist (durable URLs) from brief 003. The only
remaining AC from the full-text retrieval stage is AC6. The roadmap explicitly records:

> "AC1–7 verified except AC6 (deferred → brief 004)"

Until AC6 ships, a reviewer who includes a paywalled study has no path to its full text inside
Blindspot. Data extraction (Otto-SR parity step 4, the next pipeline milestone) requires that
every included study can reach full-text — automated OA or user upload, no dead ends. Building
extraction on a pipeline that silently dead-ends on paywalled studies would produce unreliable,
unauditable extraction results.

AC6 is the minimum gate to open brief 005 (data extraction).

---

## Exact files to touch

| File | Action | What changes |
|------|--------|--------------|
| `supabase/migrations/025_fulltext_upload_bucket.sql` | **CREATE** | Create the `fulltext-uploads` storage bucket if it does not exist. Use `INSERT INTO storage.buckets (id, name, public) VALUES ('fulltext-uploads', 'fulltext-uploads', true) ON CONFLICT (id) DO NOTHING;`. Set `public = true` for now — public-read, write-protected by the upload route's auth. No RLS changes needed on other tables. |
| `app/api/fulltext/route.ts` | **EDIT** | Add a `multipart/form-data` upload path alongside the existing JSON path. Detection: if `Content-Type` starts with `multipart/form-data`, parse the request as `FormData`; extract the `file` field (must be a PDF — validate `file.type === 'application/pdf'`); require `search_id` and `pmid_or_doi` FormData fields for the storage path. Store to Supabase Storage at `fulltext-uploads/{search_id}/{pmid_or_doi}.pdf` via the service-role client. Return `{ fulltext: { url, source: "user_upload" }, fetched_at }` on 200. Return 400 for missing fields or wrong MIME type. The existing JSON path (`{ doi?, pmid? }` → OA resolution) is **unchanged**. |
| `components/ResultsDashboard.tsx` | **EDIT** | Find the AC5-404 fallback added in handoff 104 ("No open-access version found" static note). Replace it with an "Upload PDF" file input control: (a) a labeled `<input type="file" accept="application/pdf" />` (or equivalent styled button) visible only when the automated resolution returned 404; (b) on file selection, POST `multipart/form-data` to `/api/fulltext` with `file`, `search_id`, and the row's `pmid` or `doi`; (c) show a spinner while the upload is in-flight; (d) on success, save the returned URL + `user_upload` source via the existing save path (same flow as an automated hit) and render the source chip labeled `via Upload` with a link to the stored URL; (e) on error, show a brief inline error note — do not crash or silently fail. No changes for `exclude` or `uncertain` rows; no changes to the automated-OA chip flow. |

No changes to `lib/fulltext.ts`, `lib/fulltext.test.ts`, `app/api/screening/save/route.ts`
(already handles `fulltext_url`/`fulltext_source`/`fulltext_fetched_at`), or any search/
screening-logic files.

---

## Scope

### In
- Supabase Storage bucket creation (`fulltext-uploads`, public-read) via migration
- Upload route in `/api/fulltext`: `multipart/form-data` path → validate PDF MIME → store
  to `fulltext-uploads/{search_id}/{pmid_or_doi}.pdf` → return `{ url, source: "user_upload" }`
- UI: replace the AC5-404 static note with an "Upload PDF" file input; spinner; on success,
  source chip "via Upload" + save to DB
- Full provenance chain: uploaded PDF gets the same `fulltext_url` + `fulltext_source` +
  `fulltext_fetched_at` persistence as any automated hit

### Out
- Signed / access-controlled Storage URLs — public URLs for now; security pass later
- Multi-file upload or ZIP batch upload
- In-app PDF viewer or text extraction from uploaded PDFs — that is data extraction (brief 005)
- Bulk background pre-fetch for all included studies — on-demand per user action only
- Full-text screening (using full text to re-evaluate inclusion decisions) — a distinct stage
- CRIT-1 fix (`OPENALEX_API_KEY` on Vercel) — ops blocker, not in dev scope
- Search recall fix (F3 date-sorted truncation, F4 synonym expansion) — separate brief after
  full-text stage closes

---

## Acceptance criteria — beat, don't match

Otto-SR auto-fetches open-access PDFs but has no upload escape hatch: a paywalled study is a
dead end. The bar: Blindspot gives reviewers a path to *every* included study — automated OA
with a labeled source chip, or user upload with an equally labeled chip. No included study is
a dead end, and every full-text URL in the DB carries its provenance.

| # | Criterion | Measurable bar |
|---|-----------|----------------|
| AC6 | **Upload control visible on 404** | For an `include`-verdict study where automated OA resolution returns 404, the UI shows a file-input control labeled "Upload PDF" (or equivalent). No disabled button, no silence, no crash. The control must appear *after* the automated resolution attempt settles — not preemptively before the API call. |
| AC6-upload | **Upload path returns URL** | `POST /api/fulltext` with a valid `multipart/form-data` body (a real PDF file + `search_id` + `pmid_or_doi` fields) returns HTTP 200 with `{ fulltext: { url: <non-empty string>, source: "user_upload" }, fetched_at: <ISO string> }`. The returned URL is a publicly accessible Supabase Storage URL resolving to the uploaded file. |
| AC6-mime | **Non-PDF rejected** | `POST /api/fulltext` with a non-PDF file (e.g. a `.txt` file) returns HTTP 400 with a descriptive error. |
| AC6-persist | **Upload survives reload** | After upload + save: reload the screening workbench — the row shows a source chip labeled exactly `via Upload` (not re-prompting with the file input). Confirm via DevTools Network tab: no re-upload call on reload; URL and source read from `screening_results`. |
| AC6-migration | **Bucket creation idempotent** | Running `025_fulltext_upload_bucket.sql` twice does not error (`ON CONFLICT (id) DO NOTHING`). |
| AC7 | **No regression** | `npx tsc --noEmit --skipLibCheck` and `npx vitest run` pass with zero new failures. The 15 pre-existing failures (handoff 083 §8) are unchanged. |

The **beat** is AC6 + AC6-persist together: Blindspot surfaces not just a PDF link but a
labeled, persisted source record for *every* included study, including paywalled ones — an
auditable provenance trail Otto-SR cannot offer, and the final foundation that makes data
extraction viable on all included studies.

---

## Notes for the dev

**Supabase client in the route:** the upload route must use the **service-role** Supabase
client (not the anon client) to write to Storage. Confirm the service-role client is already
instantiated elsewhere in `app/api/` (likely in a shared `lib/supabase-admin.ts` or similar)
and import from there rather than instantiating a new one.

**Storage path convention:** `{search_id}/{pmid_or_doi}.pdf`
- `search_id`: the UUID of the parent search, passed as a FormData field
- `pmid_or_doi`: the study identifier — use PMID if available, else the DOI (with slashes
  replaced by underscores to avoid sub-path ambiguity, e.g. `10.1000_xyz123.pdf`)
- Example: `a3f7c2d1-..../16804151.pdf`

**Public URL retrieval:** after `.upload()`, call `supabase.storage.from('fulltext-uploads').getPublicUrl(path)` to get the public URL. Return this in the response body as `fulltext.url`.

**ResultsDashboard integration:** the component already holds the `search_id` for the active
search (used in other API calls). Pass it as a FormData field alongside the file. The save
flow after a successful upload is identical to the automated flow: set `fulltext_url`,
`fulltext_source: "user_upload"`, `fulltext_fetched_at` on the screening decision and call the
existing save route.

**Validation handoff:** after shipping, the tester will verify AC6 (upload control visible),
AC6-upload (API returns URL), AC6-persist (chip survives reload), and AC7 (no regression)
in validation 005. The AC2/AC3/AC4 live harness does not need re-running — the OA resolution
chain is unchanged.

**Blocker note (for ops, not dev):** CRIT-1 (`OPENALEX_API_KEY` returning 401 on Vercel) and
the search recall failures (validation 004 F3: date-sorted truncation, F4: synonym expansion)
are tracked separately. CRIT-1 is an ops/secrets task (~5 min at openalex.org/settings/api).
F3/F4 will be addressed in a subsequent brief after this stage closes.
