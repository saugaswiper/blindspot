"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Source definitions — two render strategies:
//   "favicon"  → Google favicon CDN, gated by naturalWidth ≥ 32px check
//   "text"     → Name only; used when no reliable external logo is available
// ---------------------------------------------------------------------------

type Source =
  | { kind: "favicon"; name: string; domain: string; href: string }
  | { kind: "text";    name: string;                 href: string };

const SOURCES: Source[] = [
  {
    kind: "favicon",
    name: "PubMed",
    domain: "pubmed.ncbi.nlm.nih.gov",
    href: "https://pubmed.ncbi.nlm.nih.gov/",
  },
  {
    kind: "favicon",
    name: "OpenAlex",
    domain: "openalex.org",
    href: "https://openalex.org/",
  },
  {
    kind: "text",
    name: "Europe PMC",
    href: "https://europepmc.org/",
  },
  {
    kind: "favicon",
    name: "Semantic Scholar",
    domain: "semanticscholar.org",
    href: "https://www.semanticscholar.org/",
  },
  {
    kind: "text",
    name: "ClinicalTrials.gov",
    href: "https://clinicaltrials.gov/",
  },
  {
    kind: "text",
    name: "PROSPERO",
    href: "https://www.crd.york.ac.uk/prospero/",
  },
];

// ---------------------------------------------------------------------------
// Chip variants
// ---------------------------------------------------------------------------

function FaviconChip({
  name,
  domain,
  href,
}: {
  name: string;
  domain: string;
  href: string;
}) {
  const [imgOk, setImgOk] = useState<boolean | null>(null);
  const src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 transition-opacity hover:opacity-90"
      style={{ color: "rgba(244,241,234,0.5)" }}
    >
      <img
        src={src}
        alt=""
        width={14}
        height={14}
        className="w-3.5 h-3.5 shrink-0"
        style={{ display: imgOk ? "block" : "none", opacity: 0.75 }}
        onLoad={(e) => {
          // Google returns a 16px generic page icon for unknown domains;
          // real logos come back at the requested 32px.
          setImgOk(e.currentTarget.naturalWidth >= 32);
        }}
        onError={() => setImgOk(false)}
      />
      <span className="text-xs font-medium tracking-wide">{name}</span>
    </a>
  );
}

function TextChip({ name, href }: { name: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center transition-opacity hover:opacity-90"
      style={{ color: "rgba(244,241,234,0.5)" }}
    >
      <span className="text-xs font-medium tracking-wide">{name}</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function HeroSourceLogos() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {SOURCES.map((s) => {
        if (s.kind === "favicon") return <FaviconChip key={s.name} {...s} />;
        return <TextChip key={s.name} name={s.name} href={s.href} />;
      })}
    </div>
  );
}
