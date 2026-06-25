/**
 * Risk Helper — public aggregator.
 *
 * v0.3.2 ship-set: VENDOR + AKUN rules (10 rules total).
 *
 * DEFERRED ke v0.3.3 (API drift dari workflow generator — beberapa agen invent
 * sendiri RiskRule type + RuleHit shape vs Foundation):
 *   - statistical (evaluate vs run, RuleHit.flagged array shape)
 *   - nilai (own Rule interface)
 *   - timing (own RiskRule interface)
 *   - cross-ref (own RiskRule interface)
 *
 * File .deferred preserved supaya port logic ke Foundation API tinggal rename.
 */

import type { Rule, RuleCategory } from "./types";
import { VENDOR_RULES } from "./rules/vendor";
import { AKUN_RULES } from "./rules/akun";

export * from "./types";
export { runRiskRules } from "./engine";

/** Semua rule yang ke-register di engine, urut kategori. */
export const ALL_RULES: ReadonlyArray<Rule> = [
  ...VENDOR_RULES,
  ...AKUN_RULES,
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
