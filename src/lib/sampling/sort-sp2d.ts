/**
 * Shared SP2D sort helpers — pakai running number numerik (BUKAN lex string).
 * "SP2D-10" sebelumnya nyolot duluan dari "SP2D-9" kalau lex.
 *
 * Format SIPD umum: "35.27/04.0/000123/LS/2025" → ambil token numerik
 * terpanjang yang bukan tahun (≥4 digit, di luar 1900-2100).
 * Fallback ke lex comparison kalau gagal extract.
 *
 * Dipakai di 7 metode sampling biar urutan reproducible cross-method.
 */

import type { SP2DRow } from "@/types";

export function sortBySP2DSeq(a: SP2DRow, b: SP2DRow): number {
  const sa = extractSeq(a.no_sp2d);
  const sb = extractSeq(b.no_sp2d);
  if (sa !== null && sb !== null) return sa - sb;
  return (a.no_sp2d ?? "") < (b.no_sp2d ?? "") ? -1 : 1;
}

export function extractSeq(noSP2D: string | undefined): number | null {
  if (!noSP2D) return null;
  const tokens = noSP2D.split(/[^0-9]+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;
  const sorted = [...tokens].sort((x, y) => {
    if (y.length !== x.length) return y.length - x.length;
    const xIsYear = +x >= 1900 && +x <= 2100;
    const yIsYear = +y >= 1900 && +y <= 2100;
    return Number(xIsYear) - Number(yIsYear);
  });
  const n = Number(sorted[0]);
  return Number.isFinite(n) ? n : null;
}
