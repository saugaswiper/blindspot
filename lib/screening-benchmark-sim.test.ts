import { describe, it, expect } from "vitest";
import { screenedToReach, summarize, orderMetrics, randomOrder, activeLearningRun, rng } from "./screening-benchmark-sim";

describe("screening-benchmark-sim", () => {
  it("screenedToReach counts the fraction screened at the target", () => {
    const order = [true, false, false, true, false, false, false, false, false, false];
    expect(screenedToReach(order, 0.5)).toBeCloseTo(0.1);
    expect(screenedToReach(order, 1)).toBeCloseTo(0.4);
    expect(screenedToReach([false, false], 0.95)).toBe(1);
  });

  it("summarize reports median, worst and mean", () => {
    expect(summarize([1, 2, 9])).toEqual({ median: 2, worst: 1, mean: 4 });
    expect(summarize([1, 2, 9, 10], false)).toEqual({ median: 5.5, worst: 10, mean: 5.5 });
  });

  it("orderMetrics is perfect for a perfect order", () => {
    const order = [...Array(5).fill(true), ...Array(95).fill(false)];
    const m = orderMetrics(order);
    expect(m.recallAt10).toBe(1);
    expect(m.screenedTo95).toBeCloseTo(0.05);
    expect(m.wss95).toBeCloseTo(0.9);
  });

  it("randomOrder is a seeded permutation", () => {
    const labels = Array.from({ length: 50 }, (_, i) => i % 10 === 0);
    const a = randomOrder(labels, 1);
    expect(a).toEqual(randomOrder(labels, 1));
    expect(a.filter(Boolean).length).toBe(5);
    expect(rng(3)()).toBe(rng(3)());
  });

  it("activeLearningRun on a separable synthetic pool beats random and is deterministic", () => {
    const records = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      title: i % 10 === 0 ? `randomised trial of drug alpha ${i}` : `case report of surgery beta ${i}`,
      abstract: i % 10 === 0 ? "placebo controlled randomised outcome" : "single patient narrative",
    }));
    const labels = records.map((_, i) => i % 10 === 0);
    const run = activeLearningRun(records, labels, 1);
    expect(run.order.length).toBe(200);
    expect(run.order.filter(Boolean).length).toBe(20);
    expect(orderMetrics(run.order).wss95).toBeGreaterThan(0.4);
    expect(activeLearningRun(records, labels, 1).order).toEqual(run.order);
    expect(run.rankCalls).toBeGreaterThan(1);
  });
});
