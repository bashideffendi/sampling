import { describe, it, expect } from "vitest";
import { compileCriterion, judgmentalSelection } from "./judgmental";
import type { JudgmentalParam, SP2DRow } from "@/types";

function makePop(): SP2DRow[] {
  return [
    { no_sp2d: "SP2D-001", tgl_sp2d: "2025-01-15", nilai: 50_000_000, skpd: "DPUPR", penyedia: "CV ABC", _idx: 0 },
    { no_sp2d: "SP2D-002", tgl_sp2d: "2025-12-28", nilai: 199_000_000, skpd: "Dinkes", penyedia: "PT XYZ", _idx: 1 },
    { no_sp2d: "SP2D-003", tgl_sp2d: "2025-06-10", nilai: 250_000_000, skpd: "DPUPR", penyedia: "CV ABC", _idx: 2 },
    { no_sp2d: "SP2D-004", tgl_sp2d: "2025-12-30", nilai: 75_000_000, skpd: "BAPPEDA", penyedia: "CV LMN", _idx: 3 },
  ];
}

describe("Judgmental DSL parser", () => {
  it("nilai >= 200000000", () => {
    const p = compileCriterion("nilai >= 200000000");
    expect(p(makePop()[2])).toBe(true);
    expect(p(makePop()[0])).toBe(false);
  });

  it("contains operator (case insensitive)", () => {
    const p = compileCriterion('skpd contains "dpupr"');
    expect(p(makePop()[0])).toBe(true);
    expect(p(makePop()[3])).toBe(false);
  });

  it("regex operator", () => {
    const p = compileCriterion('tgl_sp2d regex "^2025-12"');
    expect(p(makePop()[1])).toBe(true);
    expect(p(makePop()[2])).toBe(false);
  });

  it("in operator multi value", () => {
    const p = compileCriterion('skpd in "DPUPR","BAPPEDA"');
    expect(p(makePop()[0])).toBe(true);
    expect(p(makePop()[3])).toBe(true);
    expect(p(makePop()[1])).toBe(false);
  });

  it("compound clauses with &&", () => {
    const p = compileCriterion('nilai >= 100000000 && skpd contains "DPUPR"');
    expect(p(makePop()[2])).toBe(true);
    expect(p(makePop()[0])).toBe(false); // nilai too low
    expect(p(makePop()[1])).toBe(false); // skpd mismatch
  });
});

describe("Judgmental selection", () => {
  const base: JudgmentalParam = {
    rationale: "Fokus risiko: paket mendekati batas PL + akhir tahun anggaran (vendor berulang).",
    seed: 1,
    criteria: [
      { id: "near_pl", label: "Mendekati Rp 200jt", filter: "nilai >= 190000000 && nilai <= 200000000", enabled: true },
      { id: "year_end", label: "Cair akhir Desember", filter: 'tgl_sp2d regex "^2025-12"', enabled: true },
    ],
  };

  it("matched items terpilih dengan reason judgmental_match", () => {
    const result = judgmentalSelection(makePop(), base);
    const sel = result.selectedItems.map((s) => s.row.no_sp2d).sort();
    // SP2D-002 (near_pl=199jt + akhir des), SP2D-004 (akhir des)
    expect(sel).toEqual(["SP2D-002", "SP2D-004"]);
    expect(result.selectedItems[0].reason).toBe("judgmental_match");
  });

  it("matchedCriteria mencatat semua criterion yg cocok", () => {
    const result = judgmentalSelection(makePop(), base);
    const sp2 = result.selectedItems.find((s) => s.row.no_sp2d === "SP2D-002");
    expect(sp2?.matchedCriteria).toEqual(expect.arrayContaining(["near_pl", "year_end"]));
  });

  it("throws kalau rationale terlalu pendek", () => {
    expect(() =>
      judgmentalSelection(makePop(), { ...base, rationale: "ad-hoc" }),
    ).toThrow(/rationale/);
  });

  it("throws kalau gak ada criterion aktif", () => {
    expect(() =>
      judgmentalSelection(makePop(), {
        ...base,
        criteria: base.criteria.map((c) => ({ ...c, enabled: false })),
      }),
    ).toThrow(/criterion/);
  });
});
