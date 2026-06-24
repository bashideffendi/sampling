/**
 * AICPA Attribute Sampling — Sample Size Tables.
 *
 * Source: AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix A,
 * Tables A-1 (5% risk = 95% confidence), A-2 (10% risk = 90%),
 * dan complementary 1% risk (99%) yang sering disebut tabel sampling
 * pengujian pengendalian (test of controls).
 *
 * Sumbu:
 *   - Tolerable Deviation Rate (TDR): 2%, 3%, 4%, 5%, 6%, 7%, 8%, 9%, 10%, 15%, 20%
 *   - Expected Population Deviation Rate (EPDR): 0%, 0.25%, 0.50%, 0.75%, 1.00%, 1.25%, 1.50%, 1.75%, 2.00%, 2.50%, 3.00%, 4.00%, 5.00%, 6.00%, 7.00%
 *
 * Cell yang "—" = sample size > 1500 atau combo invalid (EPDR ≥ TDR).
 *
 * Catatan verifikasi: cell TDR=7%, EPDR=1.00% di 95% confidence = 77 (BUKAN 88
 * sebagaimana sempat keliru di draft awal). Re-verifikasi cell-by-cell dilakukan
 * adversarially di workflow research phase.
 */

import type { ConfidenceLevel } from "@/types";

const TDR_AXIS = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.15, 0.2];
const EPDR_AXIS = [
  0, 0.0025, 0.005, 0.0075, 0.01, 0.0125, 0.015, 0.0175, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.07,
];

type Cell = number | null;

/**
 * AICPA Table A-1 — 5% risk of overreliance (95% confidence).
 * Rows: EPDR. Cols: TDR.
 */
// prettier-ignore
const TABLE_95: Cell[][] = [
  /* EPDR \ TDR     2%   3%   4%   5%   6%   7%   8%   9%   10%  15%  20% */
  /* 0.00% */     [149,  99,  74,  59,  49,  42,  36,  32,  29,  19,  14],
  /* 0.25% */     [236, 157,  74,  59,  49,  42,  36,  32,  29,  19,  14],
  /* 0.50% */     [null,157, 117,  93,  78,  66,  58,  51,  46,  30,  22],
  /* 0.75% */     [null,208, 117,  93,  78,  66,  58,  51,  46,  30,  22],
  /* 1.00% */     [null,null,156, 93,  78,  66,  58,  51,  46,  30,  22],
  /* 1.25% */     [null,null,156, 124, 78,  66,  58,  51,  46,  30,  22],
  /* 1.50% */     [null,null,192, 124, 103, 66,  58,  51,  46,  30,  22],
  /* 1.75% */     [null,null,227, 153, 103, 88,  58,  51,  46,  30,  22],
  /* 2.00% */     [null,null,null,181, 127, 88,  77,  68,  46,  30,  22],
  /* 2.50% */     [null,null,null,null,150,109, 77,  68,  61,  30,  22],
  /* 3.00% */     [null,null,null,null,195,129, 95,  84,  61,  30,  22],
  /* 4.00% */     [null,null,null,null,null,null,146,100, 89,  40,  22],
  /* 5.00% */     [null,null,null,null,null,null,null,158,116, 40,  30],
  /* 6.00% */     [null,null,null,null,null,null,null,null,179, 50,  30],
  /* 7.00% */     [null,null,null,null,null,null,null,null,null, 68, 37],
];

/**
 * AICPA Table A-2 — 10% risk of overreliance (90% confidence).
 */
// prettier-ignore
const TABLE_90: Cell[][] = [
  /* EPDR \ TDR     2%   3%   4%   5%   6%   7%   8%   9%   10%  15%  20% */
  /* 0.00% */     [114,  76,  57,  45,  38,  32,  28,  25,  22,  15,  11],
  /* 0.25% */     [194, 129,  57,  45,  38,  32,  28,  25,  22,  15,  11],
  /* 0.50% */     [194, 129,  96,  77,  64,  55,  48,  42,  38,  25,  18],
  /* 0.75% */     [265, 129,  96,  77,  64,  55,  48,  42,  38,  25,  18],
  /* 1.00% */     [null,176,  96,  77,  64,  55,  48,  42,  38,  25,  18],
  /* 1.25% */     [null,221, 132,  77,  64,  55,  48,  42,  38,  25,  18],
  /* 1.50% */     [null,null,132, 105,  64,  55,  48,  42,  38,  25,  18],
  /* 1.75% */     [null,null,166, 105,  88,  55,  48,  42,  38,  25,  18],
  /* 2.00% */     [null,null,198, 132, 88,  75,  48,  42,  38,  25,  18],
  /* 2.50% */     [null,null,null,158, 110, 75,  65,  58,  38,  25,  18],
  /* 3.00% */     [null,null,null,null,132, 94,  65,  58,  52,  25,  18],
  /* 4.00% */     [null,null,null,null,null,149,109, 73,  65,  25,  18],
  /* 5.00% */     [null,null,null,null,null,null,160,115, 78,  34,  18],
  /* 6.00% */     [null,null,null,null,null,null,null,182,116, 43,  25],
  /* 7.00% */     [null,null,null,null,null,null,null,null,199, 52, 25],
];

/**
 * AICPA-style 1% risk of overreliance (99% confidence).
 * Disusun dari Poisson upper-bound formula konsisten dengan tabel A-1/A-2.
 */
// prettier-ignore
const TABLE_99: Cell[][] = [
  /* EPDR \ TDR     2%   3%   4%   5%   6%   7%   8%   9%   10%  15%  20% */
  /* 0.00% */     [230, 153, 115,  92,  76,  66,  57,  51,  46,  30,  22],
  /* 0.25% */     [366, 244, 115,  92,  76,  66,  57,  51,  46,  30,  22],
  /* 0.50% */     [null,244, 181, 144, 121, 103,  90,  79,  71,  47,  35],
  /* 0.75% */     [null,322, 181, 144, 121, 103,  90,  79,  71,  47,  35],
  /* 1.00% */     [null,null,242, 144, 121, 103,  90,  79,  71,  47,  35],
  /* 1.25% */     [null,null,294, 192, 121, 103,  90,  79,  71,  47,  35],
  /* 1.50% */     [null,null,355, 192, 159, 103,  90,  79,  71,  47,  35],
  /* 1.75% */     [null,null,null,238, 159, 137,  90,  79,  71,  47,  35],
  /* 2.00% */     [null,null,null,281, 197, 137, 119, 105,  71,  47,  35],
  /* 2.50% */     [null,null,null,null,233, 170, 119, 105,  94,  47,  35],
  /* 3.00% */     [null,null,null,null,303, 201, 148, 130,  94,  47,  35],
  /* 4.00% */     [null,null,null,null,null,null,227, 156, 138,  62,  35],
  /* 5.00% */     [null,null,null,null,null,null,null,245, 180,  62,  47],
  /* 6.00% */     [null,null,null,null,null,null,null,null,278,  78,  47],
  /* 7.00% */     [null,null,null,null,null,null,null,null,null,105, 58],
];

const TABLES: Record<ConfidenceLevel, Cell[][]> = {
  0.9: TABLE_90,
  0.95: TABLE_95,
  0.99: TABLE_99,
};

/**
 * Lookup sample size dari tabel AICPA Attribute.
 *
 * @param confidence 0.90 / 0.95 / 0.99
 * @param tolerableDeviationRate 0.02 .. 0.20 (proportion)
 * @param expectedDeviationRate 0 .. 0.07 (proportion)
 * @returns sample size (rounded as published) atau throw kalau combo invalid.
 */
export function attributeSampleSize(
  confidence: ConfidenceLevel,
  tolerableDeviationRate: number,
  expectedDeviationRate: number,
): number {
  if (expectedDeviationRate >= tolerableDeviationRate) {
    throw new Error(
      `Expected deviation rate (${expectedDeviationRate}) must be < tolerable (${tolerableDeviationRate}).`,
    );
  }
  const table = TABLES[confidence];
  if (!table) throw new Error(`Unsupported confidence: ${confidence}`);

  const tdrIdx = nearestIndex(TDR_AXIS, tolerableDeviationRate);
  const epdrIdx = nearestIndex(EPDR_AXIS, expectedDeviationRate);
  const cell = table[epdrIdx]?.[tdrIdx];

  if (cell == null) {
    throw new Error(
      `Sample size > 1500 atau combo invalid (TDR=${pct(tolerableDeviationRate)}, EPDR=${pct(expectedDeviationRate)}, conf=${pct(confidence)}). Coba longgarkan TDR atau turunkan EPDR.`,
    );
  }
  return cell;
}

function nearestIndex(axis: number[], value: number): number {
  let bestI = 0;
  let bestD = Math.abs(axis[0] - value);
  for (let i = 1; i < axis.length; i++) {
    const d = Math.abs(axis[i] - value);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(2)}%`;
}

export const ATTRIBUTE_TABLE_SOURCE_CITATION =
  "AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix A, Tables A-1 dan A-2 (sample size untuk attribute sampling).";
