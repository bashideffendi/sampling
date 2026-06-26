/**
 * Smoke test integration — Data Realisasi Master Sampang TA 2025 (39.321 baris).
 *
 * Verifikasi end-to-end:
 *  1. Parser: fingerprint format SIPD + map kolom + parse 39k row + agregat SP2D.
 *  2. MUS sampling: run deterministic seed → reproducible sample.
 *  3. Risk Helper: jalanin 40 rules over populasi penuh, ukur durasi.
 *
 * Path file: <repo>/Data Realisasi Master Sampang.xlsx (di-gitignore).
 * Test ini SKIP kalau file gak ada (CI / fresh clone).
 *
 * Tujuan: catch regressions yang gak ke-tangkep unit test pakai data sintetis.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseSP2DExcel } from "@/lib/parser/parse-excel";
import { musSelection } from "@/lib/sampling/mus";
import { runRiskRules } from "@/lib/risk/engine";
import { ALL_RULES } from "@/lib/risk";

const FILE_PATH = join(process.cwd(), "Data Realisasi Master Sampang.xlsx");
const HAS_FILE = existsSync(FILE_PATH);
const describeIfFile = HAS_FILE ? describe : describe.skip;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) view[i] = buf[i];
  return ab;
}

describeIfFile("Sampang TA 2025 — integration smoke", () => {
  it("parse 39k row → SP2D-level rows dalam waktu wajar", async () => {
    const t0 = Date.now();
    const buf = readFileSync(FILE_PATH);
    const ab = toArrayBuffer(buf);
    const result = await parseSP2DExcel(ab, { filename: "Sampang.xlsx" });
    const dt = Date.now() - t0;

    expect(result.rows.length).toBeGreaterThan(1000); // post-aggregate SP2D count
    expect(result.fingerprint.format).toBeTruthy();
    expect(result.fingerprint.format).not.toBe("AGGREGATE_REJECT");
    expect(dt).toBeLessThan(35_000); // Iris Xe + 12GB RAM headroom
    console.log(
      `[parse] raw rows -> SP2D-level ${result.rows.length}, ` +
        `format=${result.fingerprint.format}, granularity=${result.fingerprint.granularity}, ` +
        `koreksi=${result.populasiKoreksi.length}, warnings=${result.warnings.length}, ${dt}ms`,
    );
  });

  it("MUS sampling deterministic seeded — reproducible per seed", async () => {
    const buf = readFileSync(FILE_PATH);
    const result = await parseSP2DExcel(toArrayBuffer(buf), { filename: "Sampang.xlsx" });
    const populasi = result.rows;
    const bookValue = populasi.reduce((s, r) => s + r.nilai, 0);
    const tm = bookValue * 0.005;
    const em = tm * 0.1;

    const t0 = Date.now();
    const sampling = musSelection(populasi, {
      bookValue,
      tolerableMisstatement: tm,
      expectedMisstatement: em,
      confidenceLevel: 0.95,
      seed: 42,
    });
    const dt = Date.now() - t0;

    expect(sampling.sampleSize).toBeGreaterThan(0);
    expect(sampling.selectedItems.length).toBe(sampling.sampleSize);
    expect(sampling.seed).toBe(42);
    expect(dt).toBeLessThan(10_000);

    const sampling2 = musSelection(populasi, {
      bookValue,
      tolerableMisstatement: tm,
      expectedMisstatement: em,
      confidenceLevel: 0.95,
      seed: 42,
    });
    expect(sampling2.selectedItems.map((s) => s.row.no_sp2d)).toEqual(
      sampling.selectedItems.map((s) => s.row.no_sp2d),
    );
    console.log(
      `[mus] populasi=${populasi.length}, BV=Rp ${(bookValue / 1e9).toFixed(2)} M, ` +
        `n=${sampling.sampleSize}, ${dt}ms`,
    );
  });

  it("Risk Helper ALL_RULES over populasi penuh — < 30s + per-rule durasi", async () => {
    const buf = readFileSync(FILE_PATH);
    const result = await parseSP2DExcel(toArrayBuffer(buf), { filename: "Sampang.xlsx" });
    const populasi = result.rows;

    const t0 = Date.now();
    const report = runRiskRules([...ALL_RULES], {
      populasi,
      meta: result.meta,
      allRows: populasi,
    });
    const dt = Date.now() - t0;

    expect(report.results.length).toBe(ALL_RULES.length);
    expect(Array.isArray(report.uniqueFlagged)).toBe(true);
    expect(dt).toBeLessThan(30_000);

    const top5 = [...report.results]
      .sort((a, b) => b.runDurationMs - a.runDurationMs)
      .slice(0, 5)
      .map((r) => `${r.ruleId}(${Math.round(r.runDurationMs)}ms, ${r.hits.length}h)`);
    console.log(
      `[risk] ${ALL_RULES.length} rules × ${populasi.length} row in ${dt}ms — ` +
        `totalHits=${report.totalHits}, uniqueFlagged=${report.uniqueFlagged.length}`,
    );
    console.log(`[risk] top-5 slowest: ${top5.join(", ")}`);
  });
});

if (!HAS_FILE) {
  console.log(
    `[smoke] SKIP — '${FILE_PATH}' tidak ada. Expected di CI / fresh clone (file pemda gak di-commit).`,
  );
}
