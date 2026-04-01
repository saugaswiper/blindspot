import { createClient } from "@/lib/supabase/server";
import * as PubMed from "@/lib/pubmed";
import * as OpenAlex from "@/lib/openalex";
import * as EuropePMC from "@/lib/europepmc";
import * as ClinicalTrials from "@/lib/clinicaltrials";
import * as SemanticScholar from "@/lib/semanticscholar";
import { searchProspero, isQuerySubstantialEnough } from "@/lib/prospero";
import { getCachedResult, saveSearchResult } from "@/lib/cache";
import { validateSearchInput } from "@/lib/validators";
import { toApiError } from "@/lib/errors";
import { expandConcept } from "@/lib/synonyms";
import type { ExistingReview } from "@/types";

type SearchBody = { queryText?: string; pico?: { population: string; intervention: string; comparison?: string; outcome: string } };

/**
 * Builds the user-facing query string used as the cache key and stored label.
 * Kept simple: PICO components are joined with spaces.
 */
function buildQueryString(body: SearchBody): string {
  if (body.queryText) return body.queryText;
  if (body.pico) {
    const { population, intervention, comparison, outcome } = body.pico;
    return [population, intervention, comparison, outcome].filter(Boolean).join(" ");
  }
  return "";
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
 * Only applied when there are 2+ concepts (single-concept searches are
 * already specific enough to rely on the API's own relevance ranking).
 */
function filterByRelevance(reviews: ExistingReview[], reviewQuery: string): ExistingReview[] {
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

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json(
        { error: "Please sign in to search." },
        { status: 401 }
      );
    }

    // Validate input
    const body = (await request.json()) as unknown;
    const validation = validateSearchInput(body);
    if (!validation.success) {
      return Response.json({ error: "Invalid input", details: validation.errors }, { status: 400 });
    }

    const query = buildQueryString(body as SearchBody);
    // Targeted boolean query used for review searches — narrows results to the
    // exact combination of concepts rather than any individual keyword match.
    const reviewQuery = buildReviewQuery(body as SearchBody);

    // Check cache first
    const cached = await getCachedResult(user.id, query);
    if (cached) {
      return Response.json({ resultId: cached.id, cached: true });
    }

    // Run all sources in parallel — fall back gracefully if any fail
    let pubmedReviews: ExistingReview[] = [];
    let openalexReviews: ExistingReview[] = [];
    let europepmcReviews: ExistingReview[] = [];
    let semanticScholarReviews: ExistingReview[] = [];
    let primaryStudyCount = 0;
    let pubmedFailed = false;
    let openalexFailed = false;
    let europepmcFailed = false;

    const [
      pubmedResult,
      openalexResult,
      europepmcResult,
      semanticScholarResult,
      pubmedCount,
      openalexCount,
      europepmcCount,
      clinicalTrialsCount,
      prosperoCount,
    ] = await Promise.allSettled([
      // Review searches use the targeted boolean query for higher precision
      PubMed.searchExistingReviews(reviewQuery),
      OpenAlex.searchExistingReviews(reviewQuery),
      EuropePMC.searchExistingReviews(reviewQuery),
      SemanticScholar.searchExistingReviews(reviewQuery),
      // Primary study counts stay broad (original query) for accurate feasibility scoring
      PubMed.countPrimaryStudies(query),
      OpenAlex.countPrimaryStudies(query),
      EuropePMC.countPrimaryStudies(query),
      ClinicalTrials.countPrimaryStudies(query),
      isQuerySubstantialEnough(query) ? searchProspero(reviewQuery) : Promise.resolve(0),
    ]);

    if (pubmedResult.status === "fulfilled") {
      pubmedReviews = pubmedResult.value;
    } else {
      pubmedFailed = true;
      console.error("PubMed failed:", pubmedResult.reason);
    }

    if (openalexResult.status === "fulfilled") {
      openalexReviews = openalexResult.value;
    } else {
      openalexFailed = true;
      console.error("OpenAlex failed:", openalexResult.reason);
    }

    if (europepmcResult.status === "fulfilled") {
      europepmcReviews = europepmcResult.value;
    } else {
      europepmcFailed = true;
      console.error("Europe PMC failed:", europepmcResult.reason);
    }

    // Semantic Scholar is optional — never fail the request if it's down
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

    // Smarter primary study count estimation:
    // PubMed and Europe PMC are precise clinical databases; OpenAlex is broader but
    // can significantly over-count for general topics. If OpenAlex count exceeds the
    // max of the two clinical sources by more than 5×, blend rather than taking the
    // raw maximum to avoid inflating feasibility scores.
    const pubmedCountVal = pubmedCount.status === "fulfilled" ? pubmedCount.value : null;
    const openalexCountVal = openalexCount.status === "fulfilled" ? openalexCount.value : null;
    const europepmcCountVal = europepmcCount.status === "fulfilled" ? europepmcCount.value : null;
    const clinicalTrialsCountVal =
      clinicalTrialsCount.status === "fulfilled" ? clinicalTrialsCount.value : null;
    const prosperoCountVal =
      prosperoCount.status === "fulfilled" ? prosperoCount.value : null;

    const clinicalCounts = [pubmedCountVal, europepmcCountVal].filter(
      (c): c is number => c !== null
    );
    const allCounts = [pubmedCountVal, openalexCountVal, europepmcCountVal].filter(
      (c): c is number => c !== null
    );

    if (allCounts.length === 0) {
      primaryStudyCount = clinicalTrialsCountVal ?? 0;
    } else {
      const maxClinical = clinicalCounts.length > 0 ? Math.max(...clinicalCounts) : 0;
      const maxAll = Math.max(...allCounts);

      // If OpenAlex is the sole outlier (>5× clinical sources), use a weighted blend
      if (
        openalexCountVal !== null &&
        clinicalCounts.length > 0 &&
        openalexCountVal > maxClinical * 5
      ) {
        const clinicalAvg =
          clinicalCounts.reduce((a, b) => a + b, 0) / clinicalCounts.length;
        primaryStudyCount = Math.round(clinicalAvg * 0.6 + openalexCountVal * 0.4);
      } else {
        primaryStudyCount = Math.max(maxAll, clinicalTrialsCountVal ?? 0);
      }
    }

    const {
      reviews: dedupedReviews,
      deduplicationCount,
    } = dedupeReviews(
      pubmedReviews,
      openalexReviews,
      europepmcReviews,
      semanticScholarReviews
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

    // Save and cache
    const resultId = await saveSearchResult(user.id, query, {
      existing_reviews: existingReviews,
      primary_study_count: primaryStudyCount,
      clinical_trials_count: clinicalTrialsCountVal,
      prospero_registrations_count: prosperoCountVal,
      deduplication_count: deduplicationCount,
    });

    return Response.json({
      resultId,
      cached: false,
      ...(warning && { warning }),
    });
  } catch (error) {
    const apiError = toApiError(error);
    console.error("[/api/search] Unhandled error:", apiError.message, error instanceof Error ? error.stack : error);
    return Response.json(
      { error: apiError.userMessage },
      { status: apiError.statusCode }
    );
  }
}
