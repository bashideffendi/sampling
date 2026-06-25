"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { SamplingResult } from "@/types";
import { formatRupiah } from "@/lib/utils";
import { computeUML, type MisstatementInput as MStInput } from "@/lib/sampling/mus-eval";
import type { ConfidenceLevel } from "@/types";

interface MisstatementInputProps {
  result: SamplingResult;
  confidence: ConfidenceLevel;
  onChange?: (uml: ReturnType<typeof computeUML>) => void;
}

interface ItemEntry {
  no_sp2d: string;
  bookValue: number;
  auditValue: number;
  isTopStratum: boolean;
  hasMisstatement: boolean;
}

export function MisstatementInput({ result, confidence, onChange }: MisstatementInputProps) {
  const initialItems: ItemEntry[] = useMemo(
    () =>
      result.selectedItems.map((item) => ({
        no_sp2d: item.row.no_sp2d,
        bookValue: item.row.nilai,
        auditValue: item.row.nilai,
        isTopStratum: item.reason === "top_stratum",
        hasMisstatement: false,
      })),
    [result.selectedItems],
  );
  const [items, setItems] = useState<ItemEntry[]>(initialItems);

  const interval = result.selectionInterval ?? 0;

  const uml = useMemo(() => {
    if (interval <= 0) return null;
    const inputs: MStInput[] = items
      .filter((i) => i.hasMisstatement)
      .map((i) => ({
        no_sp2d: i.no_sp2d,
        bookValue: i.bookValue,
        auditValue: i.auditValue,
        isTopStratum: i.isTopStratum,
      }));
    try {
      const r = computeUML({
        samplingInterval: interval,
        confidence,
        inputs,
      });
      onChange?.(r);
      return r;
    } catch {
      return null;
    }
  }, [items, interval, confidence, onChange]);

  function updateItem(i: number, patch: Partial<ItemEntry>) {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  if (result.method !== "mus") {
    return null;
  }

  if (interval <= 0) {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
        Evaluasi UML butuh sampling interval &gt; 0. Re-run MUS dulu.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h3 className="serif text-lg font-medium tracking-tight text-[var(--color-ink)]">
          Evaluasi salah saji
        </h3>
        <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
          {items.filter((i) => i.hasMisstatement).length} / {items.length} flagged
        </span>
      </header>

      <p className="text-sm text-[var(--color-text-muted)]">
        Centang item kalau ada salah saji, isi nilai hasil audit. UML (Upper Misstatement Limit)
        otomatis dihitung pakai formula AICPA Audit Guide.
      </p>

      {uml && (
        <div className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric
              label="Basic Precision"
              value={formatRupiah(uml.basicPrecision)}
              hint="J × RF(c=0)"
            />
            <Metric
              label="Σ Projected Misst."
              value={formatRupiah(uml.sumProjectedMisstatement)}
              hint={`${uml.countMisstated} item`}
            />
            <Metric
              label="Σ Incremental Allow."
              value={formatRupiah(uml.sumIncrementalAllowance)}
              hint="taint × (RF inc)"
            />
            <Metric
              label="UML"
              value={formatRupiah(uml.uml)}
              accent
              hint="BP + ΣPM + ΣIA"
            />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">No SP2D</th>
              <th className="px-3 py-2 font-medium text-right">Book Value</th>
              <th className="px-3 py-2 font-medium">Salah saji?</th>
              <th className="px-3 py-2 font-medium text-right">Audit Value</th>
              <th className="px-3 py-2 font-medium text-right">Tainting</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const misst = item.bookValue - item.auditValue;
              const taint =
                item.bookValue > 0 ? (misst / item.bookValue) * 100 : 0;
              return (
                <tr key={item.no_sp2d} className="border-t border-[var(--color-hairline)]">
                  <td className="px-3 py-2 text-[var(--color-text-subtle)]">{i + 1}</td>
                  <td className="mono px-3 py-2 text-[var(--color-text)]">
                    {item.no_sp2d}
                    {item.isTopStratum && (
                      <span className="ml-2 inline-block rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--color-paper)]">
                        TOP
                      </span>
                    )}
                  </td>
                  <td className="mono tnum px-3 py-2 text-right text-[var(--color-text)]">
                    {formatRupiah(item.bookValue, { withSymbol: false })}
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.hasMisstatement}
                        onChange={(e) =>
                          updateItem(i, {
                            hasMisstatement: e.target.checked,
                            auditValue: e.target.checked ? item.auditValue : item.bookValue,
                          })
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs text-[var(--color-text-muted)]">flag</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.hasMisstatement ? (
                      <input
                        type="number"
                        value={Number.isFinite(item.auditValue) ? item.auditValue : 0}
                        onChange={(e) =>
                          updateItem(i, {
                            auditValue: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="mono tnum w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-right text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                      />
                    ) : (
                      <span className="text-[var(--color-text-subtle)]">—</span>
                    )}
                  </td>
                  <td
                    className={`mono tnum px-3 py-2 text-right ${
                      misst === 0
                        ? "text-[var(--color-text-subtle)]"
                        : misst > 0
                          ? "text-[var(--color-warn)]"
                          : "text-[var(--color-info)]"
                    }`}
                  >
                    {item.hasMisstatement
                      ? `${taint.toFixed(2)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {uml && uml.countMisstated === 0 && (
        <div className="flex items-center gap-2 rounded border border-[var(--color-accent)] bg-[var(--color-surface)] p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
          <span className="text-[var(--color-text)]">
            Tidak ada salah saji flagged. UML = Basic Precision (
            <span className="mono">{formatRupiah(uml.basicPrecision)}</span>).
          </span>
        </div>
      )}

      {uml && uml.countMisstated > 5 && (
        <div className="flex items-start gap-2 rounded border border-[var(--color-warn)] bg-[var(--color-surface)] p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[var(--color-warn)]" />
          <span className="text-[var(--color-text)]">
            {uml.countMisstated} item flagged sebagai salah saji. AICPA: c &gt; 5
            → evaluasi kualitatif dianjurkan, formula projection menjadi kurang
            reliable.
          </span>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div
        className={`mono tnum text-sm font-medium ${
          accent ? "text-[var(--color-accent-ink)]" : "text-[var(--color-text)]"
        }`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-[var(--color-text-subtle)]">{hint}</div>
      )}
    </div>
  );
}
