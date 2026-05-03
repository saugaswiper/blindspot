import { cookies } from "next/headers";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import * as PubMed from "@/lib/pubmed";
import * as OpenAlex from "@/lib/openalex";
import * as EuropePMC from "@/lib/europepmc";
import * as Scopus from "@/lib/scopus";
import * as ClinicalTrials from "@/lib/clinicaltrials";
import * as SemanticScholar from "@/lib/semanticscholar";
import { searchProspero, isQuerySubstantialEnough } from "@/lib/prospero";
import { searchOSFRegistrations } from "@/lib/osf-registry";
import { getCachedResult, saveSearchResult, saveGuestSearchResult } from "@/lib/cache";
import { validateSearchInput } from "@/lib/validators";
import { insertSearchTelemetry } from "@/lib/search-telemetry";
import { toApiError } from "@/lib/errors";
import { expandConcept } from "@/lib/synonyms";
import { isUserBooleanQuery } from "@/lib/boolean-search";
import type { ExistingReview } from "@/types";

/**
 * Returns a short, one-way hash of the client IP address.
 * The BLINDSPOT_IP_SALT env variable prevents rainbow-table reversal.
 * We truncate to 32 hex chars — sufficient for collision resistance at
 * the scale of guests per day while keeping the stored value compact.
 */
function hashIp(ip: string): string {
  const salt = process.env.BLINDSPOT_IP_SALT ?? "blindspot-default-salt";
  return createHash("sha256").update(ip + salt).digest("hex").slice(0, 32);
}

/** Extract the best-effort client IP from Next.js request headers. */
function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

const GUEST_COOKIE = "blindspot_guest_search";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — matches search result TTL

type SearchBody = {
  queryText?: string;
  pico?: { population: string; intervention: string; comparison?: string; outcome: string };
  /** ACC-8: optional minimum publication year for primary-study count filtering */
  minYear?: number;
};

/**
 * Builds the user-facing query string used as the cache key and stored label.
 * Kept simple: PICO components are joined with spaces.
 *
 * ACC-8: When minYear is present, appends " (after YYYY)" to the query so that:
 *   1. The Supabase cache key is unique per year filter (avoids stale hits)
 *   2. The stored query_text shown on the results page reflects the filter
 */
function buildQueryString(body: SearchBody): string {
  let base = "";
  if (body.queryText) {
    base = body.queryText;
  } else if (body.pico) {
    const { population, intervention, comparison, outcome } = body.pico;
    base = [population, intervention, comparison, outcome].filter(Boolean).join(" ");
  }
  return body.minYear ? `${base} (after ${body.minYear})` : base;
}

/**
 * Builds a targeted boolean query for review searches.
 *
 * PICO mode: each component becomes a required AND clause, with multi-word
 * phrases quoted — e.g. `"elderly patients" AND "cognitive behavioral therapy" AND "sleep quality"`.
 *
 * Simple mode: splits on common connector words (for / in / with / and / of /
 * on / about / among / between) to extract distinct concept phrases, then ANDs
 * them — e.g. "CBT for insomnia in elderly patients" →
 * `"CBT" AND "insomnia" AND "elderly patients"`.
 * Falls back to the raw text when the input is a single concept or short phrase.
 */
function buildReviewQuery(body: SearchBody): string {
  if (body.pico) {
    const { population, intervention, comparison, outcome } = body.pico;
    const parts = [population, intervention, comparison, outcome]
      .filter((p): p is string => Boolean(p))
      .map((p) => (p.trim().includes(" ") ? `"${p.trim()}"` : p.trim()));
    return parts.join(" AND ");
  }
  if (body.queryText) {
    const raw = body.queryText.trim();

    // User has entered explicit Boolean operators or PubMed field tags:
    // pass through verbatim so their syntax reaches the APIs unchanged.
    if (isUserBooleanQuery(raw)) return raw;

    // Otherwise, auto-split on natural-language connector words and build
    // a simple AND query for better multi-concept precision.
    const concepts = raw
      .split(/\s+(?:for|in|with|and|of|on|about|among|between)\s+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (concepts.length <= 1) return raw;
    return concepts.map((c) => (c.includes(" ") ? `"${c}"` : c)).join(" AND ");
  }
  return "";
}

/**
 * Normalize a DOI to a bare identifier (strip URL prefix if present).
 * OpenAlex returns DOIs as "https://doi.org/10.xxx/..." while Europe PMC
 * and Semantic Scholar return bare DOIs ("10.xxx/..."). Normalising before
 * comparison prevents the same paper from appearing twice in results.
 */
function normalizeDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  return doi
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}

/**
 * Extracts the AND-separated concept phrases from a boolean review query.
 * e.g. `"psilocybin" AND "adolescents"` → ["psilocybin", "adolescents"]
 */
function extractQueryConcepts(reviewQuery: string): string[] {
  return reviewQuery
    .split(/\s+AND\s+/i)
    .map((s) => s.trim().replace(/^"|"$/g, "").toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Returns true if `text` contains `term` as a whole word (case-insensitive).
 * Uses \b word boundaries to avoid matching "aged" inside "managed", etc.
 * Special regex characters in `term` are escaped before use.
 */
function textContainsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Filters reviews to only those that mention ALL query concepts in their
 * title or abstract snippet. Each concept is expanded to its synonym group
 * so a review using "youth" satisfies a search for "adolescents", etc.
 *
 * Only applied when there are 2+ AND-joined concepts (single-concept searches
 * are already specific enough to rely on the API's own relevance ranking).
 *
 * When the query contains OR or NOT operators the API's own relevance ranking
 * is authoritative — we skip the client-side filter to avoid discarding valid
 * results that the user explicitly requested through those operators.
 */
function filterByRelevance(reviews: ExistingReview[], reviewQuery: string): ExistingReview[] {
  // OR / NOT queries: trust the API. Post-filtering against a single AND-model
  // would incorrectly discard reviews that match only one branch of an OR clause.
  if (/\b(OR|NOT)\b/.test(reviewQuery)) return reviews;

  const concepts = extractQueryConcepts(reviewQuery);
  if (concepts.length <= 1) return reviews;
  return reviews.filter((review) => {
    const text = `${review.title} ${review.abstract_snippet}`;
    return concepts.every((concept) => {
      const synonyms = expandConcept(concept);
      return synonyms.some((syn) => textContainsTerm(text, syn));
    });
  });
}

interface DedupeResult {
  /** All deduplicated reviews (uncapped — caller applies the display cap after relevance filtering). */
  reviews: ExistingReview[];
  /** Sum of all records across every source before deduplication. */
  totalIdentified: number;
  /** Number of duplicate records removed (totalIdentified - unique count). */
  deduplicationCount: number;
}

function dedupeReviews(...sources: ExistingReview[][]): DedupeResult {
  const totalIdentified = sources.reduce((sum, src) => sum + src.length, 0);

  const seenTitles = new Set<string>();
  const seenDois = new Set<string>();
  const seenPmids = new Set<string>();
  const unique: ExistingReview[] = [];

  for (const source of sources) {
    for (const review of source) {
      const titleKey = review.title.toLowerCase().trim();
      const doiKey = normalizeDoi(review.doi);
      const pmidKey = review.pmid?.trim();

      // Skip if we've seen this review by any identifier
      if (seenTitles.has(titleKey)) continue;
      if (doiKey && seenDois.has(doiKey)) continue;
      if (pmidKey && seenPmids.has(pmidKey)) continue;

      seenTitles.add(titleKey);
      if (doiKey) seenDois.add(doiKey);
      if (pmidKey) seenPmids.add(pmidKey);
      unique.push(review);
    }
  }

  return {
    reviews: unique,
    totalIdentified,
    deduplicationCount: totalIdentified - unique.length,
  };
}

/**
 * Deduplicate primary study IDs fetched from multiple databases.
 *
 * Each entry carries an optional PMID and/or DOI. A record is considered a
 * duplicate if its PMID or DOI was already seen in a previous source's sample.
 * EuropePMC is a particularly useful "bridge" source because its records carry
 * both PMIDs (matches PubMed) and DOIs (matches OpenAlex and Scopus).
 *
 * Returns the fraction of unique records in the combined sample. This fraction
 * is then applied to the sum of all source counts to estimate the true unique
 * primary study count — replacing the fixed 0.75 dedupFactor approximation.
 *
 * @param sources  Arrays of IDs from each source, in order they should be merged
 * @returns  dedupFraction in (0, 1]: 1 means no overlap detected in sample
 */
function computeDedupFraction(
  sources: Array<Array<{ pmid?: string; doi?: string }>>,
): number {
  const seenPmids = new Set<string>();
  const seenDois = new Set<string>();
  let uniqueCount = 0;
  let totalCount = 0;

  for (const source of sources) {
    for (const id of source) {
      totalCount++;
      const pmid = id.pmid?.trim();
      const doi = id.doi
        ? id.doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim()
        : undefined;

      if (pmid && seenPmids.has(pmid)) continue;
      if (doi && seenDois.has(doi)) continue;

      // New record — mark as seen
      uniqueCount++;
      if (pmid) seenPmids.add(pmid);
      if (doi) seenDois.add(doi);
    }
  }

  if (totalCount === 0) return 0.75; // no sample — fall back to legacy estimate
  // Clamp between 0.30 and 0.95 to guard against extreme sampling artefacts
  // (highly-ranked records tend to be indexed in more sources than average,
  //  so the true uniqueness fraction is slightly higher than the sample suggests)
  return Math.min(0.95, Math.max(0.30, uniqueCount / totalCount));
}

export async function POST(request: Request) {
  try {
    // Resolve auth and guest cookie in parallel
    const supabase = await createClient();
    const [{ data: { user } }, cookieStore] = await Promise.all([
      supabase.auth.getUser(),
      cookies(),
    ]);

    const isGuest = !user;

    if (isGuest) {
      // Layer 1: cookie-based gate (first line of defence — fast, no DB call).
      if (cookieStore.has(GUEST_COOKIE)) {
        return Response.json(
          { error: "Create a free account to run more searches and save your results.", guestLimitReached: true },
          { status: 401 }
        );
      }

      // Layer 2: server-side IP-hash rate limit (resistant to cookie clearing / incognito).
      // Limits each IP to 3 guest searches per 24-hour window stored in Supabase.
      // Uses the service-role client because guest rows have user_id = NULL which
      // the normal RLS policy would block from reading.
      try {
        const ipHash = hashIp(getClientIp(request));
        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const svc = createServiceRoleClient();
        const { count: recentGuestCount } = await svc
          .from("searches")
          .select("*", { count: "exact", head: true })
          .is("user_id", null)
          .eq("guest_ip_hash", ipHash)
          .gte("created_at", windowStart);

        if ((recentGuestCount ?? 0) >= 3) {
          return Response.json(
            { error: "Too many searches from this network. Create a free account to continue.", guestLimitReached: true },
            { status: 429 }
          );
        }
      } catch (err) {
        // IP rate-limit check is best-effort; don't block the search if it fails.
        console.warn("[search] IP rate-limit check failed:", err);
      }
    }

    // Validate input
    const body = (await request.json()) as unknown;
    const validation = validateSearchInput(body);
    if (!validation.success) {
      return Response.json({ error: "Invalid input", details: validation.errors }, { status: 400 });
    }

    const typedBody = body as SearchBody;
    const query = buildQueryString(typedBody);
    // ACC-8: Extract the base query (without the year suffix) for count functions
    // that accept minYear directly — avoids double-filtering.
    const baseQuery = typedBody.queryText
      ? typedBody.queryText
      : typedBody.pico
      ? [typedBody.pico.population, typedBody.pico.intervention, typedBody.pico.comparison, typedBody.pico.outcome].filter(Boolean).join(" ")
      : query;
    const minYear: number | undefined = typedBody.minYear;
    // Targeted boolean query used for review searches — narrows results to the
    // exact combination of concepts rather than any individual keyword match.
    const reviewQuery = buildReviewQuery(typedBody);

    // Check cache for authenticated users only (guests always run fresh)
    if (!isGuest) {
      const cached = await getCachedResult(user!.id, query);
      if (cached) {
        return Response.json({ resultId: cached.id, cached: true });
      }
    }

    // Run all sources in parallel — fall back gracefully if any fail.
    // We run 4 categories in one allSettled batch to minimise latency:
    //   1. Review searches (for the existing-reviews list)
    //   2. Primary study COUNTS (for feasibility scoring)
    //   3. Primary study ID samples (for cross-source deduplication)
    //   4. Registry checks (PROSPERO, ClinicalTrials.gov, OSF)
    let pubmedReviews: ExistingReview[] = [];
    let openalexReviews: ExistingReview[] = [];
    let europepmcReviews: ExistingReview[] = [];
    let scopusReviews: ExistingReview[] = [];
    let semanticScholarReviews: ExistingReview[] = [];
    let primaryStudyCount = 0;
    let pubmedFailed = false;
    let openalexFailed = false;
    let europepmcFailed = false;

    const [
      pubmedResult,
      openalexResult,
      europepmcResult,
      scopusResult,
      semanticScholarResult,
      pubmedCount,
      openalexCount,
      europepmcCount,
      scopusCount,
      clinicalTrialsCount,
      prosperoCount,
      pubmedRecentCount,
      osfCount,
      // ID samples for true deduplication (200 IDs per source, runs in parallel)
      pubmedIds,
      openalexIds,
      europepmcIds,
      scopusIds,
    ] = await Promise.allSettled([
      // ── Review searches ──────────────────────────────────────────────────────
      PubMed.searchExistingReviews(reviewQuery),
      OpenAlex.searchExistingReviews(reviewQuery),
      EuropePMC.searchExistingReviews(reviewQuery),
      Scopus.searchExistingReviews(reviewQuery),
      SemanticScholar.searchExistingReviews(reviewQuery),
      // ── Primary study counts ─────────────────────────────────────────────────
      // We use reviewQuery (concept-AND boolean) rather than raw baseQuery so
      // that counts reflect the strict multi-concept intersection. This prevents
      // individual concept keywords inflating the count on narrow clinical topics
      // (e.g. "psilocybin AND adolescents AND MDD" vs "psilocybin in adolescents
      // with MDD" which databases may interpret as a loose OR-style text match).
      // ACC-8: minYear restricts counts to studies published on/after that year.
      PubMed.countPrimaryStudies(reviewQuery, minYear),
      OpenAlex.countPrimaryStudies(reviewQuery, minYear),
      EuropePMC.countPrimaryStudies(reviewQuery, minYear),
      Scopus.countPrimaryStudies(reviewQuery, minYear),
      ClinicalTrials.countPrimaryStudies(baseQuery),
      isQuerySubstantialEnough(baseQuery) ? searchProspero(reviewQuery) : Promise.resolve(0),
      // NEW-2: Count primary studies published in the last 3 years (PubMed only).
      PubMed.countPrimaryStudiesRecent(reviewQuery, 3),
      // ACC-6: OSF Registries — third-largest SR registry
      isQuerySubstantialEnough(baseQuery) ? searchOSFRegistrations(reviewQuery) : Promise.resolve(0),
      // ── ID samples for cross-source deduplication ────────────────────────────
      // 200 records per source is sufficient to estimate database overlap with
      // ~±5% precision. These run concurrently with the count calls above so
      // they add no wall-clock latency.
      PubMed.fetchPrimaryStudyIds(reviewQuery, minYear, 200),
      OpenAlex.fetchPrimaryStudyIds(reviewQuery, minYear, 200),
      EuropePMC.fetchPrimaryStudyIds(reviewQuery, minYear, 200),
      Scopus.fetchPrimaryStudyIds(reviewQuery, minYear, 200),
    ]);

    if (pubmedResult.status === "fulfilled") {
      pubmedReviews = pubmedResult.value;
    } else {
      pubmedFailed = true;
      console.error("PubMed reviews failed:", pubmedResult.reason);
    }

    if (openalexResult.status === "fulfilled") {
      openalexReviews = openalexResult.value;
    } else {
      openalexFailed = true;
      console.error("OpenAlex reviews failed:", openalexResult.reason);
    }

    if (europepmcResult.status === "fulfilled") {
      europepmcReviews = europepmcResult.value;
    } else {
      europepmcFailed = true;
      console.error("Europe PMC reviews failed:", europepmcResult.reason);
    }

    // Scopus and Semantic Scholar are supplementary — never fail the request
    if (scopusResult.status === "fulfilled") {
      scopusReviews = scopusResult.value;
    } else {
      console.error("Scopus reviews failed:", scopusResult.reason);
    }

    if (semanticScholarResult.status === "fulfilled") {
      semanticScholarReviews = semanticScholarResult.value;
    } else {
      console.error("Semantic Scholar failed:", semanticScholarResult.reason);
    }

    if (pubmedFailed && openalexFailed && europepmcFailed) {
      return Response.json(
        { error: "Academic databases are temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }

    // ── Extract individual counts — log failures so Vercel logs show the cause ──
    const pubmedCountVal = pubmedCount.status === "fulfilled" ? pubmedCount.value : null;
    const openalexCountVal = openalexCount.status === "fulfilled" ? openalexCount.value : null;
    const europepmcCountVal = europepmcCount.status === "fulfilled" ? europepmcCount.value : null;
    const scopusCountVal = scopusCount.status === "fulfilled" ? scopusCount.value : null;
    if (scopusCount.status === "rejected") {
      console.error("[search] Scopus count failed:", scopusCount.reason);
    }
    if (scopusIds.status === "rejected") {
      console.error("[search] Scopus ID fetch failed:", scopusIds.reason);
    }
    const clinicalTrialsCountVal =
      clinicalTrialsCount.status === "fulfilled" ? clinicalTrialsCount.value : null;
    const prosperoCountVal =
      prosperoCount.status === "fulfilled" ? prosperoCount.value : null;
    // NEW-2: Recent count is from PubMed only; null means unavailable (API failure)
    const recentPrimaryStudyCountVal =
      pubmedRecentCount.status === "fulfilled" ? pubmedRecentCount.value : null;
    // ACC-6: OSF Registries count — null means API was unavailable
    const osfCountVal =
      osfCount.status === "fulfilled" ? osfCount.value : null;

    // ── True deduplication via sampled IDs ────────────────────────────────────
    // Collect ID samples from each source that succeeded. EuropePMC is the key
    // "bridge" source — its records carry both PMIDs (matching PubMed) and DOIs
    // (matching OpenAlex / Scopus) — which maximises overlap detection.
    const idSamples = [
      pubmedIds.status === "fulfilled" ? pubmedIds.value : [],
      // EuropePMC first so its PMID+DOI pairs can link PubMed PMIDs to DOIs
      // before we process the DOI-only OpenAlex/Scopus entries.
      europepmcIds.status === "fulfilled" ? europepmcIds.value : [],
      openalexIds.status === "fulfilled" ? openalexIds.value : [],
      scopusIds.status === "fulfilled" ? scopusIds.value : [],
    ];

    const dedupFraction = computeDedupFraction(idSamples);

    // Sum all source counts; apply the empirical dedup fraction to estimate
    // the true number of unique primary studies across all databases.
    const availableCounts = [pubmedCountVal, openalexCountVal, europepmcCountVal, scopusCountVal]
      .filter((c): c is number => c !== null);

    if (availableCounts.length === 0) {
      primaryStudyCount = clinicalTrialsCountVal ?? 0;
    } else {
      const sumCounts = availableCounts.reduce((a, b) => a + b, 0);
      primaryStudyCount = Math.max(
        Math.round(sumCounts * dedupFraction),
        clinicalTrialsCountVal ?? 0,
      );
    }

    const {
      reviews: dedupedReviews,
      deduplicationCount,
    } = dedupeReviews(
      pubmedReviews,
      openalexReviews,
      europepmcReviews,
      scopusReviews,
      semanticScholarReviews,
    );

    // Keep only reviews that mention all key concepts in title or abstract.
    // Applied after dedup so PRISMA duplicate counts remain accurate.
    const existingReviews = filterByRelevance(dedupedReviews, reviewQuery).slice(0, 50);

    // Build warnings for failed sources
    const failedSources = [
      pubmedFailed && "PubMed",
      openalexFailed && "OpenAlex",
      europepmcFailed && "Europe PMC",
    ].filter(Boolean);
    const warning = failedSources.length > 0
      ? `${failedSources.join(", ")} ${failedSources.length === 1 ? "was" : "were"} temporarily unavailable.`
      : undefined;

    // Save result — guest results are public and stored with no user_id
    const searchData = {
      existing_reviews: existingReviews,
      primary_study_count: primaryStudyCount,
      clinical_trials_count: clinicalTrialsCountVal,
      prospero_registrations_count: prosperoCountVal,
      osf_registrations_count: osfCountVal,
      scopus_count: scopusCountVal,
      deduplication_count: deduplicationCount,
      recent_primary_study_count: recentPrimaryStudyCountVal,
      // UI-1: Per-source primary study counts — stored for breakdown display
      pubmed_count: pubmedCountVal,
      openalex_count: openalexCountVal,
      europepmc_count: europepmcCountVal,
    };

    // PICO-1: Pass structured PICO elements so they are stored in the searches row.
    // Used by PROSPERO export and protocol generator to pre-fill typed fields
    // (population, intervention, comparator, outcome) instead of generic query text.
    const picoFields = typedBody.pico
      ? {
          population: typedBody.pico.population ?? null,
          intervention: typedBody.pico.intervention ?? null,
          comparison: typedBody.pico.comparison ?? null,
          outcome: typedBody.pico.outcome ?? null,
        }
      : undefined;

    const resultId = isGuest
      ? await saveGuestSearchResult(query, searchData, hashIp(getClientIp(request)), picoFields)
      : await saveSearchResult(user!.id, query, searchData, picoFields);

    // Best-effort telemetry insert (migration 014).
    // Records after_dedup, tier, and PRISMA included estimate for retrospective
    // calibration of the screening funnel rates against published SRs.
    // Never awaited at top level — a telemetry failure must not affect the response.
    void insertSearchTelemetry(resultId, primaryStudyCount, isGuest);

    // Set guest cookie after a successful guest search so subsequent
    // unauthenticated requests are redirected to sign-up.
    // Wrapped in try-catch: in some Next.js 15/16 contexts (e.g. when the
    // Response is already being streamed) cookie mutation can throw — we log
    // and continue rather than failing the entire response.
    if (isGuest) {
      try {
        cookieStore.set(GUEST_COOKIE, "1", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: GUEST_COOKIE_MAX_AGE,
          path: "/",
        });
      } catch (cookieErr) {
        console.warn("[search] Failed to set guest cookie (non-fatal):", cookieErr);
      }
    }

    return Response.json({
      resultId,
      cached: false,
      isGuest,
      ...(warning && { warning }),
    });
  } catch (error) {
    const apiError = toApiError(error);
    // Log the full error for server-side diagnosis (Vercel Logs / local console)
    console.error(
      "[/api/search] Unhandled error:",
      error instanceof Error ? `${error.name}: ${error.message}` : error,
      error instanceof Error ? error.stack : "",
    );
    return Response.json(
      {
        error: apiError.userMessage,
        // Expose raw message in non-production environments for easier debugging
        ...(process.env.NODE_ENV !== "production" && {
          _debug: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }),
      },
      { status: apiError.statusCode }
    );
  }
}
