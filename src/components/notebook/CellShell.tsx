"use client";

import { ChevronDown, ChevronRight, CircleDot, CircleCheck, CircleX, Loader2 } from "lucide-react";
import { useNotebookStore } from "@/store/notebookStore";
import type { Cell, CellStatus, CellType } from "@/lib/notebook/types";

interface CellShellProps {
  cell: Cell;
  title: string;
  description?: string;
  badge?: string;
  children: React.ReactNode;
}

const TYPE_LABEL: Record<CellType, string> = {
  markdown: "Catatan",
  populasi: "Populasi",
  materialitas: "Materialitas",
  metode: "Metode",
  sampling: "Sampling",
  evaluasi: "Evaluasi",
};

export function CellShell({ cell, title, description, badge, children }: CellShellProps) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const toggleCollapse = useNotebookStore((s) => s.toggleCollapse);

  return (
    <section
      className="overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-paper)]"
      aria-labelledby={`cell-${cell.id}`}
    >
      <header className="flex items-center gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-2.5">
        <button
          onClick={() => toggleCollapse(cell.id)}
          className="text-[var(--color-text-subtle)] transition hover:text-[var(--color-ink)]"
          aria-label={cell.collapsed ? "Expand" : "Collapse"}
        >
          {cell.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
          {TYPE_LABEL[cell.type]}
        </span>
        <h3
          id={`cell-${cell.id}`}
          className="serif flex-1 text-base font-medium text-[var(--color-ink)]"
        >
          {title}
        </h3>
        {badge && (
          <span className="mono rounded-full border border-[var(--color-accent)] px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {badge}
          </span>
        )}
        <StatusBadge status={cell.status} />
      </header>

      {!cell.collapsed && (
        <>
          {description && (
            <p className="border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
              {description}
            </p>
          )}
          <div className="px-4 py-4">{children}</div>
          {cell.type !== "markdown" && (
            <div className="border-t border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
              <label className="block">
                <div className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                  Rationale (pertimbangan profesional)
                </div>
                <textarea
                  value={cell.rationale}
                  onChange={(e) => updateCell(cell.id, { rationale: e.target.value })}
                  rows={2}
                  placeholder="Justifikasi: kenapa langkah ini perlu, apa yang dipertimbangkan, referensi standar/peraturan…"
                  className="w-full rounded border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </label>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: CellStatus }) {
  switch (status) {
    case "running":
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
          <Loader2 className="h-3 w-3 animate-spin" /> Run
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent)]">
          <CircleCheck className="h-3 w-3" /> Done
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-danger)]">
          <CircleX className="h-3 w-3" /> Error
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
          <CircleDot className="h-3 w-3" /> Idle
        </span>
      );
  }
}
