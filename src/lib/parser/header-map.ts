/**
 * Canonical field mapping untuk header Excel SP2D dari berbagai sistem keuangan daerah
 * (SIPD Sampang, SIMDA Register, SIMDA Rincian, Sipakad, manual BPKAD).
 *
 * v0.2: ekspansi canonical field — pisah nilai_sp2d (header total) vs nilai_realisasi
 * (per baris breakdown), tambah jenis_trx, uraian_akun, keterangan. Alias regex disusun
 * dari header riil yang ditemui di lapangan plus varian umum.
 */

/** Kanonik field yang dikenali parser v0.2. */
export type CanonicalField =
  | "no_sp2d"
  | "tgl_sp2d"
  | "nilai_sp2d"
  | "nilai_realisasi"
  | "jenis_trx"
  | "skpd"
  | "kode_rek"
  | "uraian_akun"
  | "penyedia"
  | "npwp"
  | "bank"
  | "keterangan"
  | "no_spm"
  | "kegiatan"
  | "sub_kegiatan"
  | "program";

export type ColumnMap = Partial<Record<CanonicalField, number>>;

const ALIASES: Record<CanonicalField, RegExp[]> = {
  no_sp2d: [
    /^(no|nomor)\.?\s*sp2d$/,
    /^sp2d$/,
    /^no\s*bukti\s*sp2d$/,
    /^no\s*spm\/sp2d$/,
    /^nomor$/,
    /^no$/,
  ],
  tgl_sp2d: [
    /^(tanggal|tgl)\.?\s*sp2d$/,
    /^(tgl|tanggal)\s*cair$/,
    /^tanggal\s*pencairan$/,
    /^(tanggal|tgl)\.?$/,
    /^date$/,
  ],
  nilai_sp2d: [
    /^nilai\s*sp2d$/,
    /^total\s*sp2d$/,
    /^nilai\s*bersih\s*sp2d$/,
    /^netto$/,
    /^neto$/,
    /^nilai\s*netto$/,
    /^nilai\s*neto$/,
    /^jumlah\s*bayar$/,
    /^jumlah\s*bersih$/,
  ],
  nilai_realisasi: [
    /^nilai\s*realisasi$/,
    /^realisasi$/,
    /^jumlah\s*realisasi$/,
    /^(jumlah|nominal)\s*(rupiah|rp)$/,
    /^total$/,
    /^bruto$/,
    /^brutto$/,
    /^nilai\s*bruto$/,
    /^nilai\s*brutto$/,
    /^nilai\s*kotor$/,
    /^jumlah\s*kotor$/,
    /^nilai$/,
    /^jumlah$/,
    /^rupiah$/,
    /^nominal$/,
  ],
  jenis_trx: [
    /^jenis\s*(transaksi|sp2d|spp|bayar)$/,
    /^tipe\s*sp2d$/,
    /^jns\s*spm$/,
    /^jenis\s*spm$/,
    /^jenis$/,
    /^up\/?gu\/?tu\/?ls$/,
  ],
  skpd: [
    /^(skpd|opd)$/,
    /^nama\s*(skpd|opd|unit)$/,
    /^unit\s*kerja$/,
    /^satker$/,
    /^satuan\s*kerja$/,
    /^(unit|sub\s*unit)$/,
  ],
  kode_rek: [
    /^kode\s*rek(ening)?$/,
    /^kode\s*akun$/,
    /^mata\s*anggaran$/,
    /^mak$/,
    /^kode\s*sub\s*kegiatan\s*\+\s*rek$/,
    /^kd\s*rek$/,
    /^rek(ening)?$/,
    /^akun(\s*belanja)?$/,
  ],
  uraian_akun: [
    /^uraian$/,
    /^uraian\s*akun$/,
    /^nama\s*rekening$/,
    /^nama\s*akun$/,
    /^keterangan\s*akun$/,
  ],
  keterangan: [
    /^keterangan(\s*dokumen)?$/,
    /^uraian\s*sp2d$/,
    /^uraian\s*pembayaran$/,
    /^deskripsi$/,
    /^description$/,
    /^narasi$/,
  ],
  penyedia: [
    /^nama\s*(penerima|penyedia)$/,
    /^penerima$/,
    /^penyedia$/,
    /^pihak\s*ketiga$/,
    /^pihak\s*ke\s*tiga$/,
    /^nama\s*rekanan$/,
    /^rekanan$/,
    /^vendor$/,
    /^supplier$/,
  ],
  npwp: [
    /^npwp(\s*(penerima|penyedia|rekanan))?$/,
  ],
  bank: [
    /^bank(\s*penerima)?$/,
    /^nama\s*bank$/,
    /^rekening\s*penerima$/,
    /^rekening\s*bank$/,
  ],
  kegiatan: [
    /^kegiatan$/,
    /^nama\s*kegiatan$/,
    /^kd\s*keg$/,
  ],
  sub_kegiatan: [
    /^sub\s*kegiatan$/,
    /^nama\s*sub\s*kegiatan$/,
    /^kd\s*sub\s*keg$/,
  ],
  program: [
    /^program$/,
    /^nama\s*program$/,
    /^kd\s*program$/,
  ],
  no_spm: [
    /^no\s*spm$/,
    /^nomor\s*spm$/,
    /^spm$/,
  ],
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
  /** Skor 0..1 — komposit critical + optional. */
  confidence: number;
  /** Header yang tidak ter-map ke canonical field manapun. */
  unmatched: string[];
}

/** Deteksi kolom dari array header string. Greedy first-match, satu kolom max satu field. */
export function detectColumns(headers: string[]): DetectionResult {
  const normalized = headers.map(normalize);
  const map: ColumnMap = {};
  const used = new Set<number>();

  for (const [canonical, patterns] of Object.entries(ALIASES) as Array<[
    CanonicalField,
    RegExp[],
  ]>) {
    for (const pattern of patterns) {
      const idx = normalized.findIndex(
        (h, i) => !used.has(i) && pattern.test(h),
      );
      if (idx >= 0) {
        map[canonical] = idx;
        used.add(idx);
        break;
      }
    }
  }

  // Critical fields buat sampling SP2D: no, tanggal, nilai header, SKPD.
  // nilai_realisasi diterima sebagai pengganti nilai_sp2d (akan diagregasi).
  const critical: CanonicalField[] = ["no_sp2d", "tgl_sp2d", "nilai_sp2d", "skpd"];
  const optional: CanonicalField[] = [
    "kode_rek",
    "uraian_akun",
    "penyedia",
    "jenis_trx",
    "keterangan",
  ];

  const criticalHit = critical.filter((k) => map[k] !== undefined).length;
  const valueFallback =
    map.nilai_sp2d === undefined && map.nilai_realisasi !== undefined ? 1 : 0;
  const adjustedCritical = criticalHit + valueFallback;
  const criticalScore = Math.min(adjustedCritical / critical.length, 1);
  const optionalScore =
    optional.filter((k) => map[k] !== undefined).length / optional.length;
  const confidence = 0.75 * criticalScore + 0.25 * optionalScore;

  const unmatched = headers.filter((_, i) => !used.has(i));
  return { map, confidence, unmatched };
}

/** Terapkan override manual ke ColumnMap (null = hapus mapping). */
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

/** Label tampilan + flag wajib untuk tiap canonical field. */
export const CANONICAL_FIELDS_DISPLAY: Record<
  CanonicalField,
  { label: string; required: boolean }
> = {
  no_sp2d: { label: "Nomor SP2D", required: true },
  tgl_sp2d: { label: "Tanggal SP2D", required: true },
  nilai_sp2d: { label: "Nilai SP2D (Header)", required: true },
  nilai_realisasi: { label: "Nilai Realisasi (Per Baris)", required: false },
  jenis_trx: { label: "Jenis Transaksi (LS/UP/GU/TU)", required: false },
  skpd: { label: "OPD / SKPD", required: false },
  kode_rek: { label: "Kode Rekening / Akun", required: false },
  uraian_akun: { label: "Uraian Akun", required: false },
  penyedia: { label: "Penyedia / Penerima", required: false },
  npwp: { label: "NPWP", required: false },
  bank: { label: "Bank", required: false },
  keterangan: { label: "Keterangan / Uraian SP2D", required: false },
  no_spm: { label: "No SPM", required: false },
  kegiatan: { label: "Kegiatan", required: false },
  sub_kegiatan: { label: "Sub-Kegiatan", required: false },
  program: { label: "Program", required: false },
};
