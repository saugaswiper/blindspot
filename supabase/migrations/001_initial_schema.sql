-- =============================================================================
-- Blindspot MVP — Initial Schema
-- Run this in Supabase Dashboard → SQL Editor
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PROFILES
-- Extends Supabase's built-in auth.users table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  full_name   text,
  institution text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------------------------------------
-- SEARCHES
-- One row per topic search submitted by a user
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS searches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  query_text        text NOT NULL,
  pico_population   text,
  pico_intervention text,
  pico_comparison   text,
  pico_outcome      text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- SEARCH_RESULTS
-- Cached analysis output linked to a search row (7-day TTL)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_results (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id                   uuid NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  existing_reviews            jsonb NOT NULL DEFAULT '[]',
  primary_study_count         integer NOT NULL DEFAULT 0,
  feasibility_score           text CHECK (feasibility_score IN ('High','Moderate','Low','Insufficient')),
  feasibility_explanation     text,
  gap_analysis                jsonb,
  study_design_recommendation jsonb,
  raw_api_responses           jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- -----------------------------------------------------------------------------
-- FEEDBACK
-- In-app ratings and comments per search
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  search_id  uuid REFERENCES searches(id) ON DELETE SET NULL,
  rating     integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- Enable on every table — enforced at the database level regardless of app code
-- =============================================================================

ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE searches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback      ENABLE ROW LEVEL SECURITY;

-- PROFILES: users can only read/update their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- SEARCHES: users can only see and manage their own searches
CREATE POLICY "searches_select_own" ON searches
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "searches_insert_own" ON searches
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "searches_delete_own" ON searches
  FOR DELETE USING (auth.uid() = user_id);

-- SEARCH_RESULTS: accessible only through the owning search
CREATE POLICY "search_results_select_own" ON search_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );

CREATE POLICY "search_results_insert_own" ON search_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM searches
      WHERE searches.id = search_results.search_id
        AND searches.user_id = auth.uid()
    )
  );

-- FEEDBACK: users can create feedback and read only their own
CREATE POLICY "feedback_insert_own" ON feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_select_own" ON feedback
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================================================
-- INDEXES for common query patterns
-- =============================================================================
CREATE INDEX IF NOT EXISTS searches_user_id_idx        ON searches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS search_results_search_id_idx ON search_results(search_id);
CREATE INDEX IF NOT EXISTS search_results_expires_at_idx ON search_results(expires_at);
