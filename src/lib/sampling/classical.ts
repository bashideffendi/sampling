/**
 * Classical Variables Sampling — 3 estimator: Mean-per-Unit (MPU), Ratio, Difference.
 *
 * Sample size formula (audit-correct per AICPA Audit Guide):
 *   A = (TM − EM) × (1 − allowanceFraction)   <-- planned precision
 *   n_unadjusted = (Z × σ × N / A)²
 *   n_adj = n / (1 + (n−1)/N)                  <-- FPC
 *
 * CRITICAL koreksi adversarial verify (dari audit Day 1):
 *   - Allowance fraction 0.5–0.7 typical. JANGAN A = TM langsung
 *     (under-sampling parah, populasi material misstatement gak ter-detect).
 *   - Population stdev σ harus dari pilot atau historical, BUKAN guess.
 *
 * Estimator differences:
 *   - MPU: pakai σ nilai populasi langsung (best untuk populasi homogen)
 *   - Ratio: pakai σ rasio (audit/book), efisien kalau audit value ~ book value
 *   - Difference: pakai σ difference (book − audit), best kalau salah saji
 *     proporsional terhadap nilai
 *
 * v0.3.6 ship MPU saja (formula sample size). Ratio/Difference projection
 * butuh pilot data atau auditor judgment — defer.
 */

import type {
  ClassicalParam,
  SamplingResult,
  SP2DRow,
  SelectedItem,
} from "@/types";
import { mulberry32, sampleIndices } from "@/lib/prng/mulberry32";
import { zScore } from "@/lib/sampling/rf-table";

export interface ClassicalSampleSize {
  n: number;
  nUnadjusted: number;
  precision: number;
  z: number;
  effectiveTM: number;
}

export function classicalSampleSize(param: ClassicalParam): ClassicalSampleSize {
  const {
    populationSize,
    confidenceLevel,
    expectedStdev,
    tolerableMisstatement,
    expectedMisstatement,
    allowanceFraction,
  } = param;

  if (populationSize <= 0) throw new Error("Classical: populationSize harus > 0.");
  if (expectedStdev <= 0) throw new Error("Classical: expectedStdev harus > 0.");
  if (tolerableMisstatement <= 0)
    throw new Error("Classical: tolerableMisstatement harus > 0.");
  if (expectedMisstatement < 0)
    throw new Error("Classical: expectedMisstatement harus >= 0.");
  if (expectedMisstatement >= tolerableMisstatement)
    throw new Error("Classical: expectedMisstatement harus < tolerableMisstatement.");
  if (allowanceFraction < 0 || allowanceFraction >= 1)
    throw new Error("Classical: allowanceFraction harus di [0, 1).");

  // Planned precision A — KOREKSI AUDIT: A < (TM - EM), bukan A = TM
  const effectiveTM = tolerableMisstatement - expectedMisstatement;
  const precision = effectiveTM * (1 - allowanceFraction);
  if (precision <= 0)
    throw new Error(
      "Classical: planned precision <= 0. Naikkan TM atau turunkan allowanceFraction.",
    );

  const z = zScore(confidenceLevel);
  // n = (Z × σ × N / A)²
  const nUnadjusted = Math.pow((z * expectedStdev * populationSize) / precision, 2);
  // FPC adjustment
  const nAdj = nUnadjusted / (1 + (nUnadjusted - 1) / populationSize);
  const n = Math.min(populationSize, Math.max(1, Math.ceil(nAdj)));

  return {
    n,
    nUnadjusted: Math.ceil(nUnadjusted),
    precision,
    z,
    effectiveTM,
  };
}

export function classicalSelection(
  populasi: SP2DRow[],
  param: ClassicalParam,
): SamplingResult {
  if (populasi.length === 0) throw new Error("Classical: populasi kosong.");
  // populationSize di-override pakai populasi.length aktual — caller bisa kasih
  // stale value, kita pakai authoritative.
  const correctedParam: ClassicalParam = {
    ...param,
    populationSize: populasi.length,
  };
  const sizing = classicalSampleSize(correctedParam);
  const rng = mulberry32(param.seed);
  const indices = sampleIndices(populasi.length, sizing.n, rng);
  // Stable order — pakai SP2D sequence numeric (BUKAN lex). "SP2D-10" sebelum
  // "SP2D-9" kalau lex; ekstrak running number biar urutan benar.
  const ordered = [...populasi].sort(sortBySP2DSeq);
  const selectedItems: SelectedItem[] = indices.map((i) => ({
    row: ordered[i],
    reason: "selected",
  }));

  return {
    method: "classical",
    param: correctedParam,
    sampleSize: sizing.n,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    seed: param.seed,
    selectedItems,
    computedAt: new Date().toISOString(),
    rfSource:
      "AICPA Audit Guide: Audit Sampling (2024 ed.), Classical Variables Sampling (MPU formula).",
    warnings: [],
  };
}

/**
 * Sort SP2D by running number numerik (BUKAN lex string).
 * Format SIPD umum: "35.27/04.0/000123/LS/2025" → ambil token numerik
 * terpanjang yang bukan tahun (≥4 digit, di luar 1900-2100).
 * Fallback ke lex comparison kalau gagal extract.
 */
function sortBySP2DSeq(a: SP2DRow, b: SP2DRow): number {
  const sa = extractSeq(a.no_sp2d);
  const sb = extractSeq(b.no_sp2d);
  if (sa !== null && sb !== null) return sa - sb;
  return (a.no_sp2d ?? "") < (b.no_sp2d ?? "") ? -1 : 1;
}

function extractSeq(noSP2D: string | undefined): number | null {
  if (!noSP2D) return null;
  const tokens = noSP2D.split(/[^0-9]+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  const sorted = [...tokens].sort((x, y) => {
    if (y.length !== x.length) return y.length - x.length;
    const xIsYear = +x >= 1900 && +x <= 2100;
    const yIsYear = +y >= 1900 && +y <= 2100;
    return Number(xIsYear) - Number(yIsYear);
  });
  const n = Number(sorted[0]);
  return Number.isFinite(n) ? n : null;
}
