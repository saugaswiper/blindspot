"use client";

import { ThemeProvider } from "next-themes";

/**
 * Client-side providers wrapper.
 *
 * ThemeProvider from next-themes adds `.dark` / `.light` class to `<html>`
 * based on the user's explicit preference (stored in localStorage) or, by
 * default, their OS system preference.
 *
 * - `attribute="class"` — syncs with Tailwind v4 @custom-variant dark
 * - `defaultTheme="system"` — respects OS dark/light on first visit
 * - `enableSystem` — keeps the theme in sync with OS changes
 * - `disableTransitionOnChange` — prevents flash of wrong theme colors
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
