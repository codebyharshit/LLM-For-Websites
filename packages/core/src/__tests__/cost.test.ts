import { describe, it, expect } from "vitest";
import { estimateCost, percentile } from "../cost.js";

describe("estimateCost", () => {
  it("prices known models by tokens in/out", () => {
    // gemini-2.5-flash: 1M in @0.30 + 1M out @2.50 = 2.80
    expect(estimateCost("gemini-2.5-flash", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 6);
  });
  it("returns 0 for unknown/none/fake models", () => {
    expect(estimateCost("none", 1000, 1000)).toBe(0);
    expect(estimateCost("fake", 1000, 1000)).toBe(0);
  });
});

describe("percentile", () => {
  it("computes nearest-rank percentiles", () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
  });
});
