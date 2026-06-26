"use client";

import { useMemo } from "react";
import { useSamplingStore } from "@/store/samplingStore";
import { runSampling } from "@/lib/sampling";
import { formatRupiah } from "@/lib/utils";
import {
  exportToExcel,
  buildSeedBundle,
  downloadBlob,
  makeFilename,
  exportToWord,
  makeWordFilename,
} from "@/lib/exporter";
import { Play, Download, FileJson, FileText, AlertTriangle, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import type { MethodParam } from "@/types";
import { APP_VERSION } from "@/lib/constants";
import { SkewnessAlert } from "@/components/sampling/SkewnessAlert";
import { MisstatementInput } from "@/components/sampling/MisstatementInput";
import type { ConfidenceLevel } from "@/types";

interface ResultPanelProps {
  /**
   * Sembunyiin section Evaluasi MUS (MisstatementInput) — dipakai di Notebook
   * mode dimana EvaluasiCell render-nya sendiri. Default false (Express tetep inline).
   */
  hideEvaluation?: boolean;
}

export function ResultPanel({ hideEvaluation = false }: ResultPanelProps = {}) {
  const populasi = useSamplingStore((s) => s.populasi);
  const populasiMeta = useSamplingStore((s) => s.populasiMeta);
  const parseExtras = useSamplingStore((s) => s.parseExtras);
  const method = useSamplingStore((s) => s.method);
  const params = useSamplingStore((s) => s.params);
  const draftMeta = useSamplingStore((s) => s.draftMeta);
  const result = useSamplingStore((s) => s.result);
  const setResult = useSamplingStore((s) => s.setResult);

  const canRun = useMemo(() => populasi !== null && populasi.length > 0, [populasi]);

  const run = () => {
    if (!populasi || !populasiMeta) {
      toast.error("Upload populasi dulu.");
      return;
    }
    try {
      const mp = paramForMethod(method, params);
      const r = runSampling(populasi, mp);
      setResult(r);
      toast.success(`Sampling sukses: ${r.sampleSize} SP2D dipilih`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Sampling gagal: ${msg}`);
    }
  };

  const downloadExcel = async () => {
    if (!result || !populasiMeta) return;
    const blob = await exportToExcel(result, populasiMeta, {
      entitas: draftMeta.entitas || "Entitas",
      tahun: draftMeta.tahun,
      draftId: draftMeta.draftId,
      appVersion: APP_VERSION,
      extras: parseExtras
        ? {
            breakdown: parseExtras.breakdown,
            populasiKoreksi: parseExtras.populasiKoreksi,
            warnings: parseExtras.warnings,
            fingerprint: parseExtras.fingerprint ?? undefined,
          }
        : undefined,
    });
    downloadBlob(blob, makeFilename(result, { entitas: draftMeta.entitas, tahun: draftMeta.tahun }, "xlsx"));
  };

  const downloadJSON = () => {
    if (!result || !populasiMeta) return;
    const bundle = buildSeedBundle(result, populasiMeta, {
      draftId: draftMeta.draftId,
      appVersion: APP_VERSION,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    downloadBlob(blob, makeFilename(result, { entitas: draftMeta.entitas, tahun: draftMeta.tahun }, "json"));
  };

  const downloadWord = async () => {
    if (!result || !populasiMeta) return;
    try {
      const blob = await exportToWord(result, populasiMeta, {
        entitas: draftMeta.entitas || "Entitas",
        tahun: draftMeta.tahun,
        draftId: draftMeta.draftId,
      });
      downloadBlob(
        blob,
        makeWordFilename(
          { entitas: draftMeta.entitas, tahun: draftMeta.tahun },
          result.method,
        ),
      );
      toast.success("Lampiran KKP (.docx) berhasil di-download.");
    } catch (e) {
      toast.error(`Generate Word gagal: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Hasil Sampling
        </h3>
        <button
          onClick={run}
          disabled={!canRun}
          className="flex items-center gap-1.5 rounded border border-[var(--color-accent)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Run Sampling
        </button>
      </div>

      {!result && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-[var(--color-text-subtle)]">
          <BarChart3 className="h-8 w-8" />
          <p className="text-sm">
            {canRun
              ? "Klik Run Sampling buat menghitung sampel berdasarkan parameter di kiri."
              : "Upload populasi dulu, baru jalanin sampling."}
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.skewness?.isExtreme && (
            <SkewnessAlert
              cv={result.skewness.cv}
              maxOverMedian={result.skewness.maxOverMedian}
              topStratumCount={result.topStratumCount ?? 0}
              topStratumValue={result.topStratumNilai ?? 0}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Sample Size" value={result.sampleSize.toLocaleString("id-ID")} accent />
            <Metric
              label="Populasi"
              value={`${result.populasiCount.toLocaleString("id-ID")} SP2D`}
            />
            {result.method === "mus" && (
              <>
                <Metric label="Sampling Interval" value={formatRupiah(result.selectionInterval ?? 0)} />
                <Metric
                  label="Top Stratum"
                  value={`${result.topStratumCount ?? 0} (${formatRupiah(result.topStratumNilai ?? 0)})`}
                />
              </>
            )}
            {result.method === "stratified" && (
              <Metric
                label="Certainty Stratum"
                value={`${result.topStratumCount ?? 0} (${formatRupiah(result.topStratumNilai ?? 0)})`}
              />
            )}
            <Metric label="Seed PRNG" value={String(result.seed)} mono />
            {result.reliabilityFactor && (
              <Metric label="Reliability Factor" value={result.reliabilityFactor.toFixed(2)} mono />
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded border border-[var(--color-warn)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--color-warn)]">
                <AlertTriangle className="h-3.5 w-3.5" /> Peringatan
              </div>
              <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
                {result.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadExcel}
              className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
            >
              <Download className="h-3.5 w-3.5" /> Excel KKP
            </button>
            <button
              onClick={downloadWord}
              className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
            >
              <FileText className="h-3.5 w-3.5" /> Lampiran KKP
            </button>
            <button
              onClick={downloadJSON}
              className="flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
            >
              <FileJson className="h-3.5 w-3.5" /> Seed Bundle
            </button>
          </div>

          <SamplePreview result={result} />

          {result.method === "mus" && !hideEvaluation && (
            <MisstatementInput
              result={result}
              confidence={params.mus.confidenceLevel as ConfidenceLevel}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
  mono = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <div className="mb-0.5 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div
        className={`tnum text-sm font-medium ${accent ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"} ${mono ? "mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function SamplePreview({ result }: { result: NonNullable<ReturnType<typeof useSamplingStore.getState>["result"]> }) {
  const preview = result.selectedItems.slice(0, 15);
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
        Preview Sampel (15 dari {result.sampleSize})
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-bg)]">
            <tr className="text-left text-[var(--color-text-subtle)]">
              <th className="px-3 py-1.5 font-normal">#</th>
              <th className="px-3 py-1.5 font-normal">No SP2D</th>
              <th className="px-3 py-1.5 font-normal">Tgl</th>
              <th className="px-3 py-1.5 font-normal text-right">Nilai</th>
              <th className="px-3 py-1.5 font-normal">SKPD</th>
              <th className="px-3 py-1.5 font-normal">Reason</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((item, i) => (
              <tr key={item.row.no_sp2d} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-1.5 text-[var(--color-text-subtle)]">{i + 1}</td>
                <td className="mono px-3 py-1.5 text-[var(--color-text)]">{item.row.no_sp2d}</td>
                <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{item.row.tgl_sp2d}</td>
                <td className="mono px-3 py-1.5 text-right text-[var(--color-text)] tnum">
                  {formatRupiah(item.row.nilai, { withSymbol: false })}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{item.row.skpd ?? "—"}</td>
                <td className="mono px-3 py-1.5 text-[var(--color-text-subtle)]">{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function paramForMethod(
  method: ReturnType<typeof useSamplingStore.getState>["method"],
  params: ReturnType<typeof useSamplingStore.getState>["params"],
): MethodParam {
  switch (method) {
    case "mus":
      return { method: "mus", param: params.mus };
    case "srs":
      return { method: "srs", param: params.srs };
    case "stratified":
      return { method: "stratified", param: params.stratified };
    case "judgmental":
      return { method: "judgmental", param: params.judgmental };
    case "attribute":
      return { method: "attribute", param: params.attribute };
    case "classical":
      return { method: "classical", param: params.classical };
    case "discovery":
      return { method: "discovery", param: params.discovery };
  }
}
