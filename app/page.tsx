import { Suspense } from "react";
import { TopicInput } from "@/components/TopicInput";
import { NavBar } from "@/components/NavBar";
import { OnboardingTour, TourRestartButton } from "@/components/OnboardingTour";

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

          <p className="text-base sm:text-lg leading-relaxed max-w-xl opacity-80 mb-0" style={{ color: "#e8e4dc" }}>
            Blindspot searches PubMed and OpenAlex to surface genuine research gaps,
            score feasibility, and suggest specific review topics — in minutes, not weeks.
          </p>
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

      {/* Data sources strip */}
      <section style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-3xl mx-auto px-6 py-10 sm:py-12 text-center">
          <p className="text-sm leading-relaxed mb-8 max-w-xl mx-auto" style={{ color: "var(--muted)" }}>
            Blindspot queries six trusted databases to build a complete picture of the
            existing evidence landscape before flagging genuine gaps.
          </p>
          <p className="text-[10px] tracking-[0.18em] uppercase font-semibold mb-5" style={{ color: "var(--muted)", opacity: 0.6 }}>
            Searches across
          </p>
          <div className="flex flex-wrap justify-center items-center gap-x-7 gap-y-4">
            {[
              { name: "PubMed",            favicon: "https://pubmed.ncbi.nlm.nih.gov/favicon.ico",           href: "https://pubmed.ncbi.nlm.nih.gov/" },
              { name: "OpenAlex",          favicon: "https://openalex.org/favicon.ico",                      href: "https://openalex.org/" },
              { name: "Europe PMC",        favicon: "https://europepmc.org/favicon.ico",                     href: "https://europepmc.org/" },
              { name: "Semantic Scholar",  favicon: "https://www.semanticscholar.org/favicon.ico",           href: "https://www.semanticscholar.org/" },
              { name: "ClinicalTrials.gov",favicon: "https://clinicaltrials.gov/favicon.ico",                href: "https://clinicaltrials.gov/" },
              { name: "PROSPERO",          favicon: "https://www.crd.york.ac.uk/prospero/favicon.ico",       href: "https://www.crd.york.ac.uk/prospero/" },
            ].map(({ name, favicon, href }) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 transition-opacity hover:opacity-100 group"
                style={{ opacity: 0.5 }}
                title={`Search on ${name}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={favicon}
                  alt=""
                  width={16}
                  height={16}
                  className="w-4 h-4 grayscale group-hover:grayscale-0 transition-all"
                />
                <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  {name}
                </span>
              </a>
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
