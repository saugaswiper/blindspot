"use client";

import { useState } from "react";

const SOURCES = [
  { name: "PubMed",             domain: "pubmed.ncbi.nlm.nih.gov",  href: "https://pubmed.ncbi.nlm.nih.gov/" },
  { name: "OpenAlex",           domain: "openalex.org",             href: "https://openalex.org/" },
  { name: "Europe PMC",         domain: "europepmc.org",            href: "https://europepmc.org/" },
  { name: "Semantic Scholar",   domain: "semanticscholar.org",      href: "https://www.semanticscholar.org/" },
  { name: "ClinicalTrials.gov", domain: "clinicaltrials.gov",       href: "https://clinicaltrials.gov/" },
  { name: "PROSPERO",           domain: "crd.york.ac.uk",           href: "https://www.crd.york.ac.uk/prospero/" },
];

function SourceChip({
  name,
  domain,
  href,
}: {
  name: string;
  domain: string;
  href: string;
}) {
  const [imgOk, setImgOk] = useState<boolean | null>(null); // null = loading

  // Google's favicon CDN at 32 px — sharp on retina, falls back to page icon if no logo
  const src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 transition-opacity hover:opacity-90"
      style={{ color: "rgba(244,241,234,0.5)" }}
      title={name}
    >
      {/* Always render the img so onLoad/onError fires; hide while unknown */}
      <img
        src={src}
        alt=""
        width={14}
        height={14}
        // Invisible until we know it's a real logo (not a generic page icon)
        className="w-3.5 h-3.5 shrink-0"
        style={{ display: imgOk ? "block" : "none", opacity: 0.75 }}
        onLoad={(e) => {
          // Google returns a 16×16 fallback "page" icon for unknown domains — detect by
          // checking natural dimensions. Real logos are returned at the requested 32px size.
          const img = e.currentTarget;
          setImgOk(img.naturalWidth >= 32);
        }}
        onError={() => setImgOk(false)}
      />
      <span className="text-xs font-medium tracking-wide">{name}</span>
    </a>
  );
}

export function HeroSourceLogos() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {SOURCES.map((s) => (
        <SourceChip key={s.name} {...s} />
      ))}
    </div>
  );
}
