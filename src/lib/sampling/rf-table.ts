/**
 * Reliability Factor table buat Monetary Unit Sampling (MUS).
 *
 * Source: AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix C,
 * Table C-1 ("Reliability Factors for Sample Size"). Nilai-nilai ini
 * adalah Poisson upper-tail factors per kombinasi (confidence, expected
 * number of misstatements c).
 *
 * Formula sample size (Stringer / AICPA form):
 *   n = ceil(BV × RF / (TM − EF × EM))
 *   sampling interval J = TM / RF
 *
 * Re-verifikasi terhadap sumber lain (Roberts 1978; Leslie/Teitlebaum/
 * Anderson 1979). Disclaimer: kalau c > 5 → kasih warning ke auditor
 * ("evaluate qualitatively").
 */

export type ConfidenceLevel = 0.9 | 0.95 | 0.99;

interface RFTable {
  /** Indexed by c (number of misstatements / overstatements allowed in plan) */
  factors: number[];
  /** "Incremental allowance" untuk evaluasi (UML calc) */
  incremental: number[];
}

const RF_90: RFTable = {
  factors: [2.31, 3.89, 5.33, 6.69, 8.0, 9.28, 10.54, 11.78, 13.0, 14.21],
  incremental: [0, 1.58, 1.44, 1.36, 1.31, 1.28, 1.26, 1.24, 1.22, 1.21],
};

const RF_95: RFTable = {
  factors: [3.0, 4.75, 6.3, 7.76, 9.16, 10.52, 11.85, 13.15, 14.44, 15.71],
  incremental: [0, 1.75, 1.55, 1.46, 1.4, 1.36, 1.33, 1.3, 1.29, 1.27],
};

const RF_99: RFTable = {
  factors: [4.61, 6.64, 8.41, 10.05, 11.61, 13.11, 14.57, 16.0, 17.41, 18.79],
  incremental: [0, 2.03, 1.77, 1.64, 1.56, 1.5, 1.46, 1.43, 1.41, 1.38],
};

const TABLES: Record<ConfidenceLevel, RFTable> = {
  0.9: RF_90,
  0.95: RF_95,
  0.99: RF_99,
};

/**
 * Reliability factor untuk planning (sample-size calc).
 * c = expected number of overstatement misstatements.
 */
export function reliabilityFactor(
  confidence: ConfidenceLevel,
  c: number,
): number {
  const table = TABLES[confidence];
  if (!table) throw new Error(`Unsupported confidence level: ${confidence}`);
  if (c < 0) throw new Error(`Expected misstatements c must be >= 0, got ${c}`);
  const idx = Math.min(Math.floor(c), table.factors.length - 1);
  return table.factors[idx];
}

/**
 * Incremental allowance buat UML calculation.
 * Dipakai untuk hitung (RF(k) - RF(k-1) - 1) komponen di UML formula.
 */
export function incrementalAllowance(
  confidence: ConfidenceLevel,
  c: number,
): number {
  const table = TABLES[confidence];
  if (!table) throw new Error(`Unsupported confidence level: ${confidence}`);
  if (c < 0) throw new Error(`Expected misstatements c must be >= 0, got ${c}`);
  const idx = Math.min(Math.floor(c), table.incremental.length - 1);
  return table.incremental[idx];
}

/** Citation buat output Word/PDF — auto-included di metodologi narrative. */
export const RF_SOURCE_CITATION =
  "AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix C, Table C-1 (Poisson Reliability Factors).";

/** Z-score untuk klasik (Normal-approx). Dipakai SRS/Stratified/CVS. */
export function zScore(confidence: ConfidenceLevel): number {
  if (confidence === 0.9) return 1.645;
  if (confidence === 0.95) return 1.96;
  if (confidence === 0.99) return 2.576;
  throw new Error(`Unsupported confidence level: ${confidence}`);
}
