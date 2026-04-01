/**
 * GET /api/alerts/unsubscribe?token=<alertId>
 *
 * One-click unsubscribe from email links. The `token` query parameter is the
 * UUID of the search_alerts row (included in every digest email). No session
 * is required — the UUID acts as a bearer token for this single low-risk action.
 *
 * Uses the service-role client to bypass RLS so unauthenticated users can
 * disable their own alert row by knowing its ID.
 *
 * On success: redirects to /alerts/unsubscribed
 * On invalid token: redirects to /alerts/unsubscribed?error=invalid
 *
 * POST /api/alerts/unsubscribe
 *
 * Disable email alerts for a given search.
 * Requires authentication (user must own the search).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { z } from "zod";

const RequestSchema = z.object({
  searchId: z.string().uuid("Invalid search ID format"),
});

const tokenSchema = z.string().uuid();

/** Resolve a relative path to an absolute URL using the incoming request's origin. */
function toAbsoluteUrl(req: Request, path: string): string {
  const { origin } = new URL(req.url);
  return `${origin}${path}`;
}

/**
 * GET /api/alerts/unsubscribe?token=<alertId>
 *
 * One-click unsubscribe used by the weekly email digest footer link.
 * The token is the search_alerts.id UUID sent in every alert email.
 *
 * No session is required — the UUID acts as a bearer token for this
 * single, low-risk, idempotent write. Uses the service-role client to
 * bypass RLS so unauthenticated users can disable their own alert row.
 *
 * Redirects to /alerts/unsubscribed (with optional ?error=... query) so
 * users land on a friendly confirmation page instead of raw JSON.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";

  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) {
    return Response.redirect(
      toAbsoluteUrl(req, "/alerts/unsubscribed?error=invalid"),
      302
    );
  }

  try {
    const supabase = createServiceRoleClient();

    // Look up the alert row by its ID (the token).
    const { data: alert, error: fetchError } = await supabase
      .from("search_alerts")
      .select("id, is_enabled")
      .eq("id", parsed.data)
      .single();

    if (fetchError || !alert) {
      // Unknown token — show "already unsubscribed or link expired" message.
      return Response.redirect(
        toAbsoluteUrl(req, "/alerts/unsubscribed?error=not_found"),
        302
      );
    }

    // Disable the subscription (idempotent — safe to call even if already disabled).
    const { error: updateError } = await supabase
      .from("search_alerts")
      .update({ is_enabled: false, updated_at: new Date().toISOString() })
      .eq("id", parsed.data);

    if (updateError) {
      console.error("[alerts/unsubscribe GET] Supabase update error:", updateError);
      return Response.redirect(
        toAbsoluteUrl(req, "/alerts/unsubscribed?error=server"),
        302
      );
    }

    return Response.redirect(toAbsoluteUrl(req, "/alerts/unsubscribed"), 302);
  } catch (err) {
    console.error("[alerts/unsubscribe GET] Unexpected error:", err);
    return Response.redirect(
      toAbsoluteUrl(req, "/alerts/unsubscribed?error=server"),
      302
    );
  }
}

export async function POST(req: Request) {
  try {
    // Validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Missing or invalid searchId" },
        { status: 400 }
      );
    }

    const { searchId } = parsed.data;

    // Get authenticated user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Verify user owns this search
    const { data: search } = await supabase
      .from("searches")
      .select("user_id")
      .eq("id", searchId)
      .single();

    if (!search || search.user_id !== user.id) {
      return Response.json(
        { error: "Search not found or access denied" },
        { status: 404 }
      );
    }

    // Disable the alert subscription
    const { error } = await supabase
      .from("search_alerts")
      .update({
        is_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("search_id", searchId);

    if (error) {
      console.error("Supabase error:", error);
      return Response.json(
        { error: "Failed to disable alerts" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "Email alerts disabled",
    });
  } catch (error) {
    console.error("Unexpected error in /api/alerts/unsubscribe:", error);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
