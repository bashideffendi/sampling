/**
 * Excel exporter — multi-sheet workbook hasil sampling (v0.2).
 *
 * Sheets:
 *   1. Ringkasan          — parameter input + sample size + materialitas + fingerprint info
 *   2. Daftar Sampel      — list SP2D terpilih (frozen header, autofilter)
 *   3. Metodologi         — narasi siap-paste ke KKP
 *   4. Audit Trail        — hash, seed, RF source, timestamp
 *   5. Breakdown Akun     — (opsional) pecahan akun per SP2D, kalau source line-item
 *   6. Populasi Koreksi   — (opsional) SP2D yang di-route koreksi (PFK/RETUR/etc)
 *   7. Peringatan         — (opsional) parser warnings (subtotal stripped, sum mismatch, dll)
 *
 * Pakai ExcelJS (style/freeze/autofilter), bukan SheetJS.
 */

import ExcelJS from "exceljs";
import type { SamplingResult, PopulasiMeta, SeedBundle } from "@/types";
import type {
  CanonicalSP2DRow,
  BreakdownAkunRow,
  ParseWarning,
} from "@/lib/parser/canonical-row";
import type { FingerprintResult } from "@/lib/parser/canonical-row";
import { narasiMetodologi } from "./narasi";

const HEADER_FILL = "FF1F2937";
const HEADER_FONT = "FFFFFFFF";

export interface ExportExtras {
  breakdown?: BreakdownAkunRow[];
  populasiKoreksi?: CanonicalSP2DRow[];
  warnings?: ParseWarning[];
  fingerprint?: FingerprintResult;
}

export interface ExportOptions {
  entitas?: string;
  tahun?: number;
  filename?: string;
  appVersion?: string;
  draftId?: string;
  extras?: ExportExtras;
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

  const extras = opts.extras ?? {};
  if (extras.breakdown && extras.breakdown.length > 0) {
    buildBreakdown(wb, extras.breakdown);
  }
  if (extras.populasiKoreksi && extras.populasiKoreksi.length > 0) {
    buildPopulasiKoreksi(wb, extras.populasiKoreksi);
  }
  if (extras.warnings && extras.warnings.length > 0) {
    buildPeringatan(wb, extras.warnings);
  }

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
  const fp = opts.extras?.fingerprint;
  const breakdownCount = opts.extras?.breakdown?.length ?? 0;
  const koreksiCount = opts.extras?.populasiKoreksi?.length ?? 0;
  const warnCount = opts.extras?.warnings?.length ?? 0;

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
  ];

  if (fp) {
    rows.push(["—", "—"]);
    rows.push(["Format Terdeteksi", fp.format]);
    rows.push(["Granularity Source", fp.granularity]);
    rows.push(["Confidence Deteksi", Number(fp.confidence.toFixed(3))]);
  }
  if (breakdownCount > 0) rows.push(["Baris Breakdown Akun", breakdownCount]);
  if (koreksiCount > 0) rows.push(["Baris Populasi Koreksi", koreksiCount]);
  if (warnCount > 0) rows.push(["Jumlah Peringatan Parser", warnCount]);

  rows.push(
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
  );
  rows.forEach(([k, v]) => ws.addRow({ k, v }));
  if (result.warnings.length > 0) {
    ws.addRow({ k: "—", v: "—" });
    ws.addRow({ k: "Peringatan Sampling", v: "" });
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
    ["App Version", opts.appVersion ?? "0.2.0"],
    ["Draft ID", opts.draftId ?? "—"],
    ["Computed At", result.computedAt],
    ["Seed (PRNG mulberry32)", result.seed],
    ["Hash SHA-256 Populasi", populasi.hashSha256],
    ["Method", result.method],
    ["Param JSON", JSON.stringify(result.param)],
    ["RF / Tabel Sumber", result.rfSource ?? "—"],
  ];
  if (opts.extras?.fingerprint) {
    entries.push(
      ["Format Source", opts.extras.fingerprint.format],
      ["Granularity Source", opts.extras.fingerprint.granularity],
      ["Confidence Source", String(opts.extras.fingerprint.confidence)],
    );
  }
  entries.forEach(([k, v]) => ws.addRow({ k, v }));
  ws.getColumn("v").alignment = { wrapText: true, vertical: "top" };
}

function buildBreakdown(wb: ExcelJS.Workbook, breakdown: BreakdownAkunRow[]) {
  const ws = wb.addWorksheet("Breakdown Akun");
  ws.columns = [
    { header: "No SP2D", key: "no_sp2d", width: 22 },
    { header: "Kode Rekening", key: "kode_rek", width: 22 },
    { header: "Uraian Akun", key: "uraian_akun", width: 50 },
    { header: "Nilai Realisasi (Rp)", key: "nilai", width: 20 },
  ];
  ws.getRow(1).eachCell((c) => styleHeader(c));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  breakdown.forEach((b) => {
    ws.addRow({
      no_sp2d: b.no_sp2d_normalized,
      kode_rek: b.kode_rek ?? "",
      uraian_akun: b.uraian_akun ?? "",
      nilai: b.nilai_realisasi_akun,
    });
  });
  ws.getColumn("nilai").numFmt = '_-"Rp" * #,##0_-;-"Rp" * #,##0_-;_-"Rp" * "-"??_-;_-@_-';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
}

function buildPopulasiKoreksi(wb: ExcelJS.Workbook, koreksi: CanonicalSP2DRow[]) {
  const ws = wb.addWorksheet("Populasi Koreksi");
  ws.columns = [
    { header: "No SP2D", key: "no_sp2d", width: 22 },
    { header: "Tanggal", key: "tgl", width: 14 },
    { header: "Jenis Trx", key: "jenis", width: 12 },
    { header: "Nilai (Rp)", key: "nilai", width: 20 },
    { header: "OPD/SKPD", key: "skpd", width: 24 },
    { header: "Penyedia", key: "penyedia", width: 26 },
    { header: "Keterangan", key: "ket", width: 50 },
  ];
  ws.getRow(1).eachCell((c) => styleHeader(c));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  koreksi.forEach((r) => {
    ws.addRow({
      no_sp2d: r.no_sp2d_normalized,
      tgl: r.tgl_sp2d,
      jenis: r.jenis_trx,
      nilai: r.nilai_sp2d,
      skpd: r.skpd ?? "",
      penyedia: r.penyedia ?? "",
      ket: r.keterangan ?? "",
    });
  });
  ws.getColumn("nilai").numFmt = '_-"Rp" * #,##0_-;-"Rp" * #,##0_-;_-"Rp" * "-"??_-;_-@_-';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
}

function buildPeringatan(wb: ExcelJS.Workbook, warnings: ParseWarning[]) {
  const ws = wb.addWorksheet("Peringatan");
  ws.columns = [
    { header: "Severity", key: "sev", width: 12 },
    { header: "Tipe", key: "type", width: 26 },
    { header: "Pesan", key: "msg", width: 70 },
    { header: "Ref (JSON)", key: "ref", width: 50 },
  ];
  ws.getRow(1).eachCell((c) => styleHeader(c));
  ws.views = [{ state: "frozen", ySplit: 1 }];

  warnings.forEach((w) => {
    ws.addRow({
      sev: w.severity,
      type: w.type,
      msg: w.message,
      ref: w.ref ? JSON.stringify(w.ref) : "",
    });
  });
  ws.getColumn("msg").alignment = { wrapText: true, vertical: "top" };
  ws.getColumn("ref").alignment = { wrapText: true, vertical: "top" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
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
  classical: "Classical Variables Sampling (MPU)",
  discovery: "Discovery Sampling (Zero-Defect)",
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
