import { describe, expect, it } from "vitest";
import { stripSubtotalRows } from "./strip-subtotal";

const HEADERS = [
  "No SP2D",
  "Tanggal",
  "SKPD",
  "Penyedia",
  "Nilai SP2D",
];

describe("stripSubtotalRows", () => {
  it('membuang baris dengan cell pertama "Jumlah"', () => {
    const rows: unknown[][] = [
      ["SP2D/001", "2025-01-05", "Dinkes", "PT A", 10_000_000],
      ["Jumlah", "", "", "", 10_000_000],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(1);
    expect(out.stripped).toBe(1);
    expect(out.strippedIndices).toEqual([1]);
  });

  it('membuang baris "Total SKPD Dinas Kesehatan"', () => {
    const rows: unknown[][] = [
      ["SP2D/001", "2025-01-05", "Dinkes", "PT A", 10_000_000],
      ["Total SKPD Dinas Kesehatan", "", "", "", 50_000_000],
      ["SP2D/002", "2025-01-06", "Disdik", "PT B", 20_000_000],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(2);
    expect(out.stripped).toBe(1);
    expect(out.strippedIndices).toEqual([1]);
  });

  it('membuang baris "GRAND TOTAL" (case-insensitive)', () => {
    const rows: unknown[][] = [
      ["SP2D/001", "2025-01-05", "Dinkes", "PT A", 10_000_000],
      ["GRAND TOTAL", "", "", "", 1_000_000_000],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(1);
    expect(out.stripped).toBe(1);
  });

  it("baris data normal (diawali nomor SP2D) lolos", () => {
    const rows: unknown[][] = [
      ["SP2D/001/2025", "2025-01-05", "Dinkes", "PT A", 10_000_000],
      ["00123/SP2D-LS/2025", "2025-01-06", "Disdik", "PT B", 20_000_000],
      ["SP2D-LS-456", "2025-01-07", "Dinas PU", "CV C", 5_000_000],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(3);
    expect(out.stripped).toBe(0);
    expect(out.strippedIndices).toEqual([]);
  });

  it("header row tidak ikut dibuang (karena caller pisahin headers duluan)", () => {
    // Simulasi: caller cuma kasih data rows, bukan header row.
    const rows: unknown[][] = [
      ["SP2D/001", "2025-01-05", "Dinkes", "PT A", 10_000_000],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(1);
    expect(out.stripped).toBe(0);
  });

  it("mixed: 100 baris data + 3 subtotal → 100 kept, 3 stripped", () => {
    const rows: unknown[][] = [];
    for (let i = 0; i < 100; i++) {
      rows.push([
        `SP2D/${String(i + 1).padStart(4, "0")}`,
        "2025-01-05",
        "Dinkes",
        "PT A",
        1_000_000 + i * 1000,
      ]);
      if (i === 32) {
        rows.push(["Jumlah Per SKPD Dinkes", "", "", "", 50_000_000]);
      }
      if (i === 66) {
        rows.push(["Sub Total", "", "", "", 75_000_000]);
      }
    }
    rows.push(["GRAND TOTAL", "", "", "", 999_000_000]);

    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(100);
    expect(out.stripped).toBe(3);
    expect(out.strippedIndices).toHaveLength(3);
  });

  it("baris benar-benar kosong tidak dianggap subtotal", () => {
    const rows: unknown[][] = [
      ["SP2D/001", "2025-01-05", "Dinkes", "PT A", 10_000_000],
      ["", "", "", "", ""],
      [null, null, null],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(3);
    expect(out.stripped).toBe(0);
  });

  it('variasi "Jumlah Sub Kegiatan" tertangkap', () => {
    const rows: unknown[][] = [
      ["SP2D/001", "2025-01-05", "Dinkes", "PT A", 10_000_000],
      ["Jumlah Sub Kegiatan Pengadaan Obat", "", "", "", 30_000_000],
      ["SP2D/002", "2025-01-06", "Dinkes", "PT B", 20_000_000],
    ];
    const out = stripSubtotalRows(rows, HEADERS);
    expect(out.kept).toHaveLength(2);
    expect(out.stripped).toBe(1);
    expect(out.strippedIndices).toEqual([1]);
  });
});
