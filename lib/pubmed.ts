import { ApiError } from "@/lib/errors";
import type { ExistingReview } from "@/types";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY ?? "";

interface ESearchResult {
  esearchresult: {
    count: string;
    idlist: string[];
  };
}

// Very small XML parser for PubMed EFetch responses
function parseArticles(xml: string): ExistingReview[] {
  const articles: ExistingReview[] = [];
  const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];

  for (const block of articleBlocks) {
    const title = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]
      ?.replace(/<[^>]+>/g, "")
      .trim() ?? "Untitled";

    const year =
      block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1] ??
      block.match(/<Year>(\d{4})<\/Year>/)?.[1] ??
      "Unknown";

    const journal =
      block.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/)?.[1]?.trim() ??
      block.match(/<Title>([\s\S]*?)<\/Title>/)?.[1]?.trim() ??
      "Unknown journal";

    const abstract =
      block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim() ?? "";

    const pmid = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];

    articles.push({
      title,
      year: parseInt(year) || 0,
      journal,
      abstract_snippet: abstract.slice(0, 300) + (abstract.length > 300 ? "…" : ""),
      pmid,
      source: "PubMed",
    });
  }

  return articles;
}

async function esearch(term: string, retmax = 50): Promise<{ count: number; ids: string[] }> {
  const url = new URL(`${BASE}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("term", term);
  url.searchParams.set("retmax", String(retmax));
  url.searchParams.set("retmode", "json");
  if (API_KEY) url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`PubMed ESearch failed: ${res.status}`, 502);

  const data = (await res.json()) as ESearchResult;
  return {
    count: parseInt(data.esearchresult.count) || 0,
    ids: data.esearchresult.idlist,
  };
}

async function efetch(ids: string[]): Promise<ExistingReview[]> {
  if (ids.length === 0) return [];

  const url = new URL(`${BASE}/efetch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("rettype", "xml");
  url.searchParams.set("retmode", "xml");
  if (API_KEY) url.searchParams.set("api_key", API_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`PubMed EFetch failed: ${res.status}`, 502);

  return parseArticles(await res.text());
}

export async function searchExistingReviews(query: string): Promise<ExistingReview[]> {
  const { ids } = await esearch(`${query} AND systematic[sb]`, 50);
  return efetch(ids);
}

export async function countPrimaryStudies(query: string): Promise<number> {
  // Exclude systematic reviews from the primary study count.
  // We want to assess how much raw primary evidence exists — not whether
  // there are existing reviews of that evidence.
  // PubMed's systematic[sb] filter matches all systematic reviews, Cochrane
  // reviews, and related secondary study types.
  const { count } = await esearch(`(${query}) AND NOT systematic[sb]`, 1);
  return count;
}

export async function countSystematicReviews(query: string): Promise<number> {
  const { count } = await esearch(`${query} AND systematic[sb]`, 1);
  return count;
}
