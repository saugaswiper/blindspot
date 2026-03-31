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
import type { ExistingReview } from "@/types";

function buildQueryString(body: { queryText?: string; pico?: { population: string; intervention: string; comparison?: string; outcome: string } }): string {
  if (body.queryText) return body.queryText;
  if (body.pico) {
    const { population, intervention, comparison, outcome } = body.pico;
    return [population, intervention, comparison, outcome].filter(Boolean).join(" ");
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

interface DedupeResult {
  /** Deduplicated reviews, capped at 50 for display. */
  reviews: ExistingReview[];
  /** Sum of all records across every source before deduplication. */
  totalIdentified: number;
  /**
   * Number of duplicate records removed (totalIdentified - unique count,
   * computed before the 50-record display cap is applied so that true
   * cross-database duplicates are counted accurately).
   */
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
    reviews: unique.slice(0, 50),
    totalIdentified,
    // Measure true duplicates before the display cap so the PRISMA count is accurate
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

    const query = buildQueryString(
      body as { queryText?: string; pico?: { population: string; intervention: string; comparison?: string; outcome: string } }
    );

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
      PubMed.searchExistingReviews(query),
      OpenAlex.searchExistingReviews(query),
      EuropePMC.searchExistingReviews(query),
      SemanticScholar.searchExistingReviews(query),
      PubMed.countPrimaryStudies(query),
      OpenAlex.countPrimaryStudies(query),
      EuropePMC.countPrimaryStudies(query),
      ClinicalTrials.countPrimaryStudies(query),
      isQuerySubstantialEnough(query) ? searchProspero(query) : Promise.resolve(0),
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
      reviews: existingReviews,
      deduplicationCount,
    } = dedupeReviews(
      pubmedReviews,
      openalexReviews,
      europepmcReviews,
      semanticScholarReviews
    );

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
    console.error("Search error:", apiError.message);
    return Response.json(
      { error: apiError.userMessage },
      { status: apiError.statusCode }
    );
  }
}
