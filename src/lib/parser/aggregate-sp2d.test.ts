import { describe, it, expect } from "vitest";
import {
  aggregateToSp2dLevel,
  normalizeSp2dKey,
  normalizeJenisTrx,
  normalizeDate,
  parseRupiah,
  type RawRow,
} from "./aggregate-sp2d";
import type { ResolvedColumnMapping } from "./canonical-row";

// ---------- Test fixture helper ----------

interface RowSpec {
  no_sp2d?: unknown;
  tgl_sp2d?: unknown;
  jenis_trx?: unknown;
  nilai_sp2d?: unknown;
  skpd?: unknown;
  penyedia?: unknown;
  npwp?: unknown;
  bank?: unknown;
  keterangan?: unknown;
  kode_rek?: unknown;
  uraian_akun?: unknown;
  nilai_realisasi?: unknown;
}

const COLUMNS = [
  "no_sp2d",
  "tgl_sp2d",
  "jenis_trx",
  "nilai_sp2d",
  "skpd",
  "penyedia",
  "npwp",
  "bank",
  "keterangan",
  "kode_rek",
  "uraian_akun",
  "nilai_realisasi",
] as const;

const MAPPING: ResolvedColumnMapping = {
  no_sp2d: 0,
  tgl_sp2d: 1,
  jenis_trx: 2,
  nilai_sp2d: 3,
  skpd: 4,
  penyedia: 5,
  npwp: 6,
  bank: 7,
  keterangan: 8,
  kode_rek: 9,
  uraian_akun: 10,
  nilai_realisasi: 11,
} as ResolvedColumnMapping;

function makeRawRows(specs: RowSpec[]): RawRow[] {
  return specs.map((spec, i) => {
    const row: Record<string | number, unknown> = { _idx: i };
    COLUMNS.forEach((field, idx) => {
      row[idx] = (spec as Record<string, unknown>)[field] ?? null;
    });
    return row as RawRow;
  });
}

// ---------- Helper unit tests ----------

describe("normalizeSp2dKey", () => {
  it("uppercase + trim", () => {
    expect(normalizeSp2dKey("  sp2d/123  ")).toBe("SP2D/123");
  });
  it("backslash -> slash", () => {
    expect(normalizeSp2dKey("SP2D\\LS\\001")).toBe("SP2D/LS/001");
  });
  it("collapse whitespace", () => {
    expect(normalizeSp2dKey("SP2D   LS\t001")).toBe("SP2D LS 001");
  });
  it("empty / null", () => {
    expect(normalizeSp2dKey("")).toBe("");
    expect(normalizeSp2dKey(null)).toBe("");
    expect(normalizeSp2dKey(undefined)).toBe("");
  });
});

describe("normalizeJenisTrx", () => {
  it("recognises canonical codes", () => {
    expect(normalizeJenisTrx("LS")).toBe("LS");
    expect(normalizeJenisTrx("up")).toBe("UP");
    expect(normalizeJenisTrx("GU")).toBe("GU");
    expect(normalizeJenisTrx("TU")).toBe("TU");
    expect(normalizeJenisTrx("NIHIL")).toBe("NIHIL");
    expect(normalizeJenisTrx("PFK")).toBe("PFK");
    expect(normalizeJenisTrx("RETUR")).toBe("RETUR");
  });
  it("keyword inside longer text", () => {
    expect(normalizeJenisTrx("SP2D-LS")).toBe("LS");
    expect(normalizeJenisTrx("LS Gaji")).toBe("LS");
  });
  it("unknown -> OTHER", () => {
    expect(normalizeJenisTrx("XYZ")).toBe("OTHER");
    expect(normalizeJenisTrx("")).toBe("OTHER");
    expect(normalizeJenisTrx(null)).toBe("OTHER");
  });
});

describe("normalizeDate", () => {
  it("ISO passthrough", () => {
    expect(normalizeDate("2025-01-02")).toBe("2025-01-02");
  });
  it("dd/mm/yyyy", () => {
    expect(normalizeDate("02/01/2025")).toBe("2025-01-02");
  });
  it("Indonesian long form", () => {
    expect(normalizeDate("2 Januari 2025")).toBe("2025-01-02");
    expect(normalizeDate("15 Desember 2024")).toBe("2024-12-15");
  });
  it("Excel serial number", () => {
    // 45658 = 2025-01-01 (excel)
    expect(normalizeDate(45658)).toBe("2025-01-01");
  });
  it("Date instance", () => {
    expect(normalizeDate(new Date(2025, 0, 2))).toBe("2025-01-02");
  });
  it("invalid -> empty", () => {
    expect(normalizeDate("bogus")).toBe("");
    expect(normalizeDate(null)).toBe("");
    expect(normalizeDate("")).toBe("");
  });
});

describe("parseRupiah", () => {
  it("ID format", () => {
    expect(parseRupiah("1.234.567,89")).toBeCloseTo(1234567.89, 2);
  });
  it("US format", () => {
    expect(parseRupiah("1,234,567.89")).toBeCloseTo(1234567.89, 2);
  });
  it("plain number", () => {
    expect(parseRupiah(1000)).toBe(1000);
  });
  it("parentheses negative", () => {
    expect(parseRupiah("(500.000)")).toBe(-500000);
  });
  it("invalid -> null", () => {
    expect(parseRupiah("abc")).toBeNull();
    expect(parseRupiah(null)).toBeNull();
    expect(parseRupiah("")).toBeNull();
  });
});

// ---------- Aggregation scenario tests ----------

describe("aggregateToSp2dLevel — scenario (a) single SP2D, 3 akun, nilai konsisten", () => {
  it("produces 1 canonical row + 3 breakdowns, no warnings", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/001",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 3_000_000,
        skpd: "Dinas A",
        kode_rek: "5.1.01",
        uraian_akun: "Belanja Gaji",
        nilai_realisasi: 1_000_000,
      },
      {
        no_sp2d: "SP2D/001",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 3_000_000,
        kode_rek: "5.1.02",
        uraian_akun: "Tunjangan",
        nilai_realisasi: 1_000_000,
      },
      {
        no_sp2d: "SP2D/001",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 3_000_000,
        kode_rek: "5.1.03",
        uraian_akun: "Honor",
        nilai_realisasi: 1_000_000,
      },
    ]);

    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical).toHaveLength(1);
    expect(res.populasiKoreksi).toHaveLength(0);
    expect(res.breakdown).toHaveLength(3);

    const row = res.canonical[0];
    expect(row.no_sp2d_normalized).toBe("SP2D/001");
    expect(row.nilai_sp2d).toBe(3_000_000);
    expect(row.breakdown_count).toBe(3);
    expect(row.jenis_trx).toBe("LS");
    expect(row.tgl_sp2d).toBe("2025-01-02");
    expect(res.warnings).toHaveLength(0);
  });
});

describe("aggregateToSp2dLevel — scenario (b) header value inconsistent (3 distinct)", () => {
  it("picks MAX + emits INCONSISTENT_HEADER_VALUE warning", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/002",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 3_000_000,
        nilai_realisasi: 1_000_000,
      },
      {
        no_sp2d: "SP2D/002",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 3_500_000,
        nilai_realisasi: 1_000_000,
      },
      {
        no_sp2d: "SP2D/002",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 4_000_000,
        nilai_realisasi: 1_000_000,
      },
    ]);

    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical).toHaveLength(1);
    expect(res.canonical[0].nilai_sp2d).toBe(4_000_000);

    const warn = res.warnings.find((w) => w.type === "INCONSISTENT_HEADER_VALUE");
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe("warn");
  });
});

describe("aggregateToSp2dLevel — scenario (c) header value all empty", () => {
  it("falls back to SUM realisasi + NILAI_SP2D_FALLBACK_SUM warning", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/003",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: null,
        nilai_realisasi: 750_000,
      },
      {
        no_sp2d: "SP2D/003",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: null,
        nilai_realisasi: 250_000,
      },
    ]);

    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical).toHaveLength(1);
    expect(res.canonical[0].nilai_sp2d).toBe(1_000_000);

    const warn = res.warnings.find((w) => w.type === "NILAI_SP2D_FALLBACK_SUM");
    expect(warn).toBeDefined();
  });
});

describe("aggregateToSp2dLevel — scenario (d) sum mismatch >= Rp 1", () => {
  it("emits SUM_MISMATCH when header != SUM realisasi", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/004",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 600_000,
      },
      {
        no_sp2d: "SP2D/004",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 350_000,
      },
    ]);

    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical[0].nilai_sp2d).toBe(1_000_000);

    const warn = res.warnings.find((w) => w.type === "SUM_MISMATCH");
    expect(warn).toBeDefined();
  });

  it("no SUM_MISMATCH when diff < 1 (rounding tolerance)", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/004B",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 1_000_000.4,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.warnings.find((w) => w.type === "SUM_MISMATCH")).toBeUndefined();
  });
});

describe("aggregateToSp2dLevel — scenario (e) negative value routed to koreksi", () => {
  it("negative nilai_sp2d goes to populasi_koreksi", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/005",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: -500_000,
        nilai_realisasi: -500_000,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical).toHaveLength(0);
    expect(res.populasiKoreksi).toHaveLength(1);
    expect(res.populasiKoreksi[0].nilai_sp2d).toBe(-500_000);
  });
});

describe("aggregateToSp2dLevel — scenario (f) jenis_trx PFK routed to koreksi", () => {
  it("PFK transactions go to populasi_koreksi even when positive", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/006",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "PFK",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 1_000_000,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical).toHaveLength(0);
    expect(res.populasiKoreksi).toHaveLength(1);
    expect(res.populasiKoreksi[0].jenis_trx).toBe("PFK");
  });

  it("RETUR also routed to populasi_koreksi", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/006R",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "RETUR",
        nilai_sp2d: 250_000,
        nilai_realisasi: 250_000,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.populasiKoreksi).toHaveLength(1);
  });
});

describe("aggregateToSp2dLevel — scenario (g) mixed jenis_trx in group", () => {
  it("emits MIXED_JENIS_TRX warning (severity warn, not error)", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/007",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 2_000_000,
        nilai_realisasi: 1_000_000,
      },
      {
        no_sp2d: "SP2D/007",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "GU",
        nilai_sp2d: 2_000_000,
        nilai_realisasi: 1_000_000,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    const warn = res.warnings.find((w) => w.type === "MIXED_JENIS_TRX");
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe("warn");
    // Tetap diproses jadi satu canonical row.
    expect(res.canonical).toHaveLength(1);
  });
});

describe("aggregateToSp2dLevel — scenario (h) empty no_sp2d", () => {
  it("skips row + emits EMPTY_SP2D_NUMBER warning", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 1_000_000,
      },
      {
        no_sp2d: "SP2D/008",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 500_000,
        nilai_realisasi: 500_000,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical).toHaveLength(1);
    expect(res.canonical[0].no_sp2d_normalized).toBe("SP2D/008");

    const warn = res.warnings.find((w) => w.type === "EMPTY_SP2D_NUMBER");
    expect(warn).toBeDefined();
  });
});

describe("aggregateToSp2dLevel — scenario (i) re-issuance suspect (different dates)", () => {
  it("emits REISSUANCE_SUSPECT when same SP2D number has different dates", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/009",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 500_000,
      },
      {
        no_sp2d: "SP2D/009",
        tgl_sp2d: "2025-03-15",
        jenis_trx: "LS",
        nilai_sp2d: 1_000_000,
        nilai_realisasi: 500_000,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    const warn = res.warnings.find((w) => w.type === "REISSUANCE_SUSPECT");
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe("warn");
  });
});

describe("aggregateToSp2dLevel — deterministic ordering", () => {
  it("sorts populasi_utama by no_sp2d_normalized lexically", () => {
    const rows = makeRawRows([
      {
        no_sp2d: "SP2D/Z",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 100,
        nilai_realisasi: 100,
      },
      {
        no_sp2d: "SP2D/A",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 200,
        nilai_realisasi: 200,
      },
      {
        no_sp2d: "SP2D/M",
        tgl_sp2d: "2025-01-02",
        jenis_trx: "LS",
        nilai_sp2d: 300,
        nilai_realisasi: 300,
      },
    ]);
    const res = aggregateToSp2dLevel(rows, MAPPING);
    expect(res.canonical.map((r) => r.no_sp2d_normalized)).toEqual([
      "SP2D/A",
      "SP2D/M",
      "SP2D/Z",
    ]);
  });
});
