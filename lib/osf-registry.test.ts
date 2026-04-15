/**
 * Unit tests for lib/osf-registry.ts
 * Tests pure functions only — no network calls.
 */

import { describe, it, expect } from "vitest";
import { formatOSFStatus, formatOSFWarning } from "./osf-registry";

// ---------------------------------------------------------------------------
// formatOSFStatus
// ---------------------------------------------------------------------------

describe("formatOSFStatus", () => {
  it("returns 'No match' and hasMatch=false when count is 0", () => {
    const result = formatOSFStatus(0);
    expect(result.label).toBe("No match");
    expect(result.hasMatch).toBe(false);
  });

  it("returns '1 match' and hasMatch=true when count is 1", () => {
    const result = formatOSFStatus(1);
    expect(result.label).toBe("1 match");
    expect(result.hasMatch).toBe(true);
  });

  it("returns 'N matches' and hasMatch=true when count is 2", () => {
    const result = formatOSFStatus(2);
    expect(result.label).toBe("2 matches");
    expect(result.hasMatch).toBe(true);
  });

  it("returns correct label for large counts", () => {
    const result = formatOSFStatus(47);
    expect(result.label).toBe("47 matches");
    expect(result.hasMatch).toBe(true);
  });

  it("hasMatch is false only when count is exactly 0", () => {
    expect(formatOSFStatus(0).hasMatch).toBe(false);
    expect(formatOSFStatus(1).hasMatch).toBe(true);
    expect(formatOSFStatus(100).hasMatch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatOSFWarning
// ---------------------------------------------------------------------------

describe("formatOSFWarning", () => {
  it("returns empty string when count is 0", () => {
    expect(formatOSFWarning(0)).toBe("");
  });

  it("returns singular phrasing when count is 1", () => {
    const msg = formatOSFWarning(1);
    expect(msg).toContain("1 systematic review protocol");
    expect(msg).toContain("OSF Registries");
    expect(msg).not.toContain("protocols");
  });

  it("returns plural phrasing when count > 1", () => {
    const msg = formatOSFWarning(5);
    expect(msg).toContain("5 systematic review protocols");
    expect(msg).toContain("OSF Registries");
  });

  it("includes a warning symbol for non-zero counts", () => {
    expect(formatOSFWarning(1)).toContain("⚠");
    expect(formatOSFWarning(10)).toContain("⚠");
  });

  it("does not include a warning symbol for zero count", () => {
    expect(formatOSFWarning(0)).not.toContain("⚠");
  });
});
