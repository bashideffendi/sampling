import { describe, it, expect } from "vitest";
import { reliabilityFactor, incrementalAllowance, zScore } from "./rf-table";

describe("AICPA Reliability Factor table", () => {
  it("RF 95% c=0 = 3.00 (Poisson upper bound)", () => {
    expect(reliabilityFactor(0.95, 0)).toBeCloseTo(3.0, 2);
  });

  it("RF 90% c=0 = 2.31", () => {
    expect(reliabilityFactor(0.9, 0)).toBeCloseTo(2.31, 2);
  });

  it("RF 99% c=0 = 4.61", () => {
    expect(reliabilityFactor(0.99, 0)).toBeCloseTo(4.61, 2);
  });

  it("RF 95% c=1 = 4.75 (vs c=0: incremental ~1.75)", () => {
    expect(reliabilityFactor(0.95, 1)).toBeCloseTo(4.75, 2);
    expect(incrementalAllowance(0.95, 1)).toBeCloseTo(1.75, 2);
  });

  it("RF monotonic in c", () => {
    for (const conf of [0.9, 0.95, 0.99] as const) {
      let prev = 0;
      for (let c = 0; c < 8; c++) {
        const rf = reliabilityFactor(conf, c);
        expect(rf).toBeGreaterThan(prev);
        prev = rf;
      }
    }
  });

  it("RF monotonic in confidence (higher conf → higher RF)", () => {
    for (let c = 0; c < 6; c++) {
      expect(reliabilityFactor(0.95, c)).toBeGreaterThan(reliabilityFactor(0.9, c));
      expect(reliabilityFactor(0.99, c)).toBeGreaterThan(reliabilityFactor(0.95, c));
    }
  });

  it("zScore standard values", () => {
    expect(zScore(0.9)).toBeCloseTo(1.645, 3);
    expect(zScore(0.95)).toBeCloseTo(1.96, 3);
    expect(zScore(0.99)).toBeCloseTo(2.576, 3);
  });
});
