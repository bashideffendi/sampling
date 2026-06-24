import { describe, it, expect } from "vitest";
import { musSampleSize, musSelection } from "./mus";
import type { MUSParam, SP2DRow } from "@/types";

const baseParam: MUSParam = {
  bookValue: 10_000_000_000, // Rp 10 M
  tolerableMisstatement: 500_000_000, // Rp 500 jt
  expectedMisstatement: 0,
  confidenceLevel: 0.95,
  seed: 42,
  includeNegativeAs100Pct: false,
};

describe("MUS sample size", () => {
  it("EM=0 95% → n = ceil(BV × 3.0 / TM)", () => {
    const r = musSampleSize(baseParam);
    // 10_000_000_000 × 3.0 / 500_000_000 = 60
    expect(r.n).toBe(60);
    expect(r.interval).toBeCloseTo(500_000_000 / 3.0, 0);
    expect(r.rf).toBeCloseTo(3.0, 2);
  });

  it("EM > 0 → n bertambah dengan expansion factor", () => {
    const a = musSampleSize(baseParam).n;
    const b = musSampleSize({ ...baseParam, expectedMisstatement: 100_000_000 }).n;
    expect(b).toBeGreaterThan(a);
  });

  it("higher confidence → larger n", () => {
    const at90 = musSampleSize({ ...baseParam, confidenceLevel: 0.9 }).n;
    const at95 = musSampleSize({ ...baseParam, confidenceLevel: 0.95 }).n;
    const at99 = musSampleSize({ ...baseParam, confidenceLevel: 0.99 }).n;
    expect(at95).toBeGreaterThan(at90);
    expect(at99).toBeGreaterThan(at95);
  });

  it("interval = TM / RF (bukan TM adjusted)", () => {
    const r = musSampleSize(baseParam);
    expect(r.interval).toBeCloseTo(500_000_000 / 3.0, 0);
  });

  it("throws kalau TM <= EF × EM", () => {
    expect(() =>
      musSampleSize({ ...baseParam, expectedMisstatement: 500_000_000 }),
    ).toThrow();
  });
});

function makePopulasi(count: number, distribution: "uniform" | "skewed"): SP2DRow[] {
  const rows: SP2DRow[] = [];
  for (let i = 0; i < count; i++) {
    const nilai =
      distribution === "uniform"
        ? 5_000_000 + i * 100_000
        : Math.round(1_000_000 * (i + 1) ** 1.5);
    rows.push({
      no_sp2d: `SP2D-${String(i + 1).padStart(5, "0")}`,
      tgl_sp2d: "2025-01-15",
      nilai,
      _idx: i,
    });
  }
  return rows;
}

describe("MUS selection", () => {
  it("reproducible per seed", () => {
    const pop = makePopulasi(200, "skewed");
    const r1 = musSelection(pop, baseParam);
    const r2 = musSelection(pop, baseParam);
    expect(r1.selectedItems.map((s) => s.row.no_sp2d)).toEqual(
      r2.selectedItems.map((s) => s.row.no_sp2d),
    );
  });

  it("top stratum 100% dipilih (nilai >= interval)", () => {
    const pop = makePopulasi(500, "skewed");
    const sized = musSampleSize({ ...baseParam, bookValue: pop.reduce((s, r) => s + r.nilai, 0) });
    const result = musSelection(pop, baseParam);
    const topCount = pop.filter((r) => r.nilai >= sized.interval).length;
    expect(result.topStratumCount).toBe(topCount);
  });

  it("populasi homogen → MUS approx sama dengan random", () => {
    const pop = makePopulasi(100, "uniform");
    const result = musSelection(pop, baseParam);
    expect(result.sampleSize).toBeGreaterThan(0);
    expect(result.sampleSize).toBeLessThanOrEqual(pop.length);
  });

  it("seed berbeda → sample berbeda", () => {
    const pop = makePopulasi(200, "uniform");
    const r1 = musSelection(pop, { ...baseParam, seed: 1 });
    const r2 = musSelection(pop, { ...baseParam, seed: 9999 });
    const a = r1.selectedItems.map((s) => s.row.no_sp2d).join("|");
    const b = r2.selectedItems.map((s) => s.row.no_sp2d).join("|");
    expect(a).not.toBe(b);
  });

  it("includeNegativeAs100Pct=true → semua nilai negatif terpilih", () => {
    const pop = makePopulasi(50, "uniform");
    pop.push({
      no_sp2d: "SP2D-NEG-1",
      tgl_sp2d: "2025-01-15",
      nilai: -5_000_000,
      _idx: 99,
    });
    const result = musSelection(pop, { ...baseParam, includeNegativeAs100Pct: true });
    const neg = result.selectedItems.find((s) => s.reason === "negative");
    expect(neg).toBeDefined();
  });
});
