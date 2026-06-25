import { describe, it, expect } from "vitest";
import { classicalSampleSize, classicalSelection } from "./classical";
import type { ClassicalParam, SP2DRow } from "@/types";

const baseParam: ClassicalParam = {
  populationSize: 1000,
  confidenceLevel: 0.95,
  estimator: "mpu",
  expectedStdev: 5_000_000,
  tolerableMisstatement: 500_000_000,
  expectedMisstatement: 50_000_000,
  allowanceFraction: 0.5,
  seed: 42,
};

describe("classicalSampleSize", () => {
  it("MPU formula sound: A = (TM−EM)×(1−frac)", () => {
    const r = classicalSampleSize(baseParam);
    // A = (500jt - 50jt) × 0.5 = 225jt
    expect(r.precision).toBeCloseTo(225_000_000, 0);
    expect(r.effectiveTM).toBe(450_000_000);
    expect(r.n).toBeGreaterThan(0);
    expect(r.n).toBeLessThanOrEqual(baseParam.populationSize);
  });

  it("higher allowanceFraction → tighter precision → larger n", () => {
    const looser = classicalSampleSize({ ...baseParam, allowanceFraction: 0.3 });
    const tighter = classicalSampleSize({ ...baseParam, allowanceFraction: 0.7 });
    expect(tighter.n).toBeGreaterThan(looser.n);
  });

  it("higher confidence → larger n", () => {
    expect(classicalSampleSize({ ...baseParam, confidenceLevel: 0.99 }).n).toBeGreaterThan(
      classicalSampleSize({ ...baseParam, confidenceLevel: 0.95 }).n,
    );
  });

  it("higher stdev → larger n (more variance to detect)", () => {
    const higherSigma = classicalSampleSize({
      ...baseParam,
      expectedStdev: 10_000_000,
    });
    expect(higherSigma.n).toBeGreaterThan(classicalSampleSize(baseParam).n);
  });

  it("throws kalau expectedMisstatement >= tolerable", () => {
    expect(() =>
      classicalSampleSize({ ...baseParam, expectedMisstatement: 500_000_000 }),
    ).toThrow();
  });

  it("throws kalau allowanceFraction out of range", () => {
    expect(() =>
      classicalSampleSize({ ...baseParam, allowanceFraction: 1.2 }),
    ).toThrow();
    expect(() =>
      classicalSampleSize({ ...baseParam, allowanceFraction: -0.1 }),
    ).toThrow();
  });

  it("throws kalau planned precision <= 0", () => {
    expect(() =>
      classicalSampleSize({
        ...baseParam,
        tolerableMisstatement: 100_000_000,
        expectedMisstatement: 100_000_000,
      }),
    ).toThrow();
  });
});

function makePop(count: number): SP2DRow[] {
  return Array.from({ length: count }, (_, i) => ({
    no_sp2d: `SP2D-${String(i + 1).padStart(5, "0")}`,
    tgl_sp2d: "2025-01-15",
    nilai: 1_000_000 + i * 1000,
    _idx: i,
  }));
}

describe("classicalSelection", () => {
  it("reproducible per seed", () => {
    const pop = makePop(500);
    const a = classicalSelection(pop, baseParam);
    const b = classicalSelection(pop, baseParam);
    expect(a.selectedItems.map((s) => s.row.no_sp2d)).toEqual(
      b.selectedItems.map((s) => s.row.no_sp2d),
    );
  });

  it("citation merujuk AICPA Audit Guide", () => {
    const r = classicalSelection(makePop(200), baseParam);
    expect(r.rfSource).toContain("AICPA");
  });
});
