"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { parseSP2DExcel } from "@/lib/parser/parse-excel";
import { useSamplingStore } from "@/store/samplingStore";
import { toast } from "sonner";

export function UploadDropzone() {
  const setPopulasi = useSamplingStore((s) => s.setPopulasi);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setError(null);
      try {
        const buf = await file.arrayBuffer();
        const result = await parseSP2DExcel(buf, { filename: file.name });
        await setPopulasi(result.rows, result.meta, {
          breakdown: result.breakdown ?? [],
          populasiKoreksi: result.populasiKoreksi ?? [],
          warnings: result.warnings ?? [],
          fingerprint: result.fingerprint ?? null,
          headers: result.headerLabels ?? [],
          mapping: result.detection?.map ?? {},
        });
        const fpFormat = result.fingerprint?.format ?? "GENERIC";
        toast.success(
          `${result.rows.length} SP2D ter-parse · format ${fpFormat} · confidence ${(result.detection.confidence * 100).toFixed(0)}%`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toast.error(`Parse gagal: ${msg}`);
      } finally {
        setParsing(false);
      }
    },
    [setPopulasi],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
      className={`relative flex flex-col items-center justify-center rounded border-2 border-dashed p-12 text-center transition ${
        dragOver
          ? "border-[var(--color-accent)] bg-[var(--color-surface-2)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={parsing}
      />
      {parsing ? (
        <>
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-[var(--color-accent)]" />
          <p className="text-sm text-[var(--color-text)]">Membaca berkas Excel…</p>
        </>
      ) : (
        <>
          <Upload className="mb-4 h-7 w-7 text-[var(--color-accent)]" strokeWidth={1.5} />
          <p className="serif text-xl font-medium tracking-tight text-[var(--color-ink)]">
            Letakkan berkas Excel SP2D
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            atau <span className="underline decoration-[var(--color-accent)] decoration-1 underline-offset-4">klik untuk memilih</span>
          </p>
          <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
            .xlsx · .xls · .csv  ·  diolah di peramban
          </p>
        </>
      )}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded border border-[var(--color-danger)] bg-[var(--color-surface-2)] p-3 text-left text-sm text-[var(--color-danger)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
