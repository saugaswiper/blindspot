-- 024: Supabase advisor fixes (2026-11-02). Idempotent; no data changes.

-- 1. handle_new_user is a trigger function (SECURITY DEFINER). It must not be callable via
--    /rest/v1/rpc by anon/authenticated. The auth.users trigger still runs it as owner.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- search_has_public_result stays executable: the searches_select_via_public_result policy
-- calls it as the querying role (anon viewers of shared results).

-- 2. RLS init-plan: evaluate auth.uid() once per statement, not per row.
ALTER POLICY feedback_insert_own ON public.feedback WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY feedback_select_own ON public.feedback USING ((select auth.uid()) = user_id);
ALTER POLICY profiles_select_own ON public.profiles USING ((select auth.uid()) = id);
ALTER POLICY profiles_update_own ON public.profiles USING ((select auth.uid()) = id);
ALTER POLICY search_alerts_delete_own ON public.search_alerts USING ((select auth.uid()) = user_id);
ALTER POLICY search_alerts_insert_own ON public.search_alerts WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY search_alerts_select_own ON public.search_alerts USING ((select auth.uid()) = user_id);
ALTER POLICY search_alerts_update_own ON public.search_alerts USING ((select auth.uid()) = user_id);
ALTER POLICY searches_delete_own ON public.searches USING ((select auth.uid()) = user_id);
ALTER POLICY searches_insert_own ON public.searches WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY searches_select_own ON public.searches USING ((select auth.uid()) = user_id);
ALTER POLICY search_results_delete_own ON public.search_results USING (EXISTS (SELECT 1 FROM public.searches s WHERE s.id = search_results.search_id AND s.user_id = (select auth.uid())));
ALTER POLICY search_results_insert_own ON public.search_results WITH CHECK (EXISTS (SELECT 1 FROM public.searches s WHERE s.id = search_results.search_id AND s.user_id = (select auth.uid())));
ALTER POLICY search_results_select_own ON public.search_results USING (EXISTS (SELECT 1 FROM public.searches s WHERE s.id = search_results.search_id AND s.user_id = (select auth.uid())));
ALTER POLICY search_results_update_own ON public.search_results USING (EXISTS (SELECT 1 FROM public.searches s WHERE s.id = search_results.search_id AND s.user_id = (select auth.uid())));
-- `progress` is not created by this repo's migrations (pre-existing table); only touch it if present.
DO $$ BEGIN
  IF to_regclass('public.progress') IS NOT NULL THEN
    ALTER POLICY progress_insert_own ON public.progress WITH CHECK ((select auth.uid()) = user_id);
    ALTER POLICY progress_select_own ON public.progress USING ((select auth.uid()) = user_id);
    ALTER POLICY progress_update_own ON public.progress USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;

-- 3. Covering indexes for feedback foreign keys.
CREATE INDEX IF NOT EXISTS feedback_search_id_idx ON public.feedback (search_id);
CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON public.feedback (user_id);

-- 4. topic_search_cache: server-only (service role, lib/cache.ts). Explicit deny for client
--    roles, mirroring search_telemetry — the anon key must not write counts (cache poisoning).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='topic_search_cache' AND policyname='topic_search_cache_deny_clients') THEN
    CREATE POLICY topic_search_cache_deny_clients ON public.topic_search_cache
      FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;
