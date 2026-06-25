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
import { parseRupiah, parseDate, normalizeNoSp2d, inferJenisTrx } from "./value-parsers";
import { mapDirectSp2dHeader } from "./map-direct";
import { computeStats } from "./population-stats";
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


// Re-export untuk backward compat dengan existing test import sites.
export { parseRupiah, parseDate, normalizeNoSp2d, inferJenisTrx };

