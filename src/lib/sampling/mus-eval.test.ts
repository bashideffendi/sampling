import { describe, it, expect } from "vitest";
import { computeUML } from "./mus-eval";

describe("computeUML — Basic Precision", () => {
  it("BP = J × RF(c=0)", () => {
    const r = computeUML({
      samplingInterval: 500_000_000,
      confidence: 0.95,
      inputs: [],
    });
    // RF 95% c=0 = 3.0 → BP = 500jt × 3 = 1.5 M
    expect(r.basicPrecision).toBeCloseTo(1_500_000_000, 0);
    expect(r.sumProjectedMisstatement).toBe(0);
    expect(r.sumIncrementalAllowance).toBe(0);
    expect(r.uml).toBe(r.basicPrecision);
    expect(r.countMisstated).toBe(0);
  });

  it("BP scales dengan confidence", () => {
    const at90 = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.9,
      inputs: [],
    });
    const at99 = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.99,
      inputs: [],
    });
    expect(at99.basicPrecision).toBeGreaterThan(at90.basicPrecision);
  });

  it("throws kalau interval ≤ 0", () => {
    expect(() =>
      computeUML({ samplingInterval: 0, confidence: 0.95, inputs: [] }),
    ).toThrow();
  });
});

describe("computeUML — Projected Misstatement", () => {
  it("sample no misstatement → PM = 0, UML = BP", () => {
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        { no_sp2d: "SP2D-001", bookValue: 50_000_000, auditValue: 50_000_000, isTopStratum: false },
        { no_sp2d: "SP2D-002", bookValue: 30_000_000, auditValue: 30_000_000, isTopStratum: false },
      ],
    });
    expect(r.sumProjectedMisstatement).toBe(0);
    expect(r.countMisstated).toBe(0);
    expect(r.uml).toBe(r.basicPrecision);
  });

  it("pool item misstatement → PM = taint% × J", () => {
    // book 50jt, audit 40jt, J 100jt → taint 20%, PM 20jt
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        { no_sp2d: "SP2D-001", bookValue: 50_000_000, auditValue: 40_000_000, isTopStratum: false },
      ],
    });
    expect(r.perItem[0].taintPercent).toBeCloseTo(0.2, 4);
    expect(r.perItem[0].projectedMisstatement).toBeCloseTo(20_000_000, 0);
    expect(r.sumProjectedMisstatement).toBeCloseTo(20_000_000, 0);
    expect(r.countMisstated).toBe(1);
  });

  it("top stratum item → PM = misstatement (no projection)", () => {
    // book 500jt, audit 400jt, J 100jt → PM = 100jt (book-audit, no projection)
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        { no_sp2d: "SP2D-TOP", bookValue: 500_000_000, auditValue: 400_000_000, isTopStratum: true },
      ],
    });
    expect(r.perItem[0].projectedMisstatement).toBe(100_000_000);
    expect(r.sumProjectedMisstatement).toBe(100_000_000);
    // Top stratum tidak kontribusi IA
    expect(r.sumIncrementalAllowance).toBe(0);
  });

  it("audit > book (understatement) → PM negatif", () => {
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        { no_sp2d: "SP2D-001", bookValue: 50_000_000, auditValue: 60_000_000, isTopStratum: false },
      ],
    });
    expect(r.perItem[0].misstatement).toBe(-10_000_000);
    expect(r.perItem[0].projectedMisstatement).toBeLessThan(0);
  });
});

describe("computeUML — Incremental Allowance + UML", () => {
  it("1 pool misstatement → IA = PM × (RF(1) - RF(0) - 1)", () => {
    // RF 95% c=0 = 3.0, c=1 = 4.75. IA factor = 4.75 - 3.0 = 1.75. (factor-1)=0.75.
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        { no_sp2d: "SP2D-001", bookValue: 50_000_000, auditValue: 40_000_000, isTopStratum: false },
      ],
    });
    // PM = 20jt, IA = 20jt × 0.75 = 15jt
    expect(r.sumIncrementalAllowance).toBeCloseTo(15_000_000, 0);
    // UML = BP + PM + IA = 300jt + 20jt + 15jt = 335jt
    expect(r.uml).toBeCloseTo(335_000_000, 0);
  });

  it("multiple pool misstatement → sort by taint desc, factor escalate", () => {
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        // taint 20% → PM 20jt
        { no_sp2d: "SP2D-A", bookValue: 50_000_000, auditValue: 40_000_000, isTopStratum: false },
        // taint 50% → PM 50jt (lebih tinggi taint, ranked first)
        { no_sp2d: "SP2D-B", bookValue: 20_000_000, auditValue: 10_000_000, isTopStratum: false },
      ],
    });
    expect(r.sumProjectedMisstatement).toBeCloseTo(70_000_000, 0);
    // BP = 300jt + ΣPM = 70jt + ΣIA (positif)
    expect(r.uml).toBeGreaterThan(r.basicPrecision + r.sumProjectedMisstatement);
  });

  it("countMisstated tepat", () => {
    const r = computeUML({
      samplingInterval: 100_000_000,
      confidence: 0.95,
      inputs: [
        { no_sp2d: "SP2D-001", bookValue: 50_000_000, auditValue: 50_000_000, isTopStratum: false },
        { no_sp2d: "SP2D-002", bookValue: 30_000_000, auditValue: 28_000_000, isTopStratum: false },
        { no_sp2d: "SP2D-003", bookValue: 20_000_000, auditValue: 15_000_000, isTopStratum: false },
      ],
    });
    expect(r.countMisstated).toBe(2);
  });
});
