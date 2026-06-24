/**
 * Excel exporter — multi-sheet workbook hasil sampling.
 *
 * Sheet:
 *   1. Ringkasan     — parameter input + sample size + materialitas
 *   2. Daftar Sampel — list SP2D terpilih (frozen header, autofilter)
 *   3. Metodologi    — narasi siap-paste ke KKP
 *   4. Audit Trail   — hash, seed, RF source, timestamp
 *
 * Pakai ExcelJS (style/freeze/autofilter), bukan SheetJS.
 */

import ExcelJS from "exceljs";
import type { SamplingResult, PopulasiMeta, SeedBundle } from "@/types";
import { narasiMetodologi } from "./narasi";

const HEADER_FILL = "FF1F2937";
const HEADER_FONT = "FFFFFFFF";

export interface ExportOptions {
  entitas?: string;
  tahun?: number;
  filename?: string;
  appVersion?: string;
  draftId?: string;
}

export async function exportToExcel(
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: ExportOptions = {},
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cap Cip Cup";
  wb.created = new Date(result.computedAt);
  wb.modified = new Date(result.computedAt);

  buildRingkasan(wb, result, populasi, opts);
  buildSampel(wb, result);
  buildMetodologi(wb, result, populasi, opts);
  buildAuditTrail(wb, result, populasi, opts);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildRingkasan(
  wb: ExcelJS.Workbook,
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: ExportOptions,
) {
  const ws = wb.addWorksheet("Ringkasan");
  ws.columns = [
    { header: "Field", key: "k", width: 38 },
    { header: "Nilai", key: "v", width: 50 },
  ];
  ws.getRow(1).eachCell((c) => styleHeader(c));

  const methodLabel = METHOD_LABEL[result.method];
  const rows: Array<[string, string | number]> = [
    ["Entitas Pemeriksaan", opts.entitas ?? "—"],
    ["Tahun Anggaran", opts.tahun ?? "—"],
    ["Metode Sampling", methodLabel],
    ["File Populasi", populasi.filename ?? "—"],
    ["Jumlah SP2D Populasi", populasi.count],
    ["Nilai Populasi (Rp)", populasi.totalNilai],
    ["Mean (Rp)", Math.round(populasi.meanNilai)],
    ["Median (Rp)", Math.round(populasi.medianNilai)],
    ["Min / Max (Rp)", `${populasi.minNilai} / ${populasi.maxNilai}`],
    ["Negatif / Nol", `${populasi.negativeCount} / ${populasi.zeroCount}`],
    ["—", "—"],
    ["Sample Size", result.sampleSize],
    ["Reliability Factor / Z", result.reliabilityFactor ?? "—"],
    ["Sampling Interval (Rp)", result.selectionInterval ?? "—"],
    ["Top Stratum Count", result.topStratumCount ?? "—"],
    ["Top Stratum Nilai (Rp)", result.topStratumNilai ?? "—"],
    ["Seed PRNG", result.seed],
    ["Hash SHA-256 Populasi", populasi.hashSha256],
    ["Computed At", result.computedAt],
    ["RF / Tabel Sumber", result.rfSource ?? "—"],
  ];
  rows.forEach(([k, v]) => ws.addRow({ k, v }));
  if (result.warnings.length > 0) {
    ws.addRow({ k: "—", v: "—" });
    ws.addRow({ k: "Peringatan", v: "" });
    result.warnings.forEach((w, i) => ws.addRow({ k: `  • [${i + 1}]`, v: w }));
  }
  ws.getColumn("v").alignment = { wrapText: true, vertical: "top" };
}

function buildSampel(wb: ExcelJS.Workbook, result: SamplingResult) {
  const ws = wb.addWorksheet("Daftar Sampel");
  ws.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Reason", key: "reason", width: 16 },
    { header: "No SP2D", key: "no_sp2d", width: 20 },
    { header: "Tanggal", key: "tgl", width: 14 },
    { header: "Nilai (Rp)", key: "nilai", width: 18 },
    { header: "OPD/SKPD", key: "skpd", width: 22 },
    { header: "Kode Rek", key: "kode_rek", width: 22 },
    { header: "Uraian", key: "uraian", width: 40 },
    { header: "Penyedia", key: "penyedia", width: 26 },
    { header: "Hit Value (Rp)", key: "hit", width: 18 },
    { header: "Stratum", key: "stratum", width: 10 },
    { header: "Matched Criteria", key: "matched", width: 24 },
  ];
  ws.getRow(1).eachCell((c) => styleHeader(c));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  result.selectedItems.forEach((item, i) => {
    ws.addRow({
      no: i + 1,
      reason: item.reason,
      no_sp2d: item.row.no_sp2d,
      tgl: item.row.tgl_sp2d,
      nilai: item.row.nilai,
      skpd: item.row.skpd ?? "",
      kode_rek: item.row.kode_rek ?? "",
      uraian: item.row.uraian ?? "",
      penyedia: item.row.penyedia ?? "",
      hit: item.hitValue ?? "",
      stratum: item.stratum ?? "",
      matched: item.matchedCriteria?.join(", ") ?? "",
    });
  });

  ws.getColumn("nilai").numFmt = '_-"Rp" * #,##0_-;-"Rp" * #,##0_-;_-"Rp" * "-"??_-;_-@_-';
  ws.getColumn("hit").numFmt = "#,##0";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 12 } };
}

function buildMetodologi(
  wb: ExcelJS.Workbook,
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: ExportOptions,
) {
  const ws = wb.addWorksheet("Metodologi");
  ws.columns = [{ header: "Narasi Metodologi (Siap Paste ke KKP)", key: "n", width: 100 }];
  ws.getRow(1).eachCell((c) => styleHeader(c));
  const narasi = narasiMetodologi(result, populasi, opts);
  narasi.split(/\n/).forEach((line) => {
    ws.addRow({ n: line });
  });
  ws.getColumn("n").alignment = { wrapText: true, vertical: "top" };
}

function buildAuditTrail(
  wb: ExcelJS.Workbook,
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: ExportOptions,
) {
  const ws = wb.addWorksheet("Audit Trail");
  ws.columns = [
    { header: "Field", key: "k", width: 30 },
    { header: "Nilai", key: "v", width: 70 },
  ];
  ws.getRow(1).eachCell((c) => styleHeader(c));
  const entries: Array<[string, string | number]> = [
    ["App", "Cap Cip Cup"],
    ["App Version", opts.appVersion ?? "0.1.0"],
    ["Draft ID", opts.draftId ?? "—"],
    ["Computed At", result.computedAt],
    ["Seed (PRNG mulberry32)", result.seed],
    ["Hash SHA-256 Populasi", populasi.hashSha256],
    ["Method", result.method],
    ["Param JSON", JSON.stringify(result.param)],
    ["RF / Tabel Sumber", result.rfSource ?? "—"],
  ];
  entries.forEach(([k, v]) => ws.addRow({ k, v }));
  ws.getColumn("v").alignment = { wrapText: true, vertical: "top" };
}

function styleHeader(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  cell.font = { bold: true, color: { argb: HEADER_FONT } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

const METHOD_LABEL: Record<SamplingResult["method"], string> = {
  mus: "Monetary Unit Sampling (MUS)",
  srs: "Simple Random Sampling",
  stratified: "Stratified Random Sampling",
  judgmental: "Judgmental Sampling (Non-Statistical)",
  attribute: "Attribute Sampling (Test of Controls)",
};

export function buildSeedBundle(
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: { draftId: string; appVersion: string },
): SeedBundle {
  return {
    version: "1",
    draftId: opts.draftId,
    populasi: {
      hashSha256: populasi.hashSha256,
      count: populasi.count,
      totalNilai: populasi.totalNilai,
    },
    method: result.method,
    param: result.param,
    seed: result.seed,
    result: {
      sampleSize: result.sampleSize,
      selectedNoSP2D: result.selectedItems.map((s) => s.row.no_sp2d),
    },
    rfSource: result.rfSource,
    computedAt: result.computedAt,
    appVersion: opts.appVersion,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function makeFilename(
  result: SamplingResult,
  opts: ExportOptions = {},
  ext: "xlsx" | "json" = "xlsx",
): string {
  const tahun = opts.tahun ?? new Date(result.computedAt).getFullYear();
  const entitas = (opts.entitas ?? "Entitas")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  const method = result.method.toUpperCase();
  const ts = result.computedAt.replace(/[:T-]/g, "").slice(0, 13); // YYYYMMDDHHmm
  return `Capcipcup_Sampel_SP2D_${entitas}_TA${tahun}_${method}_${ts}.${ext}`;
}
