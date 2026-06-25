"use client";

import { useNotebookStore } from "@/store/notebookStore";
import type { MarkdownCell } from "@/lib/notebook/types";

interface Props {
  cell: MarkdownCell;
}

export function MarkdownCellRender({ cell }: Props) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  return (
    <textarea
      value={cell.content}
      onChange={(e) => updateCell(cell.id, { content: e.target.value } as Partial<MarkdownCell>)}
      rows={4}
      placeholder="Tulis catatan auditor di sini — context entitas, ruang lingkup, tujuan…"
      className="serif w-full rounded border border-[var(--color-border)] bg-[var(--color-paper)] px-4 py-3 text-sm italic leading-relaxed text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
    />
  );
}
