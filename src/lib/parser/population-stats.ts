/**
 * Descriptive statistics atas populasi SP2D level-row. Dipakai parse-excel.ts
 * setelah aggregate untuk populate PopulasiMeta.
 */

import type { SP2DRow } from "@/types";

export interface PopulationStats {
  total: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  neg: number;
  zero: number;
}

export function computeStats(rows: SP2DRow[]): PopulationStats {
  if (rows.length === 0) {
    return { total: 0, mean: 0, median: 0, min: 0, max: 0, neg: 0, zero: 0 };
  }
  const sorted = rows.map((r) => r.nilai).sort((a, b) => a - b);
  const total = sorted.reduce((s, x) => s + x, 0);
  const mean = total / rows.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[(sorted.length - 1) / 2];
  return {
    total,
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    neg: rows.filter((r) => r.nilai < 0).length,
    zero: rows.filter((r) => r.nilai === 0).length,
  };
}
