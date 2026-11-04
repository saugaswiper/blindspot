/**
 * Brief 017 AC3: per-call `rankRecords` latency after warm-up, on synthetic records.
 * Run: npx tsx scripts/bench-ranker-latency.ts [--n 3000] [--train 300,600,1200] [--reps 5]
 * Synthetic text (Zipf-ish vocabulary) stands in for abstracts; real Set B timings
 * are in scripts/benchmark-setb.ts. Seeded, so repeatable up to machine noise.
 */
import { rankRecords, type RankRecord, type RankVerdict } from "../lib/screening-ranker";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg("n", "3000"));
const trains = arg("train", "300,600,1200").split(",").map(Number);
const reps = Number(arg("reps", "5"));

let s = 12345;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const vocab = Array.from({ length: 8000 }, (_, i) => `term${i}`);
const word = () => vocab[Math.floor(vocab.length * rnd() ** 2.5)];
const records: RankRecord[] = Array.from({ length: n }, (_, i) => ({
  id: String(i),
  title: Array.from({ length: 12 }, word).join(" "),
  abstract: Array.from({ length: 150 }, word).join(" "),
}));

const t0 = performance.now();
rankRecords(records, [{ id: "0", verdict: "include" }, { id: "1", verdict: "exclude" }]);
console.log(`n=${n} first call (vectorise + fit): ${(performance.now() - t0).toFixed(0)} ms`);

for (const m of trains) {
  const verdicts: RankVerdict[] = records.slice(0, Math.min(m, n)).map((r, i) => ({ id: r.id, verdict: i % 10 === 0 ? "include" : "exclude" }));
  const times: number[] = [];
  for (let r = 0; r < reps; r++) {
    const t = performance.now();
    rankRecords(records, verdicts);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(`train=${verdicts.length}: median ${times[Math.floor(reps / 2)].toFixed(0)} ms, max ${times[reps - 1].toFixed(0)} ms (${reps} warm calls)`);
}
