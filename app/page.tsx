import { Suspense } from "react";
import { TopicInput } from "@/components/TopicInput";
import { NavBar } from "@/components/NavBar";
import { OnboardingTour, TourRestartButton } from "@/components/OnboardingTour";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <NavBar />

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-8 sm:pt-16 pb-8 sm:pb-12 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] leading-tight" suppressHydrationWarning>
          Find the systematic review<br />no one&apos;s written yet
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-xl mx-auto">
          Blindspot searches PubMed and OpenAlex to surface genuine research gaps,
          score feasibility, and suggest specific review topics — in minutes, not weeks.
        </p>
      </section>

      {/* Search box */}
      <section className="max-w-2xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {/* Suspense required because TopicInput uses useSearchParams() */}
          <Suspense fallback={<div className="h-24 bg-gray-50 rounded-lg animate-pulse" />}>
            <TopicInput />
          </Suspense>
        </div>
        <p className="text-center text-xs text-gray-400 mt-3">
          Free to use. No credit card required.
        </p>
      </section>

      {/* How it works */}
      <section className="bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-14">
          <h2 className="text-xl font-semibold text-[#1e3a5f] text-center mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Enter your topic",
                body: "Type a broad research area or use the PICO form to describe your population, intervention, and outcome.",
              },
              {
                step: "2",
                title: "AI analyzes the evidence",
                body: "Blindspot searches existing systematic reviews, counts primary studies, and identifies six types of research gaps.",
              },
              {
                step: "3",
                title: "Get your report",
                body: "Download a PDF summary with suggested review topics, a feasibility score, and a study design recommendation.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white text-sm font-bold flex items-center justify-center mx-auto mb-3">
                  {step}
                </div>
                <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
                <p className="text-sm text-gray-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <span suppressHydrationWarning>Blindspot &copy; {new Date().getFullYear()}</span>
          <div className="flex gap-4">
            <a href="/about" className="hover:text-gray-600">About &amp; Methodology</a>
            <a href="/privacy" className="hover:text-gray-600">Privacy</a>
            <TourRestartButton />
          </div>
        </div>
      </footer>

      {/* Onboarding tour — auto-shows on first visit (localStorage gate) */}
      <OnboardingTour />
    </main>
  );
}
