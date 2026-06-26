/**
 * Risk rules — Timing.
 *
 * Fokus: anomali waktu di SP2D pemda — spike akhir tahun anggaran, transaksi weekend,
 * pencairan sebelum tanggal DPA berlaku, dan pre-libur panjang (spending burst sebelum
 * kantor tutup).
 *
 * Catatan adversarial (lihat docs project):
 * - `timing_weekend_holiday` defaultOff karena banyak SP2D LS gaji rutin yang cut-off
 *   jatuh weekend dan ini NORMAL (sistem generate by date). Rule mengecualikan jenis_spm
 *   "LS gaji" + heuristik kata "gaji" / "tunjangan" di uraian.
 * - `timing_year_end_spike` flag seluruh Desember — volume tinggi di akhir tahun anggaran
 *   memang normal di pemda, tapi tetap perlu audit attention (cek backdating, kejar serapan).
 * - `timing_year_end_critical` (minggu terakhir Des) severity high — window paling rawan
 *   backdate dan ngebut serapan.
 * - `timing_before_dpa` placeholder defaultOff — butuh tanggal DPA per kegiatan (belum
 *   ada di SP2DRow). Engine tetap registrasi rule supaya UI bisa expose toggle + deskripsi.
 * - `timing_pre_libur_panjang` defaultOff, severity low — hardcode kalender libur ID
 *   yang umum (lebaran/natal/tahun baru/kemerdekaan). Tahun referensi 2025.
 */

import type { SP2DRow } from "@/types";
import type { Rule, RuleContext, RuleHit } from "../types";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — parse ISO yyyy-mm-dd jadi komponen tanpa tergantung timezone.
// `new Date("2025-12-31")` itu UTC midnight; kalau pakai .getDay() di TZ +07 nanti
// bisa geser ke hari sebelumnya. Jadi parse manual.
// ──────────────────────────────────────────────────────────────────────────────

/** Parse ISO yyyy-mm-dd → {y,m,d}. Return null kalau invalid. */
export function parseISODate(
  iso: string | undefined | null,
): { y: number; m: number; d: number } | null {
  if (!iso || typeof iso !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * Day-of-week buat tanggal kalender (0 = Sunday, 6 = Saturday).
 * Pakai Date.UTC supaya bebas timezone.
 */
export function dayOfWeek(iso: string): number | null {
  const parts = parseISODate(iso);
  if (!parts) return null;
  const ts = Date.UTC(parts.y, parts.m - 1, parts.d);
  return new Date(ts).getUTCDay();
}

/** True kalau tgl_sp2d jatuh Sabtu (6) atau Minggu (0). */
export function isWeekend(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

/** True kalau bulan ISO = Desember. */
export function isDecember(iso: string): boolean {
  const parts = parseISODate(iso);
  return parts?.m === 12;
}

/** True kalau ISO masuk window Des 25 - Des 31 inclusive. */
export function isYearEndCritical(iso: string): boolean {
  const parts = parseISODate(iso);
  if (!parts) return false;
  return parts.m === 12 && parts.d >= 25 && parts.d <= 31;
}

/**
 * Cek heuristik: SP2D ini "LS gaji" / tunjangan rutin yang weekend-nya wajar.
 * Lihat jenis_spm (kalau ada) dulu, baru fallback ke kata kunci di uraian/keterangan.
 *
 * NOTE: gak boleh exclude semua "LS" — banyak LS pengadaan barang/jasa yang
 * harusnya tetap flag kalau pencairan di weekend. Yang di-exclude HANYA LS
 * yang sifatnya gaji/tunjangan/honor rutin (auto-generate by date).
 */
export function isRutinGajiTunjangan(row: SP2DRow): boolean {
  const getStr = (v: unknown): string =>
    typeof v === "string" ? v.toLowerCase() : "";

  const r = row as unknown as Record<string, unknown>;
  const jenis = getStr(r.jenis_spm);
  const uraian = getStr(r.uraian);
  const keterangan = getStr(r.keterangan);

  // Match "ls gaji", "ls tunjangan", "ls penghasilan" etc di jenis_spm
  if (
    jenis.includes("gaji") ||
    jenis.includes("tunjangan") ||
    jenis.includes("penghasilan")
  ) {
    return true;
  }

  // Fallback: kata kunci gaji/tunjangan/honor rutin di uraian / keterangan
  const text = `${uraian} ${keterangan}`;
  if (
    /\b(gaji|tunjangan|tukin|tpp|penghasilan\s+tetap|tambahan\s+penghasilan)\b/.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hardcoded kalender libur nasional ID 2025 (DOM penting buat audit TA 2025).
// Sumber: SKB 3 Menteri. Cuma yang umum panjang weekend / cuti bersama dimasukin.
// Tanggal merah single (mis 17 Agt) tetap dimasukin karena 1-3 hari sebelum =
// burst pre-libur.
//
// COVERAGE: 2024 + 2025 + 2026 (TA aktif + adjacent untuk audit lintas tahun).
// 2026 lunar holidays estimate (SKB final mungkin geser ±1 hari).
// ──────────────────────────────────────────────────────────────────────────────

export const LIBUR_NASIONAL_2024: ReadonlyArray<string> = [
  "2024-01-01", "2024-02-08", "2024-02-10", "2024-03-11",
  "2024-03-29", "2024-04-10", "2024-04-11", "2024-05-01",
  "2024-05-09", "2024-05-23", "2024-06-01", "2024-06-17",
  "2024-07-07", "2024-08-17", "2024-09-16", "2024-12-25",
];

export const LIBUR_NASIONAL_2025: ReadonlyArray<string> = [
  "2025-01-01", // Tahun Baru Masehi
  "2025-01-27", // Isra Mikraj
  "2025-01-29", // Imlek
  "2025-03-29", // Nyepi
  "2025-03-31", // Idul Fitri 1
  "2025-04-01", // Idul Fitri 2
  "2025-04-18", // Wafat Isa Almasih
  "2025-05-01", // Hari Buruh
  "2025-05-12", // Waisak
  "2025-05-29", // Kenaikan Isa Almasih
  "2025-06-01", // Pancasila
  "2025-06-06", // Idul Adha
  "2025-06-27", // Tahun Baru Hijriyah
  "2025-08-17", // Kemerdekaan
  "2025-09-05", // Maulid Nabi
  "2025-12-25", // Natal
];

export const LIBUR_NASIONAL_2026: ReadonlyArray<string> = [
  "2026-01-01", // Tahun Baru Masehi
  "2026-01-16", // Isra Mikraj (estimate)
  "2026-02-17", // Imlek (estimate)
  "2026-03-19", // Nyepi (estimate)
  "2026-03-20", // Idul Fitri 1 (estimate)
  "2026-03-21", // Idul Fitri 2 (estimate)
  "2026-04-03", // Wafat Isa Almasih
  "2026-05-01", // Hari Buruh
  "2026-05-14", // Kenaikan Isa Almasih
  "2026-05-31", // Waisak (estimate)
  "2026-05-27", // Idul Adha (estimate)
  "2026-06-01", // Pancasila
  "2026-06-16", // Tahun Baru Hijriyah (estimate)
  "2026-08-17", // Kemerdekaan
  "2026-08-25", // Maulid Nabi (estimate)
  "2026-12-25", // Natal
];

export const LIBUR_NASIONAL_ALL: ReadonlyArray<string> = [
  ...LIBUR_NASIONAL_2024,
  ...LIBUR_NASIONAL_2025,
  ...LIBUR_NASIONAL_2026,
];

/**
 * Return tanggal libur terdekat (1-3 hari ke depan) kalau ISO ada di window
 * pre-libur. Null kalau tidak.
 */
export function findPreLiburTarget(
  iso: string,
  liburList: ReadonlyArray<string> = LIBUR_NASIONAL_ALL,
): { libur: string; diffDays: number } | null {
  const sp2d = parseISODate(iso);
  if (!sp2d) return null;
  const sp2dTs = Date.UTC(sp2d.y, sp2d.m - 1, sp2d.d);
  const ONE_DAY = 24 * 60 * 60 * 1000;

  for (const libur of liburList) {
    const lp = parseISODate(libur);
    if (!lp) continue;
    const liburTs = Date.UTC(lp.y, lp.m - 1, lp.d);
    const diffDays = (liburTs - sp2dTs) / ONE_DAY;
    if (diffDays >= 1 && diffDays <= 3) {
      return { libur, diffDays };
    }
  }
  return null;
}

/** True kalau ISO di-range 1-3 hari kalender sebelum salah satu tanggal merah. */
export function isPreLiburPanjang(
  iso: string,
  liburList: ReadonlyArray<string> = LIBUR_NASIONAL_ALL,
): boolean {
  return findPreLiburTarget(iso, liburList) !== null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: ambil tgl_sp2d string dari SP2DRow (defensive).
// ──────────────────────────────────────────────────────────────────────────────

function getTglSp2d(row: SP2DRow): string {
  const r = row as unknown as Record<string, unknown>;
  const v = r.tgl_sp2d;
  return typeof v === "string" ? v : "";
}

function getIdx(row: SP2DRow, fallback: number): number {
  const r = row as unknown as Record<string, unknown>;
  const v = r._idx;
  return typeof v === "number" ? v : fallback;
}

// ──────────────────────────────────────────────────────────────────────────────
// Rule definitions — Foundation API (run(ctx) => RuleHit[]).
// ──────────────────────────────────────────────────────────────────────────────

export const timing_year_end_spike: Rule = {
  id: "timing_year_end_spike",
  category: "timing",
  severity: "medium",
  defaultOn: true,
  label: "Pencairan Desember (Akhir Tahun Anggaran)",
  description:
    "SP2D dicairkan di bulan Desember. Volume tinggi akhir tahun di pemda memang " +
    "umum karena kejar serapan, tapi tetap perlu audit attention untuk cek " +
    "backdating, mark-up volume pekerjaan, atau pekerjaan fisik belum 100% selesai.",
  run: (ctx: RuleContext): RuleHit[] => {
    const hits: RuleHit[] = [];
    for (let i = 0; i < ctx.populasi.length; i++) {
      const row = ctx.populasi[i];
      const tgl = getTglSp2d(row);
      if (!isDecember(tgl)) continue;
      const parts = parseISODate(tgl);
      hits.push({
        sp2dIdx: getIdx(row, i),
        reason: `SP2D dicairkan ${tgl} (Desember — akhir tahun anggaran).`,
        severity: "medium",
        ref: {
          tgl_sp2d: tgl,
          bulan: parts?.m ?? null,
          tahun: parts?.y ?? null,
        },
      });
    }
    return hits;
  },
};

export const timing_year_end_critical: Rule = {
  id: "timing_year_end_critical",
  category: "timing",
  severity: "high",
  defaultOn: true,
  label: "Spike Kritikal Akhir Tahun (25-31 Desember)",
  description:
    "SP2D dicairkan di minggu terakhir Desember (25-31 Des). Window paling rawan " +
    "backdate dokumen pertanggungjawaban dan ngebut serapan saat kantor sebagian " +
    "sudah tutup libur Natal. Cross-check dengan BAST dan progres fisik.",
  run: (ctx: RuleContext): RuleHit[] => {
    const hits: RuleHit[] = [];
    for (let i = 0; i < ctx.populasi.length; i++) {
      const row = ctx.populasi[i];
      const tgl = getTglSp2d(row);
      if (!isYearEndCritical(tgl)) continue;
      const parts = parseISODate(tgl);
      hits.push({
        sp2dIdx: getIdx(row, i),
        reason: `SP2D dicairkan ${tgl} (25-31 Des — window kritikal akhir tahun).`,
        severity: "high",
        ref: {
          tgl_sp2d: tgl,
          tanggal: parts?.d ?? null,
          bulan: parts?.m ?? null,
          tahun: parts?.y ?? null,
        },
      });
    }
    return hits;
  },
};

export const timing_weekend_holiday: Rule = {
  id: "timing_weekend_holiday",
  category: "timing",
  severity: "medium",
  defaultOn: false,
  label: "Pencairan di Hari Sabtu / Minggu",
  description:
    "SP2D dicairkan di hari Sabtu atau Minggu. Default OFF karena banyak false " +
    "positive: SP2D LS gaji / tunjangan rutin yang cut-off-nya jatuh weekend itu " +
    "normal (sistem generate by date). Rule mengecualikan SP2D yang teridentifikasi " +
    "sebagai gaji / tunjangan / tukin / TPP via jenis_spm atau uraian.",
  run: (ctx: RuleContext): RuleHit[] => {
    const hits: RuleHit[] = [];
    for (let i = 0; i < ctx.populasi.length; i++) {
      const row = ctx.populasi[i];
      const tgl = getTglSp2d(row);
      if (!isWeekend(tgl)) continue;
      if (isRutinGajiTunjangan(row)) continue;
      const dow = dayOfWeek(tgl);
      const hari = dow === 0 ? "Minggu" : "Sabtu";
      hits.push({
        sp2dIdx: getIdx(row, i),
        reason: `SP2D dicairkan hari ${hari} (${tgl}) — bukan LS gaji/tunjangan rutin.`,
        severity: "medium",
        ref: {
          tgl_sp2d: tgl,
          day_of_week: dow,
          hari,
        },
      });
    }
    return hits;
  },
};

export const timing_before_dpa: Rule = {
  id: "timing_before_dpa",
  category: "timing",
  severity: "high",
  defaultOn: false,
  label: "Pencairan Sebelum Tanggal DPA Berlaku (placeholder)",
  description:
    "SP2D dicairkan sebelum tanggal DPA / DPPA yang mendasarinya berlaku — indikasi " +
    "kuat backdate atau pencairan tanpa dasar anggaran sah. Default OFF: butuh data " +
    "tanggal DPA per kegiatan yang belum tersedia di canonical SP2DRow. Aktifkan " +
    "setelah enrichment DPA selesai.",
  // Placeholder: tanpa data DPA, hits selalu kosong (engine skip clean).
  run: (_ctx: RuleContext): RuleHit[] => {
    return [];
  },
};

export const timing_pre_libur_panjang: Rule = {
  id: "timing_pre_libur_panjang",
  category: "timing",
  severity: "low",
  defaultOn: false,
  label: "Pencairan 1-3 Hari Sebelum Libur Panjang",
  description:
    "SP2D dicairkan 1-3 hari kalender sebelum libur nasional (lebaran / natal / " +
    "tahun baru / hari besar). Pola burst pre-libur kadang dipakai supaya dana cair " +
    "dulu sebelum kantor tutup. Severity rendah karena banyak yang legit (mis. " +
    "THR, gaji-13, pembayaran rutin sebelum cuti bersama).",
  run: (ctx: RuleContext): RuleHit[] => {
    const hits: RuleHit[] = [];
    for (let i = 0; i < ctx.populasi.length; i++) {
      const row = ctx.populasi[i];
      const tgl = getTglSp2d(row);
      const target = findPreLiburTarget(tgl);
      if (!target) continue;
      hits.push({
        sp2dIdx: getIdx(row, i),
        reason: `SP2D ${tgl} dicairkan ${target.diffDays} hari sebelum libur nasional ${target.libur}.`,
        severity: "low",
        ref: {
          tgl_sp2d: tgl,
          libur_target: target.libur,
          diff_days: target.diffDays,
        },
      });
    }
    return hits;
  },
};

/** Semua rule timing — di-export sebagai array buat di-merge engine pusat. */
export const TIMING_RULES: Rule[] = [
  timing_year_end_spike,
  timing_year_end_critical,
  timing_weekend_holiday,
  timing_before_dpa,
  timing_pre_libur_panjang,
];
