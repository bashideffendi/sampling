"use client";

import { useSamplingStore } from "@/store/samplingStore";
import { formatRupiah, shortNumber } from "@/lib/utils";
import { Database, FileX } from "lucide-react";

export function PopulasiSummary() {
  const meta = useSamplingStore((s) => s.populasiMeta);
  const clearPopulasi = useSamplingStore((s) => s.clearPopulasi);
  if (!meta) return null;
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[var(--color-accent)]" />
          <span className="text-sm font-medium">{meta.filename ?? "Populasi"}</span>
        </div>
        <button
          onClick={() => clearPopulasi()}
          className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
        >
          <FileX className="h-3.5 w-3.5" /> Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="SP2D" value={meta.count.toLocaleString("id-ID")} mono />
        <Stat label="Total" value={formatRupiah(meta.totalNilai)} />
        <Stat label="Rata-rata" value={formatRupiah(meta.meanNilai)} />
        <Stat label="Maks" value={formatRupiah(meta.maxNilai)} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
        <span className="mono">hash:</span>
        <span className="mono">{meta.hashSha256.slice(0, 16)}…</span>
        {meta.negativeCount > 0 && (
          <span className="text-[var(--color-warn)]">· {meta.negativeCount} negatif</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className={`tnum text-sm font-medium text-[var(--color-text)] ${mono ? "mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
