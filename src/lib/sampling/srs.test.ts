import { describe, it, expect } from "vitest";
import { srsSampleSize, srsSelection } from "./srs";
import type { SRSParam, SP2DRow } from "@/types";

const base: SRSParam = {
  populationSize: 1000,
  confidenceLevel: 0.95,
  expectedDeviation: 0.01,
  tolerableDeviation: 0.05,
  seed: 7,
};

describe("SRS sample size", () => {
  it("Normal approx + FPC", () => {
    const r = srsSampleSize(base);
    expect(r.n).toBeGreaterThan(0);
    expect(r.n).toBeLessThanOrEqual(base.populationSize);
  });

  it("higher confidence → larger n", () => {
    expect(srsSampleSize({ ...base, confidenceLevel: 0.99 }).n).toBeGreaterThan(
      srsSampleSize(base).n,
    );
  });

  it("narrower precision → larger n", () => {
    const narrow: SRSParam = { ...base, tolerableDeviation: 0.02 };
    expect(srsSampleSize(narrow).n).toBeGreaterThan(srsSampleSize(base).n);
  });

  it("throws kalau expected >= tolerable", () => {
    expect(() => srsSampleSize({ ...base, expectedDeviation: 0.05 })).toThrow();
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

describe("SRS selection", () => {
  it("reproducible per seed", () => {
    const pop = makePop(500);
    const a = srsSelection(pop, base);
    const b = srsSelection(pop, base);
    expect(a.selectedItems.map((s) => s.row.no_sp2d)).toEqual(
      b.selectedItems.map((s) => s.row.no_sp2d),
    );
  });

  it("sample size match calc", () => {
    const pop = makePop(800);
    const sized = srsSampleSize({ ...base, populationSize: 800 });
    const result = srsSelection(pop, base);
    expect(result.sampleSize).toBe(sized.n);
  });

  it("seeds berbeda → selection berbeda", () => {
    const pop = makePop(300);
    const a = srsSelection(pop, { ...base, seed: 1 });
    const b = srsSelection(pop, { ...base, seed: 999 });
    const setA = new Set(a.selectedItems.map((s) => s.row.no_sp2d));
    const setB = new Set(b.selectedItems.map((s) => s.row.no_sp2d));
    expect(setA.size).toBe(setB.size);
    // some overlap acceptable, but tidak persis sama
    const intersection = [...setA].filter((x) => setB.has(x));
    expect(intersection.length).toBeLessThan(setA.size);
  });
});
