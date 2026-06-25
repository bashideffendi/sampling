/**
 * Map sumber granularity sp2d_header (1 row = 1 SP2D) langsung jadi
 * CanonicalSP2DRow tanpa aggregation. Dipakai parse-excel.ts kalau
 * fingerprint.granularity === "sp2d_header".
 */

import type {
  CanonicalSP2DRow,
  ParseWarning,
} from "./canonical-row";
import type { ColumnMap } from "./header-map";
import { parseRupiah, parseDate, normalizeNoSp2d, inferJenisTrx } from "./value-parsers";

export interface MapDirectResult {
  canonical: CanonicalSP2DRow[];
  populasiKoreksi: CanonicalSP2DRow[];
  warnings: ParseWarning[];
}

export function mapDirectSp2dHeader(
  rows: unknown[][],
  map: ColumnMap,
): MapDirectResult {
  const canonical: CanonicalSP2DRow[] = [];
  const populasiKoreksi: CanonicalSP2DRow[] = [];
  const warnings: ParseWarning[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (row.length === 0 || row.every((c) => c == null || String(c).trim() === "")) continue;

    const getStr = (k: keyof typeof map): string | undefined => {
      const ci = map[k];
      if (ci == null) return undefined;
      const v = row[ci];
      return v == null ? undefined : String(v).trim();
    };
    const getNum = (k: keyof typeof map): number | null => {
      const ci = map[k];
      if (ci == null) return null;
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
    if (nilai == null || Number.isNaN(nilai)) {
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
