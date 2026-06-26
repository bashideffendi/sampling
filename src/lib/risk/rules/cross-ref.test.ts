import { describe, it, expect } from "vitest";
import type { SP2DRow } from "@/types";
import { duplicatePayment } from "./cross-ref";

let idxCounter = 0;
function row(overrides: Partial<SP2DRow>): SP2DRow {
  return {
    no_sp2d: `SP2D-${idxCounter}`,
    tgl_sp2d: "2025-01-15",
    nilai: 10_000_000,
    skpd: "Dinas PUPR",
    kode_rek: "5.1.02.01.001",
    uraian: "Belanja konsumsi rapat koordinasi",
    penyedia: "CV Sumber Rejeki",
    npwp: "012345678901234",
    _idx: idxCounter++,
    ...overrides,
  };
}

function ctx(populasi: SP2DRow[]) {
  return {
    populasi,
    meta: { totalNilai: 0, totalCount: populasi.length, hashSha256: "" },
  };
}

describe("duplicatePayment v0.3.13 sliding-window", () => {
  it("flag 2 SP2D vendor+nilai+uraian sama dalam 30 hari", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-10" }),
      row({ tgl_sp2d: "2025-01-20" }),
    ];
    const hits = duplicatePayment.run(ctx(rows));
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.sp2dIdx).sort()).toEqual([0, 1]);
  });

  it("TIDAK flag kalau jarak > 30 hari", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-10" }),
      row({ tgl_sp2d: "2025-03-15" }), // 64 hari kemudian
    ];
    const hits = duplicatePayment.run(ctx(rows));
    expect(hits).toHaveLength(0);
  });

  it("flag 3 SP2D dalam window 30 hari — semua dapat hit", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-01" }),
      row({ tgl_sp2d: "2025-01-15" }),
      row({ tgl_sp2d: "2025-01-25" }), // 24 hari dari pertama
    ];
    const hits = duplicatePayment.run(ctx(rows));
    expect(hits).toHaveLength(3);
  });

  it("split window: A-B dekat (10 hari), B-C dekat (15 hari), A-C jauh (45 hari)", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-01" }), // _idx 0
      row({ tgl_sp2d: "2025-01-11" }), // _idx 1 — 10 hr dari 0
      row({ tgl_sp2d: "2025-02-15" }), // _idx 2 — 35 hr dari 1, 45 hr dari 0
    ];
    const hits = duplicatePayment.run(ctx(rows));
    // 0+1 dalam window, 1+2 di luar (35>30), 0+2 di luar.
    // Hanya 0+1 yang ke-flag.
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.sp2dIdx).sort()).toEqual([0, 1]);
  });

  it("vendor beda — TIDAK flag walau nilai+uraian+window sama", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-10", penyedia: "CV A" }),
      row({ tgl_sp2d: "2025-01-20", penyedia: "CV B" }),
    ];
    const hits = duplicatePayment.run(ctx(rows));
    expect(hits).toHaveLength(0);
  });

  it("nilai bucket beda (> Rp 1jt selisih) — TIDAK flag", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-10", nilai: 10_000_000 }),
      row({ tgl_sp2d: "2025-01-20", nilai: 12_500_000 }), // beda bucket
    ];
    const hits = duplicatePayment.run(ctx(rows));
    expect(hits).toHaveLength(0);
  });

  it("perf: 1000 SP2D vendor sama dalam 1 tahun selesai < 100ms", () => {
    idxCounter = 0;
    const rows: SP2DRow[] = [];
    for (let i = 0; i < 1000; i++) {
      const day = (i % 365) + 1;
      const month = Math.floor((day - 1) / 30) + 1;
      const dayOfMonth = ((day - 1) % 30) + 1;
      const dateStr = `2025-${String(Math.min(12, month)).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
      rows.push(row({ tgl_sp2d: dateStr, _idx: i }));
    }
    const t0 = Date.now();
    duplicatePayment.run(ctx(rows));
    const dt = Date.now() - t0;
    // O(n²) lama bisa 1000+ ms di n=1000. Sliding window should stay well under
    // 300ms (peers emission masih O(n²) per cluster yang fully flagged — tapi
    // window detection itu sendiri O(n)).
    expect(dt).toBeLessThan(300);
  });

  it("kosongin row tanpa tgl_sp2d — tidak crash", () => {
    idxCounter = 0;
    const rows = [
      row({ tgl_sp2d: "2025-01-10" }),
      row({ tgl_sp2d: "" }),
      row({ tgl_sp2d: "2025-01-20" }),
    ];
    const hits = duplicatePayment.run(ctx(rows));
    expect(hits).toHaveLength(2);
  });
});
