-- Migration 008: Email Alerts / Living Search
--
-- Adds support for weekly email alerts when new reviews are discovered on saved topics.
-- Users can opt-in to receive notifications for searches they care about.

-- Table to track which searches have opted-in to email alerts
CREATE TABLE IF NOT EXISTS search_alerts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id             uuid NOT NULL UNIQUE REFERENCES searches(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_enabled            boolean NOT NULL DEFAULT true,
  last_sent_at          timestamptz,  -- When the last digest email was sent
  last_checked_at       timestamptz,  -- When we last compared results for changes
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Row-level security for search_alerts
ALTER TABLE search_alerts ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own alerts
CREATE POLICY "search_alerts_select_own" ON search_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "search_alerts_insert_own" ON search_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_alerts_update_own" ON search_alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "search_alerts_delete_own" ON search_alerts
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS search_alerts_user_id_idx ON search_alerts(user_id);
CREATE INDEX IF NOT EXISTS search_alerts_enabled_idx ON search_alerts(is_enabled, last_sent_at)
  WHERE is_enabled = true;
