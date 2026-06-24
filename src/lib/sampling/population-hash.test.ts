import { describe, it, expect } from "vitest";
import { hashPopulasi, type HashableRow } from "./population-hash";

const HEX64 = /^[0-9a-f]{64}$/;

describe("hashPopulasi", () => {
  const rows: HashableRow[] = [
    {
      no_sp2d_normalized: "00001/LS/2025",
      tgl_sp2d: "2025-01-15",
      nilai_sp2d: 12_500_000,
      skpd: "Dinas Pendidikan",
    },
    {
      no_sp2d_normalized: "00002/LS/2025",
      tgl_sp2d: "2025-01-20",
      nilai_sp2d: 7_800_000,
      skpd: "Dinas Kesehatan",
    },
    {
      no_sp2d_normalized: "00003/UP/2025",
      tgl_sp2d: "2025-02-01",
      nilai_sp2d: 5_000_000,
      skpd: "Sekretariat Daerah",
    },
  ];

  it("menghasilkan hex 64 karakter (SHA-256)", async () => {
    const h = await hashPopulasi(rows);
    expect(h).toMatch(HEX64);
  });

  it("reproducible — urutan input tidak mempengaruhi hash", async () => {
    const shuffled: HashableRow[] = [rows[2], rows[0], rows[1]];
    const h1 = await hashPopulasi(rows);
    const h2 = await hashPopulasi(shuffled);
    expect(h1).toBe(h2);
  });

  it("hash berbeda untuk input berbeda", async () => {
    const mutated: HashableRow[] = [
      ...rows.slice(0, 2),
      { ...rows[2], nilai_sp2d: rows[2].nilai_sp2d! + 1 },
    ];
    const h1 = await hashPopulasi(rows);
    const h2 = await hashPopulasi(mutated);
    expect(h1).not.toBe(h2);
  });

  it("empty array menghasilkan hash konsisten", async () => {
    const h1 = await hashPopulasi([]);
    const h2 = await hashPopulasi([]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(HEX64);
  });

  it("fallback no_sp2d kalau no_sp2d_normalized absent", async () => {
    const a: HashableRow[] = [
      { no_sp2d: "X-1", tgl_sp2d: "2025-01-01", nilai: 100, skpd: "A" },
      { no_sp2d: "X-2", tgl_sp2d: "2025-01-02", nilai: 200, skpd: "B" },
    ];
    const b: HashableRow[] = [
      {
        no_sp2d_normalized: "X-1",
        tgl_sp2d: "2025-01-01",
        nilai_sp2d: 100,
        skpd: "A",
      },
      {
        no_sp2d_normalized: "X-2",
        tgl_sp2d: "2025-01-02",
        nilai_sp2d: 200,
        skpd: "B",
      },
    ];
    const ha = await hashPopulasi(a);
    const hb = await hashPopulasi(b);
    expect(ha).toBe(hb);
  });

  it("perubahan skpd mengubah hash", async () => {
    const mutated: HashableRow[] = [
      ...rows.slice(0, 2),
      { ...rows[2], skpd: "Inspektorat" },
    ];
    const h1 = await hashPopulasi(rows);
    const h2 = await hashPopulasi(mutated);
    expect(h1).not.toBe(h2);
  });
});
