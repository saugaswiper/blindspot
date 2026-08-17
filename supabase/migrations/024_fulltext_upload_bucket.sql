-- 024_fulltext_upload_bucket.sql
-- Brief 004 (deferred-004) — Full-text retrieval AC6 user-upload fallback.
--
-- Creates the `fulltext-uploads` Storage bucket that /api/fulltext writes
-- user-uploaded PDFs to when automated OA resolution returns nothing. Public
-- read so the persisted `fulltext_url` resolves without a signed request;
-- writes are gated by the upload route (service-role client only). Idempotent.

insert into storage.buckets (id, name, public)
values ('fulltext-uploads', 'fulltext-uploads', true)
on conflict (id) do nothing;
