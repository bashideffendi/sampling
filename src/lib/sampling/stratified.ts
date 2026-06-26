/**
 * Stratified Random Sampling (estimasi TOTAL salah saji — default audit BPK).
 *
 * Formula sample size (Cochran 1977, eq 5.25, estimasi TOTAL):
 *   n = (Σ N_h × S_h)² / (V_total + Σ N_h × S_h²)
 *     dengan V_total = (E / Z)²
 *
 * Allocation:
 *   - Proportional:  n_h = n × (N_h / N)
 *   - Neyman:        n_h = n × (N_h × S_h) / Σ(N_i × S_i)
 *
 * Largest Remainder Method (LRM) untuk rounding allocation supaya Σ n_h = n
 * (BUKAN Math.ceil yang bisa bikin Σ > n).
 *
 * Top stratum: item dengan nilai >= certaintyThreshold diuji 100%, dan
 * sisa populasi dihitung ulang strata-nya.
 *
 * Edge case: S_h (std dev stratum) = 0 → alokasi proporsional fallback.
 */

import type {
  StratifiedParam,
  SamplingResult,
  SP2DRow,
  SelectedItem,
} from "@/types";
import { mulberry32, sampleIndices } from "@/lib/prng/mulberry32";
import { zScore } from "@/lib/sampling/rf-table";

interface StratumStats {
  index: number;
  rows: SP2DRow[];
  N_h: number;
  sum: number;
  mean: number;
  S_h: number; // sample std dev
  upperBound: number;
  lowerBound: number;
}

export interface StratifiedSampleSize {
  n: number;
  allocations: Array<{
    stratumIndex: number;
    N_h: number;
    S_h: number;
    mean: number;
    sum: number;
    n_h: number;
    upperBound: number;
    lowerBound: number;
  }>;
  certaintyCount: number;
  certaintySum: number;
}

function computeStrata(rows: SP2DRow[], boundaries: number[]): StratumStats[] {
  // boundaries = upper bounds untuk stratum 0..K-2; stratum terakhir = >= last bound.
  // Contoh: boundaries [10jt, 100jt, 500jt] → 4 stratum: <10jt, 10-100jt, 100-500jt, >=500jt
  const sorted = [...boundaries].sort((a, b) => a - b);
  const cuts = [0, ...sorted, Infinity];
  const strata: StratumStats[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const lower = cuts[i];
    const upper = cuts[i + 1];
    const inStratum = rows.filter((r) => r.nilai >= lower && r.nilai < upper);
    const N = inStratum.length;
    const sum = inStratum.reduce((s, r) => s + r.nilai, 0);
    const mean = N > 0 ? sum / N : 0;
    const variance =
      N > 1 ? inStratum.reduce((s, r) => s + (r.nilai - mean) ** 2, 0) / (N - 1) : 0;
    const S_h = Math.sqrt(variance);
    strata.push({
      index: i,
      rows: inStratum,
      N_h: N,
      sum,
      mean,
      S_h,
      upperBound: upper,
      lowerBound: lower,
    });
  }
  return strata;
}

export function stratifiedSampleSize(
  populasi: SP2DRow[],
  param: StratifiedParam,
): StratifiedSampleSize {
  if (populasi.length === 0) throw new Error("Stratified: populasi kosong.");
  const { strataBoundaries, certaintyThreshold, totalTolerableError, confidenceLevel, allocation } = param;
  if (totalTolerableError <= 0) throw new Error("Stratified: tolerable error harus > 0.");

  // Certainty stratum (100% inspect)
  const certaintyRows = populasi.filter((r) => r.nilai >= certaintyThreshold);
  const rest = populasi.filter((r) => r.nilai < certaintyThreshold);

  const strata = computeStrata(rest, strataBoundaries).filter((s) => s.N_h > 0);
  const Z = zScore(confidenceLevel);
  const V_total = (totalTolerableError / Z) ** 2;

  const sumNh_Sh = strata.reduce((s, st) => s + st.N_h * st.S_h, 0);
  const sumNh_Sh2 = strata.reduce((s, st) => s + st.N_h * st.S_h * st.S_h, 0);

  // n untuk estimasi TOTAL: n = (Σ N_h × S_h)² / (V_total + Σ N_h × S_h²)
  // Edge case: kalau semua S_h = 0 → populasi seragam, n = 0 (gak perlu sampel) — fallback 1.
  let nRaw = 0;
  if (sumNh_Sh > 0) {
    nRaw = (sumNh_Sh * sumNh_Sh) / (V_total + sumNh_Sh2);
  }
  const totalRestN = strata.reduce((s, st) => s + st.N_h, 0);
  // Min sample size = max(1, jumlah stratum yang non-empty) supaya stratifikasi
  // gak collapse ke 1 stratum (kasus nRaw < 1 di populasi seragam / S_h kecil).
  // Kalau totalRestN < strata.length, fallback ke totalRestN (semua di-inspect).
  const minN = sumNh_Sh > 0 ? Math.min(strata.length, totalRestN) : 1;
  const n = Math.min(totalRestN, Math.max(minN, Math.ceil(nRaw)));

  // Allocation
  const idealAlloc: number[] = strata.map((st) => {
    if (allocation === "neyman" && sumNh_Sh > 0 && st.S_h > 0) {
      return n * ((st.N_h * st.S_h) / sumNh_Sh);
    }
    // proportional fallback
    return n * (st.N_h / totalRestN);
  });

  // Largest Remainder Method: floor + distribute remainder by largest fractional part.
  const floors = idealAlloc.map((x) => Math.floor(x));
  const remainders = idealAlloc.map((x, i) => ({ i, frac: x - floors[i] }));
  let assigned = floors.reduce((s, x) => s + x, 0);
  let toDistribute = n - assigned;
  remainders.sort((a, b) => b.frac - a.frac);
  const allocCounts = [...floors];
  for (let k = 0; k < toDistribute; k++) {
    const target = remainders[k % remainders.length].i;
    allocCounts[target]++;
  }
  // Clamp to N_h (jangan ambil lebih banyak dari ukuran stratum).
  for (let i = 0; i < allocCounts.length; i++) {
    if (allocCounts[i] > strata[i].N_h) {
      const overflow = allocCounts[i] - strata[i].N_h;
      allocCounts[i] = strata[i].N_h;
      // Distribute overflow ke stratum lain dengan sisa kapasitas (round-robin)
      let placed = 0;
      for (let j = 0; j < allocCounts.length && placed < overflow; j++) {
        if (j === i) continue;
        const space = strata[j].N_h - allocCounts[j];
        if (space > 0) {
          const add = Math.min(space, overflow - placed);
          allocCounts[j] += add;
          placed += add;
        }
      }
    }
  }

  return {
    n: allocCounts.reduce((s, x) => s + x, 0) + certaintyRows.length,
    allocations: strata.map((st, idx) => ({
      stratumIndex: st.index,
      N_h: st.N_h,
      S_h: st.S_h,
      mean: st.mean,
      sum: st.sum,
      n_h: allocCounts[idx],
      upperBound: st.upperBound,
      lowerBound: st.lowerBound,
    })),
    certaintyCount: certaintyRows.length,
    certaintySum: certaintyRows.reduce((s, r) => s + r.nilai, 0),
  };
}

export function stratifiedSelection(
  populasi: SP2DRow[],
  param: StratifiedParam,
): SamplingResult {
  if (populasi.length === 0) throw new Error("Stratified: populasi kosong.");
  const sizing = stratifiedSampleSize(populasi, param);
  const rng = mulberry32(param.seed);
  const warnings: string[] = [];

  // Certainty stratum 100% inspect.
  const certaintyRows = populasi.filter((r) => r.nilai >= param.certaintyThreshold);
  const certItems: SelectedItem[] = certaintyRows.map((row) => ({
    row,
    reason: "top_stratum",
    stratum: -1,
  }));

  const rest = populasi.filter((r) => r.nilai < param.certaintyThreshold);
  const strata = computeStrata(rest, param.strataBoundaries).filter((s) => s.N_h > 0);

  const restItems: SelectedItem[] = [];
  sizing.allocations.forEach((alloc) => {
    if (alloc.n_h <= 0) return;
    const stratum = strata.find((s) => s.index === alloc.stratumIndex);
    if (!stratum) return;
    const ordered = [...stratum.rows].sort((a, b) => (a.no_sp2d < b.no_sp2d ? -1 : 1));
    const idxs = sampleIndices(ordered.length, alloc.n_h, rng);
    for (const i of idxs) {
      restItems.push({ row: ordered[i], reason: "selected", stratum: alloc.stratumIndex });
    }
  });

  if (sizing.allocations.some((a) => a.n_h < 2) && param.allocation === "neyman") {
    warnings.push(
      "Beberapa stratum dapat alokasi < 2 sampel; pertimbangkan merge stratum atau ubah ke proportional.",
    );
  }

  return {
    method: "stratified",
    param,
    sampleSize: certItems.length + restItems.length,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    topStratumCount: certItems.length,
    topStratumNilai: sizing.certaintySum,
    seed: param.seed,
    selectedItems: [...certItems, ...restItems],
    computedAt: new Date().toISOString(),
    warnings,
  };
}
