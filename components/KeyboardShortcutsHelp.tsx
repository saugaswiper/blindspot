"use client";

import { useEffect, useRef, useState } from "react";
import {
  RESULT_SHORTCUTS,
  getShortcutsByCategory,
  getDisplayKey,
  hasShortcutsTooltipBeenSeen,
  markShortcutsTooltipAsSeen,
} from "@/lib/keyboard-shortcuts";
import type { KeyboardShortcut } from "@/lib/keyboard-shortcuts";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<KeyboardShortcut["category"], string> = {
  navigation: "Navigation",
  actions: "Actions",
  help: "Help",
};

export function KeyboardShortcutsHelp({ open, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus close button when opened
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const categories = (["navigation", "actions", "help"] as const).filter(
    (cat) => getShortcutsByCategory(cat).length > 0
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6"
      aria-modal="true"
      role="dialog"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      {/* Panel — stops click propagation so clicking the panel itself doesn't close it */}
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-xl w-full sm:w-80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#1e3a5f]">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-semibold tracking-wide">
              ⌨ Keyboard Shortcuts
            </span>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="text-white/70 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4 max-h-80 overflow-y-auto">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {CATEGORY_LABELS[cat]}
              </p>
              <div className="space-y-1.5">
                {getShortcutsByCategory(cat).map((shortcut) => (
                  <ShortcutRow key={shortcut.key} shortcut={shortcut} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 text-center">
            Shortcuts are disabled when typing in a form field
          </p>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ shortcut }: { shortcut: KeyboardShortcut }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-600 leading-tight">{shortcut.description}</span>
      <kbd
        className="shrink-0 inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 text-xs font-mono font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded-md shadow-sm"
        aria-label={`Key ${shortcut.key}`}
      >
        {getDisplayKey(shortcut)}
      </kbd>
    </div>
  );
}

/**
 * A small `?` button shown in the Results page header that opens the
 * keyboard shortcuts help panel.  Separate from NavHelpButton (which opens
 * the onboarding tour).
 */
export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Show keyboard shortcuts"
      title="Keyboard shortcuts"
      className="inline-flex items-center justify-center w-7 h-7 text-xs font-mono font-semibold text-gray-500 border border-gray-300 rounded-full hover:border-[#4a90d9] hover:text-[#4a90d9] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4a90d9]"
    >
      ⌨
    </button>
  );
}

/**
 * One-time "Press ? for shortcuts" discovery tooltip.
 *
 * Appears anchored below the ⌨ ShortcutsButton on the first visit to any
 * Results page. localStorage-gated: dismissed automatically after 5 seconds
 * or immediately when the user clicks ×. Either action marks it as seen so
 * it never appears again for this browser.
 *
 * When the user clicks the label text (not just ×), the shortcuts panel
 * opens so they can browse available shortcuts right away.
 */
interface TooltipProps {
  /** Called when the user clicks the tooltip body (not ×) to open shortcuts. */
  onOpenShortcuts: () => void;
}

export function ShortcutsDiscoveryTooltip({ onOpenShortcuts }: TooltipProps) {
  // Lazy initializer mirrors the OnboardingTour pattern:
  //   • Server render  → typeof window === "undefined" → false (no tooltip in SSR HTML)
  //   • Client render  → checks localStorage → true on first visit, false thereafter
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !hasShortcutsTooltipBeenSeen();
  });

  // When visible becomes true (first-visit only): mark as seen and start
  // the 5 s auto-dismiss timer.  Cleanup clears the timer if the user
  // manually dismisses before it fires.  deps=[visible] satisfies the
  // exhaustive-deps rule and keeps the effect idempotent.
  useEffect(() => {
    if (!visible) return;
    markShortcutsTooltipAsSeen();
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-full right-0 mt-2 z-40 flex items-center gap-2 bg-[#1e3a5f] text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg whitespace-nowrap"
    >
      {/* Clickable label — opens shortcuts panel */}
      <button
        onClick={() => {
          setVisible(false);
          onOpenShortcuts();
        }}
        className="flex items-center gap-1.5 hover:text-white/90 transition-colors"
        aria-label="Open keyboard shortcuts panel"
      >
        Press{" "}
        <kbd className="inline-flex items-center justify-center w-5 h-5 text-xs font-mono font-semibold bg-white/20 rounded">
          ?
        </kbd>{" "}
        for shortcuts
      </button>

      {/* Dismiss (×) */}
      <button
        onClick={() => setVisible(false)}
        aria-label="Dismiss shortcuts hint"
        className="ml-1 text-white/60 hover:text-white transition-colors text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}

// Re-export so consumers can import the shortcut definitions for reference
export { RESULT_SHORTCUTS };
