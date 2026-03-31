// ---------------------------------------------------------------------------
// Onboarding tour: pure-function helpers + step definitions
// ---------------------------------------------------------------------------

export interface TourStep {
  /** Short heading shown in the modal title */
  title: string;
  /** Multi-sentence description shown in the modal body */
  description: string;
  /** Emoji icon summarising the step */
  icon: string;
  /** Hint text shown below the description (shorter, secondary) */
  hint: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Search by topic or PICO",
    description:
      "Enter any research area in the Simple search box, or switch to PICO mode to describe your Population, Intervention, Comparison, and Outcome. PICO mode produces a more structured search and is preferred for clinical or intervention topics.",
    icon: "🔍",
    hint: 'Try: "cognitive behavioral therapy for insomnia in elderly patients"',
  },
  {
    title: "Understand the feasibility score",
    description:
      "After your search, Blindspot scores the topic High, Moderate, Low, or Insufficient based on how many existing systematic reviews and primary studies are available. A High score means there is genuine gap potential; Insufficient means the evidence base is too thin for a new review.",
    icon: "📊",
    hint: "High = a new review is likely viable. Insufficient = primary studies needed first.",
  },
  {
    title: "Explore the Gap Analysis",
    description:
      "Click \u201cRun AI Gap Analysis\u201d on the results page to see gaps across six dimensions: population, methodology, outcome, geographic, temporal, and theoretical. The AI also suggests specific review titles, generates a PubMed Boolean search string, and can draft a full PROSPERO-ready protocol.",
    icon: "🧠",
    hint: "Gap Analysis uses Gemini AI and takes about 15–20 seconds to generate.",
  },
];

/** Returns the total number of steps in the onboarding tour. */
export function getTourStepCount(): number {
  return TOUR_STEPS.length;
}

/**
 * Returns the TourStep at the given zero-based index,
 * or null if the index is out of range.
 */
export function getTourStep(index: number): TourStep | null {
  if (index < 0 || index >= TOUR_STEPS.length) return null;
  return TOUR_STEPS[index];
}

/** Returns true if the given index is the last step. */
export function isLastStep(index: number): boolean {
  return index === TOUR_STEPS.length - 1;
}

/** Returns true if the given index is the first step. */
export function isFirstStep(index: number): boolean {
  return index === 0;
}

/**
 * localStorage key used to track whether the current browser has
 * dismissed the onboarding tour. Versioned so that a redesigned tour
 * can show again by bumping the version suffix.
 */
export const TOUR_STORAGE_KEY = "blindspot_tour_v1_seen";

/**
 * Returns true if the tour has been dismissed before.
 * Must be called client-side (returns false in SSR context).
 */
export function hasTourBeenSeen(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
}

/**
 * Persists tour-dismissed state so the tour does not auto-show again.
 * Must be called client-side (no-ops in SSR context).
 */
export function markTourAsSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOUR_STORAGE_KEY, "true");
}

/**
 * Clears tour-dismissed state so the tour will auto-show on next page load.
 * Used by the "Take the tour again" footer link.
 * Must be called client-side.
 */
export function resetTourSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
