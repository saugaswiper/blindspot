import { createClient } from "@/lib/supabase/server";
import { toApiError } from "@/lib/errors";
import { z } from "zod";

const idSchema = z.string().uuid("Invalid result ID.");

/**
 * POST /api/share/:id
 *
 * Toggles the is_public flag on a search_result.  The result must belong
 * to the authenticated user (enforced by Supabase RLS on search_results).
 *
 * Returns: { is_public: boolean }
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return Response.json({ error: "Invalid result ID." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json(
        { error: "Please sign in to share results." },
        { status: 401 }
      );
    }

    // Read the current is_public state.
    // RLS (search_results_select_own) restricts this to the owning user,
    // so non-owners get a null result rather than a 403.
    const { data: result, error: fetchError } = await supabase
      .from("search_results")
      .select("id, is_public")
      .eq("id", parsed.data)
      .single();

    if (fetchError || !result) {
      return Response.json(
        { error: "Result not found or you do not have access to it." },
        { status: 404 }
      );
    }

    const newPublicState = !result.is_public;

    // Update the flag.
    // RLS (search_results_update_own) ensures only the owner can update.
    const { error: updateError } = await supabase
      .from("search_results")
      .update({ is_public: newPublicState })
      .eq("id", parsed.data);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return Response.json({ is_public: newPublicState });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("Share toggle error:", apiError.message);
    return Response.json(
      { error: apiError.userMessage },
      { status: apiError.statusCode }
    );
  }
}
