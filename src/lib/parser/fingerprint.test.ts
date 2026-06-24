/**
 * Test detectFingerprint untuk semua format SP2D yang kita support.
 *
 * Cakupan:
 *   - SIPD Sampang real (57 kolom) → 'SIPD', confidence > 0.7
 *   - SIMDA Register synthetic → 'SIMDA_REGISTER'
 *   - SIMDA Rincian synthetic → 'SIMDA_RINCIAN'
 *   - SIPAKAD synthetic → 'SIPAKAD'
 *   - Generic 8 kolom → 'GENERIC_BPKAD'
 *   - LRA agregat (ada "Bulan" tapi gak ada SP2D) → 'AGGREGATE_REJECT'
 *   - Granularity line_item & sp2d_header
 */

import { describe, it, expect } from "vitest";
import { detectFingerprint, __internals } from "./fingerprint";

// ---------------------------------------------------------------------------
// Fixtures: header arrays
// ---------------------------------------------------------------------------

/** SIPD Sampang TA 2025 — 57 kolom riil (subset penting + filler). */
const SIPD_SAMPANG_HEADERS: string[] = [
  "Tahun",
  "Tahapan APBD",
  "Kode SKPD",
  "Nama SKPD",
  "Kode Sub SKPD",
  "Nama Sub SKPD",
  "Kode Bidang Urusan",
  "Nama Bidang Urusan",
  "Kode Program",
  "Nama Program",
  "Kode Kegiatan",
  "Nama Kegiatan",
  "Kode Sub Kegiatan",
  "Nama Sub Kegiatan",
  "Kode Sumber Dana",
  "Nama Sumber Dana",
  "Kode Rekening",
  "Nama Rekening",
  "Pagu",
  "Nilai Realisasi",
  "Sisa Pagu",
  "Persentase Realisasi",
  "Nomor SPM",
  "Tanggal SPM",
  "Jenis SPM",
  "Nomor SP2D",
  "Tanggal SP2D",
  "Nilai SP2D",
  "Nilai Bruto",
  "Nilai Potongan",
  "Nilai Netto",
  "Nomor BKU",
  "Tanggal BKU",
  "Uraian BKU",
  "Nama Penerima",
  "NPWP Penerima",
  "Bank Penerima",
  "Rekening Penerima",
  "Kode KPA",
  "Nama KPA",
  "Kode PPK",
  "Nama PPK",
  "Kode Bendahara",
  "Nama Bendahara",
  "Status SP2D",
  "Keterangan",
  "Tanggal Cair",
  "Kode Akun",
  "Nama Akun",
  "Kategori Belanja",
  "Tipe Transaksi",
  "Flag Koreksi",
  "Flag Pengembalian",
  "Periode Lapor",
  "User Input",
  "Timestamp Input",
  "Sumber Data",
];

const SIMDA_REGISTER_HEADERS: string[] = [
  "No",
  "No SP2D",
  "Tgl SP2D",
  "No SPM",
  "Jenis SPM",
  "Unit Kerja",
  "Uraian",
  "Bruto",
  "Potongan",
  "Netto",
  "Nama Penerima",
  "Bank",
];

const SIMDA_RINCIAN_HEADERS: string[] = [
  "No",
  "No SP2D",
  "Tgl SP2D",
  "Kode Rekening",
  "Uraian",
  "Jumlah",
  "Unit Kerja",
];

const SIPAKAD_HEADERS: string[] = [
  "No",
  "No SP2D",
  "Tanggal",
  "OPD",
  "MAK",
  "Uraian",
  "Realisasi",
  "Penerima",
];

const GENERIC_HEADERS: string[] = [
  "No",
  "No SP2D",
  "Tgl",
  "SKPD",
  "Uraian",
  "Penerima",
  "Bank",
  "Nilai",
];

const LRA_AGGREGATE_HEADERS: string[] = [
  "No",
  "Kode Rekening",
  "Uraian Rekening",
  "Bulan",
  "Pagu",
  "Realisasi",
  "Sisa",
  "Persen",
];

// ---------------------------------------------------------------------------
// detectFingerprint — format detection
// ---------------------------------------------------------------------------

describe("detectFingerprint — format detection", () => {
  it("detects SIPD from Sampang real headers with confidence > 0.7", () => {
    const r = detectFingerprint(SIPD_SAMPANG_HEADERS, []);
    expect(r.format).toBe("SIPD");
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("detects SIMDA_REGISTER from synthetic headers with Bruto/Netto/Potongan", () => {
    const r = detectFingerprint(SIMDA_REGISTER_HEADERS, []);
    expect(r.format).toBe("SIMDA_REGISTER");
    expect(r.confidence).toBeGreaterThan(0.7);
  });

  it("detects SIMDA_RINCIAN when Kode Rekening + Jumlah present (no Bruto/Netto)", () => {
    const r = detectFingerprint(SIMDA_RINCIAN_HEADERS, []);
    expect(r.format).toBe("SIMDA_RINCIAN");
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("detects SIPAKAD from synthetic headers with OPD + MAK + Realisasi", () => {
    const r = detectFingerprint(SIPAKAD_HEADERS, []);
    expect(r.format).toBe("SIPAKAD");
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("falls back to GENERIC_BPKAD for minimal 8-column file", () => {
    // 8 generic cols, no Bruto/Netto/Kode Rekening/MAK/Realisasi/Kode Sub Kegiatan
    const r = detectFingerprint(GENERIC_HEADERS, []);
    expect(r.format).toBe("GENERIC_BPKAD");
  });

  it("rejects LRA aggregate file (Bulan column, no SP2D column)", () => {
    const r = detectFingerprint(LRA_AGGREGATE_HEADERS, []);
    expect(r.format).toBe("AGGREGATE_REJECT");
    expect(r.confidence).toBe(1.0);
    expect(r.reason).toMatch(/agregat/i);
  });

  it("also rejects file with Triwulan/Periode column tanpa SP2D", () => {
    const triw = detectFingerprint(
      ["Kode", "Uraian", "Triwulan", "Realisasi"],
      [],
    );
    expect(triw.format).toBe("AGGREGATE_REJECT");

    const per = detectFingerprint(
      ["Kode", "Uraian", "Periode", "Pagu", "Realisasi"],
      [],
    );
    expect(per.format).toBe("AGGREGATE_REJECT");
  });

  it("does NOT reject file that has Bulan AND Nomor SP2D (register dengan kolom bulan)", () => {
    const headers = [
      "Bulan",
      "Nomor SP2D",
      "Tanggal SP2D",
      "Nilai SP2D",
      "Nilai Realisasi",
      "Kode Sub Kegiatan",
    ];
    const r = detectFingerprint(headers, []);
    expect(r.format).not.toBe("AGGREGATE_REJECT");
  });

  it("returns UNKNOWN for headers without recognisable SP2D markers", () => {
    const r = detectFingerprint(["foo", "bar", "baz"], []);
    expect(r.format).toBe("UNKNOWN");
  });

  it("rounds confidence to 2 decimals", () => {
    const r = detectFingerprint(SIPD_SAMPANG_HEADERS, []);
    const decimals = r.confidence.toString().split(".")[1] ?? "";
    expect(decimals.length).toBeLessThanOrEqual(2);
  });

  it("populates scores map for all candidate formats", () => {
    const r = detectFingerprint(SIPD_SAMPANG_HEADERS, []);
    expect(r.scores).toBeDefined();
    expect(Object.keys(r.scores ?? {})).toEqual(
      expect.arrayContaining([
        "SIPD",
        "SIMDA_REGISTER",
        "SIMDA_RINCIAN",
        "SIPAKAD",
        "GENERIC_BPKAD",
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Tie-break
// ---------------------------------------------------------------------------

describe("detectFingerprint — tie-break", () => {
  it("prefers format with higher exact required match when scores tie", () => {
    // Header set ini punya semua required SIMDA_REGISTER + GENERIC_BPKAD.
    // Required SIMDA_REGISTER (3) > GENERIC_BPKAD (2), jadi pilih SIMDA_REGISTER.
    const r = detectFingerprint(SIMDA_REGISTER_HEADERS, []);
    expect(r.format).toBe("SIMDA_REGISTER");
  });
});

// ---------------------------------------------------------------------------
// Granularity classification
// ---------------------------------------------------------------------------

describe("detectFingerprint — granularity", () => {
  it("classifies as line_item when >=20% SP2D have >1 row and median >= 2", () => {
    const headers = ["Nomor SP2D", "Kode Rekening", "Jumlah"];
    const samples = [
      { no_sp2d: "A" },
      { no_sp2d: "A" },
      { no_sp2d: "A" },
      { no_sp2d: "B" },
      { no_sp2d: "B" },
      { no_sp2d: "C" },
    ];
    const g = __internals.classifyGranularity(headers, samples);
    expect(g).toBe("line_item");
  });

  it("classifies as sp2d_header when 10 unique SP2D all single-row", () => {
    const headers = ["Nomor SP2D", "Nilai"];
    const samples = Array.from({ length: 10 }, (_, i) => ({
      no_sp2d: `SP2D-${i + 1}`,
    }));
    const g = __internals.classifyGranularity(headers, samples);
    expect(g).toBe("sp2d_header");
  });

  it("classifies as ambiguous when sample rows kosong", () => {
    const g = __internals.classifyGranularity(["Nomor SP2D"], []);
    expect(g).toBe("ambiguous");
  });

  it("classifies as ambiguous when mixed (median 1 tapi banyak duplikat)", () => {
    // 6 unique, 1 punya 2 rows (16.7% multi-row < 20%), median = 1, single% = 5/6 = 83.3% (< 95%)
    // → ambiguous
    const headers = ["Nomor SP2D"];
    const samples = [
      { no_sp2d: "A" },
      { no_sp2d: "A" },
      { no_sp2d: "B" },
      { no_sp2d: "C" },
      { no_sp2d: "D" },
      { no_sp2d: "E" },
      { no_sp2d: "F" },
    ];
    const g = __internals.classifyGranularity(headers, samples);
    expect(g).toBe("ambiguous");
  });

  it("works with array-form rows when sp2d column index is provided via headers", () => {
    const headers = ["No", "Nomor SP2D", "Jumlah"];
    const samples: unknown[][] = [
      [1, "X", 100],
      [2, "X", 200],
      [3, "Y", 50],
      [4, "Y", 75],
      [5, "Y", 25],
      [6, "Z", 999],
    ];
    const g = __internals.classifyGranularity(headers, samples);
    expect(g).toBe("line_item");
  });

  it("integration: detectFingerprint propagates granularity into result", () => {
    const headers = [
      "Nomor SP2D",
      "Tanggal SP2D",
      "Nilai SP2D",
      "Nilai Realisasi",
      "Kode Sub Kegiatan",
      "Kode Rekening",
    ];
    const samples = [
      { no_sp2d: "A" },
      { no_sp2d: "A" },
      { no_sp2d: "A" },
      { no_sp2d: "B" },
      { no_sp2d: "B" },
      { no_sp2d: "C" },
    ];
    const r = detectFingerprint(headers, samples);
    expect(r.format).toBe("SIPD");
    expect(r.granularity).toBe("line_item");
  });
});

// ---------------------------------------------------------------------------
// Internal helpers — sanity checks
// ---------------------------------------------------------------------------

describe("fingerprint internals", () => {
  it("normalizeHeader lowercases, strips dots, collapses whitespace", () => {
    expect(__internals.normalizeHeader("No. SP2D")).toBe("no sp2d");
    expect(__internals.normalizeHeader("  Nomor   SP2D  ")).toBe("nomor sp2d");
    expect(__internals.normalizeHeader("Kode-Rekening")).toBe("kode rekening");
  });

  it("isAggregateFile true when Bulan present without SP2D", () => {
    const headers = __internals.normalizeHeaders([
      "Bulan",
      "Pagu",
      "Realisasi",
    ]);
    expect(__internals.isAggregateFile(headers)).toBe(true);
  });

  it("isAggregateFile false when both Bulan and Nomor SP2D present", () => {
    const headers = __internals.normalizeHeaders([
      "Bulan",
      "Nomor SP2D",
      "Nilai",
    ]);
    expect(__internals.isAggregateFile(headers)).toBe(false);
  });

  it("scoreFormat returns 0 score when no required hit", () => {
    const headers = __internals.normalizeHeaders(["foo", "bar"]);
    const d = __internals.scoreFormat(headers, "SIPD");
    expect(d.requiredHit).toBe(0);
    expect(d.score).toBe(0);
  });
});
