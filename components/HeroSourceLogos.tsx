"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Source definitions — three render strategies:
//   "favicon"  → Google favicon CDN, gated by naturalWidth ≥ 32px check
//   "clearbit" → Clearbit Logo API, transparent-background PNG, onError gate
//   "svg"      → Inline SVG for orgs with no reliable external logo
// ---------------------------------------------------------------------------

type Source =
  | { kind: "favicon";  name: string; domain: string;          href: string }
  | { kind: "clearbit"; name: string; domain: string;          href: string }
  | { kind: "svg";      name: string; icon: React.ReactNode;   href: string };

// PROSPERO SVG: a simple "P" monogram in their teal/blue-green brand color
const ProsperoIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    aria-hidden="true"
    style={{ opacity: 0.75, flexShrink: 0 }}
  >
    <rect width="14" height="14" rx="2.5" fill="#00838F" />
    <text
      x="7"
      y="10.2"
      textAnchor="middle"
      fill="white"
      fontSize="8.5"
      fontWeight="700"
      fontFamily="Georgia, serif"
    >
      P
    </text>
  </svg>
);

// Europe PMC SVG: their teal "E" monogram
const EuropePmcIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    aria-hidden="true"
    style={{ opacity: 0.75, flexShrink: 0 }}
  >
    <rect width="14" height="14" rx="2.5" fill="#0072CF" />
    <text
      x="7"
      y="10.2"
      textAnchor="middle"
      fill="white"
      fontSize="8.5"
      fontWeight="700"
      fontFamily="Arial, sans-serif"
    >
      E
    </text>
  </svg>
);

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
    kind: "svg",
    name: "Europe PMC",
    icon: <EuropePmcIcon />,
    href: "https://europepmc.org/",
  },
  {
    kind: "favicon",
    name: "Semantic Scholar",
    domain: "semanticscholar.org",
    href: "https://www.semanticscholar.org/",
  },
  {
    kind: "clearbit",
    name: "ClinicalTrials.gov",
    domain: "clinicaltrials.gov",
    href: "https://clinicaltrials.gov/",
  },
  {
    kind: "svg",
    name: "PROSPERO",
    icon: <ProsperoIcon />,
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

function ClearbitChip({
  name,
  domain,
  href,
}: {
  name: string;
  domain: string;
  href: string;
}) {
  const [imgOk, setImgOk] = useState<boolean | null>(null);
  // Clearbit Logo API returns a transparent-background PNG (128×128) or 404
  const src = `https://logo.clearbit.com/${domain}`;

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
        onLoad={() => setImgOk(true)}
        onError={() => setImgOk(false)}
      />
      <span className="text-xs font-medium tracking-wide">{name}</span>
    </a>
  );
}

function SvgChip({
  name,
  icon,
  href,
}: {
  name: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 transition-opacity hover:opacity-90"
      style={{ color: "rgba(244,241,234,0.5)" }}
    >
      {icon}
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
        if (s.kind === "clearbit") return <ClearbitChip key={s.name} {...s} />;
        return <SvgChip key={s.name} name={s.name} icon={s.icon} href={s.href} />;
      })}
    </div>
  );
}
