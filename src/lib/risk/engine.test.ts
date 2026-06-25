/**
 * Engine tests — pure mocks, gak nyentuh registry rule asli.
 */

import { describe, it, expect } from "vitest";
import { runRiskRules } from "./engine";
import type { Rule, RuleContext } from "./types";
import type { SP2DRow, PopulasiMeta } from "@/types";

function mkRow(idx: number, nilai = 1_000_000): SP2DRow {
  return {
    no_sp2d: `SP2D-${String(idx).padStart(4, "0")}`,
    tgl_sp2d: "2026-01-01",
    nilai,
    _idx: idx,
  };
}

function mkCtx(rows: SP2DRow[]): RuleContext {
  const meta: PopulasiMeta = {
    count: rows.length,
    totalNilai: rows.reduce((s, r) => s + r.nilai, 0),
    meanNilai: rows.length ? rows.reduce((s, r) => s + r.nilai, 0) / rows.length : 0,
    medianNilai: rows[0]?.nilai ?? 0,
    minNilai: Math.min(...rows.map((r) => r.nilai)),
    maxNilai: Math.max(...rows.map((r) => r.nilai)),
    negativeCount: 0,
    zeroCount: 0,
    hashSha256: "deadbeef",
    uploadedAt: new Date().toISOString(),
  };
  return { populasi: rows, meta };
}

const alwaysHit: Rule = {
  id: "test_always_hit",
  category: "nilai",
  severity: "medium",
  description: "Flag every row (test fixture).",
  defaultOn: true,
  run: (ctx) =>
    ctx.populasi.map((r) => ({
      sp2dIdx: r._idx,
      reason: "always",
      severity: "medium" as const,
    })),
};

const neverHit: Rule = {
  id: "test_never_hit",
  category: "vendor",
  severity: "low",
  description: "Flag nothing (test fixture).",
  defaultOn: true,
  run: () => [],
};

const overlappingHit: Rule = {
  id: "test_overlap",
  category: "akun",
  severity: "high",
  description: "Flag row idx 0 + 1 (overlap dengan alwaysHit).",
  defaultOn: true,
  run: (ctx) =>
    ctx.populasi
      .filter((r) => r._idx === 0 || r._idx === 1)
      .map((r) => ({ sp2dIdx: r._idx, reason: "overlap", severity: "high" as const })),
};

const skippedRule: Rule = {
  id: "test_skipped",
  category: "opd",
  severity: "low",
  description: "defaultOff — engine harus skip.",
  defaultOn: false,
  defaultOff: true,
  run: (ctx) =>
    ctx.populasi.map((r) => ({
      sp2dIdx: r._idx,
      reason: "should not run",
      severity: "low" as const,
    })),
};

describe("runRiskRules", () => {
  it("counts total hits across rules", () => {
    const rows = [mkRow(0), mkRow(1), mkRow(2)];
    const report = runRiskRules([alwaysHit, neverHit], mkCtx(rows));
    expect(report.totalHits).toBe(3); // alwaysHit=3 + neverHit=0
    expect(report.results).toHaveLength(2);
    expect(report.results[0].hits).toHaveLength(3);
    expect(report.results[1].hits).toHaveLength(0);
  });

  it("dedups uniqueFlagged by sp2dIdx across rules", () => {
    const rows = [mkRow(0), mkRow(1), mkRow(2)];
    const report = runRiskRules([alwaysHit, overlappingHit], mkCtx(rows));
    // alwaysHit kena {0,1,2}, overlappingHit kena {0,1} → union {0,1,2}
    expect(report.uniqueFlagged.size).toBe(3);
    expect([...report.uniqueFlagged].sort()).toEqual([0, 1, 2]);
    // tapi totalHits TETEP raw count (3 + 2 = 5), bukan dedup
    expect(report.totalHits).toBe(5);
  });

  it("records runDurationMs >= 0 for each rule", () => {
    const rows = [mkRow(0), mkRow(1)];
    const report = runRiskRules([alwaysHit, neverHit], mkCtx(rows));
    for (const r of report.results) {
      expect(r.runDurationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.runDurationMs)).toBe(true);
    }
  });

  it("skips rule when defaultOff === true", () => {
    const rows = [mkRow(0), mkRow(1)];
    const report = runRiskRules([alwaysHit, skippedRule], mkCtx(rows));
    expect(report.results.find((r) => r.ruleId === "test_skipped")).toBeUndefined();
    expect(report.results).toHaveLength(1);
    expect(report.totalHits).toBe(2); // cuma alwaysHit
  });

  it("returns ISO timestamp at runAt", () => {
    const rows = [mkRow(0)];
    const before = Date.now();
    const report = runRiskRules([alwaysHit], mkCtx(rows));
    const ts = Date.parse(report.runAt);
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before - 1);
  });

  it("preserves rule metadata in RuleResult", () => {
    const rows = [mkRow(0)];
    const report = runRiskRules([alwaysHit], mkCtx(rows));
    const r = report.results[0];
    expect(r.ruleId).toBe("test_always_hit");
    expect(r.category).toBe("nilai");
    expect(r.severity).toBe("medium");
    expect(r.description).toContain("Flag every row");
  });

  it("handles empty rule list cleanly", () => {
    const report = runRiskRules([], mkCtx([mkRow(0)]));
    expect(report.results).toHaveLength(0);
    expect(report.totalHits).toBe(0);
    expect(report.uniqueFlagged.size).toBe(0);
  });
});
