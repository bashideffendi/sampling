/**
 * Risk Helper engine.
 *
 * Tugas tunggal: jalanin daftar rule, kumpulin hits, ukur durasi per rule,
 * dedup _idx yang ke-flag. ZERO opini soal rule mana yang aktif —
 * caller (UI / preset) yang harus kasih list rule final.
 *
 * Aturan eksekusi:
 * 1. Engine jalanin SEMUA rule yang dipassing. Caller (UI) tanggung jawab
 *    filter rule aktif sebelum kirim ke runRiskRules. Kalau caller ngirim
 *    rule yang ditandai `defaultOff`, engine TETAP jalanin — caller udah
 *    eksplisit milih (mis. user click "Select All" di Risk Helper UI).
 *    (Pre-v0.3.8 engine silently skip defaultOff → bug: "Select All" gak ngapain.)
 * 2. Setiap rule diukur durasi via performance.now(). Kalau lingkungan gak
 *    punya performance global (Node <16 lawas), fallback Date.now().
 * 3. `uniqueFlagged` deduplicate by `sp2dIdx` (original file index), bukan
 *    runtime array index.
 * 4. Engine TIDAK try/catch rule. Rule yang throw = bug developer, harus
 *    keliatan loud di test/dev. Kalau nanti perlu sandbox, taro di layer atas.
 */

import type { Rule, RuleContext, RuleResult, RiskReport } from "./types";

/** High-resolution timer dengan fallback. */
function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * Jalanin sekumpulan rule terhadap satu context, balikin RiskReport.
 *
 * @param rules - daftar rule yang udah dipilih caller (post-preset, post-toggle UI).
 * @param ctx   - RuleContext (populasi + meta [+ allRows]).
 */
export function runRiskRules(rules: Rule[], ctx: RuleContext): RiskReport {
  const results: RuleResult[] = [];
  const uniqueFlagged = new Set<number>();
  let totalHits = 0;

  for (const rule of rules) {
    // Engine TIDAK skip defaultOff — caller udah filter via activeIds di UI.
    // Skip silent dulu bikin "Select All" gak ngapain (bug v0.3.7).
    const start = now();
    const hits = rule.run(ctx);
    const runDurationMs = now() - start;

    for (const hit of hits) {
      uniqueFlagged.add(hit.sp2dIdx);
    }
    totalHits += hits.length;

    results.push({
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      description: rule.description,
      citation: rule.citation,
      hits,
      runDurationMs,
    });
  }

  return {
    results,
    totalHits,
    uniqueFlagged,
    runAt: new Date().toISOString(),
  };
}
