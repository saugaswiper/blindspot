/**
 * ACC-2: Data-Grounded Alternative Topic Suggestions
 *
 * When a topic returns Insufficient or Low feasibility, suggests genuinely viable
 * alternative topics that have been verified against real PubMed counts.
 *
 * Algorithm:
 *   1. Query the OpenAlex Topics API to find the closest matching academic topic
 *   2. Extract the topic's "subfield" (e.g. "Psychiatry and Mental health")
 *   3. Fetch sibling topics in the same subfield, sorted by works_count descending
 *   4. Run parallel PubMed countPrimaryStudies for the top candidates
 *   5. Keep only alternatives with ≥ 6 studies (Moderate feasibility threshold)
 *   6. Return top 4, sorted by study count
 *
 * All suggestions are backed by real API data — no AI speculation.
 */

import { countPrimaryStudies } from "@/lib/pubmed";
import { getFeasibilityScore } from "@/lib/feasibility";
import type { FeasibilityScore } from "@/types";

const OPENALEX_BASE = "https://api.openalex.org";
const EMAIL = process.env.OPENALEX_EMAIL ?? "";

/** Minimum PubMed count for an alternative to be worth suggesting (Moderate threshold) */
const MIN_STUDY_COUNT = 6;

/** Maximum number of sibling topics to verify via PubMed (keep latency under ~3s) */
const MAX_CANDIDATES = 6;

/** Maximum alternatives to return to the client */
const MAX_RESULTS = 4;

// ---------------------------------------------------------------------------
// OpenAlex Topics API types
// ---------------------------------------------------------------------------

interface OpenAlexTopicSubfield {
  id: string;           // e.g. "https://openalex.org/subfields/2738"
  display_name: string; // e.g. "Psychiatry and Mental health"
}

interface OpenAlexTopic {
  id: string;
  display_name: string;
  subfield: OpenAlexTopicSubfield | null;
  works_count: number;
}

interface OpenAlexTopicsResponse {
  results: OpenAlexTopic[];
  meta: { count: number };
}

// ---------------------------------------------------------------------------
// Public export types
// ---------------------------------------------------------------------------

export interface AlternativeTopic {
  /** Human-readable topic name from OpenAlex */
  displayName: string;
  /** Verified PubMed primary-study count (excludes systematic reviews) */
  pubmedCount: number;
  /** Feasibility score derived from pubmedCount using standard Blindspot thresholds */
  feasibility: FeasibilityScore;
  /** URL to initiate a new Blindspot search for this topic */
  searchUrl: string;
  /** OpenAlex total works_count (all publication types) — context signal */
  openalexWorksCount: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (testable without I/O)
// ---------------------------------------------------------------------------

/**
 * Extracts the numeric subfield ID from an OpenAlex subfield URL.
 *
 * e.g. "https://openalex.org/subfields/2738" → "2738"
 * Returns null if the URL doesn't match the expected pattern.
 */
export function extractSubfieldId(subfieldUrl: string): string | null {
  const match = subfieldUrl.match(/\/subfields\/(\d+)$/);
  return match ? match[1] : null;
}

/**
 * Filters candidate topics by minimum works_count and removes the original topic
 * (matched by its OpenAlex ID). Sorts descending by works_count.
 *
 * @param topics   - list of sibling topics from the OpenAlex Topics API
 * @param originalId - OpenAlex ID of the original (matched) topic to exclude
 * @param minWorksCount - exclude topics with fewer total works (noise filter)
 * @param maxResults - cap on how many candidates to return
 */
export function filterCandidates(
  topics: OpenAlexTopic[],
  originalId: string,
  minWorksCount = 50,
  maxResults = MAX_CANDIDATES
): OpenAlexTopic[] {
  return topics
    .filter((t) => t.id !== originalId && t.works_count >= minWorksCount)
    .sort((a, b) => b.works_count - a.works_count)
    .slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// OpenAlex API fetch helpers
// ---------------------------------------------------------------------------

function openAlexHeaders(): HeadersInit {
  return EMAIL ? { "User-Agent": `blindspot/1.0 (mailto:${EMAIL})` } : {};
}

/**
 * Searches the OpenAlex Topics API for topics matching `query`.
 * Returns the top `perPage` results.
 */
async function searchTopics(query: string, perPage = 3): Promise<OpenAlexTopic[]> {
  const url = new URL(`${OPENALEX_BASE}/topics`);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("select", "id,display_name,subfield,works_count");
  if (EMAIL) url.searchParams.set("mailto", EMAIL);

  const res = await fetch(url.toString(), {
    headers: openAlexHeaders(),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as OpenAlexTopicsResponse;
  return data.results ?? [];
}

/**
 * Fetches sibling topics in the same subfield, sorted by works_count descending.
 */
async function fetchSiblingTopics(subfieldId: string, perPage = 20): Promise<OpenAlexTopic[]> {
  const url = new URL(`${OPENALEX_BASE}/topics`);
  url.searchParams.set("filter", `subfield.id:${subfieldId}`);
  url.searchParams.set("sort", "works_count:desc");
  url.searchParams.set("per-page", String(perPage));
  url.searchParams.set("select", "id,display_name,subfield,works_count");
  if (EMAIL) url.searchParams.set("mailto", EMAIL);

  const res = await fetch(url.toString(), {
    headers: openAlexHeaders(),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as OpenAlexTopicsResponse;
  return data.results ?? [];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Returns up to 4 verified alternative topics when the original query returns
 * Insufficient or Low feasibility.
 *
 * Uses the OpenAlex Topics hierarchy to discover adjacent research areas in the
 * same academic subfield, then verifies each with a real PubMed primary-study
 * count. Only topics with ≥ 6 primary studies (Moderate threshold) are returned.
 *
 * @param query - the original user query (simple text or joined PICO)
 */
export async function findFeasibleAlternativeTopics(
  query: string
): Promise<AlternativeTopic[]> {
  // Step 1: Find the best-matching OpenAlex topic for the query
  const matchedTopics = await searchTopics(query, 3);
  if (matchedTopics.length === 0) return [];

  const topTopic = matchedTopics[0];
  if (!topTopic.subfield?.id) return [];

  const subfieldId = extractSubfieldId(topTopic.subfield.id);
  if (!subfieldId) return [];

  // Step 2: Fetch sibling topics in the same subfield
  const siblings = await fetchSiblingTopics(subfieldId, 20);

  // Step 3: Filter candidates — exclude original topic, require ≥ 50 works in OpenAlex
  const candidates = filterCandidates(siblings, topTopic.id, 50, MAX_CANDIDATES);

  if (candidates.length === 0) return [];

  // Step 4: Verify each candidate with PubMed primary-study count (parallel)
  const countResults = await Promise.allSettled(
    candidates.map((c) => countPrimaryStudies(c.display_name))
  );

  // Step 5: Build verified alternatives — keep only ≥ MIN_STUDY_COUNT
  const verified: AlternativeTopic[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const result = countResults[i];
    if (result.status !== "fulfilled") continue;

    const pubmedCount = result.value;
    if (pubmedCount < MIN_STUDY_COUNT) continue;

    const topic = candidates[i];
    verified.push({
      displayName: topic.display_name,
      pubmedCount,
      feasibility: getFeasibilityScore(pubmedCount),
      searchUrl: `/?q=${encodeURIComponent(topic.display_name)}`,
      openalexWorksCount: topic.works_count,
    });
  }

  // Step 6: Sort by pubmedCount descending, return top MAX_RESULTS
  return verified
    .sort((a, b) => b.pubmedCount - a.pubmedCount)
    .slice(0, MAX_RESULTS);
}
