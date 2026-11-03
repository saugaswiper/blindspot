import { describe, it, expect } from "vitest";
import { announceVerdict, isKeyInScope, parseSpeedModeKey, toggleVerdict } from "./screening-speed-mode";

describe("parseSpeedModeKey", () => {
  it("maps navigation, verdict, reasoning and escape keys", () => {
    expect(parseSpeedModeKey("j")).toEqual({ kind: "move", delta: 1 });
    expect(parseSpeedModeKey("ArrowDown")).toEqual({ kind: "move", delta: 1 });
    expect(parseSpeedModeKey("k")).toEqual({ kind: "move", delta: -1 });
    expect(parseSpeedModeKey("ArrowUp")).toEqual({ kind: "move", delta: -1 });
    expect(parseSpeedModeKey("y")).toEqual({ kind: "verdict", verdict: "include" });
    expect(parseSpeedModeKey("n")).toEqual({ kind: "verdict", verdict: "exclude" });
    expect(parseSpeedModeKey("u")).toEqual({ kind: "verdict", verdict: "uncertain" });
    expect(parseSpeedModeKey("r")).toEqual({ kind: "reasoning" });
    expect(parseSpeedModeKey("Escape")).toEqual({ kind: "escape" });
  });
  it("ignores other keys", () => {
    expect(parseSpeedModeKey("a")).toBeNull();
    expect(parseSpeedModeKey("Tab")).toBeNull();
  });
});

describe("isKeyInScope (AC1)", () => {
  it("is false for body with no active row, and for focus outside the region", () => {
    expect(isKeyInScope({ insideRegion: false, targetIsBody: true, hasActiveRow: false })).toBe(false);
    expect(isKeyInScope({ insideRegion: false, targetIsBody: false, hasActiveRow: true })).toBe(false);
  });
  it("is true inside the region, or on body while a row is active", () => {
    expect(isKeyInScope({ insideRegion: true, targetIsBody: false, hasActiveRow: false })).toBe(true);
    expect(isKeyInScope({ insideRegion: false, targetIsBody: true, hasActiveRow: true })).toBe(true);
  });
});

describe("toggleVerdict", () => {
  it("clears when the same verdict is pressed, otherwise sets it", () => {
    expect(toggleVerdict("include", "include")).toBeNull();
    expect(toggleVerdict(null, "include")).toBe("include");
    expect(toggleVerdict("exclude", "uncertain")).toBe("uncertain");
  });
});

describe("announceVerdict (AC4)", () => {
  it("states row position, total and the effect", () => {
    expect(announceVerdict(12, 3042, "include")).toBe("Row 12 of 3,042: Include recorded");
    expect(announceVerdict(12, 3042, null)).toBe("Row 12 of 3,042: human decision cleared");
  });
});
