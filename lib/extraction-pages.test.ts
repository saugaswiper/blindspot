import { describe, it, expect } from "vitest";
import { splitIntoPages } from "./extraction-pages";

describe("splitIntoPages", () => {
  it("splits on form feeds with 1-based page numbers", () => {
    expect(splitIntoPages("one\ftwo\fthree")).toEqual([
      { page: 1, text: "one" },
      { page: 2, text: "two" },
      { page: 3, text: "three" },
    ]);
  });

  it("keeps source page numbers when blank pages are dropped", () => {
    expect(splitIntoPages("a\f  \f b \f")).toEqual([
      { page: 1, text: "a" },
      { page: 3, text: "b" },
    ]);
  });

  it("returns an empty list for empty input", () => {
    expect(splitIntoPages("")).toEqual([]);
  });
});
