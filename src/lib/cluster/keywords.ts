/**
 * Keyword pattern definitions buat Cluster Explorer.
 *
 * Pola dominan di SIPD pemda Indonesia (sumber: riset data Sampang TA 2025):
 *   - "Tahap I/II/III" / "Termin/Termyn/Termijn" — kontrak termyn (paling sering)
 *   - "Uang Muka" / "UM" / "DP" — pembayaran awal
 *   - "Pelunasan" / "Pembayaran Akhir" — terakhir
 *   - "Angsuran 1/3" — payment installment
 *
 * Match pakai lowercase + word boundary biar gak false positive di tengah kata.
 */

import type { ClusterMarker } from "./types";

const ROMAN_TO_INT: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
};

interface MatchResult {
  marker: ClusterMarker;
  sequence: number | null;
  snippet: string;
}

function parseSequence(raw: string): number | null {
  const lower = raw.toLowerCase().trim();
  if (ROMAN_TO_INT[lower] !== undefined) return ROMAN_TO_INT[lower];
  const num = parseInt(lower, 10);
  if (!Number.isNaN(num) && num > 0 && num < 100) return num;
  return null;
}

/**
 * Detect marker pada string keterangan. Return null kalau gak match apa-apa.
 * Multi-pattern: tiap pattern dicoba sequential, yang first hit menang.
 */
export function detectMarker(text: string | undefined): MatchResult | null {
  if (!text) return null;
  const s = text.toLowerCase();

  // 1. Tahap I/II/III/1/2/3
  const tahapMatch = s.match(/\btahap\s+(?:ke[- ]?)?([ivx]+|\d+)\b/);
  if (tahapMatch) {
    const seq = parseSequence(tahapMatch[1]);
    return { marker: "tahap", sequence: seq, snippet: tahapMatch[0] };
  }

  // 2. Termin/Termijn/Termyn I/II/III
  const terminMatch = s.match(/\bterm(?:in|ijn|yn)\s+([ivx]+|\d+)\b/);
  if (terminMatch) {
    const seq = parseSequence(terminMatch[1]);
    return { marker: "termin", sequence: seq, snippet: terminMatch[0] };
  }

  // 3. Uang Muka / UM / DP / Down Payment
  const umMatch = s.match(/\b(uang\s*muka|down\s*payment|\bdp\b|\bum\b)\b/);
  if (umMatch) {
    return { marker: "uang_muka", sequence: 0, snippet: umMatch[0] };
  }

  // 4. Pelunasan / Pembayaran Akhir
  const pelunasanMatch = s.match(/\b(pelunasan|pembayaran\s+akhir|pelunasan\s+ke[- ]?\d+)\b/);
  if (pelunasanMatch) {
    return { marker: "pelunasan", sequence: 99, snippet: pelunasanMatch[0] };
  }

  // 5. Angsuran 1/3
  const angsuranMatch = s.match(/\bangsuran\s+(?:ke[- ]?)?([ivx]+|\d+)(?:\s*[\/dari]+\s*(\d+))?/);
  if (angsuranMatch) {
    const seq = parseSequence(angsuranMatch[1]);
    return { marker: "angsuran", sequence: seq, snippet: angsuranMatch[0] };
  }

  return null;
}
