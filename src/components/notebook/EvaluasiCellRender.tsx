"use client";

import { useEffect } from "react";
import { useSamplingStore } from "@/store/samplingStore";
import { useNotebookStore } from "@/store/notebookStore";
import { MisstatementInput } from "@/components/sampling/MisstatementInput";
import type { EvaluasiCell } from "@/lib/notebook/types";
import type { ConfidenceLevel } from "@/types";

export function EvaluasiCellRender({ cell }: { cell: EvaluasiCell }) {
  const result = useSamplingStore((s) => s.result);
  const params = useSamplingStore((s) => s.params);
  const updateCell = useNotebookStore((s) => s.updateCell);

  useEffect(() => {
    const next = result ? "done" : "idle";
    if (cell.status !== next) updateCell(cell.id, { status: next });
  }, [result, cell.id, cell.status, updateCell]);

  if (!result) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Selesaikan cell Sampling dulu — jalanin Run Sampling biar dapet hasil sample.
      </p>
    );
  }

  if (result.method !== "mus") {
    return (
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
        Evaluasi UML cuma applicable buat MUS. Metode aktif:{" "}
        <span className="mono uppercase">{result.method}</span>.
      </div>
    );
  }

  return (
    <MisstatementInput
      result={result}
      confidence={params.mus.confidenceLevel as ConfidenceLevel}
    />
  );
}
