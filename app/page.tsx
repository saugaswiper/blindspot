import { Suspense } from "react";
import { TopicInput } from "@/components/TopicInput";
import { NavBar } from "@/components/NavBar";
import { OnboardingTour, TourRestartButton } from "@/components/OnboardingTour";
import { HeroSourceLogos } from "@/components/HeroSourceLogos";
import { FieldExplorer } from "@/components/FieldExplorer";

export default function HomePage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <NavBar />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--brand-surface)", color: "#f4f1ea" }}
      >
        {/* Subtle grain texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            backgroundSize: "128px",
          }}
        />

        <div className="relative max-w-4xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          {/* Main headline — serif, editorial, large */}
          <h1
            className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.1] mb-6 max-w-3xl"
            style={{ color: "#f4f1ea" }}
            suppressHydrationWarning
          >
            Find the systematic review{" "}
            <em className="not-italic" style={{ color: "#c49a2e" }}>
              no one&apos;s written yet
            </em>
          </h1>

          <p className="text-base sm:text-lg leading-relaxed max-w-xl mb-8" style={{ color: "#e8e4dc", opacity: 0.8 }}>
            Search existing literature, score feasibility, and surface the specific
            systematic review topics most worth writing — in minutes, not weeks.
          </p>

          {/* Source logos — client component with favicon + text fallback */}
          <div>
            <p
              className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-3"
              style={{ color: "rgba(244,241,234,0.35)" }}
            >
              Searches across
            </p>
            <HeroSourceLogos />
          </div>
        </div>
      </section>

      {/* Search card — elevated, floating below hero */}
      <section className="max-w-2xl mx-auto px-4 -mt-8 pb-12 relative z-10">
        <div
          className="rounded-xl p-6 sm:p-8"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <Suspense fallback={<div className="h-24 rounded-lg animate-pulse" style={{ background: "var(--surface-2)" }} />}>
            <TopicInput />
          </Suspense>
        </div>
        <p className="text-center text-xs mt-3" style={{ color: "var(--muted)" }}>
          Free to use · No credit card required
        </p>
      </section>

      {/* Field Explorer */}
      <section style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="flex items-center gap-4 mb-8">
            <div>
              <span className="text-xs font-medium tracking-[0.18em] uppercase" style={{ color: "var(--muted)" }}>
                Explore a research field
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl mt-1 leading-snug" style={{ color: "var(--foreground)" }}>
                Not sure where to start?
              </h2>
              <p className="text-sm mt-2 leading-relaxed max-w-lg" style={{ color: "var(--muted)" }}>
                Enter a broad topic and Blindspot will surface specific review opportunities within it — each verified against real study counts.
              </p>
            </div>
          </div>
          <Suspense fallback={<div className="h-12 rounded-lg animate-pulse" style={{ background: "var(--surface-2)" }} />}>
            <FieldExplorer />
          </Suspense>
        </div>
      </section>

      {/* How it works */}
      <section style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="flex items-center gap-4 mb-12">
            <span className="text-xs font-medium tracking-[0.18em] uppercase" style={{ color: "var(--muted)" }}>
              How it works
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 sm:gap-12">
            {[
              {
                step: "01",
                title: "Enter your topic",
                body: "Type a broad research area or use the PICO form to describe your population, intervention, and outcome.",
              },
              {
                step: "02",
                title: "AI analyzes the evidence",
                body: "Blindspot searches existing systematic reviews, counts primary studies, and identifies six types of research gaps.",
              },
              {
                step: "03",
                title: "Get your report",
                body: "Download a PDF summary with suggested review topics, a feasibility score, and a study design recommendation.",
              },
            ].map(({ step, title, body }) => (
              <div key={step}>
                <p
                  className="font-serif text-4xl mb-4 leading-none"
                  style={{ color: "var(--accent)" }}
                >
                  {step}
                </p>
                <h3
                  className="font-semibold text-base mb-2"
                  style={{ color: "var(--foreground)" }}
                >
                  {title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)" }}>
        <div
          className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
          style={{ color: "var(--muted)" }}
        >
          <span suppressHydrationWarning>Blindspot &copy; {new Date().getFullYear()}</span>
          <div className="flex gap-5">
            <a
              href="/about"
              className="hover:opacity-100 transition-opacity"
              style={{ opacity: 0.7 }}
            >
              About &amp; Methodology
            </a>
            <a
              href="/privacy"
              className="hover:opacity-100 transition-opacity"
              style={{ opacity: 0.7 }}
            >
              Privacy
            </a>
            <TourRestartButton />
          </div>
        </div>
      </footer>

      <OnboardingTour />
    </main>
  );
}
