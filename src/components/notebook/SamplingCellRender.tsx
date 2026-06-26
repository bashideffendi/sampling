"use client";

import { useEffect } from "react";
import { useSamplingStore } from "@/store/samplingStore";
import { useNotebookStore } from "@/store/notebookStore";
import { ResultPanel } from "@/components/express/ResultPanel";
import { ParamPanel } from "@/components/express/ParamPanel";
import type { SamplingCell } from "@/lib/notebook/types";

export function SamplingCellRender({ cell }: { cell: SamplingCell }) {
  const populasi = useSamplingStore((s) => s.populasi);
  const result = useSamplingStore((s) => s.result);
  const updateCell = useNotebookStore((s) => s.updateCell);

  useEffect(() => {
    const next = result ? "done" : "idle";
    if (cell.status !== next) updateCell(cell.id, { status: next });
  }, [result, cell.id, cell.status, updateCell]);

  if (!populasi) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Selesaikan cell Populasi + Metode dulu.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ParamPanel />
      {/* Evaluasi MUS sengaja disembunyiin — EvaluasiCell yg render. */}
      <ResultPanel hideEvaluation />
    </div>
  );
}
