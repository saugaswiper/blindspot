import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Blindspot — Find the systematic review no one's written yet",
  description:
    "AI-powered research gap analysis for graduate students and researchers. Find viable, untapped systematic review topics in minutes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: next-themes updates the `class` attribute on
    // <html> client-side (to apply .dark / .light), which would otherwise
    // produce a React hydration mismatch warning.
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
