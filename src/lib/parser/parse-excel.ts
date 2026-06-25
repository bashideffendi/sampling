/**
 * Excel SP2D parser (v0.2).
 *
 * Pipeline:
 *   1. SheetJS read workbook (dense mode -> hemat memory).
 *   2. Pick best sheet (prefer name match /data|sp2d|realisasi|lra|belanja/i).
 *   3. Build aoa, detect header row (max confidence di 15 baris pertama).
 *   4. detectFingerprint(headers, sampleRows) -> { format, granularity, confidence }.
 *      - 'AGGREGATE_REJECT' -> throw user-friendly error.
 *   5. stripSubtotalRows() pre-pass (single source of truth subtotal/total/jumlah).
 *   6. Kalau granularity === 'line_item' -> aggregateToSp2dLevel() per no_sp2d
 *      -> canonical[] + breakdown[] + populasi_koreksi[] + warnings[].
 *      Kalau 'sp2d_header' -> map row langsung ke CanonicalSP2DRow.
 *   7. Map CanonicalSP2DRow -> SP2DRow (backward compat) buat sampling engine.
 *   8. hashPopulasi(canonical) async + computeStats(rows).
 *
 * Backward-compat contract: ParseResult.rows tetap SP2DRow[] sesuai sampling/*.
 * Field baru: canonical, breakdown, populasiKoreksi, warnings, fingerprint.
 */

import * as XLSX from "xlsx";
import type { SP2DRow, PopulasiMeta } from "@/types";
import type { ColumnMap } from "./header-map";
import { detectColumns, type DetectionResult } from "./header-map";
import {
  type CanonicalSP2DRow,
  type BreakdownAkunRow,
  type ParseWarning,
} from "./canonical-row";
import { stripSubtotalRows } from "./strip-subtotal";
import { detectFingerprint } from "./fingerprint";
import type { FingerprintResult } from "./canonical-row";
import { aggregateToSp2dLevel } from "./aggregate-sp2d";
import { hashPopulasi } from "@/lib/sampling/population-hash";

export interface ParseResult {
  /** SP2D-level rows in legacy shape — feed langsung ke sampling/*. */
  rows: SP2DRow[];
  meta: PopulasiMeta;
  detection: DetectionResult;
  headerRowIndex: number;
  headerLabels: string[];
  rawSheetName: string;
  skippedRowCount: number;
  /** Canonical SP2D rows (richer than SP2DRow — punya breakdown_count, jenis_trx). */
  canonical: CanonicalSP2DRow[];
  /** Pecahan akun per SP2D (kalau source line-item). Empty kalau source sudah header-level. */
  breakdown: BreakdownAkunRow[];
  /** Rows yang tertangkap rule koreksi (PFK/RETUR/duplikat/etc). Excluded dari rows utama. */
  populasiKoreksi: CanonicalSP2DRow[];
  /** Parser warnings (subtotal stripped, sum mismatch, dup, dll). */
  warnings: ParseWarning[];
  /** Hasil detect format + granularity. */
  fingerprint: FingerprintResult;
}

export async function parseSP2DExcel(
  fileBuffer: ArrayBuffer,
  opts: { filename?: string; overrideMap?: ColumnMap } = {},
): Promise<ParseResult> {
  const workbook = XLSX.read(fileBuffer, { type: "array", dense: true, cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => /data|sp2d|realisasi|lra|belanja/i.test(n)) ??
    workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel: tidak ada sheet ditemukan.");
  const sheet = workbook.Sheets[sheetName];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
  }) as unknown[][];
  if (aoa.length === 0) throw new Error("Excel: sheet kosong.");

  // Detect header row (scan 15 baris pertama).
  let bestHeaderIdx = 0;
  let bestDetection: DetectionResult = { map: {}, confidence: 0, unmatched: [] };
  const limit = Math.min(15, aoa.length);
  for (let i = 0; i < limit; i++) {
    const headers = (aoa[i] ?? []).map((c) => (c == null ? "" : String(c).trim()));
    if (headers.filter((h) => h.length > 0).length < 3) continue;
    const det = detectColumns(headers);
    if (det.confidence > bestDetection.confidence) {
      bestDetection = det;
      bestHeaderIdx = i;
    }
  }
  if (bestDetection.confidence === 0) {
    throw new Error(
      "Excel: header SP2D tidak terdeteksi. Cek apakah file sesuai template (kolom No SP2D, Tanggal, Nilai, OPD).",
    );
  }

  const headerRow = (aoa[bestHeaderIdx] ?? []).map((c) =>
    c == null ? "" : String(c).trim(),
  );
  const colMap: ColumnMap = opts.overrideMap ?? bestDetection.map;

  // Body slice (raw, pre-strip).
  const bodyRaw = aoa.slice(bestHeaderIdx + 1);

  // Fingerprint: kasih sample 50 baris pertama buat deteksi granularity.
  const sampleRows = bodyRaw.slice(0, 50);
  const fingerprint = detectFingerprint(headerRow, sampleRows);

  if (fingerprint.format === "AGGREGATE_REJECT") {
    throw new Error(
      "Excel: file ini agregat (rekap LRA per akun) — bukan daftar SP2D. " +
        "Cap Cip Cup butuh detail per SP2D. Cek sheet lain atau minta ekstrak dari SIPD/SIMDA versi SP2D.",
    );
  }

  // Pre-pass: strip subtotal/total/jumlah rows.
  const stripResult = stripSubtotalRows(bodyRaw, headerRow);
  const cleanRows = stripResult.kept;
  const warnings: ParseWarning[] = [];
  const skipped = stripResult.stripped;
  if (skipped > 0) {
    warnings.push({
      type: "SUBTOTAL_STRIPPED",
      severity: "info",
      message: `${skipped} baris subtotal/total dibuang sebelum parsing.`,
      ref: { count: skipped },
    });
  }

  // Branch by granularity.
  let canonical: CanonicalSP2DRow[] = [];
  let breakdown: BreakdownAkunRow[] = [];
  let populasiKoreksi: CanonicalSP2DRow[] = [];

  if (fingerprint.granularity === "line_item") {
    const rawWithIdx = cleanRows.map((row, idx) => {
      const obj: Record<string | number, unknown> & { _idx: number } = { _idx: idx };
      row.forEach((v, i) => {
        obj[i] = v;
      });
      return obj;
    });
    const agg = aggregateToSp2dLevel(rawWithIdx, colMap);
    canonical = agg.canonical;
    breakdown = agg.breakdown;
    populasiKoreksi = agg.populasiKoreksi;
    warnings.push(...agg.warnings);
  } else {
    // 'sp2d_header' — map langsung, satu row = satu SP2D.
    const direct = mapDirectSp2dHeader(cleanRows, colMap);
    canonical = direct.canonical;
    populasiKoreksi = direct.populasiKoreksi;
    warnings.push(...direct.warnings);
  }

  if (canonical.length === 0) {
    throw new Error(
      "Excel: tidak ada baris SP2D valid setelah parsing (semua baris kena strip/koreksi).",
    );
  }

  // Map CanonicalSP2DRow -> SP2DRow (legacy shape) buat sampling engine.
  const rows: SP2DRow[] = canonical.map((r, i) => ({
    no_sp2d: r.no_sp2d_normalized,
    tgl_sp2d: r.tgl_sp2d,
    nilai: r.nilai_sp2d,
    skpd: r.skpd,
    kode_rek: r.kode_rek_dominan,
    uraian: r.keterangan,
    penyedia: r.penyedia,
    npwp: r.npwp,
    bank: r.bank,
    no_spm: r.no_spm,
    kegiatan: r.kegiatan,
    sub_kegiatan: r.sub_kegiatan,
    jenis_spm: r.jenis_trx,
    program: r.program,
    _idx: i,
  }));

  const totals = computeStats(rows);
  const hash = await hashPopulasi(canonical);

  const meta: PopulasiMeta = {
    count: rows.length,
    totalNilai: totals.total,
    meanNilai: totals.mean,
    medianNilai: totals.median,
    minNilai: totals.min,
    maxNilai: totals.max,
    negativeCount: totals.neg,
    zeroCount: totals.zero,
    hashSha256: hash,
    uploadedAt: new Date().toISOString(),
    filename: opts.filename,
  };

  return {
    rows,
    meta,
    detection: bestDetection,
    headerRowIndex: bestHeaderIdx,
    headerLabels: headerRow,
    rawSheetName: sheetName,
    skippedRowCount: skipped,
    canonical,
    breakdown,
    populasiKoreksi,
    warnings,
    fingerprint,
  };
}

/**
 * Map sp2d_header source langsung jadi CanonicalSP2DRow tanpa aggregation.
 * Field breakdown[] empty karena tiap row = satu SP2D.
 */
function mapDirectSp2dHeader(
  rows: unknown[][],
  map: ColumnMap,
): {
  canonical: CanonicalSP2DRow[];
  populasiKoreksi: CanonicalSP2DRow[];
  warnings: ParseWarning[];
} {
  const canonical: CanonicalSP2DRow[] = [];
  const populasiKoreksi: CanonicalSP2DRow[] = [];
  const warnings: ParseWarning[] = [];
  const seen = new Map<string, number>(); // no_sp2d_normalized -> index in canonical

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.length === 0 || row.every((c) => c == null || String(c).trim() === "")) continue;

    const getStr = (k: keyof typeof map): string | undefined => {
      const ci = map[k];
      if (ci == null) return undefined;
      const v = row[ci];
      return v == null ? undefined : String(v).trim();
    };
    const getNum = (k: keyof typeof map): number | undefined => {
      const ci = map[k];
      if (ci == null) return undefined;
      return parseRupiah(row[ci]);
    };

    const noSp2dRaw = getStr("no_sp2d");
    if (!noSp2dRaw || noSp2dRaw.length === 0) continue;
    const noSp2dNorm = normalizeNoSp2d(noSp2dRaw);

    const tgl = parseDate(row[map.tgl_sp2d ?? -1]);
    if (!tgl) {
      warnings.push({
        type: "DATE_PARSE_FAILED",
        severity: "warn",
        message: `Tanggal SP2D ${noSp2dRaw} tidak bisa diparse — baris di-skip.`,
        ref: { no_sp2d: noSp2dRaw },
      });
      continue;
    }

    const nilai = getNum("nilai_sp2d") ?? getNum("nilai_realisasi");
    if (nilai === undefined || Number.isNaN(nilai)) {
      warnings.push({
        type: "VALUE_PARSE_FAILED",
        severity: "warn",
        message: `Nilai SP2D ${noSp2dRaw} tidak bisa diparse — baris di-skip.`,
        ref: { no_sp2d: noSp2dRaw },
      });
      continue;
    }

    const jenisTrx = inferJenisTrx(getStr("jenis_trx"), getStr("keterangan"));

    const canonicalRow: CanonicalSP2DRow = {
      no_sp2d_raw: noSp2dRaw,
      no_sp2d_normalized: noSp2dNorm,
      tgl_sp2d: tgl,
      jenis_trx: jenisTrx,
      skpd: getStr("skpd"),
      penyedia: getStr("penyedia"),
      npwp: getStr("npwp"),
      bank: getStr("bank"),
      keterangan: getStr("keterangan") ?? getStr("uraian_akun"),
      nilai_sp2d: nilai,
      breakdown_count: 0,
      kode_rek_dominan: getStr("kode_rek"),
      no_spm: getStr("no_spm"),
      kegiatan: getStr("kegiatan"),
      sub_kegiatan: getStr("sub_kegiatan"),
      program: getStr("program"),
      _src_row_idx: i,
    };

    // Koreksi routing: PFK / RETUR pisah dari populasi utama.
    if (jenisTrx === "PFK" || jenisTrx === "RETUR") {
      populasiKoreksi.push(canonicalRow);
      warnings.push({
        type: "NEGATIVE_NILAI_KOREKSI",
        severity: "info",
        message: `SP2D ${noSp2dRaw} (${jenisTrx}) di-route ke Populasi Koreksi.`,
        ref: { no_sp2d: noSp2dRaw, jenis_trx: jenisTrx },
      });
      continue;
    }

    // Dedup: kalau no_sp2d normalized sudah ada -> warn.
    if (seen.has(noSp2dNorm)) {
      warnings.push({
        type: "DUPLICATE_NO_SP2D",
        severity: "warn",
        message: `No SP2D ${noSp2dRaw} duplikat — baris kedua dipertahankan, cek source data.`,
        ref: { no_sp2d: noSp2dRaw },
      });
    }
    seen.set(noSp2dNorm, canonical.length);
    canonical.push(canonicalRow);
  }

  return { canonical, populasiKoreksi, warnings };
}

function normalizeNoSp2d(raw: string): string {
  // Strip whitespace internal multi-spasi, uppercase, hilangkan trailing dots.
  return raw.replace(/\s+/g, " ").trim().toUpperCase().replace(/\.+$/, "");
}

function inferJenisTrx(
  jenisSpm: string | undefined,
  uraian: string | undefined,
): CanonicalSP2DRow["jenis_trx"] {
  const j = (jenisSpm ?? "").trim().toUpperCase();
  if (j === "LS" || j === "UP" || j === "GU" || j === "TU") return j;
  if (j === "NIHIL" || j === "PFK") return j;
  // Heuristic via uraian.
  const u = (uraian ?? "").toLowerCase();
  if (/\bretur\b/.test(u)) return "RETUR";
  if (/\bpfk\b|pemungutan\s+pihak\s+ketiga/i.test(u)) return "PFK";
  if (/\bnihil\b/.test(u)) return "NIHIL";
  return "OTHER";
}

// ---- Helpers di-EXPORT karena dipakai unit test + sebagian module lain ----

export function parseRupiah(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  let s = String(value).trim();
  if (s.length === 0) return undefined;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\s/g, "").replace(/^rp\.?/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const tail = s.slice(lastComma + 1);
    const otherCommas = (s.match(/,/g) ?? []).length - 1;
    if (tail.length <= 2 && otherCommas === 0) {
      s = s.replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const tail = s.slice(lastDot + 1);
    const otherDots = (s.match(/\./g) ?? []).length - 1;
    if (tail.length <= 2 && otherDots === 0) {
      // dot decimal, leave it
    } else {
      s = s.replace(/\./g, "");
    }
  }

  const n = parseFloat(s);
  if (Number.isNaN(n)) return undefined;
  return negative ? -n : n;
}

export function parseDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof value === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86400000);
    return parseDate(d);
  }
  const s = String(value).trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", may: "05", jun: "06",
    jul: "07", agu: "08", aug: "08", sep: "09", okt: "10", oct: "10", nov: "11", des: "12", dec: "12",
  };
  m = s.match(/^(\d{1,2})[\s\-]+([a-z]{3,})[\s\-]+(\d{2,4})$/i);
  if (m) {
    const monthKey = m[2].slice(0, 3).toLowerCase();
    const mm = months[monthKey];
    if (mm) {
      const year = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${year}-${mm}-${m[1].padStart(2, "0")}`;
    }
  }
  return undefined;
}

function computeStats(rows: SP2DRow[]): {
  total: number; mean: number; median: number; min: number; max: number; neg: number; zero: number;
} {
  const sorted = rows.map((r) => r.nilai).sort((a, b) => a - b);
  const total = sorted.reduce((s, x) => s + x, 0);
  const mean = total / rows.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[(sorted.length - 1) / 2];
  return {
    total,
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    neg: rows.filter((r) => r.nilai < 0).length,
    zero: rows.filter((r) => r.nilai === 0).length,
  };
}
