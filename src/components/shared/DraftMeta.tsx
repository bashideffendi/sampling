"use client";

import { useSamplingStore } from "@/store/samplingStore";

export function DraftMetaForm() {
  const meta = useSamplingStore((s) => s.draftMeta);
  const setMeta = useSamplingStore((s) => s.setDraftMeta);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block">
        <div className="mb-1 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Entitas
        </div>
        <input
          type="text"
          value={meta.entitas}
          onChange={(e) => setMeta({ entitas: e.target.value })}
          placeholder="Kabupaten Sampang"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Tahun Anggaran
        </div>
        <input
          type="number"
          value={meta.tahun}
          onChange={(e) => setMeta({ tahun: parseInt(e.target.value) || meta.tahun })}
          className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Draft ID
        </div>
        <input
          type="text"
          readOnly
          value={meta.draftId.slice(0, 12)}
          className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
        />
      </label>
    </div>
  );
}
