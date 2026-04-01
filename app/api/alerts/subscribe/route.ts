/**
 * POST /api/alerts/subscribe
 *
 * Enable email alerts for a given search.
 * Requires authentication (user must own the search).
 * Idempotent: calling again just updates the subscription.
 */

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const RequestSchema = z.object({
  searchId: z.string().uuid("Invalid search ID format"),
});

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

    // Create or update the alert subscription
    const { error } = await supabase
      .from("search_alerts")
      .upsert(
        {
          search_id: searchId,
          user_id: user.id,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "search_id",
        }
      );

    if (error) {
      console.error("Supabase error:", error);
      return Response.json(
        { error: "Failed to enable alerts" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "Email alerts enabled",
    });
  } catch (error) {
    console.error("Unexpected error in /api/alerts/subscribe:", error);
    return Response.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
