/**
 * Vendor risk rules — Risk Helper v0.3.2.
 *
 * Koreksi adversarial yang sudah diterapkan:
 *  - vendor_concentration_dominant pakai SHARE > 50% per (OPD, akun-prefix-4),
 *    BUKAN ambang "vendor muncul ≥10×" (false positive di ATK/BBM/catering rutin).
 *  - vendor_new_high_value pakai ambang Rp 200jt (PL Barang/PK/Jasa Lainnya per
 *    Perpres 16/2018 jo 12/2021 Pasal 38-41), bukan Rp 100jt — pemda besar normal
 *    bertransaksi >100jt dengan vendor baru.
 *  - vendor_npwp_invalid TERIMA 15 digit (badan, format lama) ATAU 16 digit
 *    (NIK Wajib Pajak OP, PMK-112/PMK.03/2022 efektif 2024). JANGAN reject 16 digit.
 *  - 3 rule sisanya (same_address, director_overlap, not_in_master) defaultOff
 *    karena butuh data master vendor / enrichment AHU / SIKaP yang belum ada.
 */

import type { SP2DRow } from "@/types";
import type { Rule, RuleContext, RuleHit, Severity } from "../types";

// Re-export buat backward compat dengan test fixtures.
export type RuleSeverity = Severity;
export type { Rule, RuleContext, RuleHit };

// ---------------------------------------------------------------------------
// Helpers — diexport biar bisa dipakai engine + UI + test.
// ---------------------------------------------------------------------------

/**
 * Ambil digit NPWP yang valid.
 *
 * Aturan (PMK-112/PMK.03/2022 efektif 2024):
 *  - 15 digit numeric → NPWP badan / OP format lama.
 *  - 16 digit numeric → NIK Wajib Pajak Orang Pribadi (format baru).
 *
 * Toleran terhadap separator visual (titik, strip, spasi) — buang dulu sebelum cek.
 * Return null kalau format gak match.
 */
export function extractNPWP(s: string | undefined | null): string | null {
  if (!s) return null;
  const digits = String(s).replace(/[^0-9]/g, "");
  if (digits.length === 15 || digits.length === 16) return digits;
  return null;
}

/**
 * Check digit modulus-11 untuk NPWP 15 digit (best-effort).
 *
 * Catatan: BUKAN gating — DJP gak publikasikan algoritma resmi, dan banyak NPWP
 * legacy yang "gagal" checksum padahal valid di sistem CoreTax. Dipakai hanya
 * sebagai sinyal lemah, bukan auto-reject.
 *
 * Weights (community-reverse-engineered): 2,4,5,7,9,1,2,4,5,7,9 pada 11 digit
 * pertama (di luar 3 digit KPP + 1 digit cabang). Digit ke-9 = check digit.
 */
export function checksum15Heuristic(npwp15: string): boolean {
  if (npwp15.length !== 15) return false;
  const weights = [2, 4, 5, 7, 9, 1, 2, 4, 5, 7, 9];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const d = Number(npwp15[i]);
    if (!Number.isFinite(d)) return false;
    sum += d * weights[i]!;
  }
  const check = (11 - (sum % 11)) % 10;
  return check === Number(npwp15[8]);
}

/**
 * Key vendor untuk grouping. Pakai NPWP kalau ada (paling reliable), fallback
 * ke nama vendor lowercased+trimmed. JANGAN pakai prefix CV/PT buat klasifikasi —
 * itu salah arah, klasifikasi yang benar by kode_rek (5.1.01/5.1.02 = pegawai/honor).
 */
export function vendorKey(row: SP2DRow): string | null {
  const npwp = extractNPWP(row.npwp);
  if (npwp) return `npwp:${npwp}`;
  const name = (row.penyedia ?? "").trim().toLowerCase();
  if (!name) return null;
  return `name:${name}`;
}

/**
 * Ambil prefix akun 4-SEGMENT dot-separated. "5.1.02.01.001" → "5.1.02.01".
 * Pakai buat group level-3 BAS (granular per OPD×akun di vendor_concentration).
 *
 * BEDA dengan `akun4Prefix` di statistical.ts yang return 4-DIGIT numerik
 * ("5102" — level-2 BAS, lebih kasar). Dua function intentional berbeda.
 */
export function akunPrefix4(kodeRek: string | undefined | null): string {
  if (!kodeRek) return "";
  // pertahankan separator titik kalau ada: "5.1.02.01.001" → "5.1.02.01".
  const parts = String(kodeRek).split(".");
  if (parts.length >= 4) return parts.slice(0, 4).join(".");
  // fallback: ambil 4 char numerik pertama.
  const digits = String(kodeRek).replace(/[^0-9]/g, "");
  return digits.slice(0, 4);
}

export interface VendorShareBucket {
  opd: string;
  akun: string;
  vendor: string;
  vendorNilai: number;
  bucketTotal: number;
  share: number; // 0..1
  rowIdxs: number[];
}

/**
 * Hitung share tiap vendor di tiap bucket (OPD × akun-prefix-4).
 * Skip bucket dengan <3 baris (terlalu sedikit buat klaim "dominan").
 */
export function computeVendorShareByOPDAkun(
  rows: SP2DRow[],
): Map<string, VendorShareBucket> {
  // step 1: aggregate per (opd, akun, vendor).
  const perVendor = new Map<
    string,
    { opd: string; akun: string; vendor: string; nilai: number; idxs: number[] }
  >();
  // step 2: total per (opd, akun).
  const perBucket = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const opd = (row.skpd ?? "").trim();
    const akun = akunPrefix4(row.kode_rek);
    const vendor = vendorKey(row);
    if (!opd || !akun || !vendor) continue;
    if (!Number.isFinite(row.nilai) || row.nilai <= 0) continue;

    const vKey = `${opd}||${akun}||${vendor}`;
    const bKey = `${opd}||${akun}`;

    const v = perVendor.get(vKey);
    if (v) {
      v.nilai += row.nilai;
      v.idxs.push(row._idx);
    } else {
      perVendor.set(vKey, {
        opd,
        akun,
        vendor,
        nilai: row.nilai,
        idxs: [row._idx],
      });
    }

    const b = perBucket.get(bKey);
    if (b) {
      b.total += row.nilai;
      b.count += 1;
    } else {
      perBucket.set(bKey, { total: row.nilai, count: 1 });
    }
  }

  const out = new Map<string, VendorShareBucket>();
  for (const [vKey, v] of perVendor.entries()) {
    const bKey = `${v.opd}||${v.akun}`;
    const bucket = perBucket.get(bKey);
    if (!bucket || bucket.count < 3) continue;
    if (bucket.total <= 0) continue;
    out.set(vKey, {
      opd: v.opd,
      akun: v.akun,
      vendor: v.vendor,
      vendorNilai: v.nilai,
      bucketTotal: bucket.total,
      share: v.nilai / bucket.total,
      rowIdxs: v.idxs,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule 1: vendor_concentration_dominant
// ---------------------------------------------------------------------------

const CONCENTRATION_THRESHOLD = 0.5; // 50%

export const vendorConcentrationDominant: Rule = {
  id: "vendor_concentration_dominant",
  category: "vendor",
  severity: "high",
  defaultOn: true,
  description:
    "Satu vendor menguasai >50% total belanja OPD pada akun yang sama. Indikasi pengaturan paket / loyalty buyer-supplier.",
  citation:
    "BPK Pedoman Pengujian Pengadaan — analisis konsentrasi vendor per satker/akun.",
  run(ctx) {
    const shares = computeVendorShareByOPDAkun(ctx.populasi);
    const hits: RuleHit[] = [];
    // Cap maks 5 hit per bucket (vendor+opd+akun). Sebelumnya semua rowIdxs
    // di-emit → 1 vendor dengan 50 SP2D = 50 hit identik = tabel UI banjir
    // duplikasi. Pilih top-5 by nilai biar auditor liat yang paling material.
    const MAX_HITS_PER_BUCKET = 5;
    // v0.3.14 perf: build idx→nilai Map sekali, hindari O(N) find() per idx
    // per bucket. Bisa 195M ops di 39k row × banyak bucket vendor dominan.
    const idxToNilai = new Map<number, number>();
    for (const r of ctx.populasi) {
      if (typeof r._idx === "number") idxToNilai.set(r._idx, r.nilai);
    }
    for (const bucket of shares.values()) {
      if (bucket.share <= CONCENTRATION_THRESHOLD) continue;
      const sharePct = (bucket.share * 100).toFixed(1);
      const rowsByValue = bucket.rowIdxs
        .map((idx) => ({ idx, nilai: idxToNilai.get(idx) ?? 0 }))
        .sort((a, b) => b.nilai - a.nilai);
      const totalInBucket = rowsByValue.length;
      const top = rowsByValue.slice(0, MAX_HITS_PER_BUCKET);
      const moreNote =
        totalInBucket > MAX_HITS_PER_BUCKET
          ? ` (top ${MAX_HITS_PER_BUCKET} dari ${totalInBucket} SP2D vendor di bucket — sisanya disembunyikan)`
          : "";
      for (const r of top) {
        hits.push({
          sp2dIdx: r.idx,
          severity: "high",
          reason:
            `Vendor menguasai ${sharePct}% belanja OPD "${bucket.opd}" pada akun ${bucket.akun} ` +
            `(Rp ${bucket.vendorNilai.toLocaleString("id-ID")} dari Rp ${bucket.bucketTotal.toLocaleString("id-ID")})${moreNote}.`,
          ref: {
            tag: "vendor_concentration",
            bucketRowCount: totalInBucket,
            hitsShown: top.length,
          },
        });
      }
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 2: vendor_new_high_value
// ---------------------------------------------------------------------------

const NEW_VENDOR_VALUE_THRESHOLD = 200_000_000; // Rp 200jt — batas PL Perpres 16/2018

export const vendorNewHighValue: Rule = {
  id: "vendor_new_high_value",
  category: "vendor",
  severity: "medium",
  defaultOn: true,
  description:
    "Vendor baru (tidak pernah muncul sebelumnya) langsung dapat transaksi ≥ Rp 200jt. Threshold mengacu batas Pengadaan Langsung Barang/PK/Jasa Lainnya.",
  citation: "Perpres 16/2018 jo 12/2021 Pasal 38-41 (PL Barang/PK/Jasa Lainnya).",
  run(ctx) {
    const all = ctx.allRows ?? ctx.populasi;
    // Step 1: untuk tiap vendor, cari tgl_sp2d paling awal.
    const earliestByVendor = new Map<string, string>();
    for (const row of all) {
      const key = vendorKey(row);
      if (!key || !row.tgl_sp2d) continue;
      const prev = earliestByVendor.get(key);
      if (!prev || row.tgl_sp2d < prev) {
        earliestByVendor.set(key, row.tgl_sp2d);
      }
    }
    // Step 2: di populasi aktif, flag row yang merupakan kemunculan pertama vendor
    // DAN nilai ≥ threshold. "Pertama" = tgl_sp2d row == earliest vendor.
    const hits: RuleHit[] = [];
    const seenInPopulasi = new Set<string>();
    for (const row of ctx.populasi) {
      const key = vendorKey(row);
      if (!key) continue;
      if (!Number.isFinite(row.nilai) || row.nilai < NEW_VENDOR_VALUE_THRESHOLD) continue;
      const earliest = earliestByVendor.get(key);
      if (!earliest || row.tgl_sp2d !== earliest) continue;
      // hanya 1 hit per vendor (anti duplikat kalau ada beberapa baris di tgl yang sama)
      if (seenInPopulasi.has(key)) continue;
      seenInPopulasi.add(key);
      hits.push({
        sp2dIdx: row._idx,
        severity: "medium",
        reason: `Vendor baru "${row.penyedia ?? key}" — transaksi perdana ${row.tgl_sp2d} senilai Rp ${row.nilai.toLocaleString("id-ID")} (≥ batas PL Rp 200jt).`,
        ref: { tag: "perpres_16_2018_pasal_38" },
      });
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 3: vendor_npwp_invalid
// ---------------------------------------------------------------------------

export const vendorNpwpInvalid: Rule = {
  id: "vendor_npwp_invalid",
  category: "vendor",
  severity: "high",
  defaultOn: true,
  description:
    "NPWP tidak sesuai format. Terima 15 digit (badan / OP format lama) ATAU 16 digit (NIK Wajib Pajak OP per PMK-112/PMK.03/2022 efektif 2024). Selain itu = invalid.",
  citation: "UU 28/2007 Pasal 2; PMK-112/PMK.03/2022 (NIK sebagai NPWP OP, efektif 2024).",
  run(ctx) {
    const hits: RuleHit[] = [];
    for (const row of ctx.populasi) {
      // Skip baris yang gak punya kolom penyedia (mis. SP2D GU/UP/TU/internal).
      if (!row.penyedia && !row.npwp) continue;
      const npwp = extractNPWP(row.npwp);
      if (npwp) continue; // valid format 15 atau 16 digit
      const raw = (row.npwp ?? "").trim();
      const reason = raw
        ? `NPWP "${raw}" tidak 15 digit (badan) atau 16 digit (NIK OP).`
        : `NPWP kosong untuk vendor "${row.penyedia ?? "-"}".`;
      hits.push({
        sp2dIdx: row._idx,
        severity: "high",
        reason,
        ref: { tag: "pmk_112_2022" },
      });
    }
    return hits;
  },
};

// ---------------------------------------------------------------------------
// Rule 4-6: placeholder (butuh enrichment master vendor / AHU / SIKaP).
// ---------------------------------------------------------------------------

export const vendorSameAddress: Rule = {
  id: "vendor_same_address",
  category: "vendor",
  severity: "low",
  defaultOn: false,
  description:
    "Beberapa vendor berbeda menggunakan alamat yang sama. Butuh data master vendor (SIPD/SIMDA) — placeholder, aktifkan setelah enrichment.",
  citation: "BPK Pedoman Pengujian Pengadaan — uji afiliasi vendor.",
  run() {
    return [];
  },
};

export const vendorDirectorOverlap: Rule = {
  id: "vendor_director_overlap",
  category: "vendor",
  severity: "high",
  defaultOn: false,
  description:
    "Direksi/komisaris vendor yang berbeda overlap (potensi afiliasi). Butuh enrichment dari AHU (Ditjen AHU Kemenkumham) atau SIKaP LKPP — placeholder.",
  citation: "Perpres 16/2018 Pasal 7 (benturan kepentingan).",
  run() {
    return [];
  },
};

export const vendorNotInMaster: Rule = {
  id: "vendor_not_in_master",
  category: "vendor",
  severity: "medium",
  defaultOn: false,
  description:
    "NPWP vendor tidak tercatat di master vendor SIPD/SIMDA pemda. Butuh upload master vendor — placeholder, aktifkan setelah enrichment.",
  citation: "Permendagri 77/2020 (SIPD); pengendalian intern master data vendor.",
  run() {
    return [];
  },
};

// ---------------------------------------------------------------------------
// Array export buat engine.
// ---------------------------------------------------------------------------

export const VENDOR_RULES: Rule[] = [
  vendorConcentrationDominant,
  vendorNewHighValue,
  vendorNpwpInvalid,
  vendorSameAddress,
  vendorDirectorOverlap,
  vendorNotInMaster,
];
