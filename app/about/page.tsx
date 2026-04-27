import type { Metadata } from "next";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "About & Methodology — Blindspot",
  description:
    "How Blindspot works: data sources, feasibility scoring methodology, AI use disclosure, PRISMA calibration, and known limitations. Aligned with Cochrane RAISE 3 guidance.",
};

/**
 * NEW-4: RAISE Compliance Disclosure Page
 *
 * A static methodology disclosure page aligned with Cochrane RAISE 3 (June 2025)
 * guidance on responsible AI use in evidence synthesis tools.
 *
 * Required disclosures per RAISE 3:
 *  - Which databases are queried
 *  - How AI is used and where it is NOT used
 *  - Accuracy limitations and confidence calibration
 *  - Human oversight requirement
 *
 * Accessible at /about (linked from footer "About & Methodology" and from the
 * "Why This Score?" popover in ResultsDashboard).
 */

const SECTION_DIVIDER = (
  <hr className="my-8" style={{ borderColor: "var(--border)" }} />
);

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-serif text-xl sm:text-2xl mb-4 leading-snug"
      style={{ color: "var(--foreground)" }}
    >
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-semibold text-base mb-2 mt-5"
      style={{ color: "var(--foreground)" }}
    >
      {children}
    </h3>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

function InfoTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg mb-4" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--muted)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              style={{
                borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : undefined,
                background: "var(--surface)",
              }}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-sm align-top" style={{ color: j === 0 ? "var(--foreground)" : "var(--muted)" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <NavBar />

      <article className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        {/* Page header */}
        <div className="mb-10">
          <span
            className="text-xs font-semibold tracking-[0.18em] uppercase"
            style={{ color: "var(--muted)" }}
          >
            Transparency &amp; methodology
          </span>
          <h1
            className="font-serif text-3xl sm:text-4xl mt-2 mb-4 leading-[1.1]"
            style={{ color: "var(--foreground)" }}
          >
            About Blindspot
          </h1>
          <Prose>
            Blindspot is a free research gap analysis tool that helps researchers identify
            whether a systematic review opportunity exists on a given topic. It searches
            academic databases, scores feasibility based on real study counts, and uses AI
            to surface potential research gaps across six dimensions.
          </Prose>
          <Prose>
            This page discloses how the tool works, where AI is and is not used, and the
            known limitations of its outputs. It is intended to support RAISE 3
            (Cochrane&apos;s June 2025 guidance on responsible AI use in evidence synthesis)
            and institutional requirements for AI tool transparency.
          </Prose>
        </div>

        {SECTION_DIVIDER}

        {/* 1. Data sources */}
        <section>
          <SectionHeading>1. Data Sources</SectionHeading>
          <Prose>
            Blindspot queries the following databases in real time for every search. No
            results are pre-indexed; all counts and review lists are fetched live and
            cached for up to 7 days.
          </Prose>

          <InfoTable
            headers={["Source", "What it provides", "Coverage"]}
            rows={[
              [
                "PubMed",
                "Existing systematic reviews; primary study count",
                "MEDLINE + additional life science journals; ~35M citations",
              ],
              [
                "OpenAlex",
                "Existing systematic reviews; primary study count; topic taxonomy for alternative suggestions",
                "250M+ works across all disciplines (2026). 96–99% recall for systematic review benchmarks.",
              ],
              [
                "Europe PMC",
                "Existing systematic reviews; primary study count",
                "40M+ life science literature records",
              ],
              [
                "Semantic Scholar",
                "Additional existing reviews (supplemental deduplication pass)",
                "200M+ academic papers",
              ],
              [
                "ClinicalTrials.gov",
                "Active registered trial count (context signal for clinical topics)",
                "US and international registered clinical trials",
              ],
              [
                "PROSPERO",
                "Registered systematic review protocols in progress",
                "International register; ~100,000+ registered protocols (health sciences focus)",
              ],
              [
                "OSF Registries",
                "Registered systematic review protocols in progress",
                "Open Science Framework; ~2,960 SR protocols (2026); broader social science / psychology / education coverage than PROSPERO",
              ],
            ]}
          />

          <SubHeading>Deduplication</SubHeading>
          <Prose>
            Reviews retrieved from multiple sources are deduplicated by DOI, PubMed ID,
            and normalised title before display. A conservative 0.75 deduplication factor
            is applied to the blended primary study count to account for approximately
            25% inter-database overlap (PubMed/OpenAlex overlap is 50–70%; PubMed/Europe
            PMC overlap is 40–60%). This factor will be refined as search telemetry data
            accumulates.
          </Prose>

          <SubHeading>OpenAlex Coverage Limitation</SubHeading>
          <Prose>
            A 2025 PMC study found that OpenAlex has 96% recall for a systematic review
            benchmark set, but 3–4 records per search may be missing due to closed-access
            abstract removal (March 2025). Blindspot&apos;s per-source study count
            breakdown (visible on any result page) allows researchers to compare database
            counts directly.
          </Prose>
        </section>

        {SECTION_DIVIDER}

        {/* 2. Feasibility scoring */}
        <section>
          <SectionHeading>2. Feasibility Scoring</SectionHeading>
          <Prose>
            <strong style={{ color: "var(--foreground)" }}>
              Feasibility scoring is entirely data-driven — no AI is used.
            </strong>{" "}
            The score is calculated from the blended unique primary study count returned
            by the database queries. Thresholds are aligned with Cochrane Handbook
            recommendations:
          </Prose>

          <InfoTable
            headers={["Score", "Primary studies found", "Recommendation"]}
            rows={[
              [
                <span key="h" className="font-medium text-emerald-700 dark:text-emerald-400">High</span>,
                "11 or more",
                "Topic supports a systematic review or meta-analysis",
              ],
              [
                <span key="m" className="font-medium text-amber-700 dark:text-amber-400">Moderate</span>,
                "6 – 10",
                "Systematic review with narrative synthesis is feasible",
              ],
              [
                <span key="l" className="font-medium text-orange-700 dark:text-orange-400">Low</span>,
                "3 – 5",
                "Consider a scoping review to map available evidence first",
              ],
              [
                <span key="i" className="font-medium text-red-700 dark:text-red-400">Insufficient</span>,
                "Fewer than 3",
                "Primary research needed before a review is feasible",
              ],
            ]}
          />

          <SubHeading>What counts as a primary study?</SubHeading>
          <Prose>
            The primary study count excludes systematic reviews, meta-analyses, reviews,
            and protocols. Only original research articles (randomised controlled trials,
            observational studies, cohort studies, etc.) are counted. This is enforced
            via PubMed publication type filters and OpenAlex work-type exclusions.
          </Prose>

          <SubHeading>Query broadening for count accuracy</SubHeading>
          <Prose>
            PICO-structured inputs are used to generate a targeted AND-Boolean query for
            existing review searches. The same query in plain form (without Boolean
            operators) is used for primary study counting, to avoid under-counting studies
            that use synonymous terminology. A synonym expansion library maps common
            concept pairs (e.g., &quot;adolescents&quot; ↔ &quot;youth&quot;,
            &quot;myocardial infarction&quot; ↔ &quot;heart attack&quot;) to improve
            recall.
          </Prose>
        </section>

        {SECTION_DIVIDER}

        {/* 3. AI use disclosure */}
        <section>
          <SectionHeading>3. Where AI Is — and Is Not — Used</SectionHeading>

          <SubHeading>AI is used for: Gap analysis</SubHeading>
          <Prose>
            After the database searches complete, Blindspot passes the titles and abstracts
            of up to 20 existing reviews to Google Gemini 2.0 Flash for gap analysis.
            Gemini identifies potential research gaps across six dimensions: population,
            methodology, outcome, geographic, temporal, and theoretical. It also suggests
            specific review titles and a study design recommendation.
          </Prose>
          <Prose>
            Gap analysis confidence is indicated in the interface — High Confidence when
            20 reviews were analyzed, Moderate Confidence for 10–19, Low Confidence for
            5–9, and Very Low Confidence for fewer than 5. When fewer than 3 primary
            studies exist (Insufficient feasibility), AI gap analysis is blocked entirely
            because there is insufficient evidence for the AI to analyze meaningfully.
          </Prose>

          <SubHeading>AI is used for: Alternative topic suggestions</SubHeading>
          <Prose>
            When a topic returns Low or Insufficient feasibility, Blindspot uses the
            OpenAlex Topics taxonomy to find sibling research areas in the same academic
            subfield. Each candidate is verified against PubMed&apos;s real study counts
            before being shown. Only topics with 6 or more primary studies (Moderate
            feasibility threshold) are suggested.
          </Prose>

          <SubHeading>AI is NOT used for: Feasibility scoring</SubHeading>
          <Prose>
            The feasibility score (High / Moderate / Low / Insufficient) is derived
            entirely from database query counts. No AI model estimates or adjusts the
            primary study count or the resulting score.
          </Prose>

          <SubHeading>AI is NOT used for: Study counts or review retrieval</SubHeading>
          <Prose>
            All study counts and existing review listings are retrieved directly from
            PubMed, OpenAlex, Europe PMC, and Semantic Scholar APIs. AI does not
            fabricate, estimate, or supplement these results.
          </Prose>

          <SubHeading>AI is NOT used for: Registry checks</SubHeading>
          <Prose>
            PROSPERO and OSF registry checks are direct API queries. Blindspot does not
            use AI to infer whether a review is registered.
          </Prose>
        </section>

        {SECTION_DIVIDER}

        {/* 4. PRISMA flow estimates */}
        <section>
          <SectionHeading>4. PRISMA Flow Diagram Estimates</SectionHeading>
          <Prose>
            Blindspot generates an estimated PRISMA 2020 flow diagram showing how many
            records would be identified, screened, and included in a systematic review on
            the searched topic. These are estimates, not actual review numbers.
          </Prose>
          <Prose>
            Screening ratios are calibrated against published systematic review datasets
            from a 2021 meta-research study (Bannach-Brown et al.) covering 100 Cochrane
            reviews and 200 non-Cochrane systematic reviews. Estimates are stratified by
            corpus size into five tiers (XS / S / M / L / XL) to reflect the different
            screening yields observed across different evidence base sizes.
          </Prose>
          <Prose>
            Included counts are presented as a range (95% confidence interval) rather
            than a point estimate, reflecting uncertainty in screening ratios across
            review types. The displayed range is conservative: the interval spans
            approximately ±35% of the central estimate for small corpora and ±20% for
            large corpora.
          </Prose>
          <Prose>
            Search telemetry (logged since March 2026) will allow retrospective
            calibration of these ratios against real Blindspot searches once sufficient
            data accumulates.
          </Prose>
        </section>

        {SECTION_DIVIDER}

        {/* 5. Known limitations */}
        <section>
          <SectionHeading>5. Known Limitations</SectionHeading>

          <InfoTable
            headers={["Limitation", "Impact", "Mitigation"]}
            rows={[
              [
                "PROSPERO health-science focus",
                "Social science and psychology reviews may be registered in OSF only; PROSPERO-only checks would miss them",
                "OSF Registries are also checked (third-largest SR registry, 2026)",
              ],
              [
                "OpenAlex abstract removal (March 2025)",
                "3–4 closed-access records per search may be missing from OpenAlex",
                "Per-source count breakdown displayed; PubMed and Europe PMC supplement coverage",
              ],
              [
                "Primary study count blending",
                "The 0.75 deduplication factor is an estimate; true overlap varies by topic",
                "Confidence interval on the PRISMA included count reflects this uncertainty; telemetry calibration ongoing",
              ],
              [
                "Gemini gap analysis hallucination risk",
                "AI may suggest gaps not well-supported by the reviewed abstracts",
                "Gap confidence badges (◔ Low, ◑ Moderate, ● High) reflect the number of reviews analyzed; per-gap source passages shown where available",
              ],
              [
                "Cache staleness",
                "Results are cached for up to 7 days; newly published reviews may not appear",
                "Cache age is displayed; users can request a fresh search",
              ],
              [
                "No Cochrane Library direct integration",
                "Cochrane reviews are retrieved via PubMed and OpenAlex metadata, which may be less complete than direct Cochrane API access",
                "Cochrane reviews indexed in PubMed/OpenAlex are included; direct integration is planned",
              ],
            ]}
          />
        </section>

        {SECTION_DIVIDER}

        {/* 6. Human oversight */}
        <section>
          <SectionHeading>6. Human Oversight Requirement</SectionHeading>
          <Prose>
            Blindspot outputs are advisory. All AI-generated gap analysis, study design
            recommendations, and alternative topic suggestions must be verified by a
            qualified researcher before being used in a systematic review protocol,
            grant application, or publication.
          </Prose>
          <Prose>
            Feasibility scores reflect a snapshot of the indexed literature at the time of
            the search. A High feasibility score does not guarantee that a systematic
            review is appropriate or that no review exists outside the indexed databases.
            Researchers should independently search grey literature, conference proceedings,
            and discipline-specific databases before finalising a review topic.
          </Prose>
          <Prose>
            PROSPERO and OSF registry checks identify registered protocols but do not
            guarantee that an unregistered or embargoed review is not in progress.
            Researchers should contact field experts and check specialist registries
            relevant to their discipline.
          </Prose>
        </section>

        {SECTION_DIVIDER}

        {/* 7. RAISE compliance */}
        <section>
          <SectionHeading>7. RAISE 3 Alignment</SectionHeading>
          <Prose>
            Blindspot is designed to align with Cochrane RAISE 3 (June 2025) — guidance
            on selecting and using AI evidence synthesis tools responsibly. The table
            below summarises alignment with the RAISE 3 disclosure checklist:
          </Prose>

          <InfoTable
            headers={["RAISE 3 Requirement", "Blindspot implementation"]}
            rows={[
              [
                "Disclose which databases are searched",
                "Documented above (§1) and in the per-result source breakdown",
              ],
              [
                "Explain where AI is and is not used",
                "Documented above (§3); feasibility scoring is explicitly data-driven",
              ],
              [
                "Provide accuracy limitations",
                "Documented above (§5); confidence badges on gap analysis; CI ranges on PRISMA estimates",
              ],
              [
                "State human oversight requirement",
                "Documented above (§6); displayed in results interface",
              ],
              [
                "Explain AI model and version used",
                "Google Gemini 2.0 Flash; used only for gap analysis and subject to gap analysis confidence disclosure",
              ],
              [
                "Provide methodology for reproducibility",
                "This page; feasibility thresholds are fixed and Cochrane-aligned; results are reproducible within the cache window",
              ],
            ]}
          />

          <Prose>
            For questions about methodology, data sources, or institutional use, please
            contact us via the feedback link in the application footer.
          </Prose>
        </section>

        {SECTION_DIVIDER}

        {/* Back link */}
        <div className="text-sm" style={{ color: "var(--muted)" }}>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 hover:opacity-100 transition-opacity"
            style={{ opacity: 0.7 }}
          >
            ← Back to Blindspot
          </Link>
          <span className="mx-3" style={{ color: "var(--border)" }}>·</span>
          <span>Last updated: April 2026</span>
        </div>
      </article>
    </main>
  );
}
