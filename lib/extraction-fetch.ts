/**
 * Identifier → text-layer pages (Brief 009, slice 2c-ii part 2b-ii).
 *
 * Resolves an open-access full-text URL (never paywalled, per `resolveFulltext`), downloads the
 * PDF bytes with a size/time cap, and hands them to `pdfToPages`. Every failure is a typed
 * `reason` so the route can answer `manual` instead of guessing.
 */
import { resolveFulltext } from "@/lib/fulltext";
import { pdfToPages } from "@/lib/extraction-pdf";
import type { TextPage } from "@/lib/extraction-pages";
import type { FulltextResult } from "@/types";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export type FetchPagesResult =
  | { ok: true; pages: TextPage[]; source: FulltextResult }
  | {
      ok: false;
      reason:
        | "no_open_access"
        | "not_pdf"
        | "download_failed"
        | "too_large"
        | "no_text_layer"
        | "unreadable_pdf";
    };

export interface FetchPagesDeps {
  resolve: typeof resolveFulltext;
  fetchImpl: typeof fetch;
}

export async function fetchPagesForIdentifier(
  ids: { doi?: string; pmid?: string },
  deps: FetchPagesDeps = { resolve: resolveFulltext, fetchImpl: fetch },
): Promise<FetchPagesResult> {
  const { result } = await deps.resolve(ids.doi, ids.pmid);
  if (!result) return { ok: false, reason: "no_open_access" };
  if (result.content_type !== "pdf") return { ok: false, reason: "not_pdf" };
  if (!/^https:\/\//i.test(result.url)) {
    return { ok: false, reason: "download_failed" };
  }

  let bytes: Uint8Array;
  try {
    const res = await deps.fetchImpl(result.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, reason: "download_failed" };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_PDF_BYTES) return { ok: false, reason: "too_large" };
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) return { ok: false, reason: "too_large" };
    bytes = new Uint8Array(buf);
  } catch {
    return { ok: false, reason: "download_failed" };
  }

  // A PDF starts with "%PDF"; anything else (HTML landing page) is not extractable here.
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== "%PDF") return { ok: false, reason: "not_pdf" };

  const parsed = await pdfToPages(bytes);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, pages: parsed.pages, source: result };
}
