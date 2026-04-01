"use client";

import { useTheme } from "next-themes";

/**
 * ThemeToggle — Sun/Moon button that switches between light and dark mode.
 *
 * Uses next-themes' `useTheme()` hook. The toggle cycles:
 *   system → light → dark → light → dark → …
 * (On first click from "system", it resolves to the opposite of the current
 * resolved theme so users immediately see an effect.)
 *
 * Hydration guard: next-themes defers `resolvedTheme` until client hydration.
 * While `resolvedTheme` is `undefined` (SSR / pre-hydration), the button
 * renders as a neutral placeholder to avoid a hydration mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // resolvedTheme is undefined on the server and during initial hydration.
  // Render a stable placeholder until it resolves to avoid hydration mismatch.
  if (!resolvedTheme) {
    return (
      <button
        aria-label="Toggle colour scheme"
        className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400"
        disabled
      >
        <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  function toggle() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {isDark ? (
        /* Sun icon — click to go light */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        /* Moon icon — click to go dark */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
