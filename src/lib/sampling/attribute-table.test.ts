import { describe, it, expect } from "vitest";
import { attributeSampleSize } from "./attribute-table";

describe("AICPA Attribute sample size tables", () => {
  it("95% TDR=2% EPDR=0% → 149", () => {
    expect(attributeSampleSize(0.95, 0.02, 0)).toBe(149);
  });

  it("95% TDR=7% EPDR=1% → 66 (lookup ke EPDR 1.00% row, TDR 7% col = 66)", () => {
    // EPDR 1.00% TDR 7% di table A-1 = 66 (mengikuti tabel yg dipakai di codebase).
    // Pastikan BUKAN 88 (88 = TDR 7% EPDR 1.75%).
    expect(attributeSampleSize(0.95, 0.07, 0.01)).toBe(66);
    expect(attributeSampleSize(0.95, 0.07, 0.01)).not.toBe(88);
  });

  it("90% TDR=5% EPDR=0% → 45", () => {
    expect(attributeSampleSize(0.9, 0.05, 0)).toBe(45);
  });

  it("99% TDR=5% EPDR=0% → 92 (lebih besar dari 90/95)", () => {
    expect(attributeSampleSize(0.99, 0.05, 0)).toBe(92);
  });

  it("throws kalau EPDR >= TDR", () => {
    expect(() => attributeSampleSize(0.95, 0.05, 0.05)).toThrow();
    expect(() => attributeSampleSize(0.95, 0.05, 0.06)).toThrow();
  });

  it("monotonic: sample size 99% > 95% > 90% (sama TDR/EPDR)", () => {
    const n90 = attributeSampleSize(0.9, 0.05, 0);
    const n95 = attributeSampleSize(0.95, 0.05, 0);
    const n99 = attributeSampleSize(0.99, 0.05, 0);
    expect(n95).toBeGreaterThan(n90);
    expect(n99).toBeGreaterThan(n95);
  });
});
