/**
 * Risk Helper — public aggregator.
 *
 * v0.3.3 ship-set: Vendor + Akun + Nilai + Timing + Cross-Ref + Statistical (~30 rules total).
 * v0.3.2 deferred files (statistical/nilai/timing/cross-ref) ported ke Foundation API
 * di v0.3.3 — semua import via Rule/RuleHit/RuleContext dari ../types.
 */

import type { Rule, RuleCategory } from "./types";
import { VENDOR_RULES } from "./rules/vendor";
import { AKUN_RULES } from "./rules/akun";
import { NILAI_RULES } from "./rules/nilai";
import { TIMING_RULES } from "./rules/timing";
import { CROSS_REF_RULES } from "./rules/cross-ref";
import { STATISTICAL_RULES } from "./rules/statistical";

export * from "./types";
export { runRiskRules } from "./engine";

/** Semua rule yang ke-register di engine, urut kategori. */
export const ALL_RULES: ReadonlyArray<Rule> = [
  ...VENDOR_RULES,
  ...AKUN_RULES,
  ...NILAI_RULES,
  ...TIMING_RULES,
  ...CROSS_REF_RULES,
  ...STATISTICAL_RULES,
];

/** Lookup rule by id. */
export const RULE_BY_ID: ReadonlyMap<string, Rule> = new Map(
  ALL_RULES.map((r) => [r.id, r] as const),
);

/** Subset rule per kategori. */
export function getRulesByCategory(category: RuleCategory): ReadonlyArray<Rule> {
  return ALL_RULES.filter((r) => r.category === category);
}

/** Default-on rule ids — UI initial state. */
export function getDefaultActiveRuleIds(): Set<string> {
  return new Set(ALL_RULES.filter((r) => r.defaultOn && !r.defaultOff).map((r) => r.id));
}

/** Label per kategori — UI grouping. */
export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  timing: "Waktu Pencairan",
  vendor: "Penyedia & NPWP",
  nilai: "Nilai & Threshold",
  akun: "Kode Rekening",
  opd: "OPD / SKPD",
  cross_ref: "Lintas Baris",
  statistical: "Statistik",
  concentration: "Konsentrasi",
};

/** Order kategori untuk UI. */
export const CATEGORY_ORDER: ReadonlyArray<RuleCategory> = [
  "nilai",
  "vendor",
  "akun",
  "timing",
  "cross_ref",
  "statistical",
  "concentration",
  "opd",
];
