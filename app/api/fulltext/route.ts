/**
 * /api/fulltext  (Brief 001 + Brief 004)
 *
 * Two POST paths, chosen by Content-Type:
 *
 * 1. JSON  ({ doi?, pmid? })  — Brief 001. Resolve a screened-in study's
 *    open-access full-text URL via the ranked source chain in lib/fulltext.ts.
 *    - 200 → { fulltext: FulltextResult, fetched_at: string }
 *    - 404 → { error, reason: FulltextFailureReason }  (no OA URL found)
 *    - 400 → { error }  (no identifier / malformed body)
 *    Stateless OA lookup: no DB write. Persisting the resolved URL onto the
 *    screening blob is handled by the screening save route.
 *
 * 2. multipart/form-data  (file + search_id + pmid_or_doi)  — Brief 004, AC6.
 *    User-upload fallback for studies with no open-access version: store the
 *    PDF to the `fulltext-uploads` Storage bucket and return a `user_upload`
 *    result so the reviewer never dead-ends on a paywalled study.
 *    - 200 → { fulltext: { url, source: "user_upload" }, fetched_at: string }
 *    - 400 → { error }  (missing fields / non-PDF)
 */

import { resolveFulltext } from "@/lib/fulltext";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { toApiError } from "@/lib/errors";
import { z } from "zod";

const FULLTEXT_BUCKET = "fulltext-uploads";

const RequestSchema = z
  .object({
    doi: z.string().trim().min(1).optional(),
    pmid: z.string().trim().min(1).optional(),
  })
  .refine((b) => b.doi || b.pmid, {
    message: "Provide a doi or pmid to resolve full text.",
  });

export async function POST(request: Request) {
  try {
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      return await handleUpload(request);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const { doi, pmid } = parsed.data;
    const { result, reason } = await resolveFulltext(doi, pmid);

    if (!result) {
      return Response.json(
        { error: "No open-access full text found.", reason },
        { status: 404 },
      );
    }

    return Response.json(
      { fulltext: result, fetched_at: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    const apiError = toApiError(error);
    return Response.json({ error: apiError.userMessage }, { status: apiError.statusCode });
  }
}

/**
 * Brief 004 AC6 — user-upload fallback. Stores a reviewer-supplied PDF to
 * Supabase Storage at `{search_id}/{pmid_or_doi}.pdf` and returns its public
 * URL with `source: "user_upload"`. The `oa_status`/`content_type` fields of
 * FulltextResult are intentionally omitted: an upload carries no open-access
 * colour status, and only `url`/`source` are persisted onto the screening blob.
 */
async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form body." }, { status: 400 });
  }

  const file = form.get("file");
  const searchId = form.get("search_id");
  const pmidOrDoi = form.get("pmid_or_doi");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing PDF file in `file` field." }, { status: 400 });
  }
  if (typeof searchId !== "string" || !searchId.trim()) {
    return Response.json({ error: "Missing `search_id` field." }, { status: 400 });
  }
  if (typeof pmidOrDoi !== "string" || !pmidOrDoi.trim()) {
    return Response.json({ error: "Missing `pmid_or_doi` field." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json({ error: "Only PDF files are accepted." }, { status: 400 });
  }

  // Slashes in a DOI would create spurious sub-paths in the storage key.
  const safeId = pmidOrDoi.trim().replace(/\//g, "_");
  const path = `${searchId.trim()}/${safeId}.pdf`;

  const supabase = createServiceRoleClient();
  const { error: uploadError } = await supabase.storage
    .from(FULLTEXT_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(FULLTEXT_BUCKET).getPublicUrl(path);

  return Response.json(
    {
      fulltext: { url: data.publicUrl, source: "user_upload" as const },
      fetched_at: new Date().toISOString(),
    },
    { status: 200 },
  );
}
