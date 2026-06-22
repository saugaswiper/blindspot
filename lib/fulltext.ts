/**
 * Open-access full-text resolution chain (Brief 001).
 *
 * Given a screened-in study's DOI and/or PMID, resolve its open-access PDF or
 * HTML/XML full-text URL via a ranked source chain and report provenance:
 *
 *   1. Unpaywall      (DOI-keyed, no key) — primary, richest OA metadata
 *   2. OpenAlex       (DOI-keyed)         — secondary, gated on key availability
 *   3. Europe PMC     (PMID-keyed)        — tertiary, PMC-deposited full text
 *   4. PubMed Central (PMID-keyed)        — quaternary, OA PDF via PMCID
 *
 * The chain is pure of DB/cache side effects: `resolveFulltext` returns a plain
 * object; the API route handles persistence. Every successful result carries a
 * non-null `source`, and a closed-access URL is never returned (AC4) — each
 * source gates on OA status and the orchestrator re-gates as a backstop.
 */

import { ApiError } from "@/lib/errors";
import { normalizeDoi, normalizePmid } from "@/lib/study-id";
import type {
  FulltextResult,
  FulltextOaStatus,
  FulltextFailureReason,
} from "@/types";

const UNPAYWALL_EMAIL =
  process.env.UNPAYWALL_EMAIL ?? process.env.OPENALEX_EMAIL ?? "research@blindspot.app";
const OPENALEX_BASE = "https://api.openalex.org";
const EUROPEPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const PMC_IDCONV = "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/";
const PMC_ARTICLE_BASE = "https://www.ncbi.nlm.nih.gov/pmc/articles";

/** Outcome of a full-text resolution: a result, or null with a reason code. */
export interface FulltextResolution {
  result: FulltextResult | null;
  reason?: FulltextFailureReason;
}

/** Internal per-source outcome: a (possibly null) result + a paywall signal. */
interface SourceOutcome {
  result: FulltextResult | null;
  /** True when the source found the record but it is closed-access. */
  paywalled: boolean;
}

const OA_STATUSES: readonly FulltextOaStatus[] = [
  "gold",
  "green",
  "hybrid",
  "bronze",
  "closed",
];

function normalizeOaStatus(status: unknown): FulltextOaStatus {
  return typeof status === "string" && (OA_STATUSES as readonly string[]).includes(status)
    ? (status as FulltextOaStatus)
    : "closed";
}

/** Backstop OA gate (AC4): a closed-access result is never surfaced. */
function gate(result: FulltextResult): FulltextResult | null {
  return result.oa_status === "closed" ? null : result;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url);
}

// ---------------------------------------------------------------------------
// Source 1 — Unpaywall (DOI-keyed, no API key)
// ---------------------------------------------------------------------------

interface UnpaywallResponse {
  is_oa?: boolean;
  oa_status?: string;
  best_oa_location?: {
    url?: string;
    url_for_pdf?: string;
  } | null;
}

async function tryUnpaywall(doi: string): Promise<SourceOutcome> {
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(UNPAYWALL_EMAIL)}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    if (res.status === 404) return { result: null, paywalled: false };
    throw new ApiError(`Unpaywall failed: ${res.status}`, 502);
  }
  const data = (await res.json()) as UnpaywallResponse;
  const oa_status = normalizeOaStatus(data.oa_status);
  const loc = data.best_oa_location;
  if (!data.is_oa || oa_status === "closed" || !loc) {
    return { result: null, paywalled: true };
  }
  const pdf = loc.url_for_pdf ?? undefined;
  const target = pdf ?? loc.url ?? undefined;
  if (!target) return { result: null, paywalled: false };
  return {
    result: {
      url: target,
      source: "unpaywall",
      oa_status,
      content_type: pdf ? "pdf" : "html",
    },
    paywalled: false,
  };
}

// ---------------------------------------------------------------------------
// Source 2 — OpenAlex open_access metadata (DOI-keyed, gated on key)
// ---------------------------------------------------------------------------

interface OpenAlexWork {
  open_access?: {
    is_oa?: boolean;
    oa_status?: string;
    oa_url?: string | null;
  };
}

async function tryOpenAlex(doi: string): Promise<SourceOutcome> {
  const u = new URL(`${OPENALEX_BASE}/works/doi:${doi}`);
  const key = process.env.OPENALEX_API_KEY;
  if (key) u.searchParams.set("api_key", key);
  const res = await fetch(u.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    // 401/403 = CRIT-1 key issue (gracefully skip); 404 = not indexed.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { result: null, paywalled: false };
    }
    throw new ApiError(`OpenAlex failed: ${res.status}`, 502);
  }
  const data = (await res.json()) as OpenAlexWork;
  const oa = data.open_access;
  const oa_status = normalizeOaStatus(oa?.oa_status);
  if (!oa?.is_oa || oa_status === "closed" || !oa.oa_url) {
    return { result: null, paywalled: oa ? !oa.is_oa : false };
  }
  return {
    result: {
      url: oa.oa_url,
      source: "openalex",
      oa_status,
      content_type: isPdfUrl(oa.oa_url) ? "pdf" : "html",
    },
    paywalled: false,
  };
}

// ---------------------------------------------------------------------------
// Source 3 — Europe PMC full-text XML (PMID-keyed)
// ---------------------------------------------------------------------------

async function tryEuropePMC(pmid: string): Promise<SourceOutcome> {
  // fullTextXML exists only for PMC-deposited (green OA) articles.
  const url = `${EUROPEPMC_BASE}/MED/${encodeURIComponent(pmid)}/fullTextXML`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return { result: null, paywalled: false };
  return {
    result: { url, source: "europepmc", oa_status: "green", content_type: "html" },
    paywalled: false,
  };
}

// ---------------------------------------------------------------------------
// Source 4 — PubMed Central OA PDF via PMID→PMCID conversion
// ---------------------------------------------------------------------------

interface IdConvResponse {
  records?: Array<{ pmcid?: string; pmid?: string; status?: string }>;
}

async function tryPmc(pmid: string): Promise<SourceOutcome> {
  const u = new URL(PMC_IDCONV);
  u.searchParams.set("ids", pmid);
  u.searchParams.set("format", "json");
  u.searchParams.set("tool", "blindspot");
  u.searchParams.set("email", UNPAYWALL_EMAIL);
  const res = await fetch(u.toString(), { next: { revalidate: 0 } });
  if (!res.ok) return { result: null, paywalled: false };
  const data = (await res.json()) as IdConvResponse;
  const pmcid = data.records?.find((r) => r.pmcid)?.pmcid;
  if (!pmcid) return { result: null, paywalled: false };
  // PMC articles are open-access by definition (green); never paywalled.
  return {
    result: {
      url: `${PMC_ARTICLE_BASE}/${pmcid}/pdf/`,
      source: "pmc",
      oa_status: "green",
      content_type: "pdf",
    },
    paywalled: false,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Resolve a study's open-access full text through the ranked source chain.
 * Returns the first non-paywalled hit with provenance, or `null` plus a reason
 * code. Sources are tried sequentially in priority order; a thrown source is
 * caught so one failure never blocks the rest of the chain.
 */
export async function resolveFulltext(
  doiInput?: string,
  pmidInput?: string,
): Promise<FulltextResolution> {
  const doi = normalizeDoi(doiInput);
  const pmid = normalizePmid(pmidInput);
  if (!doi && !pmid) return { result: null, reason: "all_sources_failed" };

  let paywalled = false;
  let errored = false;

  const chain: Array<() => Promise<SourceOutcome>> = [
    ...(doi ? [() => tryUnpaywall(doi), () => tryOpenAlex(doi)] : []),
    ...(pmid ? [() => tryEuropePMC(pmid), () => tryPmc(pmid)] : []),
  ];

  for (const run of chain) {
    try {
      const outcome = await run();
      if (outcome.result) {
        const gated = gate(outcome.result);
        if (gated) return { result: gated };
        paywalled = true; // closed-access slipped past a source; gate caught it
      }
      if (outcome.paywalled) paywalled = true;
    } catch {
      errored = true;
    }
  }

  const reason: FulltextFailureReason = paywalled
    ? "paywalled"
    : errored
      ? "source_error"
      : "all_sources_failed";
  return { result: null, reason };
}
