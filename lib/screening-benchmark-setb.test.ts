import { describe, it, expect } from "vitest";
import { parseCsv, splitTagged, parseSetBReview, reviewIdFromFile } from "./screening-benchmark-setb";

// Synthetic fixture: no real record text.
const PROTO = "[RTI] Synthetic review title [BG] Background words. [OBJ] To test the loader. [SEL] Adults, randomised trials.";
const csv =
  ',Publication Year,Author,Review_data,Title_Abstract,included\r\n' +
  `0,2020,"A, B",${JSON.stringify(PROTO)},"[TIT] Alpha, ""quoted"" [ABS] Line one\nline two",True\r\n` +
  `1,2021,C,${JSON.stringify(PROTO)},[TIT] Beta [ABS] ,False\r\n` +
  `2,2022,D,${JSON.stringify(PROTO)},[TIT] Gamma [ABS] Some text,False\r\n`;

describe("parseCsv", () => {
  it("handles quotes, embedded commas/newlines and CRLF", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[1][2]).toBe("A, B");
    expect(rows[1][4]).toBe('[TIT] Alpha, "quoted" [ABS] Line one\nline two');
  });
});

describe("splitTagged", () => {
  it("splits tagged sections", () => {
    expect(splitTagged(PROTO)).toMatchObject({ RTI: "Synthetic review title", OBJ: "To test the loader." });
  });
  it("returns empty for untagged text", () => {
    expect(splitTagged("plain")).toEqual({});
  });
});

describe("parseSetBReview", () => {
  const review = parseSetBReview("CD000001", csv);
  it("extracts the protocol once", () => {
    expect(review.protocol).toEqual({
      title: "Synthetic review title",
      objectives: "To test the loader.",
      criteria: "Adults, randomised trials.",
    });
  });
  it("normalises records and labels", () => {
    expect(review.records.map((r) => r.label)).toEqual([true, false, false]);
    expect(review.records[0].title).toBe('Alpha, "quoted"');
    expect(review.records[0].id).toBe("CD000001:0");
  });
  it("maps a missing abstract to null", () => {
    expect(review.records[1].abstract).toBeNull();
    expect(review.records[2].abstract).toBe("Some text");
  });
  it("throws on a missing required column", () => {
    expect(() => parseSetBReview("CD000001", "a,b\n1,2\n")).toThrow(/missing column/);
  });
});

describe("reviewIdFromFile", () => {
  it("accepts Set B file names only", () => {
    expect(reviewIdFromFile("CD013377_data_cleaned.csv")).toBe("CD013377");
    expect(reviewIdFromFile("notes.csv")).toBeNull();
  });
});

describe("hygiene", () => {
  // Skipped when the local cache is absent (CI). Fails if any committed benchmark/manifest
  // file contains a record title or abstract from the loaded data.
  it("committed files contain no record text", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = path.join(os.homedir(), ".cache", "blindspot", "chan2025", "x");
    if (!fs.existsSync(dir)) return;
    const roots = ["models", "spec/benchmarks"].filter((d) => fs.existsSync(d));
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
      );
    const committed = roots.flatMap(walk).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    for (const f of fs.readdirSync(dir)) {
      const id = reviewIdFromFile(f);
      if (!id) continue;
      const review = parseSetBReview(id, fs.readFileSync(path.join(dir, f), "utf8"));
      for (const r of review.records) {
        if (r.title.length >= 20) expect(committed.includes(r.title)).toBe(false);
        if (r.abstract && r.abstract.length >= 40) expect(committed.includes(r.abstract.slice(0, 80))).toBe(false);
      }
    }
  }, 60000);

  it("loads all 22 cached Set B reviews with includes (skipped without cache)", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = path.join(os.homedir(), ".cache", "blindspot", "chan2025", "x");
    if (!fs.existsSync(dir)) return;
    const manifest = JSON.parse(fs.readFileSync("models/heldout/chan2025-setb.json", "utf8"));
    const ids = fs.readdirSync(dir).map(reviewIdFromFile).filter((x): x is string => !!x).sort();
    expect(ids).toEqual(manifest.reviewIds);
    for (const id of ids) {
      const rv = parseSetBReview(id, fs.readFileSync(path.join(dir, `${id}_data_cleaned.csv`), "utf8"));
      expect(rv.records.some((r) => r.label)).toBe(true);
      expect(rv.protocol.criteria.length).toBeGreaterThan(0);
    }
  }, 60000);
});
