-- =============================================================================
-- Migration 024 — Full-Text Upload Storage Bucket (Brief 004, AC6)
-- Creates the `fulltext-uploads` Storage bucket used by the /api/fulltext
-- multipart upload path, so a reviewer who includes a paywalled study (no
-- open-access hit) can still attach its full text instead of dead-ending.
--
-- Public-read for now (write-protected by the upload route); signed/access-
-- controlled URLs are a later security pass (Brief 004 Scope/Out).
--
-- NB: brief 004 named this `025_...`; it is filed as `024` because migration
-- 024 (fulltext columns) from brief 003 was dropped as inapplicable in
-- handoff 104 (screening persists as a JSONB blob, not a relational table),
-- so 024 is the next contiguous number.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('fulltext-uploads', 'fulltext-uploads', true)
ON CONFLICT (id) DO NOTHING;
