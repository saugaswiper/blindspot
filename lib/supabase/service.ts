/**
 * lib/supabase/service.ts
 *
 * Supabase client that uses the SERVICE ROLE key — bypasses Row-Level Security.
 *
 * ⚠️  ONLY use this in server-side background jobs (e.g. cron routes) where you
 * need to read or write rows across multiple users. NEVER expose this client
 * to the browser or pass it into React Server Components that render user data.
 *
 * Requires env variable: SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      // Service role clients should not persist sessions or auto-refresh tokens
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
