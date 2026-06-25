/**
 * Cluster Explorer — types.
 *
 * Mendeteksi rangkaian SP2D yang **likely satu kontrak** (UM + termyn + pelunasan)
 * via keyword pattern matching pada keterangan/uraian + vendor matching.
 *
 * Non-statistical: judgmental-only. Hasil cluster TIDAK boleh masuk populasi
 * sampling formal (MUS/SRS/Stratified) karena clustering non-deterministic +
 * coverage <95%. Tujuan: surface kandidat audit cross-SP2D buat judgmental
 * follow-up.
 */

import type { SP2DRow } from "@/types";

/**
 * Marker pattern yang dikenal di keterangan SP2D Indonesia.
 */
export type ClusterMarker =
  | "uang_muka" // "Uang Muka" / "UM" / "DP" / "Down Payment"
  | "tahap" // "Tahap I" / "Tahap II" / "Tahap 3"
  | "termin" // "Termin 1" / "Termijn II" / "Termyn III"
  | "pelunasan" // "Pelunasan" / "Pembayaran Akhir"
  | "angsuran" // "Angsuran 1/3"
  | "unknown";

export interface ClusterItem {
  row: SP2DRow;
  marker: ClusterMarker;
  /** Nomor urut yang ke-extract dari keterangan (mis. "Tahap II" → 2). null kalau gak ketemu. */
  sequence: number | null;
  /** Snippet keterangan yang trigger marker. */
  snippet: string;
}

export interface ClusterCandidate {
  /** Vendor key dipakai grouping (NPWP normalized atau "name:..."). */
  vendorKey: string;
  /** Display name vendor. */
  vendorLabel: string;
  /** OPD/SKPD dominan di cluster ini. */
  opd: string;
  /** Total nilai SP2D dalam cluster. */
  totalNilai: number;
  /** Jumlah SP2D di cluster. */
  count: number;
  /** Range tanggal — earliest & latest. */
  dateRange: { from: string; to: string };
  /** Items sorted by tanggal asc. */
  items: ClusterItem[];
  /** Pattern dominan ("uang_muka_pelunasan", "tahap_x", "termin_x", "mixed"). */
  dominantPattern: string;
  /** Confidence 0-1: berapa yakin cluster ini benar-benar 1 kontrak. */
  confidence: number;
  /** Anomaly flag: kalau total > Rp 200jt tapi tiap item < Rp 200jt → potensi split. */
  splitFlag: boolean;
}

export interface ClusterParams {
  /** Window deteksi (hari) — default 365. */
  windowDays: number;
  /** Min SP2D dalam cluster (default 2). */
  minSize: number;
  /** Vendor matching mode. */
  vendorMatch: "npwp_first" | "npwp_only" | "name_only";
  /** Min total nilai cluster untuk surface (default Rp 50jt, biar gak overwhelm). */
  minTotalNilai: number;
}

export const DEFAULT_CLUSTER_PARAMS: ClusterParams = {
  windowDays: 365,
  minSize: 2,
  vendorMatch: "npwp_first",
  minTotalNilai: 50_000_000,
};

export interface ClusterResult {
  clusters: ClusterCandidate[];
  scannedRows: number;
  markedRows: number;
  runDurationMs: number;
  computedAt: string;
}
