/**
 * Buang baris subtotal/total/grand total dari raw sheet rows sebelum parsing.
 * Deteksi: cell non-empty pertama match pola /^(jumlah|total|sub\s*total|grand\s*total|jumlah\s+(per|sub)\s*\w+)/i.
 */

const SUBTOTAL_PATTERN =
  /^(jumlah|total|sub\s*total|grand\s*total|jumlah\s+(per|sub)\s*\w+)/i;

export interface StripResult {
  kept: unknown[][];
  stripped: number;
  /** Indeks baris asli (0-based di input) yang dibuang. */
  strippedIndices: number[];
}

function firstNonEmpty(row: unknown[]): string | null {
  for (const cell of row) {
    if (cell === null || cell === undefined) continue;
    const s = String(cell).trim();
    if (s.length === 0) continue;
    return s;
  }
  return null;
}

function isSubtotalRow(row: unknown[]): boolean {
  const first = firstNonEmpty(row);
  if (first === null) return false;
  return SUBTOTAL_PATTERN.test(first);
}

/**
 * Buang baris subtotal. `headers` parameter dipakai sebagai kontekstual hint
 * (tidak ikut di-strip walaupun cell pertamanya kebetulan match — header sudah
 * dipisah sebelum dilempar ke fungsi ini, jadi caller cukup pass-through).
 */
export function stripSubtotalRows(
  rows: unknown[][],
  _headers: string[],
): StripResult {
  void _headers;
  const kept: unknown[][] = [];
  const strippedIndices: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isSubtotalRow(row)) {
      strippedIndices.push(i);
      continue;
    }
    kept.push(row);
  }

  return {
    kept,
    stripped: strippedIndices.length,
    strippedIndices,
  };
}
