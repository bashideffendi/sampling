import { describe, it, expect } from "vitest";
import { discoverySampleSize, discoverySelection } from "./discovery";
import type { DiscoveryParam, SP2DRow } from "@/types";

const baseParam: DiscoveryParam = {
  populationSize: 10000,
  confidenceLevel: 0.95,
  expectedOccurrenceRate: 0.005, // 0.5% baseline fraud
  seed: 42,
};

describe("discoverySampleSize", () => {
  it("formula: n = ceil(ln(α)/ln(1−p))", () => {
    const r = discoverySampleSize(baseParam);
    // α = 0.05, ln(0.05) ≈ -2.996, ln(1-0.005)=-0.005012, n ≈ 597.7 → 598
    expect(r.n).toBe(598);
    expect(r.alpha).toBeCloseTo(0.05, 4);
  });

  it("higher confidence → larger n", () => {
    expect(discoverySampleSize({ ...baseParam, confidenceLevel: 0.99 }).n).toBeGreaterThan(
      discoverySampleSize(baseParam).n,
    );
  });

  it("lower expected rate → larger n (sparse needle)", () => {
    const rare = discoverySampleSize({
      ...baseParam,
      expectedOccurrenceRate: 0.001,
    });
    expect(rare.n).toBeGreaterThan(discoverySampleSize(baseParam).n);
  });

  it("capped to populationSize", () => {
    const small = discoverySampleSize({ ...baseParam, populationSize: 100 });
    expect(small.n).toBeLessThanOrEqual(100);
  });

  it("throws kalau p <= 0", () => {
    expect(() =>
      discoverySampleSize({ ...baseParam, expectedOccurrenceRate: 0 }),
    ).toThrow();
    expect(() =>
      discoverySampleSize({ ...baseParam, expectedOccurrenceRate: -0.01 }),
    ).toThrow();
  });

  it("throws kalau p >= 1", () => {
    expect(() =>
      discoverySampleSize({ ...baseParam, expectedOccurrenceRate: 1 }),
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

describe("discoverySelection", () => {
  it("reproducible per seed", () => {
    const pop = makePop(5000);
    const a = discoverySelection(pop, baseParam);
    const b = discoverySelection(pop, baseParam);
    expect(a.selectedItems.map((s) => s.row.no_sp2d)).toEqual(
      b.selectedItems.map((s) => s.row.no_sp2d),
    );
  });

  it("warning kalau n >= 50% populasi", () => {
    const pop = makePop(100);
    const r = discoverySelection(pop, {
      ...baseParam,
      populationSize: 100,
      expectedOccurrenceRate: 0.01,
    });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
