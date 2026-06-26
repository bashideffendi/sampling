"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  Play,
  Download,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { useSamplingStore } from "@/store/samplingStore";
import {
  ALL_RULES,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  getDefaultActiveRuleIds,
  runRiskRules,
  RULE_BY_ID,
  type Rule,
  type RuleCategory,
  type Severity,
  type RiskReport,
} from "@/lib/risk";
import { formatRupiah, formatDateID, cn } from "@/lib/utils";
import type { SP2DRow } from "@/types";

export default function RiskHelperPage() {
  const populasi = useSamplingStore((s) => s.populasi);
  const populasiMeta = useSamplingStore((s) => s.populasiMeta);
  const riskReport = useSamplingStore((s) => s.riskReport);
  const setRiskReport = useSamplingStore((s) => s.setRiskReport);
  const loadCache = useSamplingStore((s) => s.loadPopulasiFromCache);

  const [activeIds, setActiveIds] = useState<Set<string>>(() => getDefaultActiveRuleIds());
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<RuleCategory>>(
    () => new Set(["nilai", "vendor"] as RuleCategory[]),
  );

  useEffect(() => {
    void loadCache();
  }, [loadCache]);

  const rulesByCategory = useMemo(() => {
    const map = new Map<RuleCategory, Rule[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const r of ALL_RULES) {
      const list = map.get(r.category);
      if (list) list.push(r);
    }
    return map;
  }, []);

  const totalActive = activeIds.size;

  function toggleRule(id: string) {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(cat: RuleCategory, on: boolean) {
    setActiveIds((prev) => {
      const next = new Set(prev);
      const ids = rulesByCategory.get(cat) ?? [];
      for (const r of ids) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  function resetDefaults() {
    setActiveIds(getDefaultActiveRuleIds());
  }

  function selectAll() {
    setActiveIds(new Set(ALL_RULES.map((r) => r.id)));
  }

  function clearAll() {
    setActiveIds(new Set());
  }

  function toggleExpand(cat: RuleCategory) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function runAnalysis() {
    if (!populasi || populasi.length === 0 || !populasiMeta) return;
    setRunning(true);
    queueMicrotask(() => {
      try {
        const activeRules = ALL_RULES.filter((r) => activeIds.has(r.id));
        const report = runRiskRules(activeRules, {
          populasi,
          meta: populasiMeta,
          allRows: populasi,
        });
        setRiskReport(report);
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-10 flex items-center justify-between border-b border-[var(--color-border)] pb-5">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-ink)]"
          >
            <ArrowLeft className="h-4 w-4" /> Beranda
          </Link>
          <span className="text-[var(--color-border-strong)]">/</span>
          <span className="wordmark text-2xl text-[var(--color-ink)]">Cap Cip Cup</span>
          <span className="rounded-full border border-[var(--color-accent)] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Risk Helper
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
          <Link href="/express/new" className="transition hover:text-[var(--color-ink)]">
            Express
          </Link>
          <Link href="/metode/mus" className="transition hover:text-[var(--color-ink)]">
            Metode
          </Link>
          <Link href="/tentang" className="transition hover:text-[var(--color-ink)]">
            Tentang
          </Link>
        </nav>
      </header>

      {!populasi || populasi.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <section className="mb-12">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h1
                  className="serif mb-2 font-medium tracking-[-0.015em] text-[var(--color-ink)]"
                  style={{ fontSize: "clamp(1.625rem, 2.4vw + 0.4rem, 2.25rem)" }}
                >
                  Pemetaan Anomali Populasi
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-text-muted)]">
                  Jalankan {ALL_RULES.length} aturan deteksi anomali atas populasi SP2D. Hasil
                  digunakan untuk men-target sampling judgmental atau memperluas cakupan walk-through.
                  Aturan ber-tag <em>defaultOff</em> butuh data tambahan atau false-positive tinggi —
                  aktifkan secara sadar.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                  Populasi
                </div>
                <div className="serif text-xl text-[var(--color-ink)] tnum">
                  {populasi.length.toLocaleString("id-ID")} baris
                </div>
                <div className="mono text-xs text-[var(--color-text-muted)] tnum">
                  {formatRupiah(populasiMeta?.totalNilai ?? 0)}
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--color-hairline)] pb-3">
              <h2 className="serif text-lg font-medium tracking-tight text-[var(--color-ink)]">
                Aturan Aktif ({totalActive}/{ALL_RULES.length})
              </h2>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                >
                  Reset default
                </button>
                <span className="text-[var(--color-border-strong)]">·</span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                >
                  Pilih semua
                </button>
                <span className="text-[var(--color-border-strong)]">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                >
                  Bersihkan
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {CATEGORY_ORDER.map((cat) => {
                const rules = rulesByCategory.get(cat) ?? [];
                if (rules.length === 0) return null;
                const activeInCat = rules.filter((r) => activeIds.has(r.id)).length;
                const isOpen = expanded.has(cat);
                return (
                  <div
                    key={cat}
                    className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-paper)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(cat)}
                      className="flex w-full items-center justify-between px-5 py-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-[var(--color-text-subtle)]" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-[var(--color-text-subtle)]" />
                        )}
                        <span className="serif text-base font-medium text-[var(--color-ink)]">
                          {CATEGORY_LABEL[cat]}
                        </span>
                        <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                          {activeInCat}/{rules.length} aktif
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategory(cat, true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleCategory(cat, true);
                            }
                          }}
                          className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                        >
                          semua
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategory(cat, false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleCategory(cat, false);
                            }
                          }}
                          className="text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                        >
                          tidak
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <ul className="divide-y divide-[var(--color-hairline)] border-t border-[var(--color-hairline)]">
                        {rules.map((rule, idx) => (
                          <RuleRow
                            key={rule.id}
                            rule={rule}
                            num={idx + 1}
                            active={activeIds.has(rule.id)}
                            onToggle={() => toggleRule(rule.id)}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-12 flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={runAnalysis}
              disabled={running || totalActive === 0}
              className={cn(
                "flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium transition",
                running || totalActive === 0
                  ? "cursor-not-allowed border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-subtle)]"
                  : "border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-paper)] hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-accent-ink)]",
              )}
            >
              <Play className="h-4 w-4" />
              {running
                ? "Menganalisis…"
                : riskReport
                  ? "Jalankan Ulang Analisis"
                  : "Jalankan Analisis Risiko"}
            </button>
            {riskReport && (
              <div className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
                <span>
                  <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                    Baris ke-flag
                  </span>
                  <span className="ml-2 serif text-base text-[var(--color-ink)] tnum">
                    {riskReport.uniqueFlagged.length.toLocaleString("id-ID")}
                  </span>
                </span>
                <span>
                  <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                    Total hit
                  </span>
                  <span className="ml-2 serif text-base text-[var(--color-ink)] tnum">
                    {riskReport.totalHits.toLocaleString("id-ID")}
                  </span>
                </span>
                <span>
                  <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                    Durasi
                  </span>
                  <span className="ml-2 serif text-base text-[var(--color-ink)] tnum">
                    {Math.round(riskReport.results.reduce((a, r) => a + r.runDurationMs, 0))} ms
                  </span>
                </span>
              </div>
            )}
          </section>

          {riskReport && (
            <>
              <ResultTable rows={populasi} report={riskReport} />
              <PerRuleSummary report={riskReport} />
            </>
          )}
        </>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <section className="flex flex-col items-start gap-5 rounded-[2px] border border-dashed border-[var(--color-border)] bg-[var(--color-paper)] p-12">
      <div className="flex items-center gap-3 text-[var(--color-accent)]">
        <AlertTriangle className="h-5 w-5" />
        <span className="mono text-[10px] uppercase tracking-[0.22em]">Populasi belum dimuat</span>
      </div>
      <h1 className="serif text-2xl font-medium tracking-tight text-[var(--color-ink)]">
        Risk Helper butuh populasi SP2D dulu.
      </h1>
      <p className="max-w-xl text-sm leading-relaxed text-[var(--color-text-muted)]">
        Unggah file Excel populasi di Express. Setelah populasi termuat di peramban, Risk Helper
        akan jalanin 40 aturan deteksi anomali tanpa upload ke server.
      </p>
      <Link
        href="/express/new"
        className="flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-[var(--color-paper)] transition hover:border-[var(--color-accent-ink)] hover:bg-[var(--color-accent-ink)]"
      >
        Unggah Populasi di Express
      </Link>
    </section>
  );
}

function RuleRow({
  rule,
  num,
  active,
  onToggle,
}: {
  rule: Rule;
  num: number;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <span className="mono mt-0.5 w-8 shrink-0 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)] tnum">
        {String(num).padStart(2, "0")}
      </span>
      <label className="flex flex-1 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={active}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
        />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[var(--color-ink)]">{rule.label}</span>
            <SeverityBadge severity={rule.severity} />
            {!rule.defaultOn && (
              <span className="mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
                default off
              </span>
            )}
            <span className="mono text-[9px] text-[var(--color-text-subtle)]">{rule.id}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {rule.description}
          </p>
          {rule.citation && (
            <p className="mono mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-accent-ink)]">
              {rule.citation}
            </p>
          )}
        </div>
      </label>
    </li>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    low: "border-[var(--color-border)] text-[var(--color-text-muted)]",
    medium: "border-[var(--color-warn)] text-[var(--color-warn)]",
    high: "border-[var(--color-danger)] text-[var(--color-danger)]",
  };
  const label: Record<Severity, string> = {
    low: "low",
    medium: "med",
    high: "high",
  };
  return (
    <span
      className={cn(
        "mono rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.18em]",
        styles[severity],
      )}
    >
      {label[severity]}
    </span>
  );
}

function ResultTable({ rows, report }: { rows: SP2DRow[]; report: RiskReport }) {
  const rowsByIdx = useMemo(() => {
    const m = new Map<number, SP2DRow>();
    for (const r of rows) m.set(r._idx, r);
    return m;
  }, [rows]);

  // Severity order desc, lalu jumlah rule trigger desc, lalu nilai desc.
  const sevWeight: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
  const flagged = useMemo(() => {
    // Aggregate hits per sp2dIdx (foundation RiskReport gak provide pre-aggregated).
    const flagsByRow = new Map<number, string[]>();
    const sevByRow = new Map<number, Severity>();
    for (const result of report.results) {
      for (const hit of result.hits) {
        const existing = flagsByRow.get(hit.sp2dIdx) ?? [];
        existing.push(result.ruleId);
        flagsByRow.set(hit.sp2dIdx, existing);
        // Max severity wins.
        const curSev = sevByRow.get(hit.sp2dIdx);
        if (!curSev || sevWeight[hit.severity] > sevWeight[curSev]) {
          sevByRow.set(hit.sp2dIdx, hit.severity);
        }
      }
    }
    const list = Array.from(flagsByRow.entries()).map(([idx, ids]) => ({
      idx,
      row: rowsByIdx.get(idx),
      ruleIds: ids,
      severity: sevByRow.get(idx) ?? ("low" as Severity),
    }));
    list.sort((a, b) => {
      const ds = sevWeight[b.severity] - sevWeight[a.severity];
      if (ds !== 0) return ds;
      const dc = b.ruleIds.length - a.ruleIds.length;
      if (dc !== 0) return dc;
      return (b.row?.nilai ?? 0) - (a.row?.nilai ?? 0);
    });
    return list;
  }, [report, rowsByIdx]);

  const [limit, setLimit] = useState(100);
  const visible = flagged.slice(0, limit);

  function exportCsv() {
    const header = [
      "no_sp2d",
      "tgl_sp2d",
      "nilai",
      "skpd",
      "penyedia",
      "npwp",
      "kode_rek",
      "uraian",
      "severity_max",
      "rule_count",
      "rule_ids",
      "rule_labels",
    ];
    const lines = [header.join(";")];
    for (const it of flagged) {
      const r = it.row;
      if (!r) continue;
      const labels = it.ruleIds.map((id) => RULE_BY_ID.get(id)?.label ?? id).join(" | ");
      const row = [
        r.no_sp2d,
        r.tgl_sp2d,
        String(r.nilai),
        r.skpd ?? "",
        r.penyedia ?? "",
        r.npwp ?? "",
        r.kode_rek ?? "",
        (r.uraian ?? "").replace(/[\r\n]+/g, " "),
        it.severity,
        String(it.ruleIds.length),
        it.ruleIds.join(","),
        labels,
      ]
        .map(csvEscape)
        .join(";");
      lines.push(row);
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `capcipcup-risk-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (flagged.length === 0) {
    return (
      <section className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-paper)] p-8 text-sm text-[var(--color-text-muted)]">
        <div className="flex items-center gap-3">
          <Info className="h-4 w-4 text-[var(--color-accent)]" />
          <span>
            Tidak ada baris yang ke-flag aturan aktif. Coba aktifkan aturan tambahan atau verifikasi
            populasi.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--color-hairline)] pb-3">
        <h2 className="serif text-lg font-medium tracking-tight text-[var(--color-ink)]">
          Baris Ke-flag ({flagged.length.toLocaleString("id-ID")})
        </h2>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
        >
          <Download className="h-4 w-4" /> Unduh CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-[2px] border border-[var(--color-border)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
            <tr>
              <Th>No SP2D</Th>
              <Th>Tanggal</Th>
              <Th className="text-right">Nilai</Th>
              <Th>SKPD</Th>
              <Th>Penyedia</Th>
              <Th className="text-center">Severity</Th>
              <Th className="text-center">Rule</Th>
              <Th>Aturan Trigger</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((it) => {
              const r = it.row;
              if (!r) return null;
              return (
                <tr
                  key={it.idx}
                  className="border-t border-[var(--color-hairline)] hover:bg-[var(--color-surface-2)]"
                >
                  <Td className="mono text-xs">{r.no_sp2d}</Td>
                  <Td className="mono text-xs whitespace-nowrap">{formatDateID(r.tgl_sp2d)}</Td>
                  <Td className="text-right tnum">{formatRupiah(r.nilai)}</Td>
                  <Td className="max-w-[18ch] truncate" title={r.skpd ?? ""}>
                    {r.skpd ?? "—"}
                  </Td>
                  <Td className="max-w-[22ch] truncate" title={r.penyedia ?? ""}>
                    {r.penyedia ?? "—"}
                  </Td>
                  <Td className="text-center">
                    <SeverityBadge severity={it.severity as Severity} />
                  </Td>
                  <Td className="text-center tnum">{it.ruleIds.length}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {it.ruleIds.slice(0, 3).map((id) => (
                        <span
                          key={id}
                          className="mono rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                          title={RULE_BY_ID.get(id)?.label ?? id}
                        >
                          {id}
                        </span>
                      ))}
                      {it.ruleIds.length > 3 && (
                        <span className="mono text-[10px] text-[var(--color-text-subtle)]">
                          +{it.ruleIds.length - 3}
                        </span>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {limit < flagged.length && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + 100)}
            className="text-sm text-[var(--color-text-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            Tampilkan {Math.min(100, flagged.length - limit)} baris berikutnya (dari {flagged.length.toLocaleString("id-ID")} total)
          </button>
        </div>
      )}
    </section>
  );
}

function PerRuleSummary({ report }: { report: RiskReport }) {
  const sorted = useMemo(() => {
    const sevWeight: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
    return [...report.results].sort((a, b) => {
      const ds = sevWeight[b.severity] - sevWeight[a.severity];
      if (ds !== 0) return ds;
      return b.hits.length - a.hits.length;
    });
  }, [report]);

  return (
    <section className="mb-16">
      <div className="mb-4 border-b border-[var(--color-hairline)] pb-3">
        <h2 className="serif text-lg font-medium tracking-tight text-[var(--color-ink)]">
          Ringkasan per Aturan
        </h2>
      </div>
      <div className="overflow-x-auto rounded-[2px] border border-[var(--color-border)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-text-muted)]">
            <tr>
              <Th>Aturan</Th>
              <Th className="text-center">Severity</Th>
              <Th className="text-right">Hit</Th>
              <Th className="text-right">Durasi</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.ruleId}
                className="border-t border-[var(--color-hairline)] hover:bg-[var(--color-surface-2)]"
              >
                <Td>
                  <div className="flex flex-col">
                    <span className="text-[var(--color-ink)]">{r.description.slice(0, 70)}</span>
                    <span className="mono text-[10px] text-[var(--color-text-subtle)]">
                      {r.ruleId}
                    </span>
                  </div>
                </Td>
                <Td className="text-center">
                  <SeverityBadge severity={r.severity} />
                </Td>
                <Td className="text-right tnum">{r.hits.length.toLocaleString("id-ID")}</Td>
                <Td className="text-right tnum mono text-xs text-[var(--color-text-muted)]">
                  {Math.round(r.runDurationMs)} ms
                </Td>
                <Td>
                  {r.hits.length === 0 ? (
                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
                      bersih
                    </span>
                  ) : (
                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
                      ada temuan
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 mono text-[10px] font-medium uppercase tracking-[0.18em]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={cn("px-3 py-2.5 align-middle", className)} title={title}>
      {children}
    </td>
  );
}

function csvEscape(v: string): string {
  if (/[;"\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
