import { ApiError } from "@/lib/errors";

const BASE = "https://clinicaltrials.gov/api/v2/studies";

interface ClinicalTrialsResponse {
  totalCount: number;
}

export async function countPrimaryStudies(query: string): Promise<number> {
  const url = new URL(BASE);
  url.searchParams.set("query.term", query);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("countTotal", "true");

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new ApiError(`ClinicalTrials.gov search failed: ${res.status}`, 502);

  const data = (await res.json()) as ClinicalTrialsResponse;
  return data.totalCount ?? 0;
}
