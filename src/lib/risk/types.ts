/**
 * Risk Helper — core types.
 *
 * Single source of truth buat rule registry, engine, dan UI.
 * Rules dijalanin di atas populasi SP2D yang udah ke-canonicalize (SP2DRow).
 *
 * Catatan adversarial-verify (lihat memory project_capcipcup.md):
 * - Threshold pengadaan langsung Rp 200jt = Barang/PK/Jasa Lainnya.
 *   Jasa Konsultansi PL batasnya Rp 100jt. Pisahkan per kategori di rule level,
 *   jangan campur di tipe.
 * - Jangan klaim "Perpres" buat threshold Rp 50jt (SPK/Kuitansi). Gunakan citation kosong
 *   atau label internal.
 * - NPWP valid: 15 digit (badan format lama) ATAU 16 digit (NIK WP OP, PMK-112/PMK.03/2022).
 * - Split paket pakai rolling window SUM 7-day per vendor+OPD, bukan LAG 1 baris.
 * - Round number: severity medium, EXCLUDE akun 56xx (hibah), 57xx (bansos), honor,
 *   perjadin — round di sana normal (lumpsum SBM).
 * - Vendor repeat: naikkan ke 20× total transaksi DAN nilai total >= Rp 1 M, atau pakai
 *   konsentrasi share > 50% per OPD+akun.
 * - Vendor classification by kode_rek (5.1.01/5.1.02 = pegawai/honor), bukan by nama.
 * - Benford applicable kalau populasi >= 1000, exclude gaji/honor, exclude transaksi terikat
 *   threshold regulasi, lebih bagus per-akun/per-OPD.
 * - Timing weekend defaultOff untuk LS gaji bulanan (cut-off jatuh weekend = normal).
 */

import type { SP2DRow, PopulasiMeta } from "@/types";

/** Kategori rule — dipakai grouping di UI. */
export type RuleCategory =
  | "vendor"
  | "nilai"
  | "timing"
  | "akun"
  | "opd"
  | "cross_ref"
  | "statistical"
  | "concentration";

/** Severity per rule (juga dipakai per-hit kalau rule mau down/up-rate hit tertentu). */
export type Severity = "low" | "medium" | "high";

/**
 * Context yang diterima setiap rule waktu di-run.
 *
 * - `populasi` = SP2D yang udah difilter sesuai scope analisis (mis. exclude gaji).
 * - `meta`     = ringkasan populasi (count/total/min/max/hash dll) — beberapa rule
 *                butuh ini buat threshold relatif (mis. konsentrasi vendor).
 * - `allRows`  = OPSIONAL. Populasi penuh sebelum filter, dipakai cross-ref rule
 *                (mis. cek duplicate_payment atau gap nomor SP2D lintas scope).
 */
export interface RuleContext {
  populasi: SP2DRow[];
  meta: PopulasiMeta;
  allRows?: SP2DRow[];
}

/**
 * Output per item yang ke-flag oleh rule.
 *
 * - `sp2dIdx`  = SP2DRow._idx (posisi original di file) supaya audit trail kuat,
 *                bukan index array runtime.
 * - `severity` = bisa override severity rule-level (mis. round number di nilai >Rp 1M
 *                bisa naik dari medium → high).
 * - `ref`      = payload bebas yang rule mau attach (mis. windowSum, vendorOther, dll).
 */
export interface RuleHit {
  sp2dIdx: number;
  reason: string;
  severity: Severity;
  ref?: Record<string, unknown>;
}

/**
 * Definisi rule — registry entry.
 *
 * Konvensi `id`: snake_case + prefix kategori (mis. `vendor_repeat_concentration`,
 * `nilai_split_window_7d`, `timing_weekend_non_gaji`). Konsisten supaya gampang
 * di-filter di UI dan di-test.
 *
 * `defaultOn` vs `defaultOff`:
 * - `defaultOn: true`  → rule aktif by default di Risk Helper run.
 * - `defaultOff: true` → rule EXCLUDED dari default active set (via
 *   `getDefaultActiveRuleIds` di index.ts). Dipakai buat rule yang butuh data
 *   ekstra (pagu, master vendor) atau yang high-false-positive di konteks
 *   tertentu (timing weekend buat LS gaji).
 *
 * CATATAN v0.3.8: Engine TIDAK lagi cek defaultOff. Kalau caller (UI) eksplisit
 * pasing rule defaultOff ke `runRiskRules`, engine jalanin. Caller (mis. "Select
 * All" di Risk Helper) bertanggung jawab filter via activeIds.
 */
export interface Rule {
  id: string;
  category: RuleCategory;
  severity: Severity;
  /** Short display label — fallback ke id kalau gak ada. */
  label?: string;
  description: string;
  /** Citation peraturan kalau applicable. Kosongkan kalau bukan klaim regulatori. */
  citation?: string;
  defaultOn: boolean;
  defaultOff?: boolean;
  run: (ctx: RuleContext) => RuleHit[];
}

/** Hasil eksekusi satu rule. */
export interface RuleResult {
  ruleId: string;
  category: RuleCategory;
  severity: Severity;
  description: string;
  citation?: string;
  hits: RuleHit[];
  runDurationMs: number;
}

/** Laporan agregat seluruh run Risk Helper. */
export interface RiskReport {
  results: RuleResult[];
  totalHits: number;
  /** Set _idx unik yang ke-flag minimal satu rule. */
  uniqueFlagged: Set<number>;
  runAt: string; // ISO
}
