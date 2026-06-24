/**
 * Excel SP2D parser.
 *
 * Pipeline:
 *   1. SheetJS read workbook (dense mode → cepat di laptop 12 GB).
 *   2. Cari sheet "data" (atau sheet pertama dengan ≥ 1 row data).
 *   3. Detect header row: cari row dengan ≥ 3 alias match.
 *   4. detectColumns() → ColumnMap + confidence.
 *   5. Parse data rows: skip empty, subtotal rows ("Total", "Subtotal", "Jumlah").
 *   6. Coerce types: nilai → number (handle "Rp 1.234.567,89"), tgl → ISO yyyy-mm-dd.
 *   7. Return SP2DRow[] + PopulasiMeta.
 *
 * Hash: SHA-256 atas concatenation no_sp2d|tgl|nilai|skpd|kode_rek (urut by _idx)
 * → reproducibility proof.
 */

import * as XLSX from "xlsx";
import type { SP2DRow, PopulasiMeta, ColumnMap } from "@/types";
import { detectColumns, type DetectionResult } from "./header-map";

const SUBTOTAL_KEYWORDS = /^(total|sub\s*total|jumlah|grand\s*total)\b/i;

export interface ParseResult {
  rows: SP2DRow[];
  meta: PopulasiMeta;
  detection: DetectionResult;
  headerRowIndex: number;
  headerLabels: string[];
  rawSheetName: string;
  skippedRowCount: number;
}

export async function parseSP2DExcel(
  fileBuffer: ArrayBuffer,
  opts: { filename?: string; overrideMap?: ColumnMap } = {},
): Promise<ParseResult> {
  const workbook = XLSX.read(fileBuffer, { type: "array", dense: true, cellDates: true });
  // Pick best sheet: prefer one whose name matches /data|sp2d|realisasi|lra/i, fall back to first.
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

  // Detect header row (scan first 15 rows; pick row with highest detection confidence).
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

  const rows: SP2DRow[] = [];
  let skipped = 0;
  for (let i = bestHeaderIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    if (row.length === 0 || row.every((c) => c == null || String(c).trim() === "")) {
      skipped++;
      continue;
    }
    // Skip subtotal/total rows (any cell starts with keyword).
    const firstNonEmpty = row.find((c) => c != null && String(c).trim().length > 0);
    if (firstNonEmpty && SUBTOTAL_KEYWORDS.test(String(firstNonEmpty).trim())) {
      skipped++;
      continue;
    }

    try {
      const parsed = mapRow(row, colMap, rows.length);
      if (parsed) rows.push(parsed);
      else skipped++;
    } catch {
      skipped++;
    }
  }

  if (rows.length === 0) {
    throw new Error("Excel: tidak ada baris data yang valid setelah parsing.");
  }

  const totals = computeStats(rows);
  const hash = await sha256Hash(rows);

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
  };
}

function mapRow(row: unknown[], map: ColumnMap, idx: number): SP2DRow | null {
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

  const no_sp2d = getStr("no_sp2d");
  if (!no_sp2d || no_sp2d.length === 0) return null;

  const tgl_sp2d_raw = row[map.tgl_sp2d ?? -1];
  const tgl_sp2d = parseDate(tgl_sp2d_raw);
  if (!tgl_sp2d) return null;

  const nilai = getNum("nilai_bruto") ?? getNum("nilai_netto");
  if (nilai === undefined || Number.isNaN(nilai)) return null;

  return {
    no_sp2d,
    tgl_sp2d,
    nilai,
    skpd: getStr("skpd"),
    kode_rek: getStr("kode_rek"),
    uraian: getStr("uraian"),
    penyedia: getStr("penyedia"),
    npwp: getStr("npwp"),
    bank: getStr("bank"),
    no_spm: getStr("no_spm"),
    kegiatan: getStr("kegiatan"),
    sub_kegiatan: getStr("sub_kegiatan"),
    jenis_spm: getStr("jenis_spm"),
    program: getStr("program"),
    _idx: idx,
  };
}

export function parseRupiah(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  let s = String(value).trim();
  if (s.length === 0) return undefined;

  // Strip parentheses (parens = negative)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Strip whitespace, currency prefix, leading sign.
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
      // ID format: "1.234.567,89" → dots thousands, comma decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: "1,234,567.89" → commas thousands, dot decimal
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const tail = s.slice(lastComma + 1);
    // Decimal if 1-2 digits after last comma (and no other commas) OR
    // if total digit count makes it unambiguous (e.g. "1234,56" → decimal).
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
      // Already decimal format, leave it.
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
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86400000);
    return parseDate(d);
  }
  const s = String(value).trim();
  if (!s) return undefined;
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // dd-MMM-yy or dd MMM yyyy (Indonesian months)
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

async function sha256Hash(rows: SP2DRow[]): Promise<string> {
  const canonical = rows
    .map((r) =>
      [r.no_sp2d, r.tgl_sp2d, r.nilai, r.skpd ?? "", r.kode_rek ?? ""].join("|"),
    )
    .join("\n");
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const data = new TextEncoder().encode(canonical);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node fallback (untuk Vitest run di node env): pakai dynamic import.
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(canonical).digest("hex");
}
