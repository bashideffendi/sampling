/**
 * Fingerprint detector untuk file Excel SP2D.
 *
 * Tugas:
 *   1. Aggregate-file guard — tolak LRA/SIKD (ada kolom Bulan/Triwulan/Periode
 *      tapi gak ada Nomor SP2D).
 *   2. Score per format (SIPD, SIMDA_REGISTER, SIMDA_RINCIAN, SIPAKAD,
 *      GENERIC_BPKAD) berdasar required + bonus headers.
 *   3. Tie-break — kalau ada >=2 format dengan score >= 0.7, pilih yang
 *      exact required match-nya paling banyak.
 *   4. Granularity classification — group sample rows by no_sp2d, klasifikasi
 *      jadi line_item / sp2d_header / ambiguous.
 *
 * Asumsi: sampleRows sudah di-strip subtotal sebelum masuk sini.
 */

import type { Format, Granularity, FingerprintResult } from "./canonical-row";
export type { FingerprintResult } from "./canonical-row";

// ---------------------------------------------------------------------------
// Normalisasi header
// ---------------------------------------------------------------------------

function normalizeHeader(header: string): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[._\-:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map(normalizeHeader);
}

/**
 * Cek apakah salah satu pattern (alias) match dengan salah satu header.
 * Pattern bisa string literal (akan di-normalize) atau RegExp.
 */
function hasHeader(
  normalized: string[],
  patterns: Array<string | RegExp>,
): boolean {
  for (const pat of patterns) {
    if (pat instanceof RegExp) {
      if (normalized.some((h) => pat.test(h))) return true;
    } else {
      const target = normalizeHeader(pat);
      if (normalized.some((h) => h === target)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Spesifikasi per format
// ---------------------------------------------------------------------------

interface FormatSpec {
  /** Daftar required headers — masing-masing item adalah array "alternatif"
   *  (OR). Semua group harus match minimal salah satu alternatifnya. */
  required: Array<Array<string | RegExp>>;
  /** Bonus headers — nambah skor kalau ada. */
  bonus: Array<Array<string | RegExp>>;
}

const FORMAT_SPECS: Record<Exclude<Format, "UNKNOWN" | "AGGREGATE_REJECT">, FormatSpec> = {
  SIPD: {
    required: [
      ["Nomor SP2D", /^no(\s+|\s*\.\s*)?sp2d$/],
      ["Nilai SP2D"],
      ["Nilai Realisasi"],
      ["Kode Sub Kegiatan", /^kd\s*sub\s*keg(iatan)?$/],
    ],
    bonus: [
      ["Tahapan APBD"],
      ["Nama Sub SKPD"],
      ["Kode Rekening", /^kd\s*rek(ening)?$/],
    ],
  },
  SIMDA_REGISTER: {
    required: [
      ["No SP2D", "Nomor SP2D", /^sp2d$/],
      ["Bruto", "Nilai Bruto", "Jumlah Bruto"],
      ["Netto", "Nilai Netto", "Jumlah Netto", "Neto"],
    ],
    bonus: [
      ["Potongan", "Jumlah Potongan"],
      ["Tgl SP2D", "Tanggal SP2D"],
      ["Jenis SPM"],
    ],
  },
  SIMDA_RINCIAN: {
    required: [
      ["No SP2D", "Nomor SP2D", /^sp2d$/],
      ["Kode Rekening", /^kd\s*rek(ening)?$/, "Kode Rek"],
      ["Jumlah", "Nilai", "Nilai Realisasi"],
    ],
    bonus: [["Uraian", "Keterangan"]],
  },
  SIPAKAD: {
    required: [
      ["No SP2D", "Nomor SP2D"],
      ["OPD", "SKPD", "Nama OPD", "Nama SKPD"],
      ["Realisasi", "Nilai Realisasi"],
    ],
    bonus: [["MAK", "Mata Anggaran"]],
  },
  GENERIC_BPKAD: {
    required: [
      ["No SP2D", "Nomor SP2D", /^sp2d$/],
      ["Nilai", "Jumlah", "Nominal", "Rupiah", "Total"],
    ],
    bonus: [],
  },
};

// ---------------------------------------------------------------------------
// Aggregate-file guard
// ---------------------------------------------------------------------------

const AGGREGATE_MARKERS: RegExp[] = [
  /^bulan$/,
  /^triwulan$/,
  /^periode$/,
  /^tw\s*\d?$/,
];

const SP2D_MARKERS: RegExp[] = [
  /^(no|nomor)\s*sp2d$/,
  /^sp2d$/,
  /^no\s*\.?\s*sp2d$/,
];

function isAggregateFile(normalized: string[]): boolean {
  const hasAggregateCol = normalized.some((h) =>
    AGGREGATE_MARKERS.some((re) => re.test(h)),
  );
  const hasSp2dCol = normalized.some((h) =>
    SP2D_MARKERS.some((re) => re.test(h)),
  );
  return hasAggregateCol && !hasSp2dCol;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface FormatScoreDetail {
  format: Exclude<Format, "UNKNOWN" | "AGGREGATE_REJECT">;
  requiredHit: number;
  requiredTotal: number;
  bonusHit: number;
  bonusTotal: number;
  score: number; // 0-1
}

function scoreFormat(
  normalized: string[],
  format: Exclude<Format, "UNKNOWN" | "AGGREGATE_REJECT">,
): FormatScoreDetail {
  const spec = FORMAT_SPECS[format];
  const requiredHit = spec.required.filter((alts) =>
    hasHeader(normalized, alts),
  ).length;
  const requiredTotal = spec.required.length;
  const bonusHit = spec.bonus.filter((alts) => hasHeader(normalized, alts))
    .length;
  const bonusTotal = spec.bonus.length;

  // Required = 80% berat, bonus = 20%.
  const reqScore = requiredTotal === 0 ? 0 : requiredHit / requiredTotal;
  const bonusScore = bonusTotal === 0 ? 0 : bonusHit / bonusTotal;
  const score = 0.8 * reqScore + 0.2 * bonusScore;

  return {
    format,
    requiredHit,
    requiredTotal,
    bonusHit,
    bonusTotal,
    score,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Granularity classification
// ---------------------------------------------------------------------------

/** Cari index kolom no_sp2d di headers. -1 kalau gak ada. */
function findSp2dColIndex(normalized: string[]): number {
  for (let i = 0; i < normalized.length; i++) {
    if (SP2D_MARKERS.some((re) => re.test(normalized[i]!))) return i;
  }
  return -1;
}

/** Extract no_sp2d value dari satu row (array atau object). */
function extractSp2dValue(
  row: unknown,
  sp2dColIndex: number,
  normalized: string[],
): string | null {
  if (row == null) return null;

  // Object form: { no_sp2d: "..." } atau { "Nomor SP2D": "..." }
  if (!Array.isArray(row) && typeof row === "object") {
    const obj = row as Record<string, unknown>;
    if (typeof obj.no_sp2d === "string" && obj.no_sp2d.trim() !== "") {
      return obj.no_sp2d.trim();
    }
    // Coba match key by normalized header
    for (const key of Object.keys(obj)) {
      const nk = normalizeHeader(key);
      if (SP2D_MARKERS.some((re) => re.test(nk))) {
        const v = obj[key];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
    }
    return null;
  }

  // Array form: pakai column index
  if (Array.isArray(row)) {
    if (sp2dColIndex < 0) return null;
    const v = row[sp2dColIndex];
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  }

  return null;
}

function classifyGranularity(
  headers: string[],
  sampleRows: unknown[][] | unknown[],
): Granularity {
  if (!sampleRows || sampleRows.length === 0) return "ambiguous";

  const normalized = normalizeHeaders(headers);
  const sp2dColIndex = findSp2dColIndex(normalized);

  // Group by no_sp2d
  const counts = new Map<string, number>();
  let totalRowsWithSp2d = 0;
  for (const row of sampleRows as unknown[]) {
    const v = extractSp2dValue(row, sp2dColIndex, normalized);
    if (v == null) continue;
    totalRowsWithSp2d++;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  if (counts.size === 0) return "ambiguous";

  const groupCounts = Array.from(counts.values()).sort((a, b) => a - b);
  const uniqueCount = groupCounts.length;

  // Median rows per SP2D
  const mid = Math.floor(uniqueCount / 2);
  const median =
    uniqueCount % 2 === 0
      ? (groupCounts[mid - 1]! + groupCounts[mid]!) / 2
      : groupCounts[mid]!;

  // % unique no_sp2d dengan >1 row
  const multiRowCount = groupCounts.filter((c) => c > 1).length;
  const multiRowPct = multiRowCount / uniqueCount;

  // % unique no_sp2d dengan tepat 1 row
  const singleRowCount = groupCounts.filter((c) => c === 1).length;
  const singleRowPct = singleRowCount / uniqueCount;

  if (multiRowPct >= 0.2 && median >= 2) return "line_item";
  if (median === 1 && singleRowPct >= 0.95) return "sp2d_header";
  return "ambiguous";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectFingerprint(
  headers: string[],
  sampleRows: unknown[][] = [],
): FingerprintResult {
  const normalized = normalizeHeaders(headers);

  // Step 1: Aggregate-file guard
  if (isAggregateFile(normalized)) {
    return {
      format: "AGGREGATE_REJECT",
      confidence: 1.0,
      granularity: "ambiguous",
      reason: "LRA/SIKD agregat, bukan register SP2D",
      scores: {},
    };
  }

  // Step 2: Score per format
  const formats: Array<Exclude<Format, "UNKNOWN" | "AGGREGATE_REJECT">> = [
    "SIPD",
    "SIMDA_REGISTER",
    "SIMDA_RINCIAN",
    "SIPAKAD",
    "GENERIC_BPKAD",
  ];
  const details = formats.map((f) => scoreFormat(normalized, f));

  // Map rounded scores for output
  const scores: Record<string, number> = {};
  for (const d of details) scores[d.format] = round2(d.score);

  // Sort by score desc
  const sorted = [...details].sort((a, b) => b.score - a.score);
  let best = sorted[0]!;

  // Step 3: Tie-break — kalau ada >=2 format dengan score >= 0.7,
  // prefer yang requiredHit-nya max (exact match required count tinggi).
  const strongOnes = details.filter((d) => d.score >= 0.7);
  if (strongOnes.length >= 2) {
    let candidate = strongOnes[0]!;
    for (const d of strongOnes) {
      if (d.requiredHit > candidate.requiredHit) {
        candidate = d;
      } else if (
        d.requiredHit === candidate.requiredHit &&
        d.score > candidate.score
      ) {
        candidate = d;
      }
    }
    best = candidate;
  }

  // Format dianggap valid kalau score >= 0.5 dan minimal 1 required hit.
  // Di bawah itu → UNKNOWN.
  const granularity = classifyGranularity(headers, sampleRows);

  if (best.score < 0.5 || best.requiredHit === 0) {
    return {
      format: "UNKNOWN",
      confidence: round2(best.score),
      granularity,
      reason: "Tidak ada format yang cocok dengan confidence cukup",
      scores,
    };
  }

  return {
    format: best.format,
    confidence: round2(best.score),
    granularity,
    scores,
  };
}

// Re-export internal helpers untuk testing.
export const __internals = {
  normalizeHeader,
  normalizeHeaders,
  isAggregateFile,
  scoreFormat,
  classifyGranularity,
};
