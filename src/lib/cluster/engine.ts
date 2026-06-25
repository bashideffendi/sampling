/**
 * Cluster Explorer engine — group SP2D yang likely satu kontrak.
 *
 * Algoritma:
 *   1. Filter populasi: hanya row yang punya marker (UM/Tahap/Termin/Pelunasan/Angsuran)
 *      via detectMarker(keterangan + uraian).
 *   2. Group by vendor (NPWP first, fallback nama lowercased).
 *   3. Per vendor group, sort by tanggal asc, sliding-window time-based:
 *      - Window = params.windowDays (default 365)
 *      - Cluster = contiguous rows dalam window
 *   4. Skip cluster yang count < params.minSize atau totalNilai < params.minTotalNilai.
 *   5. Hitung confidence:
 *      - High kalau ada UM + sequential markers (Tahap I, II, III) + Pelunasan
 *      - Medium kalau sequential markers only
 *      - Low kalau cuma marker generic
 *   6. Flag splitFlag = true kalau totalNilai > Rp 200jt tapi tiap item < Rp 200jt.
 *
 * Non-statistical — output untuk judgmental review, BUKAN sampling formal.
 */

import type { SP2DRow } from "@/types";
import { detectMarker } from "./keywords";
import {
  type ClusterCandidate,
  type ClusterItem,
  type ClusterMarker,
  type ClusterParams,
  type ClusterResult,
  DEFAULT_CLUSTER_PARAMS,
} from "./types";

const SPLIT_PL_THRESHOLD = 200_000_000;

function normalizeNpwp(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 15 || digits.length === 16) return digits;
  return null;
}

function vendorKeyOf(row: SP2DRow, mode: ClusterParams["vendorMatch"]): string | null {
  const npwp = normalizeNpwp(row.npwp);
  if (mode !== "name_only" && npwp) return `npwp:${npwp}`;
  if (mode === "npwp_only") return null;
  const name = (row.penyedia ?? "").trim().toLowerCase();
  if (!name) return null;
  return `name:${name}`;
}

function vendorLabelOf(row: SP2DRow): string {
  return (row.penyedia ?? "(tidak diketahui)").trim();
}

function parseIsoMs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dominantOpd(items: ClusterItem[]): string {
  const counts = new Map<string, number>();
  for (const it of items) {
    const opd = (it.row.skpd ?? "").trim();
    if (!opd) continue;
    counts.set(opd, (counts.get(opd) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [opd, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = opd;
    }
  }
  return best || "(beragam)";
}

function patternSummary(items: ClusterItem[]): string {
  const markers = new Set(items.map((i) => i.marker));
  if (markers.has("uang_muka") && markers.has("pelunasan")) return "UM + Pelunasan";
  if (markers.has("uang_muka") && (markers.has("tahap") || markers.has("termin")))
    return "UM + Termyn/Tahap";
  if (markers.has("tahap")) return "Tahap berurutan";
  if (markers.has("termin")) return "Termin berurutan";
  if (markers.has("pelunasan")) return "Pelunasan";
  if (markers.has("angsuran")) return "Angsuran";
  if (markers.has("uang_muka")) return "UM saja";
  return "campuran";
}

function computeConfidence(items: ClusterItem[]): number {
  const markers = items.map((i) => i.marker);
  const uniqMarkers = new Set<ClusterMarker>(markers);
  let score = 0.4; // base

  // Bonus: UM present
  if (uniqMarkers.has("uang_muka")) score += 0.15;
  // Bonus: Pelunasan present
  if (uniqMarkers.has("pelunasan")) score += 0.15;
  // Bonus: sequential markers (Tahap atau Termin) dengan sequence terurut
  const seqMarkers = items.filter((i) => i.marker === "tahap" || i.marker === "termin");
  if (seqMarkers.length >= 2) {
    const seqs = seqMarkers
      .map((m) => m.sequence)
      .filter((s): s is number => s != null)
      .sort((a, b) => a - b);
    const isSequential = seqs.length >= 2 && seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
    if (isSequential) score += 0.2;
    else if (seqs.length >= 2) score += 0.1;
  }
  // Bonus: ≥3 items (lebih banyak = lebih confidence)
  if (items.length >= 3) score += 0.1;

  return Math.min(1, score);
}

export function detectClusters(
  rows: SP2DRow[],
  paramsIn: Partial<ClusterParams> = {},
): ClusterResult {
  const params: ClusterParams = { ...DEFAULT_CLUSTER_PARAMS, ...paramsIn };
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  // Phase 1: mark
  const marked: { row: SP2DRow; item: ClusterItem }[] = [];
  for (const row of rows) {
    const textBlob = `${row.uraian ?? ""} ${row.sub_kegiatan ?? ""}`;
    const m = detectMarker(textBlob);
    if (!m) continue;
    marked.push({
      row,
      item: {
        row,
        marker: m.marker,
        sequence: m.sequence,
        snippet: m.snippet,
      },
    });
  }

  // Phase 2: group by vendor
  const byVendor = new Map<string, ClusterItem[]>();
  for (const { row, item } of marked) {
    const vKey = vendorKeyOf(row, params.vendorMatch);
    if (!vKey) continue;
    const arr = byVendor.get(vKey);
    if (arr) arr.push(item);
    else byVendor.set(vKey, [item]);
  }

  // Phase 3: window-cluster per vendor
  const windowMs = params.windowDays * 86_400_000;
  const clusters: ClusterCandidate[] = [];

  for (const [vendorKey, items] of byVendor) {
    if (items.length < params.minSize) continue;

    // Sort by tanggal asc
    const sorted = items
      .map((it) => ({ it, ms: parseIsoMs(it.row.tgl_sp2d) ?? 0 }))
      .filter((x) => x.ms > 0)
      .sort((a, b) => a.ms - b.ms);

    // Sliding window: cluster contiguous rows yang masuk window dari item terawal di cluster
    let i = 0;
    while (i < sorted.length) {
      const startMs = sorted[i].ms;
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].ms - startMs <= windowMs) {
        j++;
      }
      const sliceItems = sorted.slice(i, j + 1).map((x) => x.it);
      if (sliceItems.length >= params.minSize) {
        const totalNilai = sliceItems.reduce((s, it) => s + it.row.nilai, 0);
        if (totalNilai >= params.minTotalNilai) {
          const dates = sliceItems.map((it) => it.row.tgl_sp2d).sort();
          const splitFlag =
            totalNilai > SPLIT_PL_THRESHOLD &&
            sliceItems.every((it) => it.row.nilai < SPLIT_PL_THRESHOLD);
          clusters.push({
            vendorKey,
            vendorLabel: vendorLabelOf(sliceItems[0].row),
            opd: dominantOpd(sliceItems),
            totalNilai,
            count: sliceItems.length,
            dateRange: { from: dates[0], to: dates[dates.length - 1] },
            items: sliceItems,
            dominantPattern: patternSummary(sliceItems),
            confidence: computeConfidence(sliceItems),
            splitFlag,
          });
        }
      }
      i = j + 1;
    }
  }

  // Sort: splitFlag first, then confidence desc, then totalNilai desc
  clusters.sort((a, b) => {
    if (a.splitFlag !== b.splitFlag) return a.splitFlag ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return b.totalNilai - a.totalNilai;
  });

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    clusters,
    scannedRows: rows.length,
    markedRows: marked.length,
    runDurationMs: t1 - t0,
    computedAt: new Date().toISOString(),
  };
}
