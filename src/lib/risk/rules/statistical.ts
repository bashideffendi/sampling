/**
 * Risk Helper v0.3.3 — Statistical rules (ported to Foundation API).
 *
 * Rule statistik bersifat indikasi (low/medium/high severity). Auditor tetap wajib substantif:
 *  - Benford = test goodness-of-fit, bukan bukti fraud (Nigrini 2012).
 *  - IQR/Tukey fence = nominal outlier, bisa wajar (proyek strategis) atau anomali.
 *  - Konsentrasi vendor (Gini) = perlu cross-check dengan kontrak.
 *
 * Adversarial-verify (lihat memory project_capcipcup.md):
 *  - Benford defaultOff, butuh n>=1000 global / n>=500 per-akun (chi-square stabil).
 *  - Exclude akun 51xx (pegawai/gaji), 5102/5104 (honor), 56xx (hibah),
 *    57xx (bansos), 5125/5121xx (perjadin) — nilainya seragam/lumpsum SBM, bukan natural.
 *  - Round-number defaultOn low tapi otomatis exclude akun di atas.
 *  - Gini concentration distinct dari vendor_concentration_dominant (yang pakai
 *    share > 50% per OPD×akun). Ini ngukur distribusi Gini per OPD (≥5 vendor).
 *
 * Foundation API:
 *  - run(ctx): RuleHit[]   (bukan evaluate)
 *  - RuleHit = { sp2dIdx, reason, severity, ref?: object }
 *  - ref TYPED OBJECT, BUKAN string
 */

import type { SP2DRow } from "@/types";
import type { Rule, RuleContext, RuleHit } from "../types";
import { vendorKey as sharedVendorKey } from "./vendor";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (exported buat test + reuse rule lain)
// ──────────────────────────────────────────────────────────────────────────────

/** Ambil prefix akun 4-digit numerik (gabungkan separator). "5.1.02.01" → "5102". */
export function akun4Prefix(kodeRek: string | undefined | null): string {
  if (!kodeRek) return "__UNKNOWN__";
  const digits = String(kodeRek).replace(/[^0-9]/g, "");
  if (digits.length < 4) return "__UNKNOWN__";
  return digits.slice(0, 4);
}

/** First significant digit (1-9). Return 0 kalau invalid / nol / negatif kecil. */
export function firstDigit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const abs = Math.abs(Math.floor(n));
  if (abs <= 0) return 0;
  const s = String(abs).replace(/^0+/, "");
  if (s.length === 0) return 0;
  const d = s.charCodeAt(0) - 48; // '0' = 48
  return d >= 1 && d <= 9 ? d : 0;
}

/** Distribusi Benford ekspektasi (d=1..9). Index 0 sengaja 0 biar 1-based. */
export const BENFORD_EXPECTED: readonly number[] = [
  0,
  0.30103,
  0.17609,
  0.12494,
  0.09691,
  0.07918,
  0.06695,
  0.05799,
  0.05115,
  0.04576,
] as const;

export interface BenfordResult {
  chi: number;
  total: number;
  counts: number[]; // index 1..9
  observedRatio: number[]; // index 1..9
}

/** Hitung chi-square Benford. df=8, critical value @ alpha=0.05 = 15.507. */
export function benfordChiSquare(values: readonly number[]): BenfordResult {
  const counts = new Array<number>(10).fill(0);
  let total = 0;
  for (const v of values) {
    const d = firstDigit(v);
    if (d >= 1 && d <= 9) {
      counts[d]++;
      total++;
    }
  }
  let chi = 0;
  const observedRatio = new Array<number>(10).fill(0);
  if (total > 0) {
    for (let d = 1; d <= 9; d++) {
      const exp = BENFORD_EXPECTED[d]! * total;
      observedRatio[d] = counts[d]! / total;
      if (exp > 0) {
        const diff = counts[d]! - exp;
        chi += (diff * diff) / exp;
      }
    }
  }
  return { chi, total, counts, observedRatio };
}

/** Chi-square critical value, df=8, alpha=0.05. */
export const BENFORD_CHI_CRITICAL_05 = 15.507;

/**
 * Akun yang di-EXCLUDE dari Benford / round-number test:
 *  51xx pegawai+gaji, 5102/5104 honor, 56xx hibah, 57xx bansos, 5125/5121xx perjadin.
 */
export function isAkunBenfordExcluded(akun4: string): boolean {
  if (!akun4 || akun4 === "__UNKNOWN__") return false;
  if (akun4.startsWith("51")) return true; // Belanja Pegawai
  if (akun4 === "5102" || akun4 === "5104") return true; // Honor
  if (akun4 === "5125" || akun4.startsWith("5121")) return true; // Perjadin
  if (akun4.startsWith("56")) return true; // Hibah
  if (akun4.startsWith("57")) return true; // Bansos
  return false;
}

/** Quantile via linear interpolation (sample sudah harus sorted asc). */
export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export interface IqrSummary {
  q1: number;
  q3: number;
  iqr: number;
  upperFence: number; // q3 + 1.5*iqr
  lowerFence: number; // q1 - 1.5*iqr
}

export function iqrSummary(values: readonly number[]): IqrSummary {
  if (values.length === 0) {
    return { q1: 0, q3: 0, iqr: 0, upperFence: 0, lowerFence: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    q1,
    q3,
    iqr,
    upperFence: q3 + 1.5 * iqr,
    lowerFence: q1 - 1.5 * iqr,
  };
}

/**
 * Gini coefficient (Brown formula) dari array share/value non-negatif.
 * 0 = perfect equality, mendekati 1 = konsentrasi ekstrem.
 */
export function giniCoefficient(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, sorted[i]!);
    sum += v;
    weightedSum += (i + 1) * v;
  }
  if (sum <= 0) return 0;
  return (2 * weightedSum) / (n * sum) - (n + 1) / n;
}

/** Cek round number — kelipatan 1.000.000 dan > 0. */
export function isRoundMillion(n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  return Math.abs(n) % 1_000_000 === 0;
}

// v0.3.11: pakai shared vendorKey dari vendor.ts (lowercase npwp:/name:)
// supaya konsisten lintas modul (vendor.ts, cluster/engine.ts, statistical.ts).
// Sebelumnya statistical.ts pake UPPERCASE NPWP:/NAME: → vendor sama bisa
// keflag inkonsisten antar rule kalau ada dedup cross-rule di masa depan.
function vendorKey(row: SP2DRow): string {
  return sharedVendorKey(row) ?? "";
}

function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Group rows by akun4 prefix. */
function groupByAkun4(rows: SP2DRow[]): Map<string, SP2DRow[]> {
  const m = new Map<string, SP2DRow[]>();
  for (const r of rows) {
    const k = akun4Prefix(r.kode_rek);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Group rows by SKPD (OPD). */
function groupBySkpd(rows: SP2DRow[]): Map<string, SP2DRow[]> {
  const m = new Map<string, SP2DRow[]>();
  for (const r of rows) {
    const k = (r.skpd ?? "").trim() || "__UNKNOWN__";
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// ──────────────────────────────────────────────────────────────────────────────
// Rule 1 — Benford global
// ──────────────────────────────────────────────────────────────────────────────
//
// Global Benford test bukan per-row signal. Karena Foundation RuleHit wajib
// punya sp2dIdx, kita attach synthetic hit ke row PERTAMA dari eligible set
// kalau (dan hanya kalau) chi-square > critical. Auditor baca dari ref summary.
// Kalau gak deviates → return [] (no hit).

const statisticalBenfordGlobal: Rule = {
  id: "statistical_benford_global",
  category: "statistical",
  severity: "low",
  defaultOn: false,
  label: "Benford's Law (Global)",
  description:
    "Uji goodness-of-fit distribusi digit pertama nilai SP2D vs distribusi Benford. " +
    "Chi-square > 15,507 (df=8, alpha=0,05) = penyimpangan signifikan, butuh follow-up. " +
    "Indikatif, bukan bukti fraud. Butuh populasi besar (n>=1000) supaya chi-square stabil.",
  citation: "Nigrini, M.J. (2012). Benford's Law: Applications for Forensic Accounting.",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;
    if (rows.length < 1000) return [];
    // Exclude akun seragam supaya tes valid.
    const eligible = rows.filter(
      (r) => !isAkunBenfordExcluded(akun4Prefix(r.kode_rek)),
    );
    if (eligible.length < 1000) return [];
    const result = benfordChiSquare(eligible.map((r) => r.nilai));
    if (result.chi <= BENFORD_CHI_CRITICAL_05) return [];
    // Deviates — attach synthetic hit ke first eligible row supaya konsisten
    // sama rule lain (row-level hit). Auditor drill-down dari ref summary.
    const firstRow = eligible[0]!;
    return [
      {
        sp2dIdx: firstRow._idx,
        severity: "low",
        reason:
          `Distribusi digit pertama populasi (n=${result.total}) menyimpang ` +
          `dari Benford: chi² = ${result.chi.toFixed(2)} > ${BENFORD_CHI_CRITICAL_05}. ` +
          `Indikasi anomali pola nominal — perlu uji substantif per akun/OPD.`,
        ref: {
          scope: "global",
          chi: result.chi,
          chiCritical: BENFORD_CHI_CRITICAL_05,
          total: result.total,
          excludedRows: rows.length - eligible.length,
          counts: result.counts.slice(1),
          observedRatio: result.observedRatio.slice(1),
          expectedRatio: BENFORD_EXPECTED.slice(1),
        },
      },
    ];
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Rule 2 — Benford per akun (4-digit)
// ──────────────────────────────────────────────────────────────────────────────

const statisticalBenfordPerAkun: Rule = {
  id: "statistical_benford_per_akun",
  category: "statistical",
  severity: "low",
  defaultOn: false,
  label: "Benford's Law per Akun",
  description:
    "Uji Benford per kode rekening (prefix 4 digit) untuk akun dengan >=500 transaksi. " +
    "Akun seragam (51xx pegawai/gaji, 5102/5104 honor, 5125 perjadin, 56xx hibah, 57xx bansos) " +
    "di-exclude karena nilainya tidak naturally generated. Akun dengan chi-square > 15,507 " +
    "di-flag — 1 summary hit per akun, top-5 row referensi di ref.sample (v0.3.10).",
  citation: "Nigrini, M.J. (2012). Benford's Law: Applications for Forensic Accounting.",
  run(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    const byAkun = groupByAkun4(ctx.populasi);
    for (const [akun, rows] of byAkun) {
      if (akun === "__UNKNOWN__") continue;
      if (isAkunBenfordExcluded(akun)) continue;
      if (rows.length < 500) continue;
      const result = benfordChiSquare(rows.map((r) => r.nilai));
      if (result.chi <= BENFORD_CHI_CRITICAL_05) continue;
      // Emit SATU hit summary per akun + cantumkan top-5 row dengan nilai terbesar
      // sebagai sample buat auditor mulai investigasi. Sebelumnya emit 1 hit per
      // row di akun → 500-row akun fail = 500 hit identik (banjir UI).
      const sampleIdxs = rows
        .slice()
        .sort((a, b) => b.nilai - a.nilai)
        .slice(0, 5)
        .map((r) => r._idx);
      // Pick row pertama sebagai anchor sp2dIdx (UI butuh single _idx buat link).
      hits.push({
        sp2dIdx: sampleIdxs[0],
        severity: "low",
        reason:
          `Akun ${akun}: chi² = ${result.chi.toFixed(2)} > ${BENFORD_CHI_CRITICAL_05} ` +
          `(n=${rows.length}). Distribusi digit pertama menyimpang dari Benford — ` +
          `${rows.length} transaksi di akun ini perlu uji substantif (top-5 di ref.sample).`,
        ref: {
          akun4: akun,
          n: rows.length,
          chi: result.chi,
          chiCritical: BENFORD_CHI_CRITICAL_05,
          sample: sampleIdxs,
        },
      });
    }
    return hits;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Rule 3 — IQR outlier per akun
// ──────────────────────────────────────────────────────────────────────────────

const statisticalIqrOutlier: Rule = {
  id: "statistical_iqr_outlier",
  category: "statistical",
  severity: "medium",
  defaultOn: true,
  label: "Outlier Nominal (IQR per Akun)",
  description:
    "Identifikasi SP2D dengan nilai di luar pagar Tukey (Q3 + 1.5×IQR) per akun (kode rek 4 digit). " +
    "Membutuhkan >=10 transaksi per akun supaya IQR meaningful. Outlier wajar saat ada proyek " +
    "strategis bernilai besar; auditor harus cek substansi (kontrak / progress).",
  run(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    const byAkun = groupByAkun4(ctx.populasi);
    for (const [akun, rows] of byAkun) {
      if (akun === "__UNKNOWN__") continue;
      if (rows.length < 10) continue;
      const values = rows.map((r) => r.nilai);
      const stats = iqrSummary(values);
      if (stats.iqr <= 0) continue; // semua nilai sama / hampir sama
      for (const r of rows) {
        if (r.nilai > stats.upperFence) {
          const multiple = stats.iqr > 0 ? (r.nilai - stats.q3) / stats.iqr : 0;
          hits.push({
            sp2dIdx: r._idx,
            severity: "medium",
            reason:
              `Akun ${akun}: nilai Rp ${formatRp(r.nilai)} > pagar atas Rp ${formatRp(stats.upperFence)} ` +
              `(${multiple.toFixed(1)}× IQR di atas Q3) — outlier nominal per akun.`,
            ref: {
              akun4: akun,
              nilai: r.nilai,
              q1: stats.q1,
              q3: stats.q3,
              iqr: stats.iqr,
              upperFence: stats.upperFence,
              iqrMultiple: multiple,
              n: rows.length,
            },
          });
        }
      }
    }
    return hits;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Rule 4 — Konsentrasi vendor per OPD (Gini coefficient)
// ──────────────────────────────────────────────────────────────────────────────
//
// Distinct dari `vendor_concentration_dominant` (vendor.ts) yang pakai
// share > 50% per (OPD × akun-prefix-4). Rule ini ukur DISTRIBUSI total
// vendor per OPD pakai Gini coefficient — statistical inequality measure,
// bukan dominasi pasangan. ID di-rename ke `..._gini` supaya jelas distinct.

const statisticalVendorConcentrationGini: Rule = {
  id: "statistical_vendor_concentration_gini",
  category: "statistical",
  severity: "high",
  defaultOn: true,
  label: "Konsentrasi Vendor per OPD (Gini)",
  description:
    "Ukur ketimpangan distribusi belanja vendor di tiap OPD pakai Gini coefficient. " +
    "Aspek statistik (distribusi), bukan repeat-count. Flag OPD dengan >=5 vendor unik, " +
    "total belanja >= Rp 1 M, dan Gini > 0,7. Trigger dominant-share dihapus v0.3.12 " +
    "karena overlap sama vendor_concentration_dominant (vendor.ts, granular per OPD×akun). " +
    "Hanya row vendor dominan yang di-flag.",
  run(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    const bySkpd = groupBySkpd(ctx.populasi);
    for (const [skpd, rows] of bySkpd) {
      if (skpd === "__UNKNOWN__") continue;
      const vendorTotals = new Map<string, number>();
      const vendorRows = new Map<string, SP2DRow[]>();
      let opdTotal = 0;
      for (const r of rows) {
        const vk = vendorKey(r);
        if (!vk) continue;
        const nilai = Math.max(0, r.nilai);
        vendorTotals.set(vk, (vendorTotals.get(vk) ?? 0) + nilai);
        const arr = vendorRows.get(vk);
        if (arr) arr.push(r);
        else vendorRows.set(vk, [r]);
        opdTotal += nilai;
      }
      if (vendorTotals.size < 5) continue;
      if (opdTotal < 1_000_000_000) continue;

      const totals = [...vendorTotals.values()];
      const gini = giniCoefficient(totals);
      let dominantVk = "";
      let dominantTotal = 0;
      for (const [vk, t] of vendorTotals) {
        if (t > dominantTotal) {
          dominantTotal = t;
          dominantVk = vk;
        }
      }
      const dominantShare = opdTotal > 0 ? dominantTotal / opdTotal : 0;
      // v0.3.12: trigger CUMA on gini > 0.7. Dulu juga fire kalau
      // dominantShare > 50%, tapi itu overlap sama `vendor_concentration_dominant`
      // di vendor.ts (group per OPD×akun, lebih granular). Gini = inequality
      // distribusi (≥5 vendor), signal unique. dominantShare di-keep di ref
      // sebagai konteks tapi gak jadi trigger.
      const hitGini = gini > 0.7;
      if (!hitGini) continue;

      const dominantRows = vendorRows.get(dominantVk) ?? [];
      for (const r of dominantRows) {
        hits.push({
          sp2dIdx: r._idx,
          severity: "high",
          reason:
            `OPD ${skpd}: vendor dominan ${dominantVk} share ${(dominantShare * 100).toFixed(1)}%, ` +
            `Gini ${gini.toFixed(2)}, total OPD Rp ${formatRp(opdTotal)} ` +
            `(${vendorTotals.size} vendor unik).`,
          ref: {
            skpd,
            vendorKey: dominantVk,
            vendorCount: vendorTotals.size,
            opdTotal,
            dominantTotal,
            dominantShare,
            gini,
            triggeredBy: "gini",
          },
        });
      }
    }
    return hits;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Rule 5 — Distribusi round number anomali per akun
// ──────────────────────────────────────────────────────────────────────────────

const statisticalRoundDistribution: Rule = {
  id: "statistical_round_distribution",
  category: "statistical",
  severity: "low",
  defaultOn: true,
  label: "Distribusi Round Number Tinggi",
  description:
    "Flag akun dengan > 30% SP2D bernilai kelipatan Rp 1 juta. Round number alami terjadi di " +
    "belanja pegawai/honor/perjadin/hibah/bansos (di-exclude), tapi di belanja barang/jasa " +
    "konsentrasi round number tinggi bisa indikasi nilai negosiasi / estimasi kasar.",
  run(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    const byAkun = groupByAkun4(ctx.populasi);
    for (const [akun, rows] of byAkun) {
      if (akun === "__UNKNOWN__") continue;
      if (isAkunBenfordExcluded(akun)) continue; // akun lumpsum di-skip — round normal di sana
      if (rows.length < 20) continue;
      let roundCount = 0;
      for (const r of rows) {
        if (isRoundMillion(r.nilai)) roundCount++;
      }
      const ratio = roundCount / rows.length;
      if (ratio <= 0.3) continue;
      for (const r of rows) {
        if (!isRoundMillion(r.nilai)) continue;
        hits.push({
          sp2dIdx: r._idx,
          severity: "low",
          reason:
            `Akun ${akun}: ${(ratio * 100).toFixed(1)}% SP2D bernilai bulat Rp juta ` +
            `(${roundCount}/${rows.length}). Nilai Rp ${formatRp(r.nilai)} termasuk round.`,
          ref: {
            akun4: akun,
            nilai: r.nilai,
            roundCount,
            akunTotal: rows.length,
            roundRatio: ratio,
          },
        });
      }
    }
    return hits;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Export rule set
// ──────────────────────────────────────────────────────────────────────────────

export const STATISTICAL_RULES: Rule[] = [
  statisticalBenfordGlobal,
  statisticalBenfordPerAkun,
  statisticalIqrOutlier,
  statisticalVendorConcentrationGini,
  statisticalRoundDistribution,
];

export {
  statisticalBenfordGlobal,
  statisticalBenfordPerAkun,
  statisticalIqrOutlier,
  statisticalVendorConcentrationGini,
  statisticalRoundDistribution,
};
