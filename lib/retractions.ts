/**
 * Retraction / withdrawal awareness.
 *
 * Acceptance criterion #4 of the Search Recall & Provenance Benchmark milestone:
 * flag retracted or withdrawn records so a reviewer never builds on discredited
 * evidence — Otto-SR table-stakes capability.
 *
 * Data source: the Crossref REST API (free, keyless; a `mailto` opts into the
 * faster "polite pool"). For each DOI we read the work's own Crossref record and
 * look for retraction signals that Crossref surfaces ON the original article:
 *   1. `relation["is-retracted-by"]` — Crossref's explicit retraction link.
 *   2. A title prefixed "RETRACTED:" / "WITHDRAWN:" / "REMOVED:" — the
 *      convention publishers and PubMed use to mark discredited articles.
 *   3. `update-to` entries whose type is a retraction/withdrawal/removal/
 *      expression-of-concern (present when the record is itself the notice).
 *
 * GUARDRAILS (RAISE / brief): flags are **advisory and displayed, never
 * auto-deleted**. A retraction-API failure must NEVER block search — every
 * network path degrades to "not flagged" rather than throwing.
 *
 * KNOWN LIMITATION: Crossref's retraction coverage is partial; the Retraction
 * Watch dataset is more complete. Records with a PMID but no DOI are not
 * checked here (Crossref is DOI-keyed). Both are documented follow-ups.
 */

import { normalizeDoi, type StudyId } from "@/lib/study-id";

const CROSSREF_BASE = "https://api.crossref.org/works";
// Crossref recommends a contact address for the polite pool; reuse the OpenAlex
// contact if a dedicated one isn't set. Empty is allowed (anonymous pool).
const CROSSREF_MAILTO = process.env.CROSSREF_MAILTO ?? process.env.OPENALEX_EMAIL ?? "";

export type RetractionType =
  | "retraction"
  | "partial_retraction"
  | "withdrawal"
  | "removal"
  | "expression_of_concern";

export interface RetractionFlag {
  /** Normalized DOI of the flagged study. */
  doi: string;
  /** What kind of post-publication action was found. */
  type: RetractionType;
  /** DOI of the retraction/withdrawal notice, when Crossref provides it. */
  noticeDoi?: string;
  /** Short human-readable explanation for display. */
  label: string;
}

// ── Crossref response shapes (subset we read) ──────────────────────────────────

interface CrossrefUpdate {
  DOI?: string;
  type?: string;
  label?: string;
}

interface CrossrefRelationItem {
  id?: string;
  "id-type"?: string;
}

export interface CrossrefMessage {
  DOI?: string;
  type?: string;
  title?: string[];
  "update-to"?: CrossrefUpdate[];
  relation?: Record<string, CrossrefRelationItem[]>;
}

interface CrossrefResponse {
  message?: CrossrefMessage;
}

// Crossref `update-to` / update type strings we treat as discrediting.
const FLAGGABLE_UPDATE_TYPES: Record<string, RetractionType> = {
  retraction: "retraction",
  partial_retraction: "partial_retraction",
  withdrawal: "withdrawal",
  removal: "removal",
  expression_of_concern: "expression_of_concern",
};

const TITLE_PREFIX_TYPES: Array<{ re: RegExp; type: RetractionType }> = [
  { re: /^\s*retracted\b/i, type: "retraction" },
  { re: /^\s*withdrawn\b/i, type: "withdrawal" },
  { re: /^\s*removed\b/i, type: "removal" },
];

const TYPE_LABELS: Record<RetractionType, string> = {
  retraction: "Retracted",
  partial_retraction: "Partially retracted",
  withdrawal: "Withdrawn",
  removal: "Removed",
  expression_of_concern: "Expression of concern",
};

/**
 * Decide whether a Crossref work record indicates a retraction/withdrawal.
 * Pure and synchronous — unit-tested independently of the network.
 */
export function parseCrossrefRetraction(message: CrossrefMessage | undefined | null): RetractionFlag | null {
  if (!message) return null;
  const doi = normalizeDoi(message.DOI);
  if (!doi) return null;

  // 1. Explicit Crossref retraction relation on the original article.
  const retractedBy = message.relation?.["is-retracted-by"];
  if (retractedBy && retractedBy.length > 0) {
    return {
      doi,
      type: "retraction",
      noticeDoi: normalizeDoi(retractedBy[0]?.id),
      label: TYPE_LABELS.retraction,
    };
  }

  // 2. Title-prefix convention ("RETRACTED: …", "WITHDRAWN: …").
  const title = message.title?.[0] ?? "";
  for (const { re, type } of TITLE_PREFIX_TYPES) {
    if (re.test(title)) {
      return { doi, type, label: TYPE_LABELS[type] };
    }
  }

  // 3. The record itself is (or carries) a flaggable update notice.
  for (const update of message["update-to"] ?? []) {
    const type = update.type ? FLAGGABLE_UPDATE_TYPES[update.type] : undefined;
    if (type) {
      return {
        doi,
        type,
        noticeDoi: normalizeDoi(update.DOI),
        label: update.label || TYPE_LABELS[type],
      };
    }
  }

  return null;
}

/** Build the Crossref work URL for a (bare) DOI. */
function crossrefUrl(doi: string): string {
  const url = new URL(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`);
  if (CROSSREF_MAILTO) url.searchParams.set("mailto", CROSSREF_MAILTO);
  return url.toString();
}

// In-process cache: retraction status is stable, so a successful lookup is
// memoized (both "flagged" and "clean") to avoid re-hitting Crossref for the
// same DOI across searches within a server instance's lifetime. Errors are NOT
// cached, so a transient outage doesn't poison a DOI as "clean".
const RETRACTION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map<string, { value: RetractionFlag | null; expires: number }>();

/** Clear the in-process retraction cache (test/maintenance hook). */
export function clearRetractionCache(): void {
  cache.clear();
}

/**
 * Check a single DOI. Returns a flag, or null when clean OR on any error.
 * Successful results are cached for RETRACTION_TTL_MS; errors are not cached.
 */
async function checkOne(doi: string): Promise<RetractionFlag | null> {
  const hit = cache.get(doi);
  if (hit && hit.expires > Date.now()) return hit.value;

  try {
    const res = await fetch(crossrefUrl(doi), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null; // 404/transient → not flagged, but don't cache an error
    const data = (await res.json()) as CrossrefResponse;
    const flag = parseCrossrefRetraction(data.message);
    cache.set(doi, { value: flag, expires: Date.now() + RETRACTION_TTL_MS });
    return flag;
  } catch {
    // Network failure must never block search — degrade to "not flagged".
    return null;
  }
}

export interface CheckRetractionsOptions {
  /** Max DOIs to check (bounds Crossref load). Default 200. */
  limit?: number;
  /** Concurrent Crossref requests. Default 5. */
  concurrency?: number;
}

/**
 * Check a set of studies for retraction/withdrawal. Only DOI-bearing records are
 * checked (Crossref is DOI-keyed). Returns one flag per flagged study.
 *
 * Always resolves — never rejects — so a retraction-source outage can't block
 * the surrounding search (matches the graceful-degradation pattern of the other
 * source modules).
 */
export async function checkRetractions(
  ids: StudyId[],
  options: CheckRetractionsOptions = {},
): Promise<RetractionFlag[]> {
  const { limit = 200, concurrency = 5 } = options;

  // Unique, normalized DOIs only.
  const seen = new Set<string>();
  const dois: string[] = [];
  for (const id of ids) {
    const doi = normalizeDoi(id.doi);
    if (doi && !seen.has(doi)) {
      seen.add(doi);
      dois.push(doi);
      if (dois.length >= limit) break;
    }
  }
  if (dois.length === 0) return [];

  const flags: RetractionFlag[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < dois.length) {
      const doi = dois[cursor++];
      const flag = await checkOne(doi);
      if (flag) flags.push(flag);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, dois.length) }, () => worker());
  try {
    await Promise.all(workers);
  } catch {
    // Defensive: even an unexpected throw yields whatever was collected so far.
    console.warn("[retractions] unexpected error during batch check — returning partial results");
  }
  return flags;
}

/** Build a DOI→flag lookup for joining flags back onto result records. */
export function retractionMap(flags: RetractionFlag[]): Map<string, RetractionFlag> {
  return new Map(flags.map((f) => [f.doi, f]));
}
