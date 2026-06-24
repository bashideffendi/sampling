/**
 * Judgmental (Non-Statistical) Sampling.
 *
 * Auditor pilih item berdasarkan kriteria risiko (mis. vendor berulang, nilai
 * mendekati batas PL, akhir tahun, akun rawan). Tidak bisa diproyeksikan
 * statistik — kesimpulan hanya buat item yang diuji.
 *
 * Filter criteria diparse dari free-text DSL sederhana (key op value) atau
 * predicate function. Rationale wajib diisi (audit defensibility).
 */

import type {
  JudgmentalParam,
  JudgmentalCriterion,
  SamplingResult,
  SP2DRow,
  SelectedItem,
} from "@/types";

/** Tipe predikat hasil compile dari criterion.filter (DSL minimal). */
type Predicate = (row: SP2DRow) => boolean;

/** Compile filter string → predicate. Mendukung:
 *  - `nilai >= 200000000`
 *  - `tgl_sp2d >= 2025-12-01`
 *  - `skpd contains "DPUPR"`
 *  - `uraian regex "^Belanja"`
 *  - `penyedia in "CV ABC","PT XYZ"`
 *  - kombinasi `&&` antar klausa.
 */
export function compileCriterion(filter: string): Predicate {
  const clauses = filter.split("&&").map((s) => s.trim()).filter(Boolean);
  const preds: Predicate[] = clauses.map((clause) => parseClause(clause));
  return (row) => preds.every((p) => p(row));
}

function parseClause(clause: string): Predicate {
  // Recognize ops: >=, <=, !=, ==, >, <, contains, regex, in
  const opMatch = clause.match(
    /^(\w+)\s+(>=|<=|!=|==|=|>|<|contains|regex|in)\s+(.+)$/i,
  );
  if (!opMatch) {
    return () => false;
  }
  const [, field, op, raw] = opMatch;
  const key = field as keyof SP2DRow;
  const lit = raw.trim();

  switch (op.toLowerCase()) {
    case "==":
    case "=":
      return (r) => String(r[key] ?? "") === unquote(lit);
    case "!=":
      return (r) => String(r[key] ?? "") !== unquote(lit);
    case ">":
      return (r) => parseFloat(String(r[key] ?? "0")) > parseFloat(lit);
    case ">=":
      return (r) => parseFloat(String(r[key] ?? "0")) >= parseFloat(lit);
    case "<":
      return (r) => parseFloat(String(r[key] ?? "0")) < parseFloat(lit);
    case "<=":
      return (r) => parseFloat(String(r[key] ?? "0")) <= parseFloat(lit);
    case "contains":
      return (r) =>
        String(r[key] ?? "").toLowerCase().includes(unquote(lit).toLowerCase());
    case "regex": {
      const re = new RegExp(unquote(lit), "i");
      return (r) => re.test(String(r[key] ?? ""));
    }
    case "in": {
      const values = lit
        .split(",")
        .map((s) => unquote(s.trim()).toLowerCase());
      return (r) => values.includes(String(r[key] ?? "").toLowerCase());
    }
    default:
      return () => false;
  }
}

function unquote(s: string): string {
  return s.replace(/^["'](.*)["']$/s, "$1");
}

export function judgmentalSelection(
  populasi: SP2DRow[],
  param: JudgmentalParam,
): SamplingResult {
  if (populasi.length === 0) throw new Error("Judgmental: populasi kosong.");
  if (!param.rationale || param.rationale.trim().length < 10) {
    throw new Error(
      "Judgmental: rationale wajib diisi (min 10 karakter). Pertimbangan profesional auditor harus terdokumentasi.",
    );
  }
  const activeCriteria = param.criteria.filter((c) => c.enabled);
  if (activeCriteria.length === 0) {
    throw new Error("Judgmental: minimal 1 criterion aktif.");
  }

  const matched: Map<string, { row: SP2DRow; matchedIds: string[] }> = new Map();
  const compiled: Array<{ c: JudgmentalCriterion; pred: Predicate }> = activeCriteria.map(
    (c) => ({ c, pred: compileCriterion(c.filter) }),
  );

  for (const row of populasi) {
    const matchedIds: string[] = [];
    for (const { c, pred } of compiled) {
      try {
        if (pred(row)) matchedIds.push(c.id);
      } catch {
        // skip row jika filter error
      }
    }
    if (matchedIds.length > 0) {
      matched.set(row.no_sp2d, { row, matchedIds });
    }
  }

  const selectedItems: SelectedItem[] = Array.from(matched.values()).map(
    ({ row, matchedIds }) => ({
      row,
      reason: "judgmental_match",
      matchedCriteria: matchedIds,
    }),
  );

  return {
    method: "judgmental",
    param,
    sampleSize: selectedItems.length,
    populasiCount: populasi.length,
    populasiNilai: populasi.reduce((s, r) => s + r.nilai, 0),
    seed: param.seed,
    selectedItems,
    computedAt: new Date().toISOString(),
    warnings: [
      "Hasil judgmental tidak dapat diproyeksikan secara statistik ke populasi. Kesimpulan hanya berlaku untuk item yang diuji.",
    ],
  };
}
