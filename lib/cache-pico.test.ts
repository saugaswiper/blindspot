/**
 * lib/cache-pico.test.ts
 *
 * Unit tests for the PICO-1 change: `buildSearchInsertPayload` correctly
 * includes PICO fields in the searches INSERT payload when provided, and
 * omits them when absent or null/empty.
 *
 * These tests cover the pure helper only — Supabase I/O is not exercised.
 */

import { describe, it, expect } from "vitest";
import { buildSearchInsertPayload } from "@/lib/cache";

// ---------------------------------------------------------------------------
// buildSearchInsertPayload
// ---------------------------------------------------------------------------

describe("buildSearchInsertPayload", () => {
  const BASE = { user_id: "user-123", query_text: "CBT insomnia elderly" };

  describe("when pico is undefined", () => {
    it("returns base payload unchanged", () => {
      const result = buildSearchInsertPayload(BASE);
      expect(result).toEqual(BASE);
    });

    it("does not add any pico_* keys", () => {
      const result = buildSearchInsertPayload(BASE);
      expect(Object.keys(result)).not.toContain("pico_population");
      expect(Object.keys(result)).not.toContain("pico_intervention");
      expect(Object.keys(result)).not.toContain("pico_comparison");
      expect(Object.keys(result)).not.toContain("pico_outcome");
    });
  });

  describe("when pico is an empty object", () => {
    it("returns base payload unchanged (no undefined keys written)", () => {
      const result = buildSearchInsertPayload(BASE, {});
      expect(result).toEqual(BASE);
    });
  });

  describe("when pico has null / empty fields", () => {
    it("does not write null population", () => {
      const result = buildSearchInsertPayload(BASE, { population: null });
      expect(Object.keys(result)).not.toContain("pico_population");
    });

    it("does not write null intervention", () => {
      const result = buildSearchInsertPayload(BASE, { intervention: null });
      expect(Object.keys(result)).not.toContain("pico_intervention");
    });

    it("does not write null comparison (optional C in PICO)", () => {
      const result = buildSearchInsertPayload(BASE, { comparison: null });
      expect(Object.keys(result)).not.toContain("pico_comparison");
    });

    it("does not write null outcome", () => {
      const result = buildSearchInsertPayload(BASE, { outcome: null });
      expect(Object.keys(result)).not.toContain("pico_outcome");
    });
  });

  describe("when pico has full fields (all four set)", () => {
    const FULL_PICO = {
      population: "Adults aged 65+",
      intervention: "Cognitive behavioural therapy",
      comparison: "Sleep hygiene education",
      outcome: "Sleep quality (PSQI score)",
    };

    it("includes pico_population in the payload", () => {
      const result = buildSearchInsertPayload(BASE, FULL_PICO);
      expect(result.pico_population).toBe(FULL_PICO.population);
    });

    it("includes pico_intervention in the payload", () => {
      const result = buildSearchInsertPayload(BASE, FULL_PICO);
      expect(result.pico_intervention).toBe(FULL_PICO.intervention);
    });

    it("includes pico_comparison in the payload", () => {
      const result = buildSearchInsertPayload(BASE, FULL_PICO);
      expect(result.pico_comparison).toBe(FULL_PICO.comparison);
    });

    it("includes pico_outcome in the payload", () => {
      const result = buildSearchInsertPayload(BASE, FULL_PICO);
      expect(result.pico_outcome).toBe(FULL_PICO.outcome);
    });

    it("preserves all base fields alongside PICO fields", () => {
      const result = buildSearchInsertPayload(BASE, FULL_PICO);
      expect(result.user_id).toBe(BASE.user_id);
      expect(result.query_text).toBe(BASE.query_text);
    });
  });

  describe("when comparison is omitted (PIco without C)", () => {
    const PICO_NO_C = {
      population: "Adults with type 2 diabetes",
      intervention: "SGLT2 inhibitors",
      outcome: "HbA1c reduction",
    };

    it("writes P, I, O but not comparison", () => {
      const result = buildSearchInsertPayload(BASE, PICO_NO_C);
      expect(result.pico_population).toBe(PICO_NO_C.population);
      expect(result.pico_intervention).toBe(PICO_NO_C.intervention);
      expect(result.pico_outcome).toBe(PICO_NO_C.outcome);
      expect(Object.keys(result)).not.toContain("pico_comparison");
    });
  });

  describe("does not mutate the base object", () => {
    it("returns a new object rather than modifying base", () => {
      const base = { user_id: "u", query_text: "q" };
      buildSearchInsertPayload(base, { population: "Adults" });
      expect(Object.keys(base)).not.toContain("pico_population");
    });
  });

  describe("guest search payload (user_id = null)", () => {
    const GUEST_BASE = {
      user_id: null,
      query_text: "telemedicine chronic pain",
      guest_ip_hash: "abc123",
    };

    it("stores pico fields alongside guest-specific fields", () => {
      const result = buildSearchInsertPayload(GUEST_BASE, {
        population: "Adults with chronic pain",
        intervention: "Telemedicine consultations",
        outcome: "Pain intensity reduction",
      });
      expect(result.user_id).toBeNull();
      expect(result.guest_ip_hash).toBe("abc123");
      expect(result.pico_population).toBe("Adults with chronic pain");
      expect(result.pico_outcome).toBe("Pain intensity reduction");
    });
  });
});
