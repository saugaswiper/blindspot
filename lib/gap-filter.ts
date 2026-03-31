/**
 * gap-filter.ts
 *
 * Pure utility functions for filtering gap analysis results by dimension.
 * All functions are side-effect-free and suitable for unit testing.
 */

import type { Gap, GapDimension, SuggestedTopic } from "@/types";

/** Canonical ordered list of all six gap dimensions. */
export const ALL_DIMENSIONS: GapDimension[] = [
  "population",
  "methodology",
  "outcome",
  "geographic",
  "temporal",
  "theoretical",
];

/**
 * Human-readable labels for each dimension, used in filter buttons.
 */
export const DIMENSION_LABELS: Record<GapDimension, string> = {
  population: "Population",
  methodology: "Methodology",
  outcome: "Outcome",
  geographic: "Geographic",
  temporal: "Temporal",
  theoretical: "Theoretical",
};

/**
 * Short single-word labels used in compact filter chips (mobile).
 */
export const DIMENSION_SHORT_LABELS: Record<GapDimension, string> = {
  population: "Population",
  methodology: "Methods",
  outcome: "Outcome",
  geographic: "Geographic",
  temporal: "Temporal",
  theoretical: "Theoretical",
};

/**
 * Returns true when the given set contains ALL six dimensions — i.e. no
 * filter is active and everything is shown.
 */
export function isUnfiltered(active: ReadonlySet<GapDimension>): boolean {
  return ALL_DIMENSIONS.every((d) => active.has(d));
}

/**
 * Toggle a single dimension in the active set.
 * - If the dimension is currently active *and* is the only one, return the
 *   full set (prevents showing an empty list).
 * - Otherwise, toggling on adds it; toggling off removes it.
 *
 * Returns a new Set (never mutates the input).
 */
export function toggleDimension(
  current: ReadonlySet<GapDimension>,
  dimension: GapDimension
): Set<GapDimension> {
  const next = new Set(current);
  if (next.has(dimension)) {
    // Don't allow deselecting the last active dimension
    if (next.size === 1) return next;
    next.delete(dimension);
  } else {
    next.add(dimension);
  }
  return next;
}

/**
 * Return a new set containing ALL dimensions (clears any active filter).
 */
export function resetFilter(): Set<GapDimension> {
  return new Set(ALL_DIMENSIONS);
}

/**
 * Filter an array of gaps to only those whose dimension is in the active set.
 * When `active` contains all dimensions (unfiltered), returns the original
 * array reference (no copy) to avoid unnecessary re-renders.
 */
export function filterGapsByDimensions(
  gaps: Gap[],
  active: ReadonlySet<GapDimension>
): Gap[] {
  if (isUnfiltered(active)) return gaps;
  return gaps.filter((g) => active.has(g.dimension));
}

/**
 * Filter an array of suggested topics to only those whose gap_type is in the
 * active set.  Same short-circuit as filterGapsByDimensions.
 */
export function filterTopicsByDimensions(
  topics: SuggestedTopic[],
  active: ReadonlySet<GapDimension>
): SuggestedTopic[] {
  if (isUnfiltered(active)) return topics;
  return topics.filter((t) => active.has(t.gap_type));
}

/**
 * Given the current gaps array, return the count of gaps per dimension.
 * Useful for showing "3 population" in a filter chip.
 */
export function countByDimension(gaps: Gap[]): Record<GapDimension, number> {
  const counts: Record<GapDimension, number> = {
    population: 0,
    methodology: 0,
    outcome: 0,
    geographic: 0,
    temporal: 0,
    theoretical: 0,
  };
  for (const gap of gaps) {
    counts[gap.dimension] = (counts[gap.dimension] ?? 0) + 1;
  }
  return counts;
}
