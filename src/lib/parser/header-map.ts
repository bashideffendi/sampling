/**
 * Canonical field mapping untuk header Excel SP2D dari berbagai sistem
 * (SIPD, SIMDA, Sipakad, manual BPKAD).
 *
 * Strategi: normalize header (lowercase, strip dots, collapse whitespace),
 * lalu match dengan alias list per canonical field. Auto-detect confidence
 * dihitung dari % field penting (no_sp2d, tgl, nilai, skpd) yang ketemu.
 */

import type { CanonicalField, ColumnMap } from "@/types";

const ALIASES: Record<CanonicalField, RegExp[]> = {
  no_sp2d: [
    /^(no|nomor)\s*sp2d$/,
    /^sp2d$/,
    /^no\s*\.?\s*sp2d$/,
    /^nomor$/,
    /^no$/,
  ],
  tgl_sp2d: [
    /^(tanggal|tgl)\s*sp2d$/,
    /^(tanggal|tgl)\.?$/,
    /^(tgl)\s*cair$/,
    /^date$/,
  ],
  nilai_bruto: [
    /^(nilai|jumlah)\s*(bruto|brutto|kotor)$/,
    /^bruto$/,
    /^brutto$/,
    /^nilai$/,
    /^(jumlah|nominal)\s*(rupiah|rp)?$/,
    /^rupiah$/,
    /^jumlah$/,
    /^total$/,
    /^nominal$/,
  ],
  nilai_netto: [
    /^(nilai|jumlah)\s*(netto|neto|bersih)$/,
    /^(netto|neto)$/,
    /^(jumlah)\s*bersih$/,
  ],
  skpd: [
    /^opd$/,
    /^skpd$/,
    /^(unit|sub\s*unit)$/,
    /^satuan\s*kerja$/,
    /^satker$/,
    /^unit\s*kerja$/,
    /^nama\s*(opd|skpd|unit)$/,
  ],
  kode_rek: [
    /^kode\s*rek(ening)?$/,
    /^akun(\s*belanja)?$/,
    /^kode\s*akun$/,
    /^mata\s*anggaran$/,
    /^mak$/,
    /^kd\s*rek$/,
    /^rek(ening)?$/,
  ],
  uraian: [
    /^uraian$/,
    /^keterangan$/,
    /^deskripsi$/,
    /^description$/,
    /^narasi$/,
  ],
  penyedia: [
    /^penyedia$/,
    /^vendor$/,
    /^penerima$/,
    /^nama\s*penyedia$/,
    /^supplier$/,
    /^rekanan$/,
    /^nama\s*penerima$/,
    /^pihak\s*ke\s*tiga$/,
  ],
  npwp: [/^npwp$/, /^npwp\s*penyedia$/],
  bank: [/^bank$/, /^nama\s*bank$/, /^bank\s*penerima$/, /^rekening\s*bank$/],
  no_spm: [/^no\s*spm$/, /^nomor\s*spm$/, /^spm$/],
  kegiatan: [/^kegiatan$/, /^nama\s*kegiatan$/, /^kd\s*keg$/],
  sub_kegiatan: [/^sub\s*kegiatan$/, /^nama\s*sub\s*kegiatan$/, /^kd\s*sub\s*keg$/],
  jenis_spm: [
    /^jenis\s*spm$/,
    /^jenis$/,
    /^jns\s*spm$/,
    /^up\/?gu\/?tu\/?ls$/,
  ],
  program: [/^program$/, /^nama\s*program$/, /^kd\s*program$/],
};

function normalize(header: string): string {
  return header
    .toLowerCase()
    .replace(/[._\-:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DetectionResult {
  map: ColumnMap;
  confidence: number; // 0-1
  unmatched: string[]; // header columns not mapped
}

export function detectColumns(headers: string[]): DetectionResult {
  const normalized = headers.map(normalize);
  const map: ColumnMap = {};
  const used = new Set<number>();

  for (const [canonical, patterns] of Object.entries(ALIASES) as Array<[
    CanonicalField,
    RegExp[],
  ]>) {
    for (const pattern of patterns) {
      const idx = normalized.findIndex((h, i) => !used.has(i) && pattern.test(h));
      if (idx >= 0) {
        map[canonical] = idx;
        used.add(idx);
        break;
      }
    }
  }

  // Confidence: weight critical fields more.
  const critical: CanonicalField[] = ["no_sp2d", "tgl_sp2d", "nilai_bruto", "skpd"];
  const optional: CanonicalField[] = ["kode_rek", "uraian", "penyedia"];
  const criticalHit = critical.filter((k) => map[k] !== undefined).length;
  // Allow netto as fallback for bruto
  const valueHit = map.nilai_bruto !== undefined || map.nilai_netto !== undefined;
  const adjusted = criticalHit + (valueHit && map.nilai_bruto === undefined ? 1 : 0);
  const criticalScore = adjusted / critical.length;
  const optionalScore =
    optional.filter((k) => map[k] !== undefined).length / optional.length;
  const confidence = 0.75 * criticalScore + 0.25 * optionalScore;

  const unmatched = headers.filter((_, i) => !used.has(i));
  return { map, confidence, unmatched };
}

/** Apply a manual override to a detection result. */
export function applyOverride(
  current: ColumnMap,
  field: CanonicalField,
  columnIndex: number | null,
): ColumnMap {
  const next = { ...current };
  if (columnIndex === null) {
    delete next[field];
  } else {
    next[field] = columnIndex;
  }
  return next;
}

export const CANONICAL_FIELDS_DISPLAY: Record<CanonicalField, { label: string; required: boolean }> = {
  no_sp2d: { label: "Nomor SP2D", required: true },
  tgl_sp2d: { label: "Tanggal SP2D", required: true },
  nilai_bruto: { label: "Nilai Bruto / Rupiah", required: true },
  nilai_netto: { label: "Nilai Netto", required: false },
  skpd: { label: "OPD / SKPD", required: false },
  kode_rek: { label: "Kode Rekening / Akun", required: false },
  uraian: { label: "Uraian", required: false },
  penyedia: { label: "Penyedia / Penerima", required: false },
  npwp: { label: "NPWP", required: false },
  bank: { label: "Bank", required: false },
  no_spm: { label: "No SPM", required: false },
  kegiatan: { label: "Kegiatan", required: false },
  sub_kegiatan: { label: "Sub-Kegiatan", required: false },
  jenis_spm: { label: "Jenis SPM (UP/GU/TU/LS)", required: false },
  program: { label: "Program", required: false },
};
