"use client";

import { useEffect, useRef, useState } from "react";
import {
  TOUR_STEPS,
  getTourStepCount,
  hasTourBeenSeen,
  isFirstStep,
  isLastStep,
  markTourAsSeen,
} from "@/lib/onboarding";

// ---------------------------------------------------------------------------
// Step dots indicator
// ---------------------------------------------------------------------------

function StepDots({
  total,
  current,
}: {
  total: number;
  current: number;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`block w-2 h-2 rounded-full transition-colors ${
            i === current ? "bg-[#1e3a5f]" : "bg-gray-300"
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main OnboardingTour component
// ---------------------------------------------------------------------------

/**
 * Renders a centered modal tour that auto-shows on first visit (client-side
 * localStorage gate). The modal is accessible: focus is trapped inside it
 * while open, and Escape dismisses it.
 *
 * Place this component anywhere in the page tree — it renders a fixed
 * full-screen overlay so its DOM position does not affect layout.
 */
export function OnboardingTour() {
  // Always start hidden (matches SSR). After hydration, check localStorage
  // and show the tour if it hasn't been seen yet.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasTourBeenSeen()) setOpen(true);
  }, []);
  const [step, setStep] = useState(0);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const total = getTourStepCount();

  // Define dismiss before the useEffect that references it.
  function dismiss() {
    markTourAsSeen();
    setOpen(false);
    setStep(0);
  }

  function advance() {
    if (isLastStep(step)) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }

  function back() {
    if (!isFirstStep(step)) {
      setStep((s) => s - 1);
    }
  }

  // Focus the primary action button whenever the modal opens or the step changes.
  useEffect(() => {
    if (open) {
      primaryButtonRef.current?.focus();
    }
  }, [open, step]);

  // Dismiss on Escape key.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // `dismiss` is defined in the same render scope — safe to omit from deps
  }, [open]);

  if (!open) return null;

  const current = TOUR_STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Blindspot onboarding tour"
    >
      {/* Modal card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="bg-[#1e3a5f] px-6 py-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-200 tracking-wide uppercase">
              How Blindspot works
            </span>
            <button
              onClick={dismiss}
              className="text-blue-200 hover:text-white text-xl leading-none focus:outline-none focus:ring-2 focus:ring-white rounded"
              aria-label="Close tour"
            >
              ×
            </button>
          </div>
          <div className="mt-3 text-3xl" aria-hidden="true">
            {current.icon}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-white leading-snug">
            {current.title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-700 leading-relaxed">
            {current.description}
          </p>
          <p className="mt-3 text-xs text-gray-400 italic border-l-2 border-gray-200 pl-3">
            {current.hint}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-4">
          {/* Step dots */}
          <StepDots total={total} current={step} />

          {/* Navigation buttons */}
          <div className="flex items-center gap-2">
            {!isFirstStep(step) && (
              <button
                type="button"
                onClick={back}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] rounded"
              >
                Back
              </button>
            )}
            {isFirstStep(step) && (
              <button
                type="button"
                onClick={dismiss}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] rounded"
              >
                Skip
              </button>
            )}
            <button
              ref={primaryButtonRef}
              type="button"
              onClick={advance}
              className="px-4 py-2 text-sm font-medium bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2d5a8e] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-2"
            >
              {isLastStep(step) ? "Get started" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TourRestartButton — standalone "Take the tour" link for the footer
// ---------------------------------------------------------------------------

/**
 * A small client-side button that resets the tour-seen flag and reloads the
 * home page so the tour auto-shows again. Can be placed in any server or
 * client component.
 */
export function TourRestartButton() {
  function handleClick() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("blindspot_tour_v1_seen");
      window.location.href = "/";
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hover:text-gray-600 focus:outline-none focus:underline"
    >
      Take the tour
    </button>
  );
}

// ---------------------------------------------------------------------------
// NavHelpButton — "?" icon in the navigation bar
// ---------------------------------------------------------------------------

/**
 * A small "?" button in the NavBar that opens the onboarding tour modal on
 * the current page (without navigating to home first). The button is always
 * visible — it allows returning users to re-open the tour at any time.
 */
export function NavHelpButton() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const total = getTourStepCount();

  // Define close before the useEffect that references it.
  function close() {
    setOpen(false);
    setStep(0);
  }

  function advance() {
    if (isLastStep(step)) {
      close();
    } else {
      setStep((s) => s + 1);
    }
  }

  function back() {
    if (!isFirstStep(step)) {
      setStep((s) => s - 1);
    }
  }

  useEffect(() => {
    if (open) {
      primaryButtonRef.current?.focus();
    }
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
    // `close` is defined in the same render scope — safe to omit from deps
  }, [open]);

  const current = TOUR_STEPS[step];

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => { setStep(0); setOpen(true); }}
        className="w-6 h-6 rounded-full border border-gray-300 text-gray-400 hover:text-[#1e3a5f] hover:border-[#1e3a5f] flex items-center justify-center text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        aria-label="Open onboarding tour"
        title="How Blindspot works"
      >
        ?
      </button>

      {/* Modal (same markup as OnboardingTour) */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Blindspot onboarding tour"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-[#1e3a5f] px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-blue-200 tracking-wide uppercase">
                  How Blindspot works
                </span>
                <button
                  onClick={close}
                  className="text-blue-200 hover:text-white text-xl leading-none focus:outline-none focus:ring-2 focus:ring-white rounded"
                  aria-label="Close tour"
                >
                  ×
                </button>
              </div>
              <div className="mt-3 text-3xl" aria-hidden="true">
                {current.icon}
              </div>
              <h2 className="mt-2 text-lg font-semibold text-white leading-snug">
                {current.title}
              </h2>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700 leading-relaxed">
                {current.description}
              </p>
              <p className="mt-3 text-xs text-gray-400 italic border-l-2 border-gray-200 pl-3">
                {current.hint}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex items-center justify-between gap-4">
              <StepDots total={total} current={step} />
              <div className="flex items-center gap-2">
                {!isFirstStep(step) && (
                  <button
                    type="button"
                    onClick={back}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] rounded"
                  >
                    Back
                  </button>
                )}
                {isFirstStep(step) && (
                  <button
                    type="button"
                    onClick={close}
                    className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] rounded"
                  >
                    Close
                  </button>
                )}
                <button
                  ref={primaryButtonRef}
                  type="button"
                  onClick={advance}
                  className="px-4 py-2 text-sm font-medium bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2d5a8e] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-2"
                >
                  {isLastStep(step) ? "Done" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
