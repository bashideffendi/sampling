/**
 * Discovery Sampling — fraud detection / zero-defect tolerance.
 *
 * Goal: dengan confidence 1-α, deteksi MINIMAL 1 occurrence kalau expected rate p.
 * Sample size = ceil( ln(α) / ln(1 - p) )
 *   dimana α = 1 - confidence (mis. 0.05 untuk 95% confidence)
 *
 * Use case audit BPK: pengujian indikasi fraud / kecurangan, pengujian kontrol
 * yang kritikal (zero defect required), uji kepatuhan compliance dengan
 * tolerable deviation = 0.
 *
 * Edge case:
 *   - p = 0 → throw (gak masuk akal expected zero, formula divergent)
 *   - p sangat kecil → n menjadi sangat besar (asymptotic), trade-off effort
 *   - p tinggi (>0.1) → n kecil, tapi ini tipikal substantive test bukan discovery
 *
 * Selection: SRS dengan PRNG seeded.
 */

import type {
  DiscoveryParam,
  SamplingResult,
  SP2DRow,
  SelectedItem,
} from "@/types";
import { mulberry32, sampleIndices } from "@/lib/prng/mulberry32";
import { sortBySP2DSeq } from "@/lib/sampling/sort-sp2d";

export interface DiscoverySampleSize {
  n: number;
  alpha: number;
  expectedRate: number;
}

export function discoverySampleSize(param: DiscoveryParam): DiscoverySampleSize {
  const { populationSize, confidenceLevel, expectedOccurrenceRate } = param;
  if (populationSize <= 0) throw new Error("Discovery: populationSize harus > 0.");
  if (expectedOccurrenceRate <= 0 || expectedOccurrenceRate >= 1)
    throw new Error(
      "Discovery: expectedOccurrenceRate harus di (0, 1). p=0 = formula divergent (n tak terbatas).",
    );

  const alpha = 1 - confidenceLevel;
  // n = ln(α) / ln(1 - p)
  const nRaw = Math.log(alpha) / Math.log(1 - expectedOccurrenceRate);
  // M-05: kalau p sangat kecil (mis. 0.0001), nRaw bisa raksasa (>> populationSize).
  // Throw clear error supaya auditor tahu p-nya gak feasible buat discovery —
  // suggest attribute sampling atau revisi p.
  if (nRaw > populationSize * 10) {
    throw new Error(
      `Discovery: expectedOccurrenceRate ${expectedOccurrenceRate} terlalu kecil — ` +
        `nRaw ≈ ${Math.ceil(nRaw)} jauh melebihi populationSize ${populationSize}. ` +
        `Pertimbangkan attribute sampling atau revisi p ke nilai lebih besar.`,
    );
  }
  const n = Math.min(populationSize, Math.max(1, Math.ceil(nRaw)));
  return { n, alpha, expectedRate: expectedOccurrenceRate };
}

export function discoverySelection(
  populasi: SP2DRow[],
  param: DiscoveryParam,
): SamplingResult {
  if (populasi.length === 0) throw new Error("Discovery: populasi kosong.");
  // populationSize override pakai populasi.length aktual.
  const correctedParam: DiscoveryParam = {
    ...param,
    populationSize: populasi.length,
  };
  const sizing = discoverySampleSize(correctedParam);
  const rng = mulberry32(param.seed);
  const indices = sampleIndices(populasi.length, sizing.n, rng);
  // Sort SP2D pakai running number numerik, BUKAN lex.
  const ordered = [...populasi].sort(sortBySP2DSeq);
  const selectedItems: SelectedItem[] = indices.map((i) => ({
    row: ordered[i],
    reason: "selected",
  }));

  const warnings: string[] = [];
  if (sizing.n >= populasi.length * 0.5) {
    warnings.push(
      `Sample size ${sizing.n} >= 50% populasi (${populasi.length}). Discovery sampling kurang efisien di kasus ini — pertimbangkan substantive test biasa.`,
    );
  }

  return {
    method: "discovery",
    param: correctedParam,
    sampleSize: sizing.n,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    seed: param.seed,
    selectedItems,
    computedAt: new Date().toISOString(),
    rfSource:
      "Discovery sampling — Poisson approximation. Reference: AICPA Audit Guide: Audit Sampling, Discovery Sampling chapter.",
    warnings,
  };
}

// v0.3.14: sortBySP2DSeq pindah ke @/lib/sampling/sort-sp2d (shared 7 metode).
