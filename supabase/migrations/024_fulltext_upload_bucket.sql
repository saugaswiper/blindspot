-- 024_fulltext_upload_bucket.sql  (Brief 004 — AC6 user-upload fallback)
--
-- Create the `fulltext-uploads` Supabase Storage bucket used by the
-- /api/fulltext multipart upload path. When automated open-access resolution
-- returns nothing, the reviewer uploads a PDF and it is stored here at
--   fulltext-uploads/{search_id}/{pmid_or_doi}.pdf
-- then surfaced with a `via Upload` source chip like any automated hit.
--
-- public = true for now: public-read, write-protected by the upload route
-- (service-role client + authenticated caller). Signed/access-controlled URLs
-- are a later security pass (out of scope per brief 004).
--
-- Idempotent: ON CONFLICT (id) DO NOTHING so re-running is a no-op (AC6-migration).
-- NOTE: brief 004 named this file 025; migration 024 (fulltext_columns) was
-- never created because full-text provenance persists inside the
-- search_results.screening_result JSON blob, not a separate table — so 024 is
-- the next free number. See spec/108-handoff.md.

INSERT INTO storage.buckets (id, name, public)
VALUES ('fulltext-uploads', 'fulltext-uploads', true)
ON CONFLICT (id) DO NOTHING;
