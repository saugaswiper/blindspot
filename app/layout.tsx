import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
