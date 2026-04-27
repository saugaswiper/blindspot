/**
 * ACC-2: Data-Grounded Alternative Topic Suggestions
 * ACC-7: OpenAlex Semantic Search Fallback
 *
 * When a topic returns Insufficient or Low feasibility, suggests genuinely viable
 * alternative topics that have been verified against real PubMed counts.
 *
 * Primary algorithm (ACC-2 taxonomy-based):
 *   1. Query the OpenAlex Topics API to find the closest matching academic topic
 *   2. Extract the topic's "subfield" (e.g. "Psychiatry and Mental health")
 *   3. Fetch sibling topics in the same subfield, sorted by works_count descending
 *   4. Run parallel PubMed countPrimaryStudies for the top candidates
 *   5. Keep only alternatives with ≥ 6 studies (Moderate feasibility threshold)
 *   6. Return top 4, sorted by study count
 *
 * Semantic fallback (ACC-7 — activated when taxonomy returns < 3 results):
 *   7. Query the OpenAlex Works API with mode=semantic to find meaning-similar papers
 *   8. Extract distinct primary_topic names from the top 20 semantically related works
 *   9. Deduplicate against taxonomy-found topics
 *  10. Verify each candidate with PubMed countPrimaryStudies
 *  11. Merge with taxonomy results, return up to MAX_COMBINED_RESULTS
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

/** Maximum alternatives to return to the client from taxonomy-only path */
const MAX_RESULTS = 4;

/**
 * Maximum combined alternatives when semantic fallback (ACC-7) supplements taxonomy.
 * Allows up to 5 when both paths contribute, so the user always sees enough options.
 */
const MAX_COMBINED_RESULTS = 5;

/**
 * Threshold: if taxonomy returns fewer than this many alternatives, run the
 * ACC-7 semantic fallback. Chosen as 3 because 1–2 suggestions are rarely
 * enough for a researcher to find an adjacent viable topic.
 */
const SEMANTIC_FALLBACK_THRESHOLD = 3;

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
// ACC-7: OpenAlex Works semantic search types
// ---------------------------------------------------------------------------

/**
 * The primary_topic field returned on each work in the OpenAlex Works API.
 * Available via `?select=id,primary_topic` to minimise response payload.
 */
interface OpenAlexWorkPrimaryTopic {
  id: string;            // e.g. "https://openalex.org/T10004"
  display_name: string;  // e.g. "Cognitive Behavioral Therapy"
}

/** Minimal work shape when selecting only id + primary_topic */
interface OpenAlexSemanticWork {
  id: string;
  primary_topic?: OpenAlexWorkPrimaryTopic | null;
}

interface OpenAlexWorksResponse {
  results: OpenAlexSemanticWork[];
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
// ACC-7: Semantic search helpers (exported for unit-testing)
// ---------------------------------------------------------------------------

/**
 * Extracts distinct primary_topic display names from a list of OpenAlex works.
 *
 * Deduplication is case-insensitive so "CBT insomnia" and "CBT Insomnia" are
 * treated as the same topic. Preserves the first occurrence's casing.
 * Works without a primary_topic are silently skipped.
 *
 * @param works - list of works from the OpenAlex semantic works endpoint
 * @returns ordered list of unique topic names (order = appearance order in works)
 */
export function extractTopicNamesFromWorks(works: OpenAlexSemanticWork[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const work of works) {
    const name = work.primary_topic?.display_name;
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * Merges two AlternativeTopic arrays, deduplicating by display name
 * (case-insensitive). Primary array takes precedence — secondary items
 * are only added if their name hasn't already appeared.
 *
 * @param primary   - taxonomy-based results (higher trust signal)
 * @param secondary - semantic-based results (fallback)
 * @param maxResults - cap on total output size
 */
export function mergeAlternatives(
  primary: AlternativeTopic[],
  secondary: AlternativeTopic[],
  maxResults: number
): AlternativeTopic[] {
  const seen = new Set(primary.map((t) => t.displayName.toLowerCase()));
  const merged = [...primary];
  for (const alt of secondary) {
    if (merged.length >= maxResults) break;
    const key = alt.displayName.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(alt);
    }
  }
  return merged;
}

/**
 * ACC-7: Semantic fallback — queries OpenAlex Works with mode=semantic to
 * discover topics related by meaning (not just taxonomy hierarchy).
 *
 * This is gated behind a check in findFeasibleAlternativeTopics: it is only
 * called when the taxonomy path returned fewer than SEMANTIC_FALLBACK_THRESHOLD
 * alternatives. OpenAlex semantic search is in beta; graceful degradation
 * (empty array) is used on any API error.
 *
 * @param query        - the original user query text
 * @param excludeNames - set of lowercase topic names already found (to avoid duplicates)
 */
async function findSemanticAlternativeTopics(
  query: string,
  excludeNames: Set<string>
): Promise<AlternativeTopic[]> {
  const url = new URL(`${OPENALEX_BASE}/works`);
  url.searchParams.set("q", query);
  url.searchParams.set("mode", "semantic");
  url.searchParams.set("per_page", "20");
  url.searchParams.set("select", "id,primary_topic");
  if (EMAIL) url.searchParams.set("mailto", EMAIL);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: openAlexHeaders(),
      next: { revalidate: 0 },
    });
  } catch {
    // Network error — degrade gracefully
    return [];
  }

  if (!res.ok) return [];

  let data: OpenAlexWorksResponse;
  try {
    data = (await res.json()) as OpenAlexWorksResponse;
  } catch {
    return [];
  }

  const allTopicNames = extractTopicNamesFromWorks(data.results ?? []);

  // Exclude names already surfaced by the taxonomy path + the original query itself
  const candidates = allTopicNames
    .filter((name) => !excludeNames.has(name.toLowerCase()))
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) return [];

  // Verify each candidate with real PubMed primary-study count (parallel)
  const countResults = await Promise.allSettled(
    candidates.map((name) => countPrimaryStudies(name))
  );

  const verified: AlternativeTopic[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const result = countResults[i];
    if (result.status !== "fulfilled") continue;

    const pubmedCount = result.value;
    if (pubmedCount < MIN_STUDY_COUNT) continue;

    verified.push({
      displayName: candidates[i],
      pubmedCount,
      feasibility: getFeasibilityScore(pubmedCount),
      searchUrl: `/?q=${encodeURIComponent(candidates[i])}`,
      // openalexWorksCount not available from the semantic works endpoint primary_topic;
      // set to 0 as a safe default (field is informational only)
      openalexWorksCount: 0,
    });
  }

  return verified
    .sort((a, b) => b.pubmedCount - a.pubmedCount)
    .slice(0, MAX_RESULTS);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Returns up to MAX_COMBINED_RESULTS (5) verified alternative topics when the
 * original query returns Insufficient or Low feasibility.
 *
 * Primary path — OpenAlex taxonomy hierarchy (ACC-2):
 *   Uses the OpenAlex Topics hierarchy to discover adjacent research areas in
 *   the same academic subfield, then verifies each with a real PubMed
 *   primary-study count. Only topics with ≥ 6 primary studies (Moderate
 *   threshold) are returned.
 *
 * Semantic fallback — OpenAlex semantic works search (ACC-7):
 *   When the taxonomy path returns fewer than SEMANTIC_FALLBACK_THRESHOLD (3)
 *   results, queries the OpenAlex Works API with mode=semantic to find
 *   meaning-similar adjacent topics. Results are deduplicated against taxonomy
 *   results and merged up to MAX_COMBINED_RESULTS (5). This catches
 *   interdisciplinary topics and emerging research areas that may not map
 *   cleanly to the OpenAlex taxonomy hierarchy.
 *
 * @param query - the original user query (simple text or joined PICO)
 */
export async function findFeasibleAlternativeTopics(
  query: string
): Promise<AlternativeTopic[]> {
  // Step 1: Find the best-matching OpenAlex topic for the query
  const matchedTopics = await searchTopics(query, 3);

  let taxonomyResults: AlternativeTopic[] = [];

  if (matchedTopics.length > 0) {
    const topTopic = matchedTopics[0];

    if (topTopic.subfield?.id) {
      const subfieldId = extractSubfieldId(topTopic.subfield.id);

      if (subfieldId) {
        // Step 2: Fetch sibling topics in the same subfield
        const siblings = await fetchSiblingTopics(subfieldId, 20);

        // Step 3: Filter candidates — exclude original topic, require ≥ 50 works in OpenAlex
        const candidates = filterCandidates(siblings, topTopic.id, 50, MAX_CANDIDATES);

        if (candidates.length > 0) {
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

          // Step 6: Sort by pubmedCount descending, cap at MAX_RESULTS
          taxonomyResults = verified
            .sort((a, b) => b.pubmedCount - a.pubmedCount)
            .slice(0, MAX_RESULTS);
        }
      }
    }
  }

  // ACC-7: Semantic fallback — runs when taxonomy found fewer than threshold results.
  // This handles interdisciplinary topics and emerging areas without stable taxonomy
  // positions (e.g. "mRNA vaccine immunogenicity", "LLM mental health chatbots").
  if (taxonomyResults.length < SEMANTIC_FALLBACK_THRESHOLD) {
    // Build an exclusion set: taxonomy names + the original query (case-insensitive)
    const excludeNames = new Set<string>([
      query.toLowerCase(),
      ...taxonomyResults.map((t) => t.displayName.toLowerCase()),
    ]);

    const semanticResults = await findSemanticAlternativeTopics(query, excludeNames);

    if (semanticResults.length > 0) {
      // Merge taxonomy + semantic, deduplicating by name, up to MAX_COMBINED_RESULTS
      return mergeAlternatives(taxonomyResults, semanticResults, MAX_COMBINED_RESULTS);
    }
  }

  return taxonomyResults;
}
