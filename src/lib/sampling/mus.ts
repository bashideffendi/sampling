/**
 * Monetary Unit Sampling (MUS / PPS / dollar-unit) — metode utama BPK.
 *
 * Formula (AICPA / Stringer form, verified):
 *   sample size n = ceil(BV × RF / (TM − EF × EM))
 *   sampling interval J = TM / RF                       <-- pakai TM ORIGINAL
 *   top stratum threshold = J (item ≥ J otomatis 100% inspect)
 *
 * Selection:
 *   1. Pisah top stratum (item ≥ J) → semua dipilih, dicatat reason="top_stratum".
 *   2. Pisah negatif (kalau opt in 100% inspect) → reason="negative".
 *   3. Sisa = pool PPS. Hitung cumulative monetary value.
 *   4. Random start s ∈ [1, J] pakai PRNG seeded.
 *   5. Hit point t_k = s + (k-1) × J, untuk k = 1..n_pool (sisa dari (n − top)).
 *   6. Item ke-i terpilih kalau ada t_k ∈ (cum_{i-1}, cum_i].
 *
 * UML evaluation (post-audit, future v1):
 *   UML = Basic Precision + Σ Projected Misstatement + Σ Incremental Allowance
 *   Basic Precision = J × RF(c=0)
 *   For book ≤ J: tainting% = (book - audit)/book; projected = tainting × J
 *   For book > J (top stratum): projected = book - audit (no projection)
 */

import type {
  MUSParam,
  SamplingResult,
  SP2DRow,
  SelectedItem,
} from "@/types";
import { mulberry32 } from "@/lib/prng/mulberry32";
import {
  RF_SOURCE_CITATION,
  reliabilityFactor,
} from "@/lib/sampling/rf-table";

export interface MUSSampleSize {
  n: number;
  interval: number;
  rf: number;
  bookValue: number;
  expectedFactor: number;
}

export function musSampleSize(param: MUSParam): MUSSampleSize {
  const { bookValue, tolerableMisstatement, expectedMisstatement, confidenceLevel } = param;
  if (bookValue <= 0) throw new Error("MUS: Book Value harus > 0.");
  if (tolerableMisstatement <= 0) throw new Error("MUS: Tolerable Misstatement harus > 0.");
  if (expectedMisstatement < 0) throw new Error("MUS: Expected Misstatement harus >= 0.");
  if (expectedMisstatement >= tolerableMisstatement) {
    throw new Error(
      "MUS: Expected Misstatement harus < Tolerable Misstatement (kalau >=, sample size tak terbatas).",
    );
  }

  // RF di c=0 untuk planning awal (formula klasik). Expansion factor untuk EM:
  //   EF (expansion factor) ≈ 1.6 (untuk 95%) — table AICPA. Pakai 1.5/1.6/1.9 untuk 90/95/99.
  const rf = reliabilityFactor(confidenceLevel, 0);
  const expansionFactor = expansionFactorFor(confidenceLevel);
  const denom = tolerableMisstatement - expansionFactor * expectedMisstatement;
  if (denom <= 0) {
    throw new Error(
      "MUS: TM − EF × EM ≤ 0. Tambah TM atau turunkan EM (atau confidence).",
    );
  }
  const nRaw = (bookValue * rf) / denom;
  const n = Math.max(1, Math.ceil(nRaw));
  const interval = tolerableMisstatement / rf;
  return { n, interval, rf, bookValue, expectedFactor: expansionFactor };
}

function expansionFactorFor(confidence: number): number {
  if (confidence === 0.9) return 1.5;
  if (confidence === 0.95) return 1.6;
  if (confidence === 0.99) return 1.9;
  throw new Error(`MUS: confidence tidak didukung: ${confidence}`);
}

export function musSelection(
  populasi: SP2DRow[],
  param: MUSParam,
): SamplingResult {
  if (populasi.length === 0) throw new Error("MUS: populasi kosong.");
  const warnings: string[] = [];

  // Step 1: Pisah negatif jika opt in.
  const negatives = param.includeNegativeAs100Pct
    ? populasi.filter((r) => r.nilai < 0)
    : [];
  const positives = populasi.filter((r) =>
    param.includeNegativeAs100Pct ? r.nilai >= 0 : r.nilai > 0,
  );
  if (!param.includeNegativeAs100Pct) {
    const negCount = populasi.length - positives.length;
    if (negCount > 0) {
      warnings.push(
        `${negCount} SP2D dengan nilai negatif/nol di-skip (opt-in includeNegativeAs100Pct=false).`,
      );
    }
  }

  const bookValuePositive = positives.reduce((s, r) => s + r.nilai, 0);
  const effectiveParam: MUSParam = { ...param, bookValue: bookValuePositive };
  const sizing = musSampleSize(effectiveParam);
  const { n, interval, rf } = sizing;

  // Step 2: Pisah top stratum (nilai >= interval).
  const topStratum = positives.filter((r) => r.nilai >= interval);
  const pool = positives.filter((r) => r.nilai < interval);

  // Step 3: PPS selection dari pool.
  const nFromPool = Math.max(0, n - topStratum.length);
  const selectedFromPool: SelectedItem[] = [];

  if (nFromPool > 0 && pool.length > 0) {
    const rng = mulberry32(param.seed);
    const start = rng() * interval; // ∈ [0, J)
    // Stable order by no_sp2d biar deterministik (kalau dataset sama, hasil sama).
    const orderedPool = [...pool].sort((a, b) => (a.no_sp2d < b.no_sp2d ? -1 : 1));
    let cum = 0;
    let nextHit = start;
    let hitIdx = 0;
    for (const row of orderedPool) {
      const next = cum + row.nilai;
      // Hit semua interval yang jatuh di window (cum, next] — defensive untuk
      // kasus item value lebih besar dari interval (seharusnya udah di top stratum,
      // tapi defensive coding).
      while (hitIdx < nFromPool && nextHit < next) {
        selectedFromPool.push({
          row,
          reason: "selected",
          hitValue: nextHit,
        });
        hitIdx++;
        nextHit += interval;
      }
      cum = next;
      if (hitIdx >= nFromPool) break;
    }
    if (selectedFromPool.length < nFromPool) {
      warnings.push(
        `Hanya ${selectedFromPool.length}/${nFromPool} sampel pool terpilih — populasi pool mungkin terlalu kecil relatif terhadap interval.`,
      );
    }
  }

  const selectedItems: SelectedItem[] = [
    ...topStratum.map((row) => ({ row, reason: "top_stratum" as const })),
    ...selectedFromPool,
    ...negatives.map((row) => ({ row, reason: "negative" as const })),
  ];

  // Dedup (top stratum + pool theoretically disjoint, tapi defensive).
  const seen = new Set<string>();
  const dedup: SelectedItem[] = [];
  for (const item of selectedItems) {
    if (!seen.has(item.row.no_sp2d)) {
      seen.add(item.row.no_sp2d);
      dedup.push(item);
    }
  }

  return {
    method: "mus",
    param: effectiveParam,
    sampleSize: dedup.length,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    selectionInterval: interval,
    topStratumCount: topStratum.length,
    topStratumNilai: topStratum.reduce((s, r) => s + r.nilai, 0),
    seed: param.seed,
    reliabilityFactor: rf,
    selectedItems: dedup,
    computedAt: new Date().toISOString(),
    rfSource: RF_SOURCE_CITATION,
    warnings,
  };
}
