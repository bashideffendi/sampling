/**
 * Single source of truth untuk value parsing primitif: Rupiah, tanggal, nomor SP2D,
 * jenis transaksi. Sebelum modul ini ada, parseRupiah/parseDate duplikat di
 * parse-excel.ts dan aggregate-sp2d.ts dengan signature divergent — risk drift
 * di v0.3+. Konsolidasi v0.2.1 (audit Day 3).
 */

import type { JenisTrx } from "./canonical-row";

// ============================================================================
// Rupiah
// ============================================================================

/**
 * Parse string rupiah ke number. Support format:
 *   - ID: "1.234.567,89" (titik ribuan, koma desimal)
 *   - US: "1,234,567.89" (koma ribuan, titik desimal)
 *   - Plain: "1234567" / 1234567 / "1234567,89"
 *   - Negatif: "-100" atau "(100)" (parentheses)
 *   - Prefix Rp / Rp.
 *
 * Return null kalau gak parseable. Sebelumnya dua impl divergent (undefined vs
 * null) — sekarang single null.
 */
export function parseRupiah(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return null;

  let s = String(raw).trim();
  if (!s) return null;

  // Strip currency markers.
  s = s.replace(/rp\.?/gi, "").replace(/\s+/g, "").trim();

  // Parentheses + leading sign.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!s) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // ID: dot thousands, comma decimal.
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: comma thousands, dot decimal.
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Comma only — ID decimal (exactly one comma, 1-2 digits after) atau thousands.
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    // Dot only — > 1 dot = thousands; single dot dengan 3 digits after = thousands.
    const parts = s.split(".");
    if (parts.length > 2) {
      s = parts.join("");
    } else if (parts.length === 2 && parts[1].length === 3) {
      s = parts.join("");
    }
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ============================================================================
// Date
// ============================================================================

const INDONESIAN_MONTHS: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2, pebruari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agustus: 8, aug: 8,
  sep: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function excelSerialToISO(serial: number): string {
  const ms = Math.round(serial * 86400 * 1000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Parse tanggal ke ISO yyyy-mm-dd. Empty string kalau gak parseable.
 * Support:
 *   - Date instance
 *   - Excel serial number (30000–100000 range)
 *   - ISO "yyyy-mm-dd" (+ optional time)
 *   - dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
 *   - dd MMM yyyy / dd Month yyyy (Indonesian + EN abbreviations)
 *   - Last resort: Date.parse fallback
 */
export function parseDate(raw: unknown): string {
  if (raw == null || raw === "") return "";

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    return `${raw.getFullYear()}-${pad2(raw.getMonth() + 1)}-${pad2(raw.getDate())}`;
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 30000 && raw < 100000) return excelSerialToISO(raw);
    return "";
  }

  const s = String(raw).trim();
  if (!s) return "";

  // ISO yyyy-mm-dd (+ time tolerated)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    return "";
  }

  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return "";
  }

  // "2 Januari 2025" / "02-Jan-25" / "10 Mei 2025"
  const idMatch = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]+)[\s\-]+(\d{2,4})$/);
  if (idMatch) {
    const d = Number(idMatch[1]);
    const monthRaw = idMatch[2].toLowerCase();
    let y = Number(idMatch[3]);
    if (y < 100) y += 2000;
    const m = INDONESIAN_MONTHS[monthRaw] ?? INDONESIAN_MONTHS[monthRaw.slice(0, 3)];
    if (m && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return "";
  }

  // Last resort.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return "";
}

// ============================================================================
// SP2D normalization
// ============================================================================

/** Normalisasi nomor SP2D: uppercase, trim, backslash→slash, strip trailing dots. */
export function normalizeNoSp2d(raw: unknown): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\.+$/, "");
}

// ============================================================================
// Jenis transaksi
// ============================================================================

/**
 * Infer jenis transaksi dari kolom jenis_trx (atau jenis_spm) + fallback ke
 * keterangan (PFK/RETUR/NIHIL keyword match).
 */
export function inferJenisTrx(jenisRaw: unknown, keterangan?: unknown): JenisTrx {
  const j = (jenisRaw == null ? "" : String(jenisRaw)).trim().toUpperCase();
  if (j) {
    if (/\bRETUR\b/.test(j)) return "RETUR";
    if (/\bPFK\b/.test(j)) return "PFK";
    if (/\bNIHIL\b/.test(j)) return "NIHIL";
    if (/\bTU\b/.test(j)) return "TU";
    if (/\bGU\b/.test(j)) return "GU";
    if (/\bUP\b/.test(j)) return "UP";
    if (/\bLS\b/.test(j)) return "LS";
  }
  const u = (keterangan == null ? "" : String(keterangan)).toLowerCase();
  if (/\bretur\b/.test(u)) return "RETUR";
  if (/\bpfk\b|pemungutan\s+pihak\s+ketiga/i.test(u)) return "PFK";
  if (/\bnihil\b/.test(u)) return "NIHIL";
  return "OTHER";
}
