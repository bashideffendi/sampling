/**
 * Cross-reference risk rules untuk Cap Cip Cup (Risk Helper).
 *
 * Kategori: 'cross_ref' — rule yang butuh ngebandingin antar-baris populasi
 * (bukan single-row check). Contoh: duplicate payment, identical amount,
 * gap nomor SP2D, vendor ngepung multi-OPD.
 *
 * Catatan adversarial verify (penting, jangan diubah tanpa mikir):
 * - 5 RULE WAJIB sesuai mandat audit BPK (lihat memory project_capcipcup).
 * - `nilai_exceed_pagu` & `vendor_not_in_master` defaultOff karena butuh
 *   enrichment (data pagu / master vendor) yang gak selalu ada saat upload
 *   SP2D mentah. Tetap dipertahankan di registry biar UI bisa nampilin
 *   sebagai "available rule" yang user bisa enable kalau punya datanya.
 * - Vendor classification BUKAN by nama (CV/PT prefix) tapi by kode_rek.
 *   Untuk cross-ref vendor, kita pakai field `penyedia` apa adanya — rule ini
 *   ngecek pola perilaku (repeat across OPD), bukan ngklasifikasi vendor.
 * - NPWP: terima 15 digit (badan format lama) ATAU 16 digit (NIK WP OP,
 *   PMK-112/PMK.03/2022).
 *
 * API: Foundation Rule (lihat ../types.ts) — run(ctx): RuleHit[].
 * Untuk enrichment data (pagu, master vendor), gunakan ctx.allRows atau
 * inject via populasi pre-processor — saat ini rule yang butuh enrichment
 * tetap defaultOff dan return [] kalau data gak ada.
 */

import type { SP2DRow } from "@/types";
import type { Rule, RuleHit, RuleContext, Severity } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_IDENTICAL_MIN_INSTANCE = 3;
const DEFAULT_IDENTICAL_MIN_NILAI = 10_000_000;
const DEFAULT_GAP_THRESHOLD = 5;

function parseISO(d: string | undefined): number | null {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

function daysBetween(aISO: string, bISO: string): number | null {
  const a = parseISO(aISO);
  const b = parseISO(bISO);
  if (a === null || b === null) return null;
  return Math.abs(a - b) / MS_PER_DAY;
}

function normalizeText(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Bucket nilai ke kelipatan `bucketSize` (default Rp 1jt) buat fuzzy match. */
function nilaiBucket(nilai: number, bucketSize = 1_000_000): number {
  return Math.round(nilai / bucketSize) * bucketSize;
}

/** Parse nomor SP2D format SIPD: ambil running number (NNNNNN). */
export function extractSP2DSeq(noSP2D: string): number | null {
  if (!noSP2D) return null;
  // Format SIPD umum: 35.27/04.0/000123/LS/2025 atau 00123/SP2D/LS/2025
  // Strategi: split by non-digit, ambil token numerik terpanjang >=4 digit.
  const tokens = noSP2D.split(/[^0-9]+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  // Ambil yang terpanjang (running number biasanya 5-6 digit, tahun 4 digit).
  // Kalau ada tie, ambil yang BUKAN tahun (1900-2100).
  const sorted = [...tokens].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aIsYear = +a >= 1900 && +a <= 2100;
    const bIsYear = +b >= 1900 && +b <= 2100;
    return Number(aIsYear) - Number(bIsYear); // non-year first
  });
  const pick = sorted[0];
  const n = Number(pick);
  return Number.isFinite(n) ? n : null;
}

/** Group SP2D ke cluster by composite key. */
function groupBy<K>(
  rows: SP2DRow[],
  keyFn: (r: SP2DRow) => K | null
): Map<K, SP2DRow[]> {
  const m = new Map<K, SP2DRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null) continue;
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Rule 1: duplicate_payment
// ---------------------------------------------------------------------------

export const duplicatePayment: Rule = {
  id: "duplicate_payment",
  category: "cross_ref",
  severity: "high",
  defaultOn: true,
  label: "Indikasi Duplikasi Pembayaran",
  description:
    "Dua atau lebih SP2D dengan vendor, nilai (bucket Rp 1 juta), dan uraian (30 karakter pertama) yang sama dalam jendela 30 hari. Indikasi pembayaran ganda atas kewajiban yang sama.",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;
    const windowDays = DEFAULT_WINDOW_DAYS;
    const clusters = groupBy(rows, (r) => {
      const vendor = normalizeText(r.penyedia);
      const uraian = normalizeText(r.uraian).slice(0, 30);
      if (!vendor || r.nilai <= 0) return null;
      const bucket = nilaiBucket(r.nilai);
      return `${vendor}|${bucket}|${uraian}`;
    });

    const severity: Severity = "high";
    const hits: RuleHit[] = [];
    for (const [, group] of clusters) {
      if (group.length < 2) continue;
      // Cek pair-wise window
      const sorted = [...group].sort((a, b) =>
        (a.tgl_sp2d ?? "").localeCompare(b.tgl_sp2d ?? "")
      );
      const inWindow = new Set<number>();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const dist = daysBetween(sorted[i].tgl_sp2d, sorted[j].tgl_sp2d);
          if (dist === null) continue;
          if (dist <= windowDays) {
            inWindow.add(sorted[i]._idx);
            inWindow.add(sorted[j]._idx);
          }
        }
      }
      for (const r of sorted) {
        if (!inWindow.has(r._idx)) continue;
        const peers = sorted
          .filter((p) => p._idx !== r._idx && inWindow.has(p._idx))
          .map((p) => p.no_sp2d);
        hits.push({
          sp2dIdx: r._idx,
          severity,
          reason: `Vendor & nilai & uraian serupa dengan ${peers.length} SP2D lain dalam ${windowDays} hari`,
          ref: {
            peers,
            vendor: r.penyedia,
            nilai: r.nilai,
            windowDays,
          },
        });
      }
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 2: identical_amount
// ---------------------------------------------------------------------------

export const identicalAmount: Rule = {
  id: "identical_amount",
  category: "cross_ref",
  severity: "medium",
  defaultOn: true,
  label: "Nilai SP2D Identik Berulang",
  description:
    "Tiga atau lebih SP2D memiliki nilai persis sama (di atas Rp 10 juta). Potensi double-claim atau template pembayaran yang perlu diuji substansi.",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;
    const minInstance = DEFAULT_IDENTICAL_MIN_INSTANCE;
    const minNilai = DEFAULT_IDENTICAL_MIN_NILAI;

    const byNilai = groupBy(rows, (r) =>
      r.nilai > minNilai ? r.nilai : null
    );

    const severity: Severity = "medium";
    const hits: RuleHit[] = [];
    for (const [nilai, group] of byNilai) {
      if (group.length < minInstance) continue;
      const peers = group.map((g) => g.no_sp2d);
      for (const r of group) {
        hits.push({
          sp2dIdx: r._idx,
          severity,
          reason: `Nilai persis sama dengan ${group.length - 1} SP2D lain (Rp ${nilai.toLocaleString("id-ID")})`,
          ref: {
            nilai,
            count: group.length,
            peers: peers.filter((p) => p !== r.no_sp2d),
          },
        });
      }
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 3: gap_nomor_sp2d
// ---------------------------------------------------------------------------

export const gapNomorSP2D: Rule = {
  id: "gap_nomor_sp2d",
  category: "cross_ref",
  severity: "medium",
  defaultOn: false,
  defaultOff: true, // butuh format-aware parsing yang stabil per SKPD
  label: "Gap Nomor SP2D (Skip Numbering)",
  description:
    "Terdapat lompatan sekuens nomor SP2D dalam satu SKPD yang lebih besar dari ambang. Indikasi penghapusan / pembatalan / manipulasi register SP2D yang perlu dikonfirmasi ke BUD.",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;
    const gapThreshold = DEFAULT_GAP_THRESHOLD;

    // Group per SKPD, ekstrak sequence number, sort, deteksi gap.
    const bySKPD = groupBy(rows, (r) => normalizeText(r.skpd) || null);

    const severity: Severity = "medium";
    const hits: RuleHit[] = [];
    for (const [, group] of bySKPD) {
      // Map row -> seq
      const enriched = group
        .map((r) => ({ r, seq: extractSP2DSeq(r.no_sp2d) }))
        .filter((x): x is { r: SP2DRow; seq: number } => x.seq !== null)
        .sort((a, b) => a.seq - b.seq);

      if (enriched.length < 2) continue;

      for (let i = 1; i < enriched.length; i++) {
        const prev = enriched[i - 1];
        const cur = enriched[i];
        const gap = cur.seq - prev.seq;
        if (gap > gapThreshold) {
          hits.push({
            sp2dIdx: cur.r._idx,
            severity,
            reason: `Gap ${gap} nomor dari SP2D sebelumnya (${prev.r.no_sp2d}) di SKPD yang sama`,
            ref: {
              skpd: cur.r.skpd,
              prevSeq: prev.seq,
              curSeq: cur.seq,
              gap,
              prevNoSP2D: prev.r.no_sp2d,
            },
          });
        }
      }
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 4: nilai_exceed_pagu (defaultOff — butuh data pagu)
// ---------------------------------------------------------------------------

export const nilaiExceedPagu: Rule = {
  id: "nilai_exceed_pagu",
  category: "cross_ref",
  severity: "high",
  defaultOn: false,
  defaultOff: true, // butuh enrichment data pagu per (SKPD, kode_rek)
  label: "Realisasi Melebihi Pagu",
  description:
    "Akumulasi realisasi SP2D pada satu kombinasi SKPD + kode rekening melebihi nilai pagu DPA. Wajib dikonfirmasi dengan dokumen DPA / DPPA terakhir. Rule hanya aktif jika data pagu di-upload (placeholder — data pagu belum ter-wire ke RuleContext).",
  run(_ctx: RuleContext): RuleHit[] {
    // PLACEHOLDER — data pagu belum ter-wire ke RuleContext Foundation.
    // Saat enrichment pagu ditambahin ke ctx (mis. lewat meta atau side-channel),
    // re-aktifkan logic akumulasi per (skpd|kode_rek) → bandingin sama pagu.
    return [];
  },
};

// ---------------------------------------------------------------------------
// Rule 5: vendor_not_in_master (defaultOff — butuh master vendor)
// ---------------------------------------------------------------------------

export const vendorNotInMaster: Rule = {
  id: "vendor_not_in_master",
  category: "cross_ref",
  severity: "medium",
  defaultOn: false,
  defaultOff: true, // butuh enrichment master vendor NPWP
  label: "Vendor Tidak Terdaftar di Master",
  description:
    "NPWP penyedia pada SP2D tidak ditemukan pada master vendor (LPSE / e-Katalog / SIKaP). Indikasi vendor fiktif atau bypass proses pengadaan. Rule hanya aktif jika master vendor di-upload (placeholder — master vendor belum ter-wire ke RuleContext). NPWP valid: 15 atau 16 digit (PMK-112/2022).",
  run(_ctx: RuleContext): RuleHit[] {
    // PLACEHOLDER — master vendor NPWP belum ter-wire ke RuleContext Foundation.
    // Saat enrichment master vendor ditambahin ke ctx, re-aktifkan logic:
    //   - Loop rows, ambil npwp (digit-only), filter length 15 ATAU 16.
    //   - Cek apakah ada di Set master; kalau gak ada → hit.
    return [];
  },
};

// ---------------------------------------------------------------------------
// Rule 6: cross_vendor_same_uraian_diff_opd (extra)
// ---------------------------------------------------------------------------

export const crossVendorSameUraianDiffOPD: Rule = {
  id: "cross_vendor_same_uraian_diff_opd",
  category: "cross_ref",
  severity: "medium",
  defaultOn: true,
  label: "Vendor Ngepung Multi-OPD",
  description:
    "Satu vendor menerima pembayaran dengan uraian serupa dari dua atau lebih OPD berbeda dalam 30 hari. Indikasi vendor dominan / pengaturan tender lintas OPD yang perlu uji konsentrasi.",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;
    const windowDays = DEFAULT_WINDOW_DAYS;

    // Group by (vendor, uraian-prefix)
    const clusters = groupBy(rows, (r) => {
      const vendor = normalizeText(r.penyedia);
      const uraian = normalizeText(r.uraian).slice(0, 30);
      if (!vendor || !uraian) return null;
      return `${vendor}|${uraian}`;
    });

    const severity: Severity = "medium";
    const hits: RuleHit[] = [];
    for (const [, group] of clusters) {
      // Hitung distinct OPD
      const opdSet = new Set(
        group.map((r) => normalizeText(r.skpd)).filter(Boolean)
      );
      if (opdSet.size < 2) continue;

      // Cek minimal ada 2 row dari OPD beda dalam window.
      const sorted = [...group].sort((a, b) =>
        (a.tgl_sp2d ?? "").localeCompare(b.tgl_sp2d ?? "")
      );
      const flagged = new Set<number>();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i];
          const b = sorted[j];
          if (normalizeText(a.skpd) === normalizeText(b.skpd)) continue;
          const dist = daysBetween(a.tgl_sp2d, b.tgl_sp2d);
          if (dist === null || dist > windowDays) continue;
          flagged.add(a._idx);
          flagged.add(b._idx);
        }
      }

      for (const r of sorted) {
        if (!flagged.has(r._idx)) continue;
        hits.push({
          sp2dIdx: r._idx,
          severity,
          reason: `Vendor ${r.penyedia ?? "-"} menerima pembayaran serupa dari ${opdSet.size} OPD berbeda dalam ${windowDays} hari`,
          ref: {
            vendor: r.penyedia,
            opdCount: opdSet.size,
            opds: Array.from(opdSet),
            windowDays,
          },
        });
      }
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 7: cross_uraian_same_vendor_diff_opd (extra — templat copy-paste)
// ---------------------------------------------------------------------------

export const crossUraianSameVendorDiffOPD: Rule = {
  id: "cross_uraian_same_vendor_diff_opd",
  category: "cross_ref",
  severity: "low",
  defaultOn: true,
  label: "Templat Uraian Identik Lintas OPD",
  description:
    "Uraian SP2D persis sama muncul di dua atau lebih OPD berbeda (vendor boleh beda). Indikasi copy-paste templat administrasi yang patut diuji substansi pengadaannya.",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;

    // Group by uraian persis (bukan prefix — harus exact biar low severity)
    const clusters = groupBy(rows, (r) => {
      const uraian = normalizeText(r.uraian);
      if (!uraian || uraian.length < 10) return null; // skip uraian terlalu pendek
      return uraian;
    });

    const severity: Severity = "low";
    const hits: RuleHit[] = [];
    for (const [uraian, group] of clusters) {
      const opdSet = new Set(
        group.map((r) => normalizeText(r.skpd)).filter(Boolean)
      );
      if (opdSet.size < 2) continue;
      for (const r of group) {
        hits.push({
          sp2dIdx: r._idx,
          severity,
          reason: `Uraian identik muncul di ${opdSet.size} OPD berbeda`,
          ref: {
            uraian,
            opdCount: opdSet.size,
            opds: Array.from(opdSet),
          },
        });
      }
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Registry export
// ---------------------------------------------------------------------------

/** Semua rule cross-ref, dalam urutan tampil di UI. */
export const CROSS_REF_RULES: Rule[] = [
  duplicatePayment,
  identicalAmount,
  gapNomorSP2D,
  nilaiExceedPagu,
  vendorNotInMaster,
  crossVendorSameUraianDiffOPD,
  crossUraianSameVendorDiffOPD,
];
