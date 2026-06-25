/**
 * Population hash — SHA-256 deterministik dari populasi SP2D.
 *
 * Tujuan: bukti reproducibility. Hash sama -> populasi identik (urutan upload
 * tak relevan). Dipakai di SeedBundle.populasi.hashSha256 + verifikasi replay.
 *
 * SCOPE HASH (penting buat audit trail clarity):
 *   - Cuma cover populasi SAMPLING UTAMA (rows yang lolos ke sampling engine).
 *   - TIDAK cover populasi koreksi (PFK/RETUR/negatif yang di-route ke
 *     populasi_koreksi terpisah) — auditor yang mau verify dua-duanya harus
 *     hash populasiKoreksi sendiri kalau perlu.
 *   - Cuma include field identifier (no_sp2d|tgl|nilai|skpd) — penyedia,
 *     npwp, keterangan, jenis_trx TIDAK ikut. Perubahan field2 itu di file
 *     yang sama TIDAK ngubah hash. Trade-off: hash robust ke trivial diff
 *     (typo penyedia), tapi miss perubahan field non-identifier yang
 *     auditor mungkin peduli.
 *
 * Canonical string:
 *   sort baris by no_sp2d_normalized (fallback no_sp2d) lex ascending,
 *   tiap baris: "no|tgl|nilai|skpd",
 *   join dengan "\n".
 *
 * JANGAN ikutkan _idx atau source_row_indices — itu artefak parsing,
 * bukan bagian dari identitas populasi.
 */

export interface HashableRow {
  no_sp2d_normalized?: string;
  no_sp2d?: string;
  tgl_sp2d: string;
  nilai_sp2d?: number;
  nilai?: number;
  skpd?: string;
}

function pickNo(row: HashableRow): string {
  return (row.no_sp2d_normalized ?? row.no_sp2d ?? "").trim();
}

function pickNilai(row: HashableRow): number {
  if (typeof row.nilai_sp2d === "number") return row.nilai_sp2d;
  if (typeof row.nilai === "number") return row.nilai;
  return 0;
}

function canonicalize(rows: HashableRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    const na = pickNo(a);
    const nb = pickNo(b);
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  });
  return sorted
    .map((r) => {
      const no = pickNo(r);
      const tgl = (r.tgl_sp2d ?? "").trim();
      const nilai = pickNilai(r);
      const skpd = (r.skpd ?? "").trim();
      return `${no}|${tgl}|${nilai}|${skpd}`;
    })
    .join("\n");
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function hashPopulasi(rows: HashableRow[]): Promise<string> {
  const canonical = canonicalize(rows);
  const data = new TextEncoder().encode(canonical);

  // Browser / modern runtime path.
  const subtle =
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.subtle !== "undefined"
      ? globalThis.crypto.subtle
      : null;

  if (subtle) {
    const digest = await subtle.digest("SHA-256", data);
    return toHex(digest);
  }

  // Node.js fallback (Vitest env tanpa webcrypto global).
  const nodeCrypto = await import("node:crypto");
  const hash = nodeCrypto.createHash("sha256");
  hash.update(Buffer.from(data));
  return hash.digest("hex");
}
