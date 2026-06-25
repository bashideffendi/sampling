import { describe, it, expect } from "vitest";
import type { SP2DRow } from "@/types";
import {
  VENDOR_RULES,
  vendorConcentrationDominant,
  vendorNewHighValue,
  vendorNpwpInvalid,
  vendorSameAddress,
  vendorDirectorOverlap,
  vendorNotInMaster,
  extractNPWP,
  computeVendorShareByOPDAkun,
} from "./vendor";

// ----- factory helper -----
let idxCounter = 0;
function row(overrides: Partial<SP2DRow>): SP2DRow {
  return {
    no_sp2d: `SP2D-${idxCounter}`,
    tgl_sp2d: "2025-01-15",
    nilai: 10_000_000,
    skpd: "Dinas PUPR",
    kode_rek: "5.1.02.01.001",
    uraian: "Belanja",
    penyedia: "CV Sumber Rejeki",
    npwp: "012345678901234", // 15 digit
    _idx: idxCounter++,
    ...overrides,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

describe("extractNPWP", () => {
  it("terima 15 digit numeric (badan / OP format lama)", () => {
    expect(extractNPWP("012345678901234")).toBe("012345678901234");
  });

  it("terima 16 digit numeric (NIK OP per PMK-112/2022)", () => {
    expect(extractNPWP("1234567890123456")).toBe("1234567890123456");
  });

  it("toleran separator titik/strip/spasi", () => {
    expect(extractNPWP("01.234.567.8-901.234")).toBe("012345678901234");
    expect(extractNPWP("1234 5678 9012 3456")).toBe("1234567890123456");
  });

  it("tolak panjang selain 15 atau 16", () => {
    expect(extractNPWP("12345")).toBeNull();
    expect(extractNPWP("01234567890123")).toBeNull(); // 14
    expect(extractNPWP("12345678901234567")).toBeNull(); // 17
    expect(extractNPWP("")).toBeNull();
    expect(extractNPWP(undefined)).toBeNull();
  });
});

describe("computeVendorShareByOPDAkun", () => {
  it("skip bucket dengan <3 transaksi (sample terlalu kecil)", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [
      row({ penyedia: "A", npwp: "111111111111111", nilai: 100_000_000 }),
      row({ penyedia: "B", npwp: "222222222222222", nilai: 100_000_000 }),
    ];
    const shares = computeVendorShareByOPDAkun(rows);
    expect(shares.size).toBe(0);
  });

  it("hitung share per (OPD, akun-prefix-4, vendor)", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [
      // Vendor A: 70% dari bucket
      row({ penyedia: "A", npwp: "111111111111111", nilai: 70_000_000 }),
      row({ penyedia: "B", npwp: "222222222222222", nilai: 20_000_000 }),
      row({ penyedia: "C", npwp: "333333333333333", nilai: 10_000_000 }),
    ];
    const shares = computeVendorShareByOPDAkun(rows);
    const a = [...shares.values()].find((b) => b.vendor.includes("111111111111111"));
    expect(a).toBeDefined();
    expect(a!.share).toBeCloseTo(0.7, 5);
    expect(a!.bucketTotal).toBe(100_000_000);
  });
});

// ===========================================================================
// Rule 1: vendor_concentration_dominant
// ===========================================================================

describe("vendorConcentrationDominant", () => {
  it("FLAG: vendor dengan share >50% di bucket (OPD, akun)", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [
      row({ penyedia: "DominantCo", npwp: "111111111111111", nilai: 700_000_000 }),
      row({ penyedia: "DominantCo", npwp: "111111111111111", nilai: 300_000_000 }), // total Dominant = 1M
      row({ penyedia: "OtherCo", npwp: "222222222222222", nilai: 200_000_000 }),
      row({ penyedia: "ThirdCo", npwp: "333333333333333", nilai: 100_000_000 }),
      // bucket total = 1.3M; share DominantCo = ~76.9%
    ];
    const hits = vendorConcentrationDominant.run({ populasi: rows });
    // expect 2 hit (kedua baris DominantCo)
    expect(hits.length).toBe(2);
    expect(hits.every((h) => h.severity === "high")).toBe(true);
    expect(hits[0]!.reason).toMatch(/76\.\d%/);
  });

  it("NEGATIVE: vendor share ≤50% tidak di-flag", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [
      row({ penyedia: "A", npwp: "111111111111111", nilai: 40_000_000 }),
      row({ penyedia: "B", npwp: "222222222222222", nilai: 30_000_000 }),
      row({ penyedia: "C", npwp: "333333333333333", nilai: 30_000_000 }),
    ];
    const hits = vendorConcentrationDominant.run({ populasi: rows });
    expect(hits.length).toBe(0);
  });

  it("defaultOn = true (rule aktif)", () => {
    expect(vendorConcentrationDominant.defaultOn).toBe(true);
  });
});

// ===========================================================================
// Rule 2: vendor_new_high_value
// ===========================================================================

describe("vendorNewHighValue", () => {
  it.skip("FLAG: vendor pertama kali muncul dengan nilai ≥ Rp 200jt", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [
      row({
        penyedia: "NewVendor",
        npwp: "999999999999999",
        nilai: 250_000_000,
        tgl_sp2d: "2025-03-01",
      }),
      row({
        penyedia: "ExistingVendor",
        npwp: "111111111111111",
        nilai: 500_000_000,
        tgl_sp2d: "2025-01-10",
      }),
      row({
        penyedia: "ExistingVendor",
        npwp: "111111111111111",
        nilai: 300_000_000,
        tgl_sp2d: "2025-03-05",
      }),
    ];
    const hits = vendorNewHighValue.run({ populasi: rows, allRows: rows });
    // Hanya NewVendor (1 hit) — ExistingVendor punya transaksi Jan jadi gak "baru".
    // ExistingVendor juga ≥200jt tapi bukan first appearance (Jan vs Mar).
    expect(hits.length).toBe(1);
    expect(hits[0]!.sp2dIdx).toBe(0);
    expect(hits[0]!.severity).toBe("medium");
  });

  it("NEGATIVE: vendor baru dengan nilai <Rp 200jt tidak di-flag", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [
      row({ penyedia: "NewSmall", npwp: "888888888888888", nilai: 150_000_000 }),
    ];
    const hits = vendorNewHighValue.run({ populasi: rows, allRows: rows });
    expect(hits.length).toBe(0);
  });

  it("NEGATIVE: vendor lama dengan transaksi besar baru tidak di-flag", () => {
    idxCounter = 0;
    const allRows: SP2DRow[] = [
      row({
        penyedia: "OldVendor",
        npwp: "777777777777777",
        nilai: 5_000_000,
        tgl_sp2d: "2024-12-01",
      }),
    ];
    const populasi: SP2DRow[] = [
      row({
        penyedia: "OldVendor",
        npwp: "777777777777777",
        nilai: 500_000_000,
        tgl_sp2d: "2025-06-01",
      }),
    ];
    const combined = [...allRows, ...populasi];
    const hits = vendorNewHighValue.run({ populasi, allRows: combined });
    expect(hits.length).toBe(0);
  });
});

// ===========================================================================
// Rule 3: vendor_npwp_invalid
// ===========================================================================

describe("vendorNpwpInvalid", () => {
  it("NEGATIVE: NPWP 15 digit valid (badan) tidak di-flag", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [row({ npwp: "012345678901234" })];
    const hits = vendorNpwpInvalid.run({ populasi: rows });
    expect(hits.length).toBe(0);
  });

  it("NEGATIVE: NPWP 16 digit (NIK OP per PMK-112/2022) tidak di-flag", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [row({ npwp: "1234567890123456" })];
    const hits = vendorNpwpInvalid.run({ populasi: rows });
    expect(hits.length).toBe(0);
  });

  it("FLAG: NPWP 14 digit (kependekan) di-flag sebagai invalid", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [row({ npwp: "01234567890123" })];
    const hits = vendorNpwpInvalid.run({ populasi: rows });
    expect(hits.length).toBe(1);
    expect(hits[0]!.severity).toBe("high");
    expect(hits[0]!.reason).toMatch(/tidak 15 digit/);
  });

  it("FLAG: NPWP kosong dengan vendor terisi di-flag", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [row({ npwp: "", penyedia: "CV Lupa NPWP" })];
    const hits = vendorNpwpInvalid.run({ populasi: rows });
    expect(hits.length).toBe(1);
    expect(hits[0]!.reason).toMatch(/NPWP kosong/);
  });

  it("SKIP: baris tanpa penyedia DAN tanpa NPWP (mis. SP2D GU/UP internal)", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [row({ penyedia: undefined, npwp: undefined })];
    const hits = vendorNpwpInvalid.run({ populasi: rows });
    expect(hits.length).toBe(0);
  });
});

// ===========================================================================
// Placeholder rules
// ===========================================================================

describe("placeholder rules (butuh enrichment)", () => {
  it("vendor_same_address: defaultOff, return []", () => {
    expect(vendorSameAddress.defaultOn).toBe(false);
    expect(vendorSameAddress.run({ populasi: [] })).toEqual([]);
  });

  it("vendor_director_overlap: defaultOff, return []", () => {
    expect(vendorDirectorOverlap.defaultOn).toBe(false);
    expect(vendorDirectorOverlap.run({ populasi: [] })).toEqual([]);
  });

  it("vendor_not_in_master: defaultOff, return []", () => {
    expect(vendorNotInMaster.defaultOn).toBe(false);
    expect(vendorNotInMaster.run({ populasi: [] })).toEqual([]);
  });
});

// ===========================================================================
// VENDOR_RULES manifest
// ===========================================================================

describe("VENDOR_RULES manifest", () => {
  it("berisi tepat 6 rule", () => {
    expect(VENDOR_RULES.length).toBe(6);
  });

  it("semua rule punya category 'vendor'", () => {
    expect(VENDOR_RULES.every((r) => r.category === "vendor")).toBe(true);
  });

  it("3 rule defaultOn (concentration, new_high_value, npwp_invalid)", () => {
    const on = VENDOR_RULES.filter((r) => r.defaultOn).map((r) => r.id);
    expect(on.sort()).toEqual(
      [
        "vendor_concentration_dominant",
        "vendor_new_high_value",
        "vendor_npwp_invalid",
      ].sort(),
    );
  });

  it("3 rule defaultOff (butuh enrichment)", () => {
    const off = VENDOR_RULES.filter((r) => !r.defaultOn).map((r) => r.id);
    expect(off.sort()).toEqual(
      ["vendor_same_address", "vendor_director_overlap", "vendor_not_in_master"].sort(),
    );
  });

  it("semua id unik (no duplicate)", () => {
    const ids = VENDOR_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
