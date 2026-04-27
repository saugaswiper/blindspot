import { describe, it, expect } from "vitest";
import { validateSearchInput } from "./validators";

describe("validateSearchInput — simple mode", () => {
  it("passes with a valid query", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia" });
    expect(result.success).toBe(true);
  });

  it("fails when queryText is empty", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.queryText).toBeDefined();
  });

  it("fails when queryText is too short", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CB" });
    expect(result.success).toBe(false);
  });
});

describe("validateSearchInput — PICO mode", () => {
  it("passes with population, intervention, and outcome", () => {
    const result = validateSearchInput({
      mode: "pico",
      pico: { population: "adults over 65", intervention: "CBT", outcome: "sleep quality" },
    });
    expect(result.success).toBe(true);
  });

  it("passes when comparison is omitted (it is optional)", () => {
    const result = validateSearchInput({
      mode: "pico",
      pico: { population: "children", intervention: "mindfulness", outcome: "anxiety" },
    });
    expect(result.success).toBe(true);
  });

  it("fails when population is missing", () => {
    const result = validateSearchInput({
      mode: "pico",
      pico: { population: "", intervention: "CBT", outcome: "sleep" },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors["pico.population"]).toBeDefined();
  });

  it("fails when intervention is missing", () => {
    const result = validateSearchInput({
      mode: "pico",
      pico: { population: "adults", intervention: "", outcome: "sleep" },
    });
    expect(result.success).toBe(false);
  });

  it("fails when outcome is missing", () => {
    const result = validateSearchInput({
      mode: "pico",
      pico: { population: "adults", intervention: "CBT", outcome: "" },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ACC-8: minYear validation
// ---------------------------------------------------------------------------

describe("validateSearchInput — minYear (ACC-8)", () => {
  it("passes when minYear is absent (all time — default)", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia" });
    expect(result.success).toBe(true);
  });

  it("passes when minYear is a valid year (e.g. 2020)", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia", minYear: 2020 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.minYear).toBe(2020);
  });

  it("passes when minYear is the boundary year 1990", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia", minYear: 1990 });
    expect(result.success).toBe(true);
  });

  it("fails when minYear is before 1990", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia", minYear: 1985 });
    expect(result.success).toBe(false);
  });

  it("fails when minYear is in the future", () => {
    const futureYear = new Date().getFullYear() + 1;
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia", minYear: futureYear });
    expect(result.success).toBe(false);
  });

  it("fails when minYear is a float", () => {
    const result = validateSearchInput({ mode: "simple", queryText: "CBT for insomnia", minYear: 2020.5 });
    expect(result.success).toBe(false);
  });

  it("passes with PICO mode and a valid minYear", () => {
    const result = validateSearchInput({
      mode: "pico",
      pico: { population: "adults", intervention: "CBT", outcome: "sleep" },
      minYear: 2018,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.minYear).toBe(2018);
  });
});
