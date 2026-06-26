/**
 * MUS Evaluation — Upper Misstatement Limit (UML) calc dari hasil sampling
 * post-fieldwork. Closes the MUS lifecycle: sampling → fieldwork (auditor
 * isi nilai salah saji) → projection ke populasi (UML).
 *
 * Formula AICPA Audit Guide: Audit Sampling, MUS chapter.
 *   UML = Basic Precision + Σ Projected Misstatement + Σ Incremental Allowance
 *
 * Komponen:
 *   - Basic Precision (BP) = J × RF(c=0, confidence)
 *     Faktor reliability buat zero misstatement scenario.
 *   - Projected Misstatement (PM) per sampled item:
 *     - Kalau book_value ≤ J: taint % = (book - audit) / book; PM = taint × J
 *     - Kalau book_value > J (top stratum): PM = book - audit (no projection,
 *       sudah 100% inspected)
 *   - Incremental Allowance (IA) per misstatement (sorted desc by taint %):
 *     IA_k = PM_k × (RF(c=k) − RF(c=k−1) − 1) untuk k ≥ 1. Top stratum
 *     misstatement TIDAK kontribusi IA.
 *
 * Edge case:
 *   - Sample with no misstatement → UML = BP, ΣPM = ΣIA = 0
 *   - Audit value > book value (understatement) → tainting negatif, kontribusi
 *     mengurangi UML (separately track most-likely understatement kalau perlu)
 *
 * Sumber: AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix C.
 */

import type { ConfidenceLevel } from "@/types";
import { incrementalAllowance, reliabilityFactor } from "./rf-table";

export interface MisstatementInput {
  no_sp2d: string;
  bookValue: number;
  auditValue: number;
  isTopStratum: boolean;
}

export interface ProjectedItem {
  no_sp2d: string;
  bookValue: number;
  auditValue: number;
  misstatement: number;
  taintPercent: number;
  projectedMisstatement: number;
  isTopStratum: boolean;
}

export interface UMLResult {
  basicPrecision: number;
  sumProjectedMisstatement: number;
  sumIncrementalAllowance: number;
  uml: number;
  perItem: ProjectedItem[];
  /** ΣPM "most likely" (best point estimate sebelum precision). */
  mostLikelyMisstatement: number;
  /** Misstatement count (sampled items dengan |book-audit| > 0). */
  countMisstated: number;
}

export interface UMLParam {
  samplingInterval: number;
  confidence: ConfidenceLevel;
  inputs: MisstatementInput[];
}

export function computeUML(param: UMLParam): UMLResult {
  const { samplingInterval, confidence, inputs } = param;
  const J = samplingInterval;

  if (J <= 0) {
    throw new Error("MUS UML: samplingInterval harus > 0.");
  }

  // Basic Precision = J × RF(c=0)
  const rf0 = reliabilityFactor(confidence, 0);
  const basicPrecision = J * rf0;

  // Projected misstatement per item.
  // EDGE CASE bookValue=0 (ghost SP2D — recorded as 0 tapi audit > 0):
  // PPS sampling normally tidak pernah pilih item dengan size=0 (probabilitas=0),
  // jadi ini anomali sample. Treat as known misstatement penuh — PM = audit-book
  // langsung tanpa taint projection (sama kayak top stratum semantically).
  const perItem: ProjectedItem[] = inputs.map((m) => {
    const misst = m.bookValue - m.auditValue;
    if (m.isTopStratum) {
      return {
        no_sp2d: m.no_sp2d,
        bookValue: m.bookValue,
        auditValue: m.auditValue,
        misstatement: misst,
        taintPercent: m.bookValue > 0 ? misst / m.bookValue : 0,
        projectedMisstatement: misst,
        isTopStratum: true,
      };
    }
    if (m.bookValue <= 0) {
      // Anomali sample (book=0). Pakai misstatement langsung — jangan silent PM=0.
      return {
        no_sp2d: m.no_sp2d,
        bookValue: m.bookValue,
        auditValue: m.auditValue,
        misstatement: misst,
        taintPercent: misst === 0 ? 0 : 1,
        projectedMisstatement: misst,
        isTopStratum: true, // treat as direct, skip IA
      };
    }
    const taint = misst / m.bookValue;
    const projected = taint * J;
    return {
      no_sp2d: m.no_sp2d,
      bookValue: m.bookValue,
      auditValue: m.auditValue,
      misstatement: misst,
      taintPercent: taint,
      projectedMisstatement: projected,
      isTopStratum: false,
    };
  });

  const sumProjectedMisstatement = perItem.reduce(
    (s, p) => s + p.projectedMisstatement,
    0,
  );

  const countMisstated = perItem.filter(
    (p) => Math.abs(p.misstatement) > 0,
  ).length;

  // Incremental Allowance — sort POOL projected misstatement (non-top-stratum)
  // by taint % desc, apply incremental factor per rank.
  const poolProjected = perItem
    .filter((p) => !p.isTopStratum && p.projectedMisstatement > 0)
    .sort((a, b) => b.taintPercent - a.taintPercent);

  let sumIncrementalAllowance = 0;
  for (let k = 1; k <= poolProjected.length; k++) {
    const factor = incrementalAllowance(confidence, k); // RF(k) - RF(k-1)
    // IA contribution = PM × (RF(k) - RF(k-1) - 1)
    const ia = poolProjected[k - 1].projectedMisstatement * (factor - 1);
    sumIncrementalAllowance += Math.max(0, ia);
  }

  const uml =
    basicPrecision + sumProjectedMisstatement + sumIncrementalAllowance;

  return {
    basicPrecision,
    sumProjectedMisstatement,
    sumIncrementalAllowance,
    uml,
    perItem,
    mostLikelyMisstatement: sumProjectedMisstatement,
    countMisstated,
  };
}
