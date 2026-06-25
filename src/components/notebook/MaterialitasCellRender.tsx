"use client";

import { useEffect } from "react";
import { useSamplingStore } from "@/store/samplingStore";
import { useNotebookStore } from "@/store/notebookStore";
import { formatRupiah } from "@/lib/utils";
import type { MateralitasCell } from "@/lib/notebook/types";

export function MaterialitasCellRender({ cell }: { cell: MateralitasCell }) {
  const populasiMeta = useSamplingStore((s) => s.populasiMeta);
  const setParam = useSamplingStore((s) => s.setParam);
  const updateCell = useNotebookStore((s) => s.updateCell);

  const basisValue = cell.basisValue || populasiMeta?.totalNilai || 0;
  const pm = basisValue * cell.pmPercent;
  const tm = pm * cell.tmRatioOfPm;

  useEffect(() => {
    if (tm > 0) {
      setParam("mus", { tolerableMisstatement: Math.round(tm) });
      if (cell.status !== "done") updateCell(cell.id, { status: "done" });
    }
  }, [tm, setParam, cell.id, cell.status, updateCell]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField
          label="Basis"
          value={basisValue}
          onChange={(v) => updateCell(cell.id, { basisValue: v } as Partial<MateralitasCell>)}
          hint={populasiMeta ? `Default: ${formatRupiah(populasiMeta.totalNilai)}` : "Upload populasi dulu"}
        />
        <NumberField
          label="PM % (Planning Materiality)"
          value={cell.pmPercent}
          onChange={(v) => updateCell(cell.id, { pmPercent: v } as Partial<MateralitasCell>)}
          step={0.001}
          hint="Typical 0.005-0.02"
        />
        <NumberField
          label="TM / PM ratio"
          value={cell.tmRatioOfPm}
          onChange={(v) => updateCell(cell.id, { tmRatioOfPm: v } as Partial<MateralitasCell>)}
          step={0.05}
          hint="Typical 0.5-0.75"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Output label="Planning Materiality (PM)" value={formatRupiah(pm)} />
        <Output label="Tolerable Misstatement (TM)" value={formatRupiah(tm)} accent />
      </div>

      <p className="text-xs text-[var(--color-text-subtle)]">
        TM otomatis di-set ke parameter MUS. Override manual di Express tab kalau perlu.
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1_000_000,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mono tnum w-full rounded border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-right text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      {hint && <div className="mt-0.5 text-[10px] text-[var(--color-text-subtle)]">{hint}</div>}
    </label>
  );
}

function Output({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div
        className={`mono tnum text-base font-medium ${
          accent ? "text-[var(--color-accent-ink)]" : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
