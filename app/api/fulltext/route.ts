/**
 * /api/fulltext  (Brief 001; upload fallback Brief 004 / deferred-004)
 *
 * Two request shapes, dispatched by Content-Type:
 *
 * 1. JSON (Brief 001) — resolve a study's open-access full-text URL via the
 *    ranked source chain in lib/fulltext.ts.
 *    - Request body: { doi?: string, pmid?: string }  (at least one required)
 *    - 200 → { fulltext: FulltextResult, fetched_at: string }
 *    - 404 → { error: string, reason: FulltextFailureReason }  (no OA URL found)
 *    - 400 → { error: string }  (no identifier / malformed body)
 *
 * 2. multipart/form-data (Brief 004 AC6) — reviewer-uploaded PDF fallback when
 *    automated OA resolution dead-ends. Fields: `file` (application/pdf),
 *    `search_id`, `pmid_or_doi`. Stores the PDF to the `fulltext-uploads`
 *    Storage bucket and returns the public URL with `user_upload` provenance.
 *    - 200 → { fulltext: { url, source: "user_upload" }, fetched_at: string }
 *    - 400 → { error: string }  (missing field / non-PDF)
 *
 * The JSON path does no auth or DB write; the upload path uses the service-role
 * client to write Storage only. Persisting the resolved/uploaded URL onto the
 * screening row is handled by the screening save route in both cases.
 */

import { resolveFulltext } from "@/lib/fulltext";
import { toApiError } from "@/lib/errors";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { z } from "zod";

/** Storage bucket for reviewer-uploaded full-text PDFs (migration 024). */
const FULLTEXT_UPLOAD_BUCKET = "fulltext-uploads";

const RequestSchema = z
  .object({
    doi: z.string().trim().min(1).optional(),
    pmid: z.string().trim().min(1).optional(),
  })
  .refine((b) => b.doi || b.pmid, {
    message: "Provide a doi or pmid to resolve full text.",
  });

/**
 * Brief 004 AC6 — accept a reviewer-uploaded PDF when automated OA resolution
 * dead-ends, store it to Supabase Storage, and return a persisted-quality URL
 * with `user_upload` provenance (same downstream save path as an automated hit).
 */
async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const searchId = form.get("search_id");
  const idField = form.get("pmid_or_doi");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "A PDF file is required in the `file` field." },
      { status: 400 },
    );
  }
  if (file.type !== "application/pdf") {
    return Response.json(
      { error: "Only PDF uploads are accepted (application/pdf)." },
      { status: 400 },
    );
  }
  if (typeof searchId !== "string" || searchId.trim() === "") {
    return Response.json({ error: "A `search_id` field is required." }, { status: 400 });
  }
  if (typeof idField !== "string" || idField.trim() === "") {
    return Response.json({ error: "A `pmid_or_doi` field is required." }, { status: 400 });
  }

  // Collapse the identifier to a single safe path segment: DOIs contain slashes
  // (sub-path ambiguity) and other punctuation, so keep only URL-safe chars.
  const safeId = idField.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${searchId.trim()}/${safeId}.pdf`;

  const supabase = createServiceRoleClient();
  const { error: uploadError } = await supabase.storage
    .from(FULLTEXT_UPLOAD_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return Response.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data } = supabase.storage.from(FULLTEXT_UPLOAD_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    return Response.json(
      { error: "Upload succeeded but no public URL was returned." },
      { status: 500 },
    );
  }

  return Response.json(
    {
      fulltext: { url: data.publicUrl, source: "user_upload" as const },
      fetched_at: new Date().toISOString(),
    },
    { status: 200 },
  );
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
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
