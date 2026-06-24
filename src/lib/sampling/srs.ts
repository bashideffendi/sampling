/**
 * Simple Random Sampling (SRS).
 *
 * Formula sample size pakai Normal approximation (audit klasik):
 *   n = (Z² × p × (1−p)) / E²
 *     dengan p = expected deviation, E = tolerable − expected (precision).
 *   Lalu adjust dengan Finite Population Correction:
 *     n_adj = n / (1 + (n−1)/N)
 *
 * Selection: shuffle indices via mulberry32 seeded, ambil n pertama (sorted asc).
 *
 * Catatan: untuk test of controls, lebih akurat pakai AICPA attribute table
 * (lihat attribute.ts). SRS di sini buat populasi homogen dengan tujuan
 * substantive sederhana / verifikasi spot-check tanpa MUS.
 */

import type { SRSParam, SamplingResult, SP2DRow, SelectedItem } from "@/types";
import { mulberry32, sampleIndices } from "@/lib/prng/mulberry32";
import { zScore } from "@/lib/sampling/rf-table";

export interface SRSSampleSize {
  n: number;
  nUnadjusted: number;
  precision: number;
  z: number;
}

export function srsSampleSize(param: SRSParam): SRSSampleSize {
  const { populationSize, confidenceLevel, expectedDeviation, tolerableDeviation } = param;
  if (populationSize <= 0) throw new Error("SRS: populationSize harus > 0.");
  if (expectedDeviation < 0 || expectedDeviation >= 1)
    throw new Error("SRS: expectedDeviation harus di [0, 1).");
  if (tolerableDeviation <= 0 || tolerableDeviation >= 1)
    throw new Error("SRS: tolerableDeviation harus di (0, 1).");
  if (expectedDeviation >= tolerableDeviation)
    throw new Error("SRS: expectedDeviation harus < tolerableDeviation.");

  const z = zScore(confidenceLevel);
  const precision = tolerableDeviation - expectedDeviation;
  const p = expectedDeviation === 0 ? 0.5 : expectedDeviation; // conservative variance
  const nUnadjusted = (z * z * p * (1 - p)) / (precision * precision);
  // FPC
  const nAdj = nUnadjusted / (1 + (nUnadjusted - 1) / populationSize);
  const n = Math.min(populationSize, Math.max(1, Math.ceil(nAdj)));
  return { n, nUnadjusted: Math.ceil(nUnadjusted), precision, z };
}

export function srsSelection(populasi: SP2DRow[], param: SRSParam): SamplingResult {
  if (populasi.length === 0) throw new Error("SRS: populasi kosong.");
  const sizing = srsSampleSize({ ...param, populationSize: populasi.length });
  const rng = mulberry32(param.seed);
  const indices = sampleIndices(populasi.length, sizing.n, rng);
  // Stable order: sort populasi by no_sp2d biar reproducibility seed sama populasi sama = hasil sama
  const ordered = [...populasi].sort((a, b) => (a.no_sp2d < b.no_sp2d ? -1 : 1));
  const selectedItems: SelectedItem[] = indices.map((i) => ({
    row: ordered[i],
    reason: "selected",
  }));
  return {
    method: "srs",
    param,
    sampleSize: sizing.n,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    seed: param.seed,
    selectedItems,
    computedAt: new Date().toISOString(),
    warnings: [],
  };
}
