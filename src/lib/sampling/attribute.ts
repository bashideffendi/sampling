/**
 * Attribute Sampling (Test of Controls).
 *
 * Sample size lookup ke AICPA Table A-1/A-2 + complementary 99% (lihat
 * attribute-table.ts). Ship 3 tabel: 90/95/99 confidence — JANGAN hardcode 95.
 *
 * Output: sample size + UDR (Upper Deviation Rate) approximation post-test.
 * Selection: SRS dengan PRNG seeded.
 */

import type {
  AttributeParam,
  SamplingResult,
  SP2DRow,
  SelectedItem,
} from "@/types";
import { mulberry32, sampleIndices } from "@/lib/prng/mulberry32";
import {
  attributeSampleSize,
  ATTRIBUTE_TABLE_SOURCE_CITATION,
} from "@/lib/sampling/attribute-table";
import { reliabilityFactor } from "@/lib/sampling/rf-table";
import { sortBySP2DSeq } from "@/lib/sampling/sort-sp2d";

export interface AttributeSampleSize {
  n: number;
  tableUsed: string;
}

export function attributeSampleSizeWithMeta(
  param: AttributeParam,
): AttributeSampleSize {
  const n = attributeSampleSize(
    param.confidenceLevel,
    param.tolerableDeviationRate,
    param.expectedDeviationRate,
  );
  return {
    n,
    tableUsed: `AICPA Appendix A, confidence ${(param.confidenceLevel * 100).toFixed(0)}%`,
  };
}

/**
 * Upper Deviation Rate (post-audit evaluation) — Poisson upper bound.
 * Disclaimer: approximation, untuk presentasi formal sebaiknya cross-check ke
 * AICPA Table A-3 / A-4. Pakai RF Poisson untuk c observed deviations.
 */
export function upperDeviationRate(
  confidence: 0.9 | 0.95 | 0.99,
  sampleSize: number,
  observedDeviations: number,
): number {
  if (sampleSize <= 0) return 1;
  const rf = reliabilityFactor(confidence, observedDeviations);
  return Math.min(1, rf / sampleSize);
}

export function attributeSelection(
  populasi: SP2DRow[],
  param: AttributeParam,
): SamplingResult {
  if (populasi.length === 0) throw new Error("Attribute: populasi kosong.");
  const sizing = attributeSampleSizeWithMeta({ ...param, populationSize: populasi.length });
  const n = Math.min(sizing.n, populasi.length);
  const rng = mulberry32(param.seed);
  const indices = sampleIndices(populasi.length, n, rng);
  const ordered = [...populasi].sort(sortBySP2DSeq);
  const selectedItems: SelectedItem[] = indices.map((i) => ({
    row: ordered[i],
    reason: "selected",
  }));
  return {
    method: "attribute",
    param,
    sampleSize: selectedItems.length,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    seed: param.seed,
    selectedItems,
    computedAt: new Date().toISOString(),
    rfSource: ATTRIBUTE_TABLE_SOURCE_CITATION,
    warnings: [],
  };
}
