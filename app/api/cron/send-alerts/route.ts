/**
 * GET /api/cron/send-alerts
 *
 * Vercel Cron Function — runs weekly (see vercel.json for schedule).
 *
 * For each user who has opted into email alerts on a saved search:
 *   1. Fetch the stored existing_reviews snapshot from search_results.
 *   2. Re-run a lightweight PubMed search on the same query.
 *   3. Identify reviews in the fresh results that are absent from the snapshot.
 *   4. If new reviews were found, OR it has been ≥ 7 days since the last digest,
 *      send an email digest to the user.
 *   5. Merge new reviews into the stored snapshot so they are not re-reported.
 *   6. Update last_checked_at (and last_sent_at if an email was sent).
 *
 * Authentication: Vercel Cron sets `Authorization: Bearer <CRON_SECRET>` on
 * every invocation. We verify this header against the CRON_SECRET env variable
 * so that arbitrary HTTP clients cannot trigger the route.
 *
 * The route uses a Supabase service-role client so it can read/write rows
 * across ALL users, bypassing Row-Level Security (which only allows each user
 * to access their own rows).
 */

import { createServiceRoleClient } from "@/lib/supabase/service";
import { runCronSearch, mergeReviews } from "@/lib/cron-search";
import {
  findNewReviews,
  generatePlainTextEmail,
  generateHtmlEmail,
  shouldSendAlert,
} from "@/lib/email-alerts";
import type { ExistingReview } from "@/types";

// ---------------------------------------------------------------------------
// Email sending
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = "alerts@blindspot-sr.dev";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://blindspot-sr.dev";

async function sendEmail(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[cron/send-alerts] RESEND_API_KEY not configured; skipping email send");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Cron handler
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  // Vercel Cron automatically adds `Authorization: Bearer <CRON_SECRET>`.
  // We reject any request that doesn't carry the correct secret so that
  // arbitrary callers cannot trigger the route.
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Secret not configured — fail closed
    console.error("[cron/send-alerts] CRON_SECRET environment variable is not set");
    return Response.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Setup ─────────────────────────────────────────────────────────────────
  // Service-role client bypasses RLS — required to read all users' alert rows.
  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    console.error("[cron/send-alerts] Could not create service-role client:", err);
    return Response.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  try {
    // ── Fetch enabled alert subscriptions ───────────────────────────────────
    const { data: alerts, error: alertsError } = await supabase
      .from("search_alerts")
      .select(`
        id,
        search_id,
        user_id,
        last_checked_at,
        last_sent_at,
        searches (
          id,
          query_text,
          user_id
        ),
        profiles (
          email
        )
      `)
      .eq("is_enabled", true);

    if (alertsError) {
      console.error("[cron/send-alerts] Failed to fetch alerts:", alertsError);
      return Response.json({ error: "Failed to fetch alerts" }, { status: 500 });
    }

    if (!alerts || alerts.length === 0) {
      return Response.json({ processed: 0, message: "No active alert subscriptions" });
    }

    let successCount = 0;
    let skippedCount = 0;
    let failureCount = 0;

    // ── Process each subscription ───────────────────────────────────────────
    for (const alert of alerts) {
      try {
        const searchData = Array.isArray(alert.searches)
          ? alert.searches[0]
          : alert.searches;
        const profileData = Array.isArray(alert.profiles)
          ? alert.profiles[0]
          : alert.profiles;

        if (!searchData || !profileData) {
          console.warn(`[cron/send-alerts] Alert ${alert.id}: missing search or profile — skipping`);
          failureCount++;
          continue;
        }

        const searchId = searchData.id as string;
        const query = searchData.query_text as string;
        const userEmail = profileData.email as string;

        // ── Fetch the stored review snapshot ─────────────────────────────
        const { data: resultData, error: resultError } = await supabase
          .from("search_results")
          .select("id, existing_reviews, primary_study_count")
          .eq("search_id", searchId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (resultError || !resultData) {
          console.warn(
            `[cron/send-alerts] Alert ${alert.id}: no search_results row for search ${searchId} — skipping`
          );
          failureCount++;
          continue;
        }

        const storedReviews = (resultData.existing_reviews ?? []) as ExistingReview[];
        const resultId = resultData.id as string;

        // ── Re-search PubMed to detect new publications ───────────────────
        const freshReviews = await runCronSearch(query);

        // Identify reviews present in the fresh search but absent from snapshot
        const newReviews = findNewReviews(freshReviews, storedReviews);

        // ── Decide whether to send ────────────────────────────────────────
        const lastSentDate = alert.last_sent_at ? new Date(alert.last_sent_at as string) : null;
        if (!shouldSendAlert(newReviews, lastSentDate)) {
          // No new reviews and recently sent — just record the check time
          await supabase
            .from("search_alerts")
            .update({ last_checked_at: new Date().toISOString() })
            .eq("id", alert.id);
          skippedCount++;
          continue;
        }

        // ── Build and send digest email ───────────────────────────────────
        const totalCount = storedReviews.length + newReviews.length;
        const unsubscribeUrl = `${APP_BASE_URL}/api/alerts/unsubscribe?token=${alert.id}`;
        const resultsUrl = `${APP_BASE_URL}/results/${resultId}`;

        const digestData = {
          searchId,
          query,
          newReviews,
          totalReviewsCount: totalCount,
          resultsUrl,
        };

        const plainText = generatePlainTextEmail(digestData, unsubscribeUrl);
        const htmlContent = generateHtmlEmail(digestData, unsubscribeUrl);

        await sendEmail(
          userEmail,
          `New Systematic Reviews Found: "${query}"`,
          plainText,
          htmlContent
        );

        // ── Update stored snapshot to prevent re-reporting ────────────────
        // Only write back if we actually found new reviews (no-op otherwise)
        if (newReviews.length > 0) {
          const mergedReviews = mergeReviews(storedReviews, freshReviews);
          await supabase
            .from("search_results")
            .update({ existing_reviews: mergedReviews })
            .eq("id", resultId);
        }

        // ── Record successful send ────────────────────────────────────────
        await supabase
          .from("search_alerts")
          .update({
            last_checked_at: new Date().toISOString(),
            last_sent_at: new Date().toISOString(),
          })
          .eq("id", alert.id);

        successCount++;
      } catch (alertErr) {
        console.error(`[cron/send-alerts] Error processing alert ${alert.id}:`, alertErr);
        failureCount++;
      }
    }

    return Response.json({
      processed: successCount,
      skipped: skippedCount,
      failed: failureCount,
      message: `Sent ${successCount} alerts, skipped ${skippedCount}, ${failureCount} failed`,
    });
  } catch (error) {
    console.error("[cron/send-alerts] Unexpected error:", error);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
