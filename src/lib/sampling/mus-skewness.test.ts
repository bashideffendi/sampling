import { describe, it, expect } from "vitest";
import { computeSkewness, musSelection } from "./mus";
import type { MUSParam, SP2DRow } from "@/types";

function makeRow(idx: number, no: string, nilai: number): SP2DRow {
  return {
    no_sp2d: no,
    tgl_sp2d: "2025-01-01",
    nilai,
    _idx: idx,
  };
}

describe("computeSkewness", () => {
  it("uniform values → CV rendah, tidak extreme", () => {
    const values = [100, 100, 100, 100, 100];
    const s = computeSkewness(values);
    expect(s.cv).toBeLessThan(2);
    expect(s.isExtreme).toBe(false);
  });

  it("near-uniform values → CV < 2, tidak extreme", () => {
    const values = [95, 100, 105, 98, 102, 99, 101];
    const s = computeSkewness(values);
    expect(s.cv).toBeLessThan(2);
    expect(s.maxOverMedian).toBeLessThan(100);
    expect(s.isExtreme).toBe(false);
  });

  it("skewed [1,1,1,1,1,1000] → CV > 2 + max/median > 100, extreme", () => {
    const values = [1, 1, 1, 1, 1, 1000];
    const s = computeSkewness(values);
    expect(s.cv).toBeGreaterThan(2);
    expect(s.maxOverMedian).toBeGreaterThan(100);
    expect(s.isExtreme).toBe(true);
  });

  it("Sampang-like (banyak transaksi kecil, segelintir raksasa) → extreme", () => {
    // ~ realita SP2D pemda kecil: 50 transaksi 1-50 jt, 3 transaksi miliaran
    const values: number[] = [];
    for (let i = 0; i < 50; i++) {
      values.push(5_000_000 + i * 500_000);
    }
    values.push(2_500_000_000);
    values.push(4_800_000_000);
    values.push(7_200_000_000);
    const s = computeSkewness(values);
    expect(s.isExtreme).toBe(true);
    // entah dari CV atau dari maxOverMedian — minimal salah satu trigger.
    expect(s.cv > 2 || s.maxOverMedian > 100).toBe(true);
  });

  it("empty array → semuanya nol, tidak extreme", () => {
    const s = computeSkewness([]);
    expect(s.cv).toBe(0);
    expect(s.maxOverMedian).toBe(0);
    expect(s.isExtreme).toBe(false);
  });

  it("single value → CV=0, isExtreme false", () => {
    const s = computeSkewness([100_000_000]);
    expect(s.cv).toBe(0);
    expect(s.isExtreme).toBe(false);
  });

  it("median nol → tidak div-by-zero (semua zero tapi panjang>0)", () => {
    const s = computeSkewness([0, 0, 0, 0]);
    expect(Number.isFinite(s.cv)).toBe(true);
    expect(Number.isFinite(s.maxOverMedian)).toBe(true);
  });

  it("trigger by maxOverMedian saja (CV moderate, max raksasa)", () => {
    // banyak data ~100, satu outlier 50000 → max/median = 500 (extreme),
    // CV tinggi karena outlier tunggal, tetap trigger.
    const values: number[] = [];
    for (let i = 0; i < 100; i++) values.push(100);
    values.push(50_000);
    const s = computeSkewness(values);
    expect(s.maxOverMedian).toBeGreaterThan(100);
    expect(s.isExtreme).toBe(true);
  });
});

describe("musSelection — skewness warning emission", () => {
  const baseParam: MUSParam = {
    bookValue: 0, // di-override musSelection ke sum of positives
    tolerableMisstatement: 50_000_000,
    expectedMisstatement: 10_000_000,
    confidenceLevel: 0.95,
    seed: 12345,
    includeNegativeAs100Pct: false,
  };

  it("distribusi extreme → warning SKEWNESS_EXTREME muncul", () => {
    const populasi: SP2DRow[] = [];
    for (let i = 0; i < 50; i++) {
      populasi.push(makeRow(i, `SP2D-${i.toString().padStart(4, "0")}`, 1_000_000));
    }
    populasi.push(makeRow(50, "SP2D-BIG-1", 5_000_000_000));
    populasi.push(makeRow(51, "SP2D-BIG-2", 8_000_000_000));
    const res = musSelection(populasi, baseParam);
    const hit = res.warnings.find((w) => w.startsWith("SKEWNESS_EXTREME"));
    expect(hit).toBeDefined();
    expect(hit).toMatch(/CV=/);
    expect(hit).toMatch(/max\/median=/);
  });

  it("distribusi uniform → tidak emit warning SKEWNESS_EXTREME", () => {
    const populasi: SP2DRow[] = [];
    for (let i = 0; i < 60; i++) {
      populasi.push(
        makeRow(i, `SP2D-${i.toString().padStart(4, "0")}`, 5_000_000 + (i % 5) * 100_000),
      );
    }
    const res = musSelection(populasi, baseParam);
    const hit = res.warnings.find((w) => w.startsWith("SKEWNESS_EXTREME"));
    expect(hit).toBeUndefined();
  });
});
