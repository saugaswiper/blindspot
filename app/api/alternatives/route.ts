/**
 * ACC-2: Alternative Topic Suggestions API
 *
 * GET /api/alternatives?query=<query>
 *
 * Returns up to 4 verified alternative topics (backed by real PubMed counts)
 * for a given query that returned Insufficient/Low feasibility.
 *
 * Authentication: requires a valid Supabase session. Guest users (cookie-based)
 * are also permitted — this endpoint does not write data, only reads public APIs.
 *
 * Rate limiting: no explicit limit here; downstream PubMed calls are bounded
 * by MAX_CANDIDATES (6) so each request makes at most 6 external API calls.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findFeasibleAlternativeTopics } from "@/lib/topic-broadening";
import { toApiError } from "@/lib/errors";

const QuerySchema = z.object({
  query: z.string().trim().min(2, "query must be at least 2 characters").max(400),
  /**
   * The original primary study count for the query.
   * Used to skip the alternatives lookup entirely when count is already Moderate/High.
   * Optional — if omitted, alternatives are always computed.
   */
  originalCount: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: Request) {
  try {
    // Auth check — we require a session to prevent open abuse of the endpoint
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Return empty rather than 401 so the UI degrades silently for guests
      return Response.json({ alternatives: [] }, { status: 200 });
    }

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const rawParams = {
      query: searchParams.get("query") ?? "",
      originalCount: searchParams.get("originalCount") ?? undefined,
    };

    const parsed = QuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return Response.json({ error: msg }, { status: 400 });
    }

    const { query, originalCount } = parsed.data;

    // Short-circuit if original count is already in Moderate or High territory
    if (originalCount !== undefined && originalCount >= 6) {
      return Response.json({ alternatives: [] }, { status: 200 });
    }

    const alternatives = await findFeasibleAlternativeTopics(query);

    return Response.json({ alternatives }, { status: 200 });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("Alternatives error:", apiError.message);
    // Return empty array on error — alternatives are non-critical; don't break the UI
    return Response.json({ alternatives: [] }, { status: 200 });
  }
}
