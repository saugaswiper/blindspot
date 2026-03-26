import { createClient } from "@/lib/supabase/server";
import * as PubMed from "@/lib/pubmed";
import * as OpenAlex from "@/lib/openalex";
import * as EuropePMC from "@/lib/europepmc";
import * as ClinicalTrials from "@/lib/clinicaltrials";
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

function dedupeReviews(...sources: ExistingReview[][]): ExistingReview[] {
  const seenTitles = new Set<string>();
  const seenDois = new Set<string>();
  const seenPmids = new Set<string>();
  const result: ExistingReview[] = [];

  for (const source of sources) {
    for (const review of source) {
      const titleKey = review.title.toLowerCase().trim();
      const doiKey = review.doi?.toLowerCase().trim();
      const pmidKey = review.pmid?.trim();

      // Skip if we've seen this review by any identifier
      if (seenTitles.has(titleKey)) continue;
      if (doiKey && seenDois.has(doiKey)) continue;
      if (pmidKey && seenPmids.has(pmidKey)) continue;

      seenTitles.add(titleKey);
      if (doiKey) seenDois.add(doiKey);
      if (pmidKey) seenPmids.add(pmidKey);
      result.push(review);
    }
  }
  return result.slice(0, 50);
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
    let primaryStudyCount = 0;
    let pubmedFailed = false;
    let openalexFailed = false;
    let europepmcFailed = false;

    const [
      pubmedResult,
      openalexResult,
      europepmcResult,
      pubmedCount,
      openalexCount,
      europepmcCount,
      clinicalTrialsCount,
    ] = await Promise.allSettled([
      PubMed.searchExistingReviews(query),
      OpenAlex.searchExistingReviews(query),
      EuropePMC.searchExistingReviews(query),
      PubMed.countPrimaryStudies(query),
      OpenAlex.countPrimaryStudies(query),
      EuropePMC.countPrimaryStudies(query),
      ClinicalTrials.countPrimaryStudies(query),
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

    if (pubmedFailed && openalexFailed && europepmcFailed) {
      return Response.json(
        { error: "Academic databases are temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }

    // Use the highest count across all sources as the primary study estimate
    const counts = [pubmedCount, openalexCount, europepmcCount, clinicalTrialsCount].map(
      (r) => (r.status === "fulfilled" ? r.value : 0)
    );
    primaryStudyCount = Math.max(...counts);

    const existingReviews = dedupeReviews(pubmedReviews, openalexReviews, europepmcReviews);

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
