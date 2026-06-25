/**
 * Word (.docx) exporter — Lampiran KKP siap-paste ke format Kertas Kerja
 * Pemeriksaan BPK. Pakai library `docx`.
 *
 * Struktur dokumen:
 *   1. Heading utama (judul + entitas + TA)
 *   2. Section A. Metodologi Sampling — narasi siap-baca (reuse narasi.ts)
 *   3. Section B. Parameter Input — table label/value
 *   4. Section C. Daftar Sampel Terpilih — table SP2D
 *   5. Section D. Audit Trail — hash, seed, RF source, app version, computed at
 *
 * Style: header BPK-ish (Calibri 11, judul bold 14, hairline border).
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  PageOrientation,
  PageBreak,
} from "docx";
import type { SamplingResult, PopulasiMeta } from "@/types";
import { narasiMetodologi } from "./narasi";
import { APP_VERSION } from "@/lib/constants";

export interface WordExportOptions {
  entitas?: string;
  tahun?: number;
  draftId?: string;
}

const METHOD_LABEL: Record<SamplingResult["method"], string> = {
  mus: "Monetary Unit Sampling (MUS)",
  srs: "Simple Random Sampling (SRS)",
  stratified: "Stratified Random Sampling",
  judgmental: "Judgmental Sampling (Non-Statistical)",
  attribute: "Attribute Sampling (Test of Controls)",
  classical: "Classical Variables Sampling (MPU)",
  discovery: "Discovery Sampling (Zero-Defect)",
};

function fmtRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function p(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        italics: opts.italics,
        size: opts.size ?? 22, // 11pt = 22 half-points
        font: "Calibri",
      }),
    ],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: "Calibri",
      }),
    ],
  });
}

function cellText(text: string, opts: { bold?: boolean; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, bold: opts.bold, size: 20, font: "Calibri" })],
      }),
    ],
  });
}

function hairlineTable(rows: TableRow[]): Table {
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "cccccc" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "cccccc" },
    },
  });
}

export async function exportToWord(
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: WordExportOptions = {},
): Promise<Blob> {
  const entitas = opts.entitas ?? "Entitas";
  const tahun = opts.tahun ?? new Date(result.computedAt).getFullYear();
  const methodLabel = METHOD_LABEL[result.method];

  // Cover / heading
  const coverChildren: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "LAMPIRAN KERTAS KERJA PEMERIKSAAN",
          bold: true,
          size: 28,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Metodologi dan Daftar Sampel SP2D",
          bold: true,
          size: 24,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [
        new TextRun({
          text: `${entitas} — Tahun Anggaran ${tahun}`,
          italics: true,
          size: 22,
          font: "Calibri",
        }),
      ],
    }),
  ];

  // Section A. Metodologi
  const narasi = narasiMetodologi(result, populasi, { entitas, tahun });
  const narasiParagraphs = narasi.split("\n").map((line) => p(line));

  // Section B. Parameter table
  const parameterRows: TableRow[] = [
    new TableRow({
      children: [cellText("Field", { bold: true }), cellText("Nilai", { bold: true })],
    }),
    new TableRow({ children: [cellText("Metode Sampling"), cellText(methodLabel)] }),
    new TableRow({ children: [cellText("Populasi (jumlah SP2D)"), cellText(populasi.count.toLocaleString("id-ID"))] }),
    new TableRow({ children: [cellText("Nilai Populasi"), cellText("Rp " + fmtRupiah(populasi.totalNilai))] }),
    new TableRow({ children: [cellText("Sample Size"), cellText(result.sampleSize.toLocaleString("id-ID"))] }),
  ];
  if (result.selectionInterval !== undefined) {
    parameterRows.push(
      new TableRow({ children: [cellText("Sampling Interval (J)"), cellText("Rp " + fmtRupiah(result.selectionInterval))] }),
    );
  }
  if (result.reliabilityFactor !== undefined) {
    parameterRows.push(
      new TableRow({ children: [cellText("Reliability Factor (RF)"), cellText(result.reliabilityFactor.toFixed(2))] }),
    );
  }
  if (result.topStratumCount !== undefined && result.topStratumCount > 0) {
    parameterRows.push(
      new TableRow({
        children: [
          cellText("Top Stratum (100% inspect)"),
          cellText(`${result.topStratumCount} SP2D senilai Rp ${fmtRupiah(result.topStratumNilai ?? 0)}`),
        ],
      }),
    );
  }
  parameterRows.push(new TableRow({ children: [cellText("Seed PRNG"), cellText(String(result.seed))] }));

  // Section C. Daftar Sampel
  const sampelHeaderRow = new TableRow({
    children: [
      cellText("No", { bold: true }),
      cellText("No SP2D", { bold: true }),
      cellText("Tanggal", { bold: true }),
      cellText("Nilai (Rp)", { bold: true }),
      cellText("OPD/SKPD", { bold: true }),
      cellText("Penyedia", { bold: true }),
      cellText("Reason", { bold: true }),
    ],
  });
  const sampelRows: TableRow[] = [sampelHeaderRow];
  result.selectedItems.forEach((item, i) => {
    sampelRows.push(
      new TableRow({
        children: [
          cellText(String(i + 1), { align: AlignmentType.RIGHT }),
          cellText(item.row.no_sp2d),
          cellText(item.row.tgl_sp2d),
          cellText(fmtRupiah(item.row.nilai), { align: AlignmentType.RIGHT }),
          cellText(item.row.skpd ?? "—"),
          cellText(item.row.penyedia ?? "—"),
          cellText(item.reason),
        ],
      }),
    );
  });

  // Section D. Audit Trail
  const auditRows: TableRow[] = [
    new TableRow({
      children: [cellText("Field", { bold: true }), cellText("Nilai", { bold: true })],
    }),
    new TableRow({ children: [cellText("Aplikasi"), cellText(`Cap Cip Cup v${APP_VERSION}`)] }),
    new TableRow({ children: [cellText("Draft ID"), cellText(opts.draftId ?? "—")] }),
    new TableRow({ children: [cellText("Hash SHA-256 Populasi"), cellText(populasi.hashSha256)] }),
    new TableRow({ children: [cellText("Seed PRNG (mulberry32)"), cellText(String(result.seed))] }),
    new TableRow({ children: [cellText("Sumber Reliability Factor"), cellText(result.rfSource ?? "—")] }),
    new TableRow({ children: [cellText("Computed At"), cellText(result.computedAt)] }),
  ];

  const doc = new Document({
    creator: "Cap Cip Cup",
    title: `Lampiran KKP — ${entitas} TA ${tahun}`,
    description: `Sampling SP2D ${methodLabel} via Cap Cip Cup v${APP_VERSION}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
            size: { orientation: PageOrientation.PORTRAIT },
          },
        },
        children: [
          ...coverChildren,
          heading("A. Metodologi Sampling", HeadingLevel.HEADING_1),
          ...narasiParagraphs,
          new Paragraph({ children: [new PageBreak()] }),
          heading("B. Parameter Sampling", HeadingLevel.HEADING_1),
          hairlineTable(parameterRows),
          ...(result.warnings.length > 0
            ? [
                heading("Peringatan Pelaksanaan", HeadingLevel.HEADING_2),
                ...result.warnings.map((w, i) => p(`${i + 1}. ${w}`)),
              ]
            : []),
          new Paragraph({ children: [new PageBreak()] }),
          heading("C. Daftar Sampel Terpilih", HeadingLevel.HEADING_1),
          p(
            `Sampel sebanyak ${result.sampleSize.toLocaleString("id-ID")} SP2D dipilih dari populasi ${result.populasiCount.toLocaleString("id-ID")} SP2D senilai Rp ${fmtRupiah(result.populasiNilai)}.`,
          ),
          hairlineTable(sampelRows),
          new Paragraph({ children: [new PageBreak()] }),
          heading("D. Audit Trail (Reproducibility)", HeadingLevel.HEADING_1),
          p(
            "Audit trail di bawah ini memungkinkan replikasi sampel bit-for-bit. Reviewer dapat memuat ulang file populasi yang sama, masukkan seed dan parameter, hasil sampel akan identik.",
            { italics: true },
          ),
          hairlineTable(auditRows),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

export function makeWordFilename(opts: WordExportOptions, method: SamplingResult["method"]): string {
  const tahun = opts.tahun ?? new Date().getFullYear();
  const entitas = (opts.entitas ?? "Entitas")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 13);
  return `Capcipcup_Lampiran_KKP_${entitas}_TA${tahun}_${method.toUpperCase()}_${ts}.docx`;
}
