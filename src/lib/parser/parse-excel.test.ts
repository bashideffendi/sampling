import { describe, it, expect } from "vitest";
import { parseRupiah, parseDate, parseSP2DExcel } from "./parse-excel";
import * as XLSX from "xlsx";

describe("parseRupiah", () => {
  it("ID format with dots as thousands + comma decimal", () => {
    expect(parseRupiah("1.234.567,89")).toBeCloseTo(1234567.89, 2);
  });

  it("plain integer", () => {
    expect(parseRupiah("1234567")).toBe(1234567);
  });

  it("Rp prefix", () => {
    expect(parseRupiah("Rp 1.000.000")).toBe(1_000_000);
    expect(parseRupiah("Rp1.000.000,00")).toBe(1_000_000);
  });

  it("US format thousands", () => {
    expect(parseRupiah("1,234,567.89")).toBeCloseTo(1234567.89, 2);
  });

  it("number input passthrough", () => {
    expect(parseRupiah(1234567)).toBe(1234567);
  });

  it("parentheses = negative", () => {
    expect(parseRupiah("(500.000)")).toBe(-500000);
  });

  it("invalid → null", () => {
    expect(parseRupiah("abc")).toBeNull();
    expect(parseRupiah(null)).toBeNull();
    expect(parseRupiah("")).toBeNull();
  });
});

describe("parseDate", () => {
  it("ISO yyyy-mm-dd", () => {
    expect(parseDate("2025-12-31")).toBe("2025-12-31");
    expect(parseDate("2025-01-05T00:00:00.000Z")).toBe("2025-01-05");
  });

  it("dd/mm/yyyy", () => {
    expect(parseDate("31/12/2025")).toBe("2025-12-31");
    expect(parseDate("5/1/2025")).toBe("2025-01-05");
  });

  it("dd-MMM-yyyy Indonesian", () => {
    expect(parseDate("15 Des 2025")).toBe("2025-12-15");
    expect(parseDate("01-Jan-2025")).toBe("2025-01-01");
    expect(parseDate("10 Mei 2025")).toBe("2025-05-10");
  });

  it("Excel serial date", () => {
    // 45292 = 2024-01-01
    expect(parseDate(45292)).toBe("2024-01-01");
  });

  it("Date instance", () => {
    const d = new Date(Date.UTC(2025, 5, 15));
    expect(parseDate(d)).toBe("2025-06-15");
  });
});

describe("parseSP2DExcel — end to end", () => {
  function makeWorkbook(rows: (string | number)[][]): ArrayBuffer {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return buf as ArrayBuffer;
  }

  it("parses canonical SIPD layout", async () => {
    const data: (string | number)[][] = [
      ["LAPORAN REALISASI BELANJA — PEMDA X TA 2025", "", "", "", ""],
      [],
      ["No SP2D", "Tanggal SP2D", "SKPD", "Kode Rekening", "Nilai", "Uraian", "Penyedia"],
      ["SP2D-00001", "2025-01-05", "DPUPR", "5.1.02.01.01.001", 50_000_000, "Honorarium", "CV ABC"],
      ["SP2D-00002", "2025-03-10", "Dinkes", "5.2.02.01.01.005", 199_500_000, "Belanja modal", "PT XYZ"],
      ["SP2D-00003", "2025-12-29", "BAPPEDA", "5.1.02.01.02.001", 75_000_000, "Perjadin", "CV LMN"],
      ["Total", "", "", "", 324_500_000, "", ""],
    ];
    const buf = makeWorkbook(data);
    const r = await parseSP2DExcel(buf, { filename: "test.xlsx" });
    expect(r.rows.length).toBe(3);
    expect(r.detection.confidence).toBeGreaterThan(0.6);
    expect(r.skippedRowCount).toBeGreaterThanOrEqual(1); // total row skipped
    expect(r.rows[0].no_sp2d).toBe("SP2D-00001");
    expect(r.rows[0].nilai).toBe(50_000_000);
    expect(r.rows[1].skpd).toBe("Dinkes");
    expect(r.meta.totalNilai).toBe(324_500_000);
    expect(r.meta.hashSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("auto-detect lowercase + ID formatted nilai", async () => {
    const data: (string | number)[][] = [
      ["nomor sp2d", "tgl", "opd", "jumlah rupiah"],
      ["SP2D-A1", "01-Jan-2025", "Dinas A", "Rp 1.500.000"],
      ["SP2D-A2", "05/02/2025", "Dinas B", "2.250.000"],
    ];
    const buf = makeWorkbook(data);
    const r = await parseSP2DExcel(buf);
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].nilai).toBe(1_500_000);
    expect(r.rows[0].tgl_sp2d).toBe("2025-01-01");
    expect(r.rows[1].nilai).toBe(2_250_000);
  });

  it("throws helpful error kalau header gak ada", async () => {
    const buf = makeWorkbook([["foo", "bar", "baz"], ["a", "b", "c"]]);
    await expect(parseSP2DExcel(buf)).rejects.toThrow(/header/i);
  });
});
