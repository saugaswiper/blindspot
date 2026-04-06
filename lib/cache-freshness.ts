/**
 * UI-3: Cache freshness utilities.
 *
 * Results on the /results/[id] page are fetched directly from Supabase by ID
 * and can therefore show data that is arbitrarily old (the 7-day TTL only
 * applies to the cache lookup used during a new search, not to direct ID
 * lookups via bookmarks or shared links).
 *
 * These pure functions compute a human-readable age label and a staleness
 * tier so the ResultsDashboard can show an appropriate indicator.
 */

export type CacheFreshnessStatus = "fresh" | "aging" | "stale";

/**
 * Tier thresholds (in days):
 *   < 7 days  → fresh  (within the normal 7-day search-cache TTL)
 *   7–30 days → aging  (cache has expired; same data still visible via direct link)
 *   > 30 days → stale  (significantly outdated — show prominent warning)
 */
const FRESH_THRESHOLD_DAYS = 7;
const STALE_THRESHOLD_DAYS = 30;

/**
 * Returns the age of a cached result in fractional days.
 * Exported to allow unit tests to verify boundary conditions.
 */
export function getAgeInDays(createdAt: string, now: Date = new Date()): number {
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Determines how stale a result is based on its creation timestamp.
 *
 * @param createdAt - ISO 8601 date string (from `search_results.created_at`)
 * @param now       - Optionally override "now" for deterministic testing
 */
export function getCacheFreshnessStatus(
  createdAt: string,
  now: Date = new Date()
): CacheFreshnessStatus {
  const ageDays = getAgeInDays(createdAt, now);
  if (ageDays < FRESH_THRESHOLD_DAYS) return "fresh";
  if (ageDays < STALE_THRESHOLD_DAYS) return "aging";
  return "stale";
}

/**
 * Returns a human-readable label for the result's age.
 *
 * Examples:
 *   "today"        (< 1 day)
 *   "yesterday"    (1 day)
 *   "3 days ago"   (2–13 days)
 *   "2 weeks ago"  (14–55 days)
 *   "2 months ago" (56+ days)
 *
 * @param createdAt - ISO 8601 date string
 * @param now       - Optionally override "now" for deterministic testing
 */
export function formatResultAge(createdAt: string, now: Date = new Date()): string {
  const ageDays = getAgeInDays(createdAt, now);

  if (ageDays < 1) return "today";
  if (ageDays < 2) return "yesterday";
  if (ageDays < 14) return `${Math.floor(ageDays)} days ago`;

  const weeks = Math.floor(ageDays / 7);
  if (weeks < 8) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;

  const months = Math.floor(ageDays / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
