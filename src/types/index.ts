/**
 * Canonical types untuk Cuplik.
 * SP2DRow = baris populasi, MethodParam per metode, SampleResult = output sampling.
 */

export type CanonicalField =
  | "no_sp2d"
  | "tgl_sp2d"
  | "nilai_bruto"
  | "nilai_netto"
  | "skpd"
  | "kode_rek"
  | "uraian"
  | "penyedia"
  | "npwp"
  | "bank"
  | "no_spm"
  | "kegiatan"
  | "sub_kegiatan"
  | "jenis_spm"
  | "program";

export type ColumnMap = Partial<Record<CanonicalField, number>>;

export interface SP2DRow {
  no_sp2d: string;
  tgl_sp2d: string; // ISO yyyy-mm-dd
  nilai: number; // single nominal (bruto default; netto fallback)
  skpd?: string;
  kode_rek?: string;
  uraian?: string;
  penyedia?: string;
  npwp?: string;
  bank?: string;
  no_spm?: string;
  kegiatan?: string;
  sub_kegiatan?: string;
  jenis_spm?: string;
  program?: string;
  _idx: number; // posisi original di file (buat audit trail)
}

export type SamplingMethod = "mus" | "srs" | "stratified" | "judgmental" | "attribute";

export interface PopulasiMeta {
  count: number;
  totalNilai: number;
  meanNilai: number;
  medianNilai: number;
  minNilai: number;
  maxNilai: number;
  negativeCount: number;
  zeroCount: number;
  hashSha256: string;
  uploadedAt: string; // ISO
  filename?: string;
}

export interface MaterialitasParam {
  basis: "pendapatan" | "belanja_total" | "ekuitas" | "manual";
  basisValue: number;
  pmPercent: number; // 0.005-0.02 typical
  tmRatioOfPm: number; // 0.5-0.75
  expectedMisstatement: number;
  planningMateriality: number; // calc: basisValue * pmPercent
  tolerableMisstatement: number; // calc: planningMateriality * tmRatioOfPm
}

export type ConfidenceLevel = 0.9 | 0.95 | 0.99;

export interface MUSParam {
  bookValue: number;
  tolerableMisstatement: number;
  expectedMisstatement: number;
  confidenceLevel: ConfidenceLevel;
  seed: number;
  includeNegativeAs100Pct: boolean;
}

export interface SRSParam {
  populationSize: number;
  confidenceLevel: ConfidenceLevel;
  expectedDeviation: number; // proportion
  tolerableDeviation: number; // proportion
  seed: number;
}

export interface StratifiedParam {
  strataBoundaries: number[]; // e.g. [10_000_000, 100_000_000, 500_000_000]
  certaintyThreshold: number; // item >= threshold -> 100% inspect
  totalTolerableError: number; // E (Rp) untuk estimasi TOTAL
  confidenceLevel: ConfidenceLevel;
  allocation: "neyman" | "proportional";
  seed: number;
}

export interface JudgmentalParam {
  criteria: JudgmentalCriterion[];
  rationale: string; // wajib
  seed: number;
}

export interface JudgmentalCriterion {
  id: string;
  label: string;
  filter: string; // free-text query, evaluated to predicate later
  enabled: boolean;
}

export interface AttributeParam {
  populationSize: number;
  confidenceLevel: ConfidenceLevel;
  tolerableDeviationRate: number; // proportion (e.g. 0.05)
  expectedDeviationRate: number; // proportion (e.g. 0.01)
  seed: number;
}

export type MethodParam =
  | { method: "mus"; param: MUSParam }
  | { method: "srs"; param: SRSParam }
  | { method: "stratified"; param: StratifiedParam }
  | { method: "judgmental"; param: JudgmentalParam }
  | { method: "attribute"; param: AttributeParam };

export interface SelectedItem {
  row: SP2DRow;
  reason: "selected" | "top_stratum" | "negative" | "judgmental_match";
  hitValue?: number; // for MUS cumulative hit
  stratum?: number; // for stratified
  matchedCriteria?: string[]; // for judgmental
}

export interface SamplingResult {
  method: SamplingMethod;
  param: MethodParam["param"];
  sampleSize: number;
  populasiCount: number;
  populasiNilai: number;
  selectionInterval?: number; // MUS
  topStratumCount?: number;
  topStratumNilai?: number;
  seed: number;
  reliabilityFactor?: number;
  selectedItems: SelectedItem[];
  computedAt: string; // ISO
  rfSource?: string; // citation
  warnings: string[];
}

export interface SeedBundle {
  version: string;
  draftId: string;
  populasi: {
    hashSha256: string;
    count: number;
    totalNilai: number;
  };
  method: SamplingMethod;
  param: MethodParam["param"];
  seed: number;
  result: {
    sampleSize: number;
    selectedNoSP2D: string[];
  };
  rfSource?: string;
  computedAt: string;
  appVersion: string;
}
