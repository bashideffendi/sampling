"use client";

import { useEffect } from "react";
import { useSamplingStore } from "@/store/samplingStore";
import { useNotebookStore } from "@/store/notebookStore";
import { UploadDropzone } from "@/components/shared/UploadDropzone";
import { PopulasiSummary } from "@/components/shared/PopulasiSummary";
import type { PopulasiCell } from "@/lib/notebook/types";

export function PopulasiCellRender({ cell }: { cell: PopulasiCell }) {
  const populasi = useSamplingStore((s) => s.populasi);
  const updateCell = useNotebookStore((s) => s.updateCell);

  useEffect(() => {
    const next = populasi ? "done" : "idle";
    if (cell.status !== next) updateCell(cell.id, { status: next });
  }, [populasi, cell.id, cell.status, updateCell]);

  return populasi ? <PopulasiSummary /> : <UploadDropzone />;
}
