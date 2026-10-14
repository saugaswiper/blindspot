/**
 * Identifier → text-layer pages (Brief 009, slice 2c-ii part 2b-ii).
 *
 * Prefers Europe PMC JATS XML (PMCID via DOI/PMID), then resolves an open-access full-text URL (never paywalled, per `resolveFulltext`), downloads the
 * PDF bytes with a size/time cap, and hands them to `pdfToPages`. Every failure is a typed
 * `reason` so the route can answer `manual` instead of guessing.
 */
import { resolveFulltext } from "@/lib/fulltext";
import { pdfToPages } from "@/lib/extraction-pdf";
import { jatsToPages } from "@/lib/extraction-xml";
import type { TextPage } from "@/lib/extraction-pages";
import type { FulltextResult } from "@/types";

const EUROPEPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;

export type FetchPagesResult =
  | { ok: true; pages: TextPage[]; source: FulltextResult }
  | {
      ok: false;
      reason:
        | "no_open_access"
        | "not_pdf"
        | "publisher_challenge"
        | "download_failed"
        | "too_large"
        | "no_text_layer"
        | "unreadable_pdf";
    };

export interface FetchPagesDeps {
  resolve: typeof resolveFulltext;
  fetchImpl: typeof fetch;
}

/** Europe PMC search by DOI/PMID → PMCID (null when absent or on any failure). */
async function resolvePmcid(
  ids: { doi?: string; pmid?: string },
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const query = ids.pmid
    ? `EXT_ID:${ids.pmid.replace(/\D/g, "")} AND SRC:MED`
    : ids.doi
      ? `DOI:"${ids.doi.replace(/["\\]/g, "")}"`
      : null;
  if (!query) return null;
  try {
    const res = await fetchImpl(
      `${EUROPEPMC_BASE}/search?query=${encodeURIComponent(query)}&format=json&resultType=lite&pageSize=1`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      resultList?: { result?: { pmcid?: string }[] };
    };
    const pmcid = json.resultList?.result?.[0]?.pmcid;
    return pmcid && /^PMC\d+$/.test(pmcid) ? pmcid : null;
  } catch {
    return null;
  }
}

/** Open-access JATS XML from Europe PMC's machine-access API; null if unavailable/empty. */
async function fetchXmlPages(
  ids: { doi?: string; pmid?: string },
  fetchImpl: typeof fetch,
): Promise<{ pages: TextPage[]; source: FulltextResult } | null> {
  const pmcid = await resolvePmcid(ids, fetchImpl);
  if (!pmcid) return null;
  const url = `${EUROPEPMC_BASE}/${pmcid}/fullTextXML`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const xml = await res.text();
    if (xml.length > MAX_PDF_BYTES) return null;
    const pages = jatsToPages(xml);
    if (pages.length === 0) return null;
    return {
      pages,
      source: { url, source: "europepmc", oa_status: "green", content_type: "html" },
    };
  } catch {
    return null;
  }
}

export async function fetchPagesForIdentifier(
  ids: { doi?: string; pmid?: string },
  deps: FetchPagesDeps = { resolve: resolveFulltext, fetchImpl: fetch },
): Promise<FetchPagesResult> {
  // Publisher PDFs sit behind bot-checks we do not bypass; try Europe PMC XML first.
  const xml = await fetchXmlPages(ids, deps.fetchImpl);
  if (xml) return { ok: true, ...xml };

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

  // A PDF starts with "%PDF"; HTML in its place is a publisher bot-check/landing page (not bypassed).
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== "%PDF") {
    const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
    const isHtml = head.startsWith("<!doctype html") || head.startsWith("<html");
    return { ok: false, reason: isHtml ? "publisher_challenge" : "not_pdf" };
  }

  const parsed = await pdfToPages(bytes);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, pages: parsed.pages, source: result };
}
