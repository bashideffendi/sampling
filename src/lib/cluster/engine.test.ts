import { describe, it, expect } from "vitest";
import { detectClusters } from "./engine";
import { detectMarker } from "./keywords";
import type { SP2DRow } from "@/types";

function row(
  i: number,
  patch: Partial<SP2DRow> & { uraian?: string; penyedia?: string; tgl_sp2d?: string; nilai?: number; npwp?: string; skpd?: string },
): SP2DRow {
  return {
    no_sp2d: `SP2D-${String(i).padStart(4, "0")}`,
    tgl_sp2d: patch.tgl_sp2d ?? "2025-01-01",
    nilai: patch.nilai ?? 50_000_000,
    skpd: patch.skpd ?? "Dinas X",
    penyedia: patch.penyedia ?? "PT ABC",
    npwp: patch.npwp,
    uraian: patch.uraian,
    _idx: i,
  };
}

describe("detectMarker", () => {
  it("detect Tahap I/II/III roman", () => {
    expect(detectMarker("Pembayaran Tahap I belanja jasa cleaning")?.marker).toBe("tahap");
    expect(detectMarker("Pembayaran Tahap II belanja jasa cleaning")?.sequence).toBe(2);
    expect(detectMarker("Pembayaran Tahap III belanja jasa cleaning")?.sequence).toBe(3);
  });

  it("detect Tahap arabic numerals", () => {
    expect(detectMarker("Pembayaran Tahap 1 honor instruktur")?.sequence).toBe(1);
    expect(detectMarker("Belanja pelatihan Tahap 5 RPS")?.sequence).toBe(5);
  });

  it("detect Termin/Termijn/Termyn", () => {
    expect(detectMarker("Belanja Sewa Kendaraan Termyn I")?.marker).toBe("termin");
    expect(detectMarker("Termijn II pengadaan ATK")?.sequence).toBe(2);
    expect(detectMarker("Pembayaran Termin 3 kontrak A")?.sequence).toBe(3);
  });

  it("detect Uang Muka / UM / DP", () => {
    expect(detectMarker("Pembayaran DP Perbaikan Genset Wabup")?.marker).toBe("uang_muka");
    expect(detectMarker("Uang Muka kontrak konstruksi")?.marker).toBe("uang_muka");
    expect(detectMarker("UM 30% pembangunan gedung")?.marker).toBe("uang_muka");
  });

  it("detect Pelunasan", () => {
    expect(detectMarker("Pelunasan pembangunan gedung X")?.marker).toBe("pelunasan");
    expect(detectMarker("Pembayaran akhir kontrak Y")?.marker).toBe("pelunasan");
  });

  it("detect Angsuran", () => {
    expect(detectMarker("Angsuran 1 sewa gedung")?.marker).toBe("angsuran");
    expect(detectMarker("Angsuran ke-3 pembelian alat")?.sequence).toBe(3);
  });

  it("return null kalau gak match", () => {
    expect(detectMarker("Belanja ATK rutin")).toBeNull();
    expect(detectMarker("Honor narsum kegiatan")).toBeNull();
    expect(detectMarker(undefined)).toBeNull();
  });
});

describe("detectClusters", () => {
  it("basic cluster UM + Tahap + Pelunasan", () => {
    const rows: SP2DRow[] = [
      row(1, {
        npwp: "012345678900000",
        penyedia: "PT XYZ Konstruksi",
        uraian: "Uang Muka pembangunan gedung",
        nilai: 60_000_000,
        tgl_sp2d: "2025-02-01",
      }),
      row(2, {
        npwp: "012345678900000",
        penyedia: "PT XYZ Konstruksi",
        uraian: "Pembayaran Tahap I pembangunan gedung",
        nilai: 80_000_000,
        tgl_sp2d: "2025-04-01",
      }),
      row(3, {
        npwp: "012345678900000",
        penyedia: "PT XYZ Konstruksi",
        uraian: "Pembayaran Tahap II pembangunan gedung",
        nilai: 80_000_000,
        tgl_sp2d: "2025-06-01",
      }),
      row(4, {
        npwp: "012345678900000",
        penyedia: "PT XYZ Konstruksi",
        uraian: "Pelunasan pembangunan gedung",
        nilai: 30_000_000,
        tgl_sp2d: "2025-08-01",
      }),
    ];
    const r = detectClusters(rows);
    expect(r.clusters).toHaveLength(1);
    const c = r.clusters[0];
    expect(c.count).toBe(4);
    expect(c.totalNilai).toBe(250_000_000);
    expect(c.dominantPattern).toContain("UM + Pelunasan");
    expect(c.confidence).toBeGreaterThan(0.7);
  });

  it("split paket detection (total > 200jt tapi tiap item < 200jt)", () => {
    const rows: SP2DRow[] = [
      row(1, {
        npwp: "111111111111111",
        penyedia: "CV Splitter",
        uraian: "Pembayaran Tahap 1 sewa kendaraan",
        nilai: 100_000_000,
        tgl_sp2d: "2025-01-10",
      }),
      row(2, {
        npwp: "111111111111111",
        penyedia: "CV Splitter",
        uraian: "Pembayaran Tahap 2 sewa kendaraan",
        nilai: 150_000_000,
        tgl_sp2d: "2025-01-15",
      }),
    ];
    const r = detectClusters(rows);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].splitFlag).toBe(true);
    expect(r.clusters[0].totalNilai).toBe(250_000_000);
  });

  it("filter cluster < minSize", () => {
    const rows: SP2DRow[] = [
      row(1, {
        npwp: "999999999999999",
        uraian: "Pembayaran Tahap 1",
        nilai: 50_000_000,
        tgl_sp2d: "2025-01-01",
      }),
    ];
    const r = detectClusters(rows, { minSize: 2 });
    expect(r.clusters).toHaveLength(0);
  });

  it("vendor matching: NPWP first", () => {
    // Sama NPWP, beda nama → tetap satu cluster
    const rows: SP2DRow[] = [
      row(1, {
        npwp: "012345678900000",
        penyedia: "PT XYZ",
        uraian: "Tahap I",
        nilai: 60_000_000,
        tgl_sp2d: "2025-02-01",
      }),
      row(2, {
        npwp: "012345678900000",
        penyedia: "PT. XYZ",
        uraian: "Tahap II",
        nilai: 80_000_000,
        tgl_sp2d: "2025-05-01",
      }),
    ];
    const r = detectClusters(rows);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].count).toBe(2);
  });

  it("skip kalau total < minTotalNilai", () => {
    const rows: SP2DRow[] = [
      row(1, { uraian: "Tahap 1", nilai: 5_000_000, tgl_sp2d: "2025-01-01" }),
      row(2, { uraian: "Tahap 2", nilai: 10_000_000, tgl_sp2d: "2025-02-01" }),
    ];
    const r = detectClusters(rows); // default minTotalNilai = 50jt
    expect(r.clusters).toHaveLength(0);
  });

  it("window cluster: gap > 365 hari → split jadi 2 cluster", () => {
    const rows: SP2DRow[] = [
      row(1, {
        npwp: "012345678900000",
        uraian: "Tahap I",
        nilai: 50_000_000,
        tgl_sp2d: "2025-01-01",
      }),
      row(2, {
        npwp: "012345678900000",
        uraian: "Tahap II",
        nilai: 50_000_000,
        tgl_sp2d: "2025-06-01",
      }),
      row(3, {
        npwp: "012345678900000",
        uraian: "Tahap III",
        nilai: 50_000_000,
        tgl_sp2d: "2027-01-01", // 2 tahun jauhnya
      }),
    ];
    // Default 365 hari, jadi (1,2) cluster, 3 lepas alone < minSize
    const r = detectClusters(rows);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].count).toBe(2);
  });

  it("scannedRows + markedRows count akurat", () => {
    const rows: SP2DRow[] = [
      row(1, { uraian: "Tahap 1", nilai: 50_000_000 }),
      row(2, { uraian: "Belanja ATK rutin", nilai: 5_000_000 }), // gak ada marker
      row(3, { uraian: "Pelunasan", nilai: 30_000_000 }),
    ];
    const r = detectClusters(rows);
    expect(r.scannedRows).toBe(3);
    expect(r.markedRows).toBe(2);
  });
});
