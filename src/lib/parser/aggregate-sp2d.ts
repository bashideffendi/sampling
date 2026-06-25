/**
 * Aggregator SP2D level.
 *
 * Input: baris Excel mentah (1 baris = 1 akun realisasi) + mapping kolom kanonik.
 * Output: AggregationResult berisi populasi utama (SP2D-level), populasi koreksi
 * (negatif / PFK / RETUR), breakdown akun per SP2D, dan kumpulan ParseWarning.
 *
 * Strategi:
 *   1. Normalisasi nomor SP2D (uppercase, `\` -> `/`, collapse whitespace).
 *   2. Group by no_sp2d_normalized (Map iteration order preserved).
 *   3. Per group: cek konsistensi tgl & jenis_trx, resolve nilai_sp2d header
 *      (distinct values → 0=fallback SUM, 1=use, >1=MAX + warning), cross-check
 *      vs SUM realisasi (|diff| ≥ 1 → SUM_MISMATCH).
 *   4. Routing: nilai < 0 OR jenis_trx ∈ {PFK, RETUR} → populasi_koreksi.
 *   5. Sort final rows by no_sp2d_normalized supaya hash populasi deterministik.
 */

import type {
  CanonicalSP2DRow,
  BreakdownAkunRow,
  ParseWarning,
  AggregationResult,
  JenisTrx,
  ResolvedColumnMapping,
  CanonicalField,
} from "./canonical-row";
import {
  parseRupiah,
  parseDate,
  normalizeNoSp2d,
  inferJenisTrx,
} from "./value-parsers";

// Re-export untuk backward compat dengan test + downstream import sites.
// Alias `normalizeSp2dKey` = `normalizeNoSp2d`, `normalizeDate` = `parseDate`,
// `normalizeJenisTrx` = `inferJenisTrx` — single source di value-parsers.ts.
export const normalizeSp2dKey = normalizeNoSp2d;
export const normalizeDate = parseDate;
export const normalizeJenisTrx = (raw: unknown) => inferJenisTrx(raw, undefined);
export { parseRupiah };

// ---------- Types ----------

export type RawRow = Record<string | number, unknown> & { _idx: number };


function getCell(
  row: RawRow,
  mapping: ResolvedColumnMapping,
  field: CanonicalField,
): unknown {
  const col = mapping[field];
  if (col === undefined || col === null) return undefined;
  return row[col];
}

function strCell(row: RawRow, mapping: ResolvedColumnMapping, field: CanonicalField): string {
  const v = getCell(row, mapping, field);
  if (v == null) return "";
  return String(v).trim();
}

export function sumBy(
  rows: RawRow[],
  mapping: ResolvedColumnMapping,
  field: CanonicalField,
): number {
  const col = mapping[field];
  if (col === undefined || col === null) return 0;
  let total = 0;
  for (const r of rows) {
    const v = parseRupiah(r[col]);
    if (v != null) total += v;
  }
  return total;
}

function nonNullCount(row: RawRow, mapping: ResolvedColumnMapping): number {
  let n = 0;
  for (const key of Object.keys(mapping)) {
    const col = mapping[key as keyof ResolvedColumnMapping];
    if (col === undefined || col === null) continue;
    const v = row[col as keyof RawRow];
    if (v != null && v !== "") n++;
  }
  return n;
}

export function pickAnchor(rows: RawRow[], mapping: ResolvedColumnMapping): RawRow {
  let best = rows[0];
  let bestScore = -1;
  for (const r of rows) {
    const score = nonNullCount(r, mapping);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// ---------- Main ----------

export function aggregateToSp2dLevel(
  raw: RawRow[],
  mapping: ResolvedColumnMapping,
): AggregationResult {
  const warnings: ParseWarning[] = [];
  const groups = new Map<string, RawRow[]>();

  // Group by normalized SP2D number. Empty key handled separately.
  for (const row of raw) {
    const rawKey = strCell(row, mapping, "no_sp2d");
    const key = normalizeSp2dKey(rawKey);
    if (!key) {
      warnings.push({
        type: "EMPTY_SP2D_NUMBER",
        severity: "warn",
        message: `Baris ke-${row._idx} tidak memiliki nomor SP2D dan dilewati.`,
        ref: { rowIdx: row._idx },
      });
      continue;
    }
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }

  const populasiUtama: CanonicalSP2DRow[] = [];
  const populasiKoreksi: CanonicalSP2DRow[] = [];
  const breakdownAkun: BreakdownAkunRow[] = [];

  for (const [key, members] of groups.entries()) {
    // ----- Date consistency -----
    const dateSet = new Set<string>();
    for (const m of members) {
      const d = normalizeDate(getCell(m, mapping, "tgl_sp2d"));
      if (d) dateSet.add(d);
    }
    const distinctDates = Array.from(dateSet).sort();
    if (distinctDates.length > 1) {
      warnings.push({
        type: "REISSUANCE_SUSPECT",
        severity: "warn",
        message: `SP2D ${key} memiliki tanggal berbeda: ${distinctDates.join(", ")} (indikasi re-issuance).`,
        ref: { noSp2dNormalized: key, values: distinctDates },
      });
    }

    // ----- Jenis transaksi consistency -----
    const jenisSet = new Set<JenisTrx>();
    for (const m of members) {
      const j = normalizeJenisTrx(getCell(m, mapping, "jenis_trx"));
      jenisSet.add(j);
    }
    if (jenisSet.size > 1) {
      warnings.push({
        type: "MIXED_JENIS_TRX",
        severity: "warn",
        message: `SP2D ${key} memiliki jenis transaksi campuran: ${Array.from(jenisSet).join(", ")}.`,
        ref: { noSp2dNormalized: key, values: Array.from(jenisSet) },
      });
    }

    // ----- Nilai SP2D header resolution -----
    const distinctHeaderValues: number[] = [];
    const seenValues = new Set<number>();
    for (const m of members) {
      const v = parseRupiah(getCell(m, mapping, "nilai_sp2d"));
      if (v != null && !seenValues.has(v)) {
        seenValues.add(v);
        distinctHeaderValues.push(v);
      }
    }

    const sumRealisasi = sumBy(members, mapping, "nilai_realisasi");
    let nilaiSp2d: number;

    if (distinctHeaderValues.length === 0) {
      nilaiSp2d = sumRealisasi;
      warnings.push({
        type: "NILAI_SP2D_FALLBACK_SUM",
        severity: "warn",
        message: `SP2D ${key} tidak memiliki nilai header; fallback ke SUM realisasi = ${sumRealisasi}.`,
        ref: { noSp2dNormalized: key, fallbackValue: sumRealisasi },
      });
    } else if (distinctHeaderValues.length === 1) {
      nilaiSp2d = distinctHeaderValues[0];
    } else {
      nilaiSp2d = Math.max(...distinctHeaderValues);
      warnings.push({
        type: "INCONSISTENT_HEADER_VALUE",
        severity: "warn",
        message: `SP2D ${key} memiliki nilai header tidak konsisten: ${distinctHeaderValues.join(", ")}; dipilih MAX = ${nilaiSp2d}.`,
        ref: { noSp2dNormalized: key, values: distinctHeaderValues, picked: nilaiSp2d },
      });
    }

    // ----- Cross-check vs sum realisasi -----
    if (distinctHeaderValues.length > 0) {
      const diff = Math.abs(nilaiSp2d - sumRealisasi);
      if (diff >= 1) {
        warnings.push({
          type: "SUM_MISMATCH",
          severity: "warn",
          message: `SP2D ${key}: nilai header (${nilaiSp2d}) tidak sama dengan SUM realisasi (${sumRealisasi}); selisih ${diff}.`,
          ref: { noSp2dNormalized: key, header: nilaiSp2d, sumRealisasi, diff },
        });
      }
    }

    // ----- Build canonical row from anchor -----
    const anchor = pickAnchor(members, mapping);
    const anchorJenis = normalizeJenisTrx(getCell(anchor, mapping, "jenis_trx"));
    const anchorTgl = normalizeDate(getCell(anchor, mapping, "tgl_sp2d"));

    const canonical: CanonicalSP2DRow = {
      no_sp2d_normalized: key,
      no_sp2d_raw: strCell(anchor, mapping, "no_sp2d"),
      tgl_sp2d: anchorTgl,
      jenis_trx: anchorJenis,
      skpd: strCell(anchor, mapping, "skpd") || undefined,
      penyedia: strCell(anchor, mapping, "penyedia") || undefined,
      npwp: strCell(anchor, mapping, "npwp") || undefined,
      bank: strCell(anchor, mapping, "bank") || undefined,
      keterangan: strCell(anchor, mapping, "keterangan") || undefined,
      nilai_sp2d: nilaiSp2d,
      breakdown_count: members.length,
      _src_row_idx: anchor._idx,
    };

    // ----- Routing -----
    const isKoreksi =
      nilaiSp2d < 0 || anchorJenis === "PFK" || anchorJenis === "RETUR";
    if (isKoreksi) populasiKoreksi.push(canonical);
    else populasiUtama.push(canonical);

    // ----- Breakdown akun -----
    for (const m of members) {
      const kodeRek = strCell(m, mapping, "kode_rek");
      const uraianAkun = strCell(m, mapping, "uraian_akun");
      const nilaiAkun = parseRupiah(getCell(m, mapping, "nilai_realisasi"));
      breakdownAkun.push({
        no_sp2d_normalized: key,
        kode_rek: kodeRek || undefined,
        uraian_akun: uraianAkun || undefined,
        nilai_realisasi_akun: nilaiAkun ?? 0,
      });
    }
  }

  // Deterministic output: sort by normalized key supaya hash populasi stabil.
  const byKey = (a: CanonicalSP2DRow, b: CanonicalSP2DRow): number =>
    a.no_sp2d_normalized < b.no_sp2d_normalized
      ? -1
      : a.no_sp2d_normalized > b.no_sp2d_normalized
        ? 1
        : 0;
  populasiUtama.sort(byKey);
  populasiKoreksi.sort(byKey);
  breakdownAkun.sort((a, b) => {
    if (a.no_sp2d_normalized !== b.no_sp2d_normalized) {
      return a.no_sp2d_normalized < b.no_sp2d_normalized ? -1 : 1;
    }
    return 0;
  });

  return {
    canonical: populasiUtama,
    populasiKoreksi: populasiKoreksi,
    breakdown: breakdownAkun,
    warnings,
    sourceRowCount: raw.length,
  };
}
