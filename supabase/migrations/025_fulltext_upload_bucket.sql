-- =============================================================================
-- Migration 025 — Full-Text Upload Storage Bucket (Brief 004 / AC6)
-- Creates the `fulltext-uploads` Storage bucket used by the /api/fulltext
-- multipart upload path. When automated open-access resolution returns nothing,
-- a reviewer can upload the PDF; it is stored here and its public URL persisted
-- onto the screening row as a `user_upload` full-text source.
--
-- public = true: public-read for now (write-protected by the upload route's
-- service-role client). Signed/access-controlled URLs are a later security pass
-- (brief 004 Scope/Out).
--
-- Idempotent: ON CONFLICT (id) DO NOTHING lets this migration run twice safely
-- (AC6-migration).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('fulltext-uploads', 'fulltext-uploads', true)
ON CONFLICT (id) DO NOTHING;
