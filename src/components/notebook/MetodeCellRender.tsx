"use client";

import { useEffect, useState } from "react";
import { useSamplingStore } from "@/store/samplingStore";
import { useNotebookStore } from "@/store/notebookStore";
import {
  SamplingUnitSelector,
  type AssertionKey,
  type SamplingUnit,
} from "@/components/sampling/SamplingUnitSelector";
import { MethodTabs } from "@/components/shared/MethodTabs";
import type { MetodeCell } from "@/lib/notebook/types";
import type { SamplingMethod } from "@/types";

export function MetodeCellRender({ cell }: { cell: MetodeCell }) {
  const populasi = useSamplingStore((s) => s.populasi);
  const populasiMeta = useSamplingStore((s) => s.populasiMeta);
  const parseExtras = useSamplingStore((s) => s.parseExtras);
  const setMethod = useSamplingStore((s) => s.setMethod);
  const method = useSamplingStore((s) => s.method);
  const updateCell = useNotebookStore((s) => s.updateCell);

  const [assertion, setAssertion] = useState<AssertionKey | null>(null);
  const [suggestedUnit, setSuggestedUnit] = useState<SamplingUnit | null>(null);

  useEffect(() => {
    if (method && cell.status !== "done") {
      updateCell(cell.id, { status: "done" });
    }
  }, [method, cell.id, cell.status, updateCell]);

  if (!populasi || !populasiMeta) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Selesaikan cell Populasi dulu — upload Excel SP2D di atas.
      </p>
    );
  }

  function handleAssertion(
    a: AssertionKey,
    suggested: { unit: SamplingUnit; method: SamplingMethod },
  ) {
    setAssertion(a);
    setSuggestedUnit(suggested.unit);
    setMethod(suggested.method);
  }

  return (
    <div className="space-y-4">
      <SamplingUnitSelector
        onSelect={handleAssertion}
        populasiCount={parseExtras?.breakdown?.length ?? populasiMeta.count}
        uniqueSp2dCount={populasiMeta.count}
      />
      {assertion && suggestedUnit && (
        <div className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-2 text-sm">
          <span className="text-[var(--color-text-muted)]">Saran: </span>
          <span className="font-medium text-[var(--color-ink)]">
            {suggestedUnit === "per_sp2d" ? "Per SP2D" : "Per Baris Akun"}
          </span>
          <span className="ml-2 text-[var(--color-text-muted)]">
            · metode di bawah otomatis terpilih.
          </span>
        </div>
      )}
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
          Metode aktif
        </div>
        <MethodTabs />
      </div>
    </div>
  );
}
