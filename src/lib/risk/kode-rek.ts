/**
 * Helper kode_rekening BAS pemda (Permendagri 90/2019 + SAP).
 *
 * Format kode_rek di lapangan SANGAT bervariasi:
 *   - "5.1.02.01.0001" (canonical dengan dot)
 *   - "51020100001" (tanpa dot)
 *   - "5.1.02" (3 level aja)
 *   - "5.1.02.xx" (placeholder)
 *   - "  5.1.02.01  " (whitespace)
 *
 * Strategi: strip semua non-digit jadi string digit-only, lalu prefix
 * match. "57" cocok dengan "57xxxx" (bansos), "512" cocok dengan
 * "512xxxx" (honor sub-kelompok 5.1.02 → digit-only "5102").
 *
 * GOTCHA: setelah strip dot, "5.1.02" → "5102" (4 digit), bukan "512".
 * Jadi prefix yang dipake juga harus digit-only TANPA dot.
 */

/** Buang dot, whitespace, dan karakter non-digit lain. Empty → "". */
export function normalizeKodeRek(raw: string | undefined | null): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

/**
 * Cek apakah kode_rek mulai dengan SALAH SATU prefix di list.
 * Prefix dibandingin dalam bentuk digit-only juga (dot di prefix diabaikan).
 *
 * Contoh:
 *   matchesPrefix("5.1.02.01.0001", ["5102"]) → true   (honor)
 *   matchesPrefix("57.01.01", ["57"]) → true            (bansos)
 *   matchesPrefix("5.2.02", ["52", "53"]) → true       (modal per spec)
 *   matchesPrefix("", ["57"]) → false                   (kosong selalu false)
 */
export function matchesPrefix(
  kodeRek: string | undefined | null,
  prefixes: string[],
): boolean {
  const norm = normalizeKodeRek(kodeRek);
  if (!norm) return false;
  for (const p of prefixes) {
    const pNorm = p.replace(/\D/g, "");
    if (pNorm && norm.startsWith(pNorm)) return true;
  }
  return false;
}

/**
 * Detect akun honor.
 *
 * Per BAS Permendagri 90/2019: 5.1.02.xx = Belanja Honorarium.
 * Digit-only: prefix "5102".
 *
 * Kalau ada konvensi lain di pemda tertentu (mis. lama: 5.1.2.02),
 * normalize juga jadi "5122" — tetap beda dari 5102, jadi gak
 * over-match. Kalau perlu, tambah prefix di sini.
 */
export function isHonorAccount(kodeRek: string | undefined | null): boolean {
  return matchesPrefix(kodeRek, ["5102"]);
}

/** Belanja Bansos — kelompok 5.7.xx (digit-only "57"). */
export function isBansosAccount(kodeRek: string | undefined | null): boolean {
  return matchesPrefix(kodeRek, ["57"]);
}

/** Belanja Hibah — kelompok 5.6.xx (digit-only "56"). */
export function isHibahAccount(kodeRek: string | undefined | null): boolean {
  return matchesPrefix(kodeRek, ["56"]);
}

/**
 * Belanja Modal — per spec project: 52xx ATAU 53xx (digit-only).
 *
 * Catatan: di Permendagri 90/2019 modern, 5.2 = Belanja Barang/Jasa
 * dan 5.3 = Belanja Modal. Spec project sengaja gabungin keduanya
 * karena banyak pemda masih pake BAS lama dimana 5.2 = modal.
 * Rule severity medium aja, jadi false positive masih acceptable.
 */
export function isModalAccount(kodeRek: string | undefined | null): boolean {
  return matchesPrefix(kodeRek, ["52", "53"]);
}
