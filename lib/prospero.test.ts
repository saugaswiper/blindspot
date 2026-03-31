import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchProspero, formatProsperoWarning, isQuerySubstantialEnough } from "./prospero";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("prospero", () => {
  describe("formatProsperoWarning", () => {
    it("returns empty string when count is 0", () => {
      expect(formatProsperoWarning(0)).toBe("");
    });

    it("formats singular warning for count = 1", () => {
      expect(formatProsperoWarning(1)).toBe(
        "⚠ 1 systematic review may already be registered on PROSPERO for this topic.",
      );
    });

    it("formats plural warning for count > 1", () => {
      expect(formatProsperoWarning(2)).toBe(
        "⚠ 2 systematic reviews may already be registered on PROSPERO for this topic.",
      );
      expect(formatProsperoWarning(10)).toBe(
        "⚠ 10 systematic reviews may already be registered on PROSPERO for this topic.",
      );
    });
  });

  describe("isQuerySubstantialEnough", () => {
    it("returns false for empty or whitespace-only queries", () => {
      expect(isQuerySubstantialEnough("")).toBe(false);
      expect(isQuerySubstantialEnough("   ")).toBe(false);
    });

    it("returns false for single-word queries", () => {
      expect(isQuerySubstantialEnough("depression")).toBe(false);
    });

    it("returns false for very short two-word queries", () => {
      expect(isQuerySubstantialEnough("a b")).toBe(false);
    });

    it("returns true for multi-word queries with sufficient length", () => {
      expect(isQuerySubstantialEnough("cognitive behavioral therapy")).toBe(
        true,
      );
      expect(isQuerySubstantialEnough("CBT insomnia children")).toBe(true);
      expect(
        isQuerySubstantialEnough(
          "effectiveness of cognitive behavioral therapy",
        ),
      ).toBe(true);
    });

    it("returns true for two-word queries with sufficient length", () => {
      expect(isQuerySubstantialEnough("systematic review")).toBe(true);
      expect(isQuerySubstantialEnough("cardiac surgery")).toBe(true);
    });

    it("handles whitespace variations", () => {
      expect(isQuerySubstantialEnough("  depression   anxiety  ")).toBe(true);
      expect(isQuerySubstantialEnough("\t cognitive \n therapy")).toBe(true);
    });
  });

  describe("searchProspero", () => {
    it("returns 0 for empty queries", async () => {
      const result = await searchProspero("");
      expect(result).toBe(0);
    });

    it("returns 0 for whitespace-only queries", async () => {
      const result = await searchProspero("   ");
      expect(result).toBe(0);
    });

    it("handles network errors gracefully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error")),
      );

      const result = await searchProspero("depression anxiety");
      expect(result).toBe(0);
    });

    it("handles non-200 responses by returning 0", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
        }),
      );

      const result = await searchProspero("depression anxiety");
      expect(result).toBe(0);
    });

    it("parses successful API response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            total: 3,
            records: [
              { id: "12345", title: "CBT for anxiety", status: "Active" },
              { id: "12346", title: "CBT for depression", status: "Active" },
              { id: "12347", title: "Mindfulness for anxiety", status: "Active" },
            ],
          }),
        }),
      );

      const result = await searchProspero("anxiety depression");
      expect(result).toBe(3);
    });

    it("handles malformed API responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
        }),
      );

      const result = await searchProspero("depression anxiety");
      expect(result).toBe(0);
    });

    it("handles missing total field in response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            records: [],
          }),
        }),
      );

      const result = await searchProspero("depression anxiety");
      expect(result).toBe(0);
    });
  });
});
