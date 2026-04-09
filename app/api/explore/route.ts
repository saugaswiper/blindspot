/**
 * Field Explorer API
 *
 * GET /api/explore?field=<broad topic>
 *
 * Returns 8 specific systematic review subtopics within the given broad
 * research field, each verified with a real PubMed primary study count.
 *
 * Open to guests (no auth required) — this is a discovery/marketing surface.
 * Rate limiting: Gemini call + up to 8 PubMed calls per request. Responses
 * are cached for 24h via Next.js fetch caching inside exploreField().
 */

import { z } from "zod";
import { exploreField } from "@/lib/explore";
import { toApiError } from "@/lib/errors";

const QuerySchema = z.object({
  field: z
    .string()
    .trim()
    .min(2, "field must be at least 2 characters")
    .max(200, "field is too long"),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({ field: searchParams.get("field") ?? "" });

    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join("; ");
      return Response.json({ error: msg }, { status: 400 });
    }

    const result = await exploreField(parsed.data.field);
    return Response.json(result, { status: 200 });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("Explore error:", apiError.message);
    return Response.json(
      { error: apiError.userMessage ?? "Failed to explore field. Please try again." },
      { status: apiError.statusCode ?? 500 }
    );
  }
}
