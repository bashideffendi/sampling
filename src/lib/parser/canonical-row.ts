/**
 * Shared type definitions untuk pipeline parser v0.2.
 * Single source of truth dipakai oleh fingerprint, normalizer, aggregator, dan UI preview.
 */

import type { CanonicalField } from "./header-map";

export type { CanonicalField };

/** Tipe transaksi SP2D yang dikenali normalizer. */
export type JenisTrx =
  | "LS"
  | "UP"
  | "GU"
  | "TU"
  | "NIHIL"
  | "PFK"
  | "RETUR"
  | "OTHER";

/** Baris populasi sampling level header SP2D (1 SP2D = 1 row). */
export interface CanonicalSP2DRow {
  no_sp2d_normalized: string;
  no_sp2d_raw: string;
  tgl_sp2d: string;
  jenis_trx: JenisTrx;
  skpd?: string;
  penyedia?: string;
  npwp?: string;
  bank?: string;
  keterangan?: string;
  nilai_sp2d: number;
  breakdown_count: number;
  // v0.2 optional enrichment (di-set kalau source punya field2 ini)
  kode_rek_dominan?: string;
  no_spm?: string;
  kegiatan?: string;
  sub_kegiatan?: string;
  program?: string;
  _src_row_idx?: number;
}

/** Baris detail breakdown akun (rincian rekening) per SP2D. */
export interface BreakdownAkunRow {
  no_sp2d_normalized: string;
  kode_rek?: string;
  uraian_akun?: string;
  nilai_realisasi_akun: number;
}

/** Kategori peringatan yang dihasilkan parser. */
export type ParseWarningType =
  | "EMPTY_SP2D_NUMBER"
  | "REISSUANCE_SUSPECT"
  | "MIXED_JENIS_TRX"
  | "INCONSISTENT_HEADER_VALUE"
  | "NILAI_SP2D_FALLBACK_SUM"
  | "SUM_MISMATCH"
  | "SUBTOTAL_STRIPPED"
  | "AGGREGATE_REJECT"
  | "AMBIGUOUS_GRANULARITY"
  | "FORMAT_LOW_CONFIDENCE"
  | "NEGATIVE_NILAI_KOREKSI"
  | "date_parse_failed"
  | "value_parse_failed";

export interface ParseWarning {
  type: ParseWarningType;
  severity: "info" | "warn" | "error";
  message: string;
  ref?: Record<string, unknown>;
}

export type ResolvedColumnMapping = Partial<Record<CanonicalField, number>>;

export type Format =
  | "SIPD"
  | "SIMDA_REGISTER"
  | "SIMDA_RINCIAN"
  | "SIPAKAD"
  | "GENERIC_BPKAD"
  | "AGGREGATE_REJECT"
  | "UNKNOWN";

export type Granularity = "line_item" | "sp2d_header" | "ambiguous";

export interface FingerprintResult {
  format: Format;
  confidence: number;
  granularity: Granularity;
  reason?: string;
  scores?: Record<string, number>;
}

/** Output proses agregasi — provides both snake_case dan camelCase aliases. */
export interface AggregationResult {
  /** Canonical SP2D rows (alias dari `rows`). */
  canonical: CanonicalSP2DRow[];
  /** @deprecated gunakan `canonical`. */
  rows?: CanonicalSP2DRow[];
  breakdown: BreakdownAkunRow[];
  warnings: ParseWarning[];
  populasiKoreksi: CanonicalSP2DRow[];
  /** @deprecated gunakan `populasiKoreksi`. */
  populasi_koreksi?: CanonicalSP2DRow[];
  sourceRowCount: number;
}
