/**
 * lib/protocol-storage.test.ts
 *
 * Unit tests for the pure utilities in lib/protocol-storage.ts.
 *
 * Run with vitest:  npx vitest run lib/protocol-storage.test.ts
 */

import { describe, it, expect } from "vitest";
import { deriveProtocolFilename, hasStoredProtocol } from "./protocol-storage";

// ---------------------------------------------------------------------------
// deriveProtocolFilename
// ---------------------------------------------------------------------------

describe("deriveProtocolFilename", () => {
  it("extracts a clean slug from a simple heading", () => {
    const protocol = "# A Systematic Review of CBT for Insomnia\n\nSome content.";
    expect(deriveProtocolFilename(protocol)).toBe(
      "a-systematic-review-of-cbt-for-insomnia.md"
    );
  });

  it("returns protocol.md when there is no ATX heading", () => {
    expect(deriveProtocolFilename("No heading here\nJust content.")).toBe("protocol.md");
  });

  it("returns protocol.md for an empty string", () => {
    expect(deriveProtocolFilename("")).toBe("protocol.md");
  });

  it("does not match a level-2 or deeper heading (## Foo)", () => {
    // Only single-# headings are treated as the title
    const protocol = "## Sub-section\n\nContent here.";
    expect(deriveProtocolFilename(protocol)).toBe("protocol.md");
  });

  it("truncates slug to 60 characters", () => {
    const longTitle = "# " + "word ".repeat(20); // well over 60 chars
    const result = deriveProtocolFilename(longTitle);
    // filename includes .md, so the slug part is at most 60 chars
    const slug = result.replace(/\.md$/, "");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(result.endsWith(".md")).toBe(true);
  });

  it("replaces spaces and punctuation with hyphens", () => {
    const protocol = "# CBT: Insomnia & Sleep Quality (Adults)";
    const result = deriveProtocolFilename(protocol);
    expect(result).toMatch(/^[a-z0-9-]+\.md$/);
    expect(result).not.toContain(":");
    expect(result).not.toContain("&");
    expect(result).not.toContain("(");
    expect(result).not.toContain(")");
  });

  it("strips leading and trailing hyphens from the slug", () => {
    // If heading starts/ends with punctuation the slug won't start/end with -
    const protocol = "# -- Review --";
    const result = deriveProtocolFilename(protocol);
    expect(result).not.toMatch(/^-/);
    expect(result.replace(/\.md$/, "")).not.toMatch(/-$/);
  });

  it("falls back to protocol.md when heading is all punctuation", () => {
    const protocol = "# ---!!!---";
    expect(deriveProtocolFilename(protocol)).toBe("protocol.md");
  });

  it("collapses consecutive non-alphanumeric chars into one hyphen", () => {
    const protocol = "# Meta-Analysis   of   CBT--Insomnia";
    const result = deriveProtocolFilename(protocol);
    // Should not have double hyphens in slug (runs collapsed to single -)
    expect(result).not.toContain("--");
  });

  it("handles headings with numbers", () => {
    const protocol = "# 2025 Review of Vitamin D3 Supplementation";
    const result = deriveProtocolFilename(protocol);
    expect(result).toContain("2025");
    expect(result).toContain("vitamin");
    expect(result.endsWith(".md")).toBe(true);
  });

  it("uses the first # heading, not a later one", () => {
    const protocol = "# First Title\n\n## Second Section\n\n# Third Title";
    const result = deriveProtocolFilename(protocol);
    expect(result).toContain("first-title");
    expect(result).not.toContain("third");
  });

  it("handles heading with only whitespace after #", () => {
    // "# " with only spaces — titleMatch[1] would be all spaces → slug empty → fallback
    const protocol = "#   \n\nContent here.";
    expect(deriveProtocolFilename(protocol)).toBe("protocol.md");
  });

  it("returns a string ending in .md in all cases", () => {
    const cases = [
      "",
      "# Valid Title",
      "No heading",
      "## Only H2",
      "# " + "x".repeat(200),
    ];
    for (const c of cases) {
      expect(deriveProtocolFilename(c).endsWith(".md")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// hasStoredProtocol
// ---------------------------------------------------------------------------

describe("hasStoredProtocol", () => {
  it("returns true for a non-empty string", () => {
    expect(hasStoredProtocol("# My Protocol\n\nContent.")).toBe(true);
  });

  it("returns true for a single-character string", () => {
    expect(hasStoredProtocol("x")).toBe(true);
  });

  it("returns false for null", () => {
    expect(hasStoredProtocol(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasStoredProtocol(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasStoredProtocol("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(hasStoredProtocol("   \n\t  ")).toBe(false);
  });

  it("returns true for a string with leading/trailing whitespace and content", () => {
    expect(hasStoredProtocol("  valid draft  ")).toBe(true);
  });

  it("acts as a type narrowing guard (TypeScript: narrows to string)", () => {
    const draft: string | null = "# Protocol";
    if (hasStoredProtocol(draft)) {
      // TypeScript should infer draft as string here
      const upper: string = draft.toUpperCase();
      expect(upper).toBe("# PROTOCOL");
    }
  });
});
