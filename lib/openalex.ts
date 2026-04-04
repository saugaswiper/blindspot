import { ApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

const EMAIL = process.env.OPENALEX_EMAIL ?? "";
const BASE = "https://api.openalex.org";

interface OpenAlexWork {
  title: string | null;
  publication_year: number | null;
  primary_location?: {
    source?: {
      display_name?: string;
    };
  };
  abstract_inverted_index?: Record<string, number[]> | null;
  doi?: string | null;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
  meta: { count: number };
}

// OpenAlex stores abstracts as inverted index — reconstruct plain text
function invertedIndexToAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ");
}

async function searchOpenAlex(query: string, filterType: "review" | "all" | "primary", perPage = 25): Promise<OpenAlexResponse> {
  const url = new URL(`${BASE}/works`);
  url.searchParams.set("search", query);
  if (filterType === "review") url.searchParams.set("filter", "type:review");
  // "primary" targets original research articles only — excludes OpenAlex's
  // review-type works (systematic reviews, narrative reviews) so the count
  // reflects actual primary research the field can support.
  if (filterType === "primary") url.searchParams.set("filter", "type:article");
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("select", "title,publication_year,primary_location,abstract_inverted_index,doi");
  if (EMAIL) url.searchParams.set("mailto", EMAIL);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`OpenAlex search failed: ${res.status}`, 502);

  return (await res.json()) as OpenAlexResponse;
}

export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  const data = await searchOpenAlex(query, "review", 25);

  return data.results
    .filter((w) => w.title)
    .map((w) => {
      const abstract = invertedIndexToAbstract(w.abstract_inverted_index);
      return {
        title: w.title!,
        year: w.publication_year ?? 0,
        journal: w.primary_location?.source?.display_name ?? "Unknown journal",
        abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
        doi: w.doi ?? undefined,
        source: "OpenAlex",
      };
    });
}

export async function countPrimaryStudies(query: string): Promise<number> {
  // Use "primary" filter (type:article) to count original research papers only.
  // Previously used "all" which included systematic reviews, editorials, and
  // letters — inflating counts for broad topics significantly.
  const data = await searchOpenAlex(query, "primary", 1);
  return data.meta.count;
}
