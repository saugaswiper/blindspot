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
import { useFocusTrap } from "@/lib/focus-trap";

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
          className="block w-2 h-2 rounded-full transition-colors"
          style={{ background: i === current ? "var(--brand)" : "var(--border)" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared modal markup helpers
// ---------------------------------------------------------------------------

function ModalCard({
  children,
  modalRef,
}: {
  children: React.ReactNode;
  modalRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={modalRef}
      className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {children}
    </div>
  );
}

function ModalHeader({
  icon,
  title,
  onClose,
}: {
  icon: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="px-6 py-5" style={{ background: "var(--brand)" }}>
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-medium tracking-wide uppercase"
          style={{ color: "rgba(255,255,255,0.65)" }}
        >
          How Blindspot works
        </span>
        <button
          onClick={onClose}
          className="text-xl leading-none focus:outline-none focus:ring-2 focus:ring-white rounded transition-opacity hover:opacity-100"
          style={{ color: "rgba(255,255,255,0.65)" }}
          aria-label="Close tour"
        >
          ×
        </button>
      </div>
      <div className="mt-3 text-3xl" aria-hidden="true">
        {icon}
      </div>
      <h2 className="mt-2 text-lg font-semibold leading-snug font-serif text-white">
        {title}
      </h2>
    </div>
  );
}

function ModalBody({
  description,
  hint,
}: {
  description: string;
  hint: string;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
        {description}
      </p>
      <p
        className="mt-3 text-xs italic pl-3"
        style={{ color: "var(--muted)", borderLeft: "2px solid var(--border)" }}
      >
        {hint}
      </p>
    </div>
  );
}

function ModalFooter({
  total,
  step,
  primaryRef,
  onBack,
  onSkipOrClose,
  onAdvance,
  isFirst,
  isLast,
  skipLabel = "Skip",
  doneLabel = "Get started",
}: {
  total: number;
  step: number;
  primaryRef: React.RefObject<HTMLButtonElement | null>;
  onBack: () => void;
  onSkipOrClose: () => void;
  onAdvance: () => void;
  isFirst: boolean;
  isLast: boolean;
  skipLabel?: string;
  doneLabel?: string;
}) {
  return (
    <div
      className="px-6 pt-4 pb-5 flex items-center justify-between gap-4"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <StepDots total={total} current={step} />
      <div className="flex items-center gap-2">
        {!isFirst && (
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-[#4a90d9] transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            Back
          </button>
        )}
        {isFirst && (
          <button
            type="button"
            onClick={onSkipOrClose}
            className="px-3 py-1.5 text-sm rounded focus:outline-none focus:ring-2 focus:ring-[#4a90d9] transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            {skipLabel}
          </button>
        )}
        <button
          ref={primaryRef}
          type="button"
          onClick={onAdvance}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:ring-offset-2"
          style={{ background: "var(--brand)" }}
        >
          {isLast ? doneLabel : "Next →"}
        </button>
      </div>
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
  const modalRef = useRef<HTMLDivElement>(null);
  const total = getTourStepCount();

  // Trap focus inside the modal card while the tour is open (WCAG 2.4.3)
  useFocusTrap(modalRef, open);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Blindspot onboarding tour"
    >
      <ModalCard modalRef={modalRef}>
        <ModalHeader icon={current.icon} title={current.title} onClose={dismiss} />
        <ModalBody description={current.description} hint={current.hint} />
        <ModalFooter
          total={total}
          step={step}
          primaryRef={primaryButtonRef}
          onBack={back}
          onSkipOrClose={dismiss}
          onAdvance={advance}
          isFirst={isFirstStep(step)}
          isLast={isLastStep(step)}
          skipLabel="Skip"
          doneLabel="Get started"
        />
      </ModalCard>
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
      className="hover:opacity-70 transition-opacity focus:outline-none focus:underline"
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
  const navModalRef = useRef<HTMLDivElement>(null);
  const total = getTourStepCount();

  // Trap focus inside the modal card while the tour is open (WCAG 2.4.3)
  useFocusTrap(navModalRef, open);

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
        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
        style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
        aria-label="Open onboarding tour"
        title="How Blindspot works"
      >
        ?
      </button>

      {/* Modal (same markup as OnboardingTour) */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Blindspot onboarding tour"
        >
          <ModalCard modalRef={navModalRef}>
            <ModalHeader icon={current.icon} title={current.title} onClose={close} />
            <ModalBody description={current.description} hint={current.hint} />
            <ModalFooter
              total={total}
              step={step}
              primaryRef={primaryButtonRef}
              onBack={back}
              onSkipOrClose={close}
              onAdvance={advance}
              isFirst={isFirstStep(step)}
              isLast={isLastStep(step)}
              skipLabel="Close"
              doneLabel="Done"
            />
          </ModalCard>
        </div>
      )}
    </>
  );
}
