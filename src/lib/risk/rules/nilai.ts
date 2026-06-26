/**
 * Risk Helper — kategori 'nilai' (pengadaan & threshold).
 *
 * Aturan ini bersifat heuristik audit. Mereka FLAG sinyal, bukan vonis.
 * Auditor wajib telusur dokumen pendukung (kontrak, BAST, SPK) sebelum simpulkan.
 *
 * Koreksi adversarial yang sudah dilakukan:
 *  - Threshold pengadaan langsung dipisah per kategori (Perpres 16/2018 jo 12/2021):
 *      * Barang / Pekerjaan Konstruksi / Jasa Lainnya  = Rp 200.000.000  (Pasal 38–41)
 *      * Jasa Konsultansi                              = Rp 100.000.000  (Pasal 38)
 *  - Rule "mendekati Rp 50jt" TIDAK lagi mengutip Perpres 16/2018 — angka itu
 *    bukan threshold pengadaan langsung di Perpres. Itu batas administratif
 *    SPK/Kuitansi yang sering muncul di juknis daerah. Citation: kosong.
 *  - Split paket pakai rolling-window SUM 7 hari per (vendor, OPD), bukan LAG.
 *    3–4 transaksi terpisah <Rp 200jt yg total >Rp 200jt = sinyal split.
 *  - Round number EXCLUDE akun 56xx (hibah), 57xx (bansos), honor, perjadin —
 *    di situ angka bulat normal karena lumpsum SBM.
 *  - classifyPengadaan SUPPORT dua skema BAS sekaligus:
 *      * Permendagri 13/2006 — kode_rek 522/523/524 (BAS lama, masih dipakai
 *        sebagian K/L pusat & beberapa pemda transisi).
 *      * Permendagri 90/2019 (Kepmendagri 050-5889/2021) — kode_rek
 *        5.1.02.xx.xx.xxxx (barang/jasa), 5.2.xx (modal). Ini dipakai mayoritas
 *        pemda sejak TA 2022. Tanpa support ini, file SIPD pemda akan
 *        classify-as-'unknown' SEMUA dan rule near_pl_* gak fire — BUG v0.3.7.
 */

import type { SP2DRow } from "@/types";
import type { Rule, RuleContext, RuleHit, Severity } from "../types";

// Re-export biar konsisten dengan modul rule lain (vendor.ts).
export type RuleSeverity = Severity;
export type { Rule, RuleContext, RuleHit };

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const PL_THRESHOLD_BARANG = 200_000_000; // Barang / PK / Jasa Lainnya
export const PL_THRESHOLD_KONSULTANSI = 100_000_000; // Jasa Konsultansi
export const SPK_KUITANSI_THRESHOLD = 50_000_000; // bukan Perpres — admin SPK/Kuitansi

export const ROUND_NUMBER_MIN = 50_000_000; // hanya cek round number di transaksi material
export const ROUND_NUMBER_MOD = 1_000_000; // kelipatan Rp 1 jt utuh

export const SPLIT_WINDOW_DAYS = 7;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Klasifikasi best-effort kategori pengadaan dari kode_rek belanja.
 *
 * DUKUNG DUA SKEMA BAS:
 *
 *  A. Permendagri 13/2006 (BAS lama — masih dipakai sebagian K/L pusat):
 *       522 → Belanja Barang dan Jasa (termasuk Jasa Lainnya)
 *       523 → Belanja Modal (Pekerjaan Konstruksi sering masuk 523.x)
 *       524 → Jasa Konsultansi (di sebagian pemda 524 = perjadin; best-effort)
 *
 *  B. Permendagri 90/2019 jo Kepmendagri 050-5889/2021 (BAS pemda saat ini):
 *       5.1.02.01.xx → Belanja Barang Pakai Habis / Tak Pakai Habis
 *       5.1.02.02.xx → Belanja Jasa
 *       5.1.02.03.xx → Belanja Pemeliharaan
 *       5.1.02.04.xx → Belanja Perjalanan Dinas
 *       5.2.xx       → Belanja Modal (termasuk 5.2.02 Pekerjaan Konstruksi)
 *
 *   Setelah strip non-digit, kode 5.1.02.xx jadi '5102xx' dan 5.2.xx jadi '52xx'.
 *   Strategi: cek prefix '512' (5.1.02 → barang/jasa/pemeliharaan/perjadin)
 *   atau '52' (5.2.xx → modal/konstruksi) untuk skema 90/2019, dan
 *   '522'/'523'/'524' untuk skema 13/2006.
 *
 *   Catatan klasifikasi konsultansi di BAS 90/2019: kode konsultansi di skema
 *   ini melebur di sub-rincian Belanja Jasa (5.1.02.02.xx) — tidak ada kode
 *   level-3 yang murni konsultansi. Karena itu klasifikasi konsultansi DI
 *   SINI hanya bisa diidentifikasi dari skema 13/2006 (prefix '524') —
 *   auditor wajib verifikasi via uraian / sub-rincian.
 */
export function classifyPengadaan(
  kodeRek: string | undefined,
): "barang_pk_jasa_lainnya" | "konsultansi" | "unknown" {
  if (!kodeRek) return "unknown";
  const k = kodeRek.replace(/[^0-9]/g, "");
  if (!k) return "unknown";

  // ---------- Skema A: Permendagri 13/2006 ----------
  // 3-digit prefix klasik. Dicek duluan karena lebih spesifik.
  if (k.startsWith("522") || k.startsWith("523")) return "barang_pk_jasa_lainnya";
  if (k.startsWith("524")) return "konsultansi";

  // ---------- Skema B: Permendagri 90/2019 ----------
  // Setelah strip dots: 5.1.02.xx → '5102xx', 5.2.xx → '52xx'.
  // Hati-hati ambiguitas: '52' di awal bisa muncul juga di prefix 13/2006
  // (522/523/524), tapi itu sudah ditangkap di atas. Sisanya:
  //   '5102' = 5.1.02 → Belanja Barang dan Jasa pemda (semua kategori
  //            barang habis / tak habis / jasa / pemeliharaan / perjadin
  //            di-bucket 'barang_pk_jasa_lainnya' karena threshold PL Rp 200jt
  //            yang sama).
  //   '52'   = 5.2 → Belanja Modal (termasuk 5.2.02 pekerjaan konstruksi).
  if (k.startsWith("5102")) return "barang_pk_jasa_lainnya";
  if (k.startsWith("52")) return "barang_pk_jasa_lainnya";

  return "unknown";
}

/**
 * Akun yang KEBAL aturan round number — wajar lumpsum / SBM:
 *  - 56xx Belanja Hibah
 *  - 57xx Belanja Bantuan Sosial
 *  - kode_rek / uraian mengandung 'honor', 'perjalanan dinas', 'perjadin'
 */
export function isExemptAccount(row: SP2DRow): boolean {
  const k = (row.kode_rek ?? "").replace(/[^0-9]/g, "");
  // Permendagri 13/2006 (3-digit prefix): 56=hibah, 57=bansos.
  // Permendagri 90/2019 jo Kepmendagri 050-5889/2021 (5.1.x level):
  //   5.1.05 → strip jadi '5105xx' = Belanja Hibah
  //   5.1.06 → strip jadi '5106xx' = Belanja Bantuan Sosial
  //   (5.1.07 = Bagi Hasil, BUKAN bansos — gak di-exempt)
  // FIX v0.3.14: sebelumnya salah pakai 5106/5107 (5107 = Bagi Hasil, bukan
  // lump-sum SBM; sementara hibah 5105 ke-skip dari exempt → false-positive
  // round-number).
  if (k.startsWith("56") || k.startsWith("57")) return true;
  if (k.startsWith("5105") || k.startsWith("5106")) return true;
  const blob = `${row.uraian ?? ""} ${row.kode_rek ?? ""} ${row.jenis_spm ?? ""}`.toLowerCase();
  if (/\bhonor(arium)?\b/.test(blob)) return true;
  if (/perjalanan\s*dinas|perjadin\b/.test(blob)) return true;
  return false;
}

export function isRoundNumber(nilai: number): boolean {
  if (!Number.isFinite(nilai) || nilai <= 0) return false;
  return Math.round(nilai) % ROUND_NUMBER_MOD === 0;
}

function fmtRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function parseDateMs(iso: string | undefined): number | null {
  if (!iso) return null;
  // iso = yyyy-mm-dd; parse manual biar timezone-independent
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return Date.UTC(y, mo, d);
}

function groupKey(row: SP2DRow): string | null {
  const vendor = (row.penyedia ?? "").trim();
  const opd = (row.skpd ?? "").trim();
  if (!vendor || !opd) return null;
  return `${vendor.toLowerCase()}||${opd.toLowerCase()}`;
}

// ----------------------------------------------------------------------------
// Rule 1: nilai_near_pl_200jt_barang_pk_jasa_lainnya
// ----------------------------------------------------------------------------

/**
 * Mendekati batas Pengadaan Langsung Rp 200 jt (Barang / PK / Jasa Lainnya).
 * Range 90–100% dari batas: 180.000.000 ≤ nilai ≤ 200.000.000.
 * Hanya kena baris yg klasifikasi pengadaannya == barang_pk_jasa_lainnya
 * (atau unknown — biar gak silent miss; ditandai uncertain di reason).
 */
export const ruleNearPL200jtBarangPKJasaLainnya: Rule = {
  id: "nilai_near_pl_200jt_barang_pk_jasa_lainnya",
  category: "nilai",
  label: "Mendekati batas PL Rp 200 jt (Barang/PK/Jasa Lainnya)",
  severity: "high",
  defaultOn: true,
  description:
    "Nilai SP2D berada di rentang 90–100% dari batas Pengadaan Langsung Rp 200 juta " +
    "untuk Barang / Pekerjaan Konstruksi / Jasa Lainnya. Indikasi potensi pemecahan paket " +
    "agar tetap bisa ditunjuk langsung tanpa tender.",
  citation: "Perpres 16/2018 jo 12/2021 Pasal 38–41 (Barang/PK/Jasa Lainnya)",
  run(ctx: RuleContext): RuleHit[] {
    const lo = PL_THRESHOLD_BARANG * 0.9; // 180 jt
    const hi = PL_THRESHOLD_BARANG; // 200 jt (inclusive)
    const hits: RuleHit[] = [];
    for (const row of ctx.populasi) {
      if (!Number.isFinite(row.nilai)) continue;
      if (row.nilai < lo || row.nilai > hi) continue;
      const klas = classifyPengadaan(row.kode_rek);
      if (klas === "konsultansi") continue; // jelas bukan kategori ini
      const uncertain = klas === "unknown";
      hits.push({
        sp2dIdx: row._idx,
        severity: "high",
        reason:
          `Nilai ${fmtRupiah(row.nilai)} di rentang 90–100% batas PL Rp 200 jt` +
          (uncertain ? " (klasifikasi pengadaan tidak dapat dipastikan dari kode_rek)" : ""),
        ref: {
          tag: "perpres_16_2018_pasal_38_41",
          nilai: row.nilai,
          threshold: PL_THRESHOLD_BARANG,
          kategori: "barang_pk_jasa_lainnya",
          klasifikasi: klas,
        },
      });
    }
    return hits;
  },
};

// ----------------------------------------------------------------------------
// Rule 2: nilai_near_pl_100jt_jasa_konsultansi
// ----------------------------------------------------------------------------

/**
 * Mendekati batas Pengadaan Langsung Rp 100 jt (Jasa Konsultansi).
 * Range 90–100%: 90.000.000 ≤ nilai ≤ 100.000.000.
 * Hanya kena kode_rek 524 (heuristik konsultansi — BAS Permendagri 13/2006).
 *
 * CATATAN BAS 90/2019: skema pemda tidak punya kode level-3 murni untuk
 * konsultansi (melebur di 5.1.02.02.xx Belanja Jasa). Auditor yang pakai BAS
 * 90/2019 perlu cross-check uraian / sub-rincian secara manual.
 */
export const ruleNearPL100jtJasaKonsultansi: Rule = {
  id: "nilai_near_pl_100jt_jasa_konsultansi",
  category: "nilai",
  label: "Mendekati batas PL Rp 100 jt (Jasa Konsultansi)",
  severity: "high",
  defaultOn: true,
  description:
    "Nilai SP2D Jasa Konsultansi berada di rentang 90–100% dari batas Pengadaan Langsung " +
    "Rp 100 juta. Di atas Rp 100 juta wajib seleksi konsultan.",
  citation: "Perpres 16/2018 Pasal 38 (Jasa Konsultansi)",
  run(ctx: RuleContext): RuleHit[] {
    const lo = PL_THRESHOLD_KONSULTANSI * 0.9; // 90 jt
    const hi = PL_THRESHOLD_KONSULTANSI; // 100 jt
    const hits: RuleHit[] = [];
    for (const row of ctx.populasi) {
      if (!Number.isFinite(row.nilai)) continue;
      if (row.nilai < lo || row.nilai > hi) continue;
      if (classifyPengadaan(row.kode_rek) !== "konsultansi") continue;
      hits.push({
        sp2dIdx: row._idx,
        severity: "high",
        reason: `Nilai ${fmtRupiah(row.nilai)} di rentang 90–100% batas PL Jasa Konsultansi Rp 100 jt`,
        ref: {
          tag: "perpres_16_2018_pasal_38_konsultansi",
          nilai: row.nilai,
          threshold: PL_THRESHOLD_KONSULTANSI,
          kategori: "jasa_konsultansi",
        },
      });
    }
    return hits;
  },
};

// ----------------------------------------------------------------------------
// Rule 3: nilai_near_spk_kuitansi_50jt
// ----------------------------------------------------------------------------

/**
 * Mendekati batas pembayaran SPK / Kuitansi Rp 50 jt.
 * Range 90–100%: 45.000.000 ≤ nilai ≤ 50.000.000.
 * PENTING: Angka Rp 50 jt BUKAN threshold di Perpres 16/2018. Ini batas administratif
 * SPK/Kuitansi yang lazim diatur di juknis daerah. Citation sengaja dikosongkan.
 */
export const ruleNearSPKKuitansi50jt: Rule = {
  id: "nilai_near_spk_kuitansi_50jt",
  category: "nilai",
  label: "Mendekati batas SPK/Kuitansi Rp 50 jt",
  severity: "medium",
  defaultOn: true,
  description:
    "Nilai SP2D berada di rentang 90–100% dari batas administratif pembayaran SPK/Kuitansi " +
    "Rp 50 juta yang lazim diatur di juknis pemda. Bisa jadi indikasi pemecahan kecil agar " +
    "cukup pakai kuitansi tanpa SPK.",
  // Citation sengaja dikosongkan — bukan threshold Perpres 16/2018.
  run(ctx: RuleContext): RuleHit[] {
    const lo = SPK_KUITANSI_THRESHOLD * 0.9; // 45 jt
    const hi = SPK_KUITANSI_THRESHOLD; // 50 jt
    const hits: RuleHit[] = [];
    for (const row of ctx.populasi) {
      if (!Number.isFinite(row.nilai)) continue;
      if (row.nilai < lo || row.nilai > hi) continue;
      hits.push({
        sp2dIdx: row._idx,
        severity: "medium",
        reason: `Nilai ${fmtRupiah(row.nilai)} di rentang 90–100% batas SPK/Kuitansi Rp 50 jt`,
        ref: {
          tag: "spk_kuitansi_admin",
          nilai: row.nilai,
          threshold: SPK_KUITANSI_THRESHOLD,
        },
      });
    }
    return hits;
  },
};

// ----------------------------------------------------------------------------
// Rule 4: nilai_split_paket
// ----------------------------------------------------------------------------

/**
 * Pemecahan Paket (split paket) — rolling-window 7 hari per (vendor, OPD).
 * Algoritme:
 *   a. Group baris by (penyedia, skpd) — keduanya wajib ada.
 *   b. Sort by tgl_sp2d ascending.
 *   c. Sliding window: untuk setiap titik i, ambil semua j ≤ i yang tgl-nya
 *      dalam ≤ 7 hari dari tgl[i]. Hitung SUM nilai window.
 *   d. Kalau SUM > Rp 200 jt DAN tidak ada baris tunggal di window yang ≥ Rp 200 jt
 *      (artinya kalau salah satu sudah ≥ 200 jt, dia memang pakai tender; bukan split),
 *      tandai SEMUA baris di window sebagai hit.
 */
export const ruleSplitPaket: Rule = {
  id: "nilai_split_paket",
  category: "nilai",
  label: "Indikasi Pemecahan Paket (vendor + OPD, jendela 7 hari)",
  severity: "high",
  defaultOn: true,
  description:
    "Total SP2D ke vendor yang sama dari OPD yang sama dalam jendela 7 hari kalender " +
    "melebihi Rp 200 juta, padahal tidak ada satu SP2D pun yang sendirian ≥ Rp 200 juta. " +
    "Pola ini konsisten dengan pemecahan paket agar tetap bisa pengadaan langsung.",
  citation: "Perpres 16/2018 jo 12/2021 Pasal 20 (larangan pemecahan paket)",
  run(ctx: RuleContext): RuleHit[] {
    const rows = ctx.populasi;
    const groups = new Map<string, SP2DRow[]>();
    for (const row of rows) {
      if (!Number.isFinite(row.nilai)) continue;
      const key = groupKey(row);
      if (!key) continue;
      const t = parseDateMs(row.tgl_sp2d);
      if (t === null) continue;
      let arr = groups.get(key);
      if (!arr) {
        arr = [];
        groups.set(key, arr);
      }
      arr.push(row);
    }

    const flaggedIdx = new Set<number>();
    const noteByIdx = new Map<number, string>();
    const sumByIdx = new Map<number, number>();
    const countByIdx = new Map<number, number>();
    const windowMs = SPLIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      const sorted = arr.slice().sort((a, b) => {
        const ta = parseDateMs(a.tgl_sp2d) ?? 0;
        const tb = parseDateMs(b.tgl_sp2d) ?? 0;
        return ta - tb;
      });
      let left = 0;
      for (let right = 0; right < sorted.length; right++) {
        const tr = parseDateMs(sorted[right]!.tgl_sp2d)!;
        while (left <= right && tr - parseDateMs(sorted[left]!.tgl_sp2d)! > windowMs) {
          left++;
        }
        const windowRows = sorted.slice(left, right + 1);
        if (windowRows.length < 2) continue;
        const sum = windowRows.reduce((s, r) => s + r.nilai, 0);
        if (sum <= PL_THRESHOLD_BARANG) continue;
        const anyAlreadyOverThreshold = windowRows.some((r) => r.nilai >= PL_THRESHOLD_BARANG);
        if (anyAlreadyOverThreshold) continue; // baris itu memang tender besar, bukan split
        const note =
          `Total ${windowRows.length} SP2D ke vendor & OPD yang sama dalam ${SPLIT_WINDOW_DAYS} hari ` +
          `= ${fmtRupiah(sum)} (> batas PL Rp 200 jt)`;
        for (const r of windowRows) {
          if (!flaggedIdx.has(r._idx)) {
            flaggedIdx.add(r._idx);
            noteByIdx.set(r._idx, note);
            sumByIdx.set(r._idx, sum);
            countByIdx.set(r._idx, windowRows.length);
          }
        }
      }
    }

    const hits: RuleHit[] = [];
    for (const row of rows) {
      if (!flaggedIdx.has(row._idx)) continue;
      hits.push({
        sp2dIdx: row._idx,
        severity: "high",
        reason: noteByIdx.get(row._idx) ?? "Indikasi pemecahan paket dalam jendela 7 hari.",
        ref: {
          tag: "perpres_16_2018_pasal_20",
          windowDays: SPLIT_WINDOW_DAYS,
          windowSum: sumByIdx.get(row._idx) ?? 0,
          windowCount: countByIdx.get(row._idx) ?? 0,
          threshold: PL_THRESHOLD_BARANG,
        },
      });
    }
    return hits;
  },
};

// ----------------------------------------------------------------------------
// Rule 5: nilai_round_number
// ----------------------------------------------------------------------------

/**
 * Angka bulat mencurigakan (round number).
 * nilai kelipatan Rp 1 jt utuh DAN ≥ Rp 50 jt.
 * EXCLUDE: akun 56xx (hibah), 57xx (bansos), honor, perjalanan dinas
 * — di situ angka bulat normal (lumpsum SBM).
 */
export const ruleRoundNumber: Rule = {
  id: "nilai_round_number",
  category: "nilai",
  label: "Angka bulat mencurigakan (≥ Rp 50 jt, kelipatan Rp 1 jt)",
  severity: "medium",
  defaultOn: true,
  description:
    "Nilai SP2D ≥ Rp 50 juta dan kelipatan Rp 1 juta utuh. Pada transaksi pengadaan riil " +
    "angka bulat sempurna jarang muncul karena ada PPN/PPh dan harga satuan. Akun hibah, " +
    "bansos, honor, dan perjalanan dinas dikecualikan karena memang lumpsum SBM.",
  // Citation kosong — heuristik audit, bukan klaim regulasi.
  run(ctx: RuleContext): RuleHit[] {
    const hits: RuleHit[] = [];
    for (const row of ctx.populasi) {
      if (!Number.isFinite(row.nilai)) continue;
      if (row.nilai < ROUND_NUMBER_MIN) continue;
      if (!isRoundNumber(row.nilai)) continue;
      if (isExemptAccount(row)) continue;
      hits.push({
        sp2dIdx: row._idx,
        severity: "medium",
        reason: `Nilai ${fmtRupiah(row.nilai)} bulat sempurna (kelipatan Rp 1 jt) — cek harga satuan vs PPN`,
        ref: {
          tag: "round_number_heuristic",
          nilai: row.nilai,
          modulus: ROUND_NUMBER_MOD,
        },
      });
    }
    return hits;
  },
};

// ----------------------------------------------------------------------------
// Registry
// ----------------------------------------------------------------------------

export const NILAI_RULES: Rule[] = [
  ruleNearPL200jtBarangPKJasaLainnya,
  ruleNearPL100jtJasaKonsultansi,
  ruleNearSPKKuitansi50jt,
  ruleSplitPaket,
  ruleRoundNumber,
];
