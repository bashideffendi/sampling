import { describe, it, expect } from "vitest";
import { stratifiedSampleSize, stratifiedSelection } from "./stratified";
import type { StratifiedParam, SP2DRow } from "@/types";

const boundaries = [10_000_000, 100_000_000, 500_000_000];

const baseParam: StratifiedParam = {
  strataBoundaries: boundaries,
  certaintyThreshold: 1_000_000_000,
  totalTolerableError: 200_000_000,
  confidenceLevel: 0.95,
  allocation: "neyman",
  seed: 42,
};

function makeSkewedPop(): SP2DRow[] {
  const rows: SP2DRow[] = [];
  let id = 1;
  // 500 small (< 10jt)
  for (let i = 0; i < 500; i++) {
    rows.push({
      no_sp2d: `SP2D-${String(id++).padStart(5, "0")}`,
      tgl_sp2d: "2025-01-15",
      nilai: 1_000_000 + Math.floor((i % 9) * 800_000),
      _idx: id,
    });
  }
  // 200 medium (10-100jt)
  for (let i = 0; i < 200; i++) {
    rows.push({
      no_sp2d: `SP2D-${String(id++).padStart(5, "0")}`,
      tgl_sp2d: "2025-01-15",
      nilai: 15_000_000 + i * 400_000,
      _idx: id,
    });
  }
  // 80 large (100-500jt)
  for (let i = 0; i < 80; i++) {
    rows.push({
      no_sp2d: `SP2D-${String(id++).padStart(5, "0")}`,
      tgl_sp2d: "2025-01-15",
      nilai: 110_000_000 + i * 4_000_000,
      _idx: id,
    });
  }
  // 20 huge (>= 500jt, sebagian certainty stratum)
  for (let i = 0; i < 20; i++) {
    rows.push({
      no_sp2d: `SP2D-${String(id++).padStart(5, "0")}`,
      tgl_sp2d: "2025-01-15",
      nilai: 500_000_000 + i * 100_000_000,
      _idx: id,
    });
  }
  return rows;
}

describe("Stratified sample size + LRM allocation", () => {
  it("Sum of n_h = total n (Largest Remainder Method)", () => {
    const pop = makeSkewedPop();
    const sized = stratifiedSampleSize(pop, baseParam);
    const sumAlloc = sized.allocations.reduce((s, a) => s + a.n_h, 0);
    expect(sumAlloc + sized.certaintyCount).toBe(sized.n);
  });

  it("Neyman vs Proportional → distribusi alokasi beda", () => {
    const pop = makeSkewedPop();
    const ney = stratifiedSampleSize(pop, baseParam);
    const prop = stratifiedSampleSize(pop, { ...baseParam, allocation: "proportional" });
    const neyDist = ney.allocations.map((a) => a.n_h).join(",");
    const propDist = prop.allocations.map((a) => a.n_h).join(",");
    expect(neyDist).not.toBe(propDist);
  });

  it("certainty stratum 100% inspect", () => {
    const pop = makeSkewedPop();
    const sized = stratifiedSampleSize(pop, baseParam);
    const certCount = pop.filter((r) => r.nilai >= baseParam.certaintyThreshold).length;
    expect(sized.certaintyCount).toBe(certCount);
  });
});

describe("Stratified selection", () => {
  it("reproducible per seed", () => {
    const pop = makeSkewedPop();
    const a = stratifiedSelection(pop, baseParam);
    const b = stratifiedSelection(pop, baseParam);
    expect(a.selectedItems.map((s) => s.row.no_sp2d)).toEqual(
      b.selectedItems.map((s) => s.row.no_sp2d),
    );
  });

  it("setiap stratum dapat n_h sesuai sizing", () => {
    const pop = makeSkewedPop();
    const sized = stratifiedSampleSize(pop, baseParam);
    const result = stratifiedSelection(pop, baseParam);
    const restItems = result.selectedItems.filter((s) => s.reason === "selected");
    const allocByStratum = new Map<number, number>();
    for (const item of restItems) {
      const k = item.stratum!;
      allocByStratum.set(k, (allocByStratum.get(k) ?? 0) + 1);
    }
    for (const a of sized.allocations) {
      expect(allocByStratum.get(a.stratumIndex) ?? 0).toBe(a.n_h);
    }
  });
});
