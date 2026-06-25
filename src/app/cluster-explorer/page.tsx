"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Download, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { useSamplingStore } from "@/store/samplingStore";
import { detectClusters } from "@/lib/cluster/engine";
import {
  DEFAULT_CLUSTER_PARAMS,
  type ClusterParams,
  type ClusterResult,
} from "@/lib/cluster/types";
import { formatRupiah } from "@/lib/utils";
import { APP_VERSION } from "@/lib/constants";
import { toast } from "sonner";

export default function ClusterExplorerPage() {
  const populasi = useSamplingStore((s) => s.populasi);
  const populasiMeta = useSamplingStore((s) => s.populasiMeta);

  const [params, setParams] = useState<ClusterParams>(DEFAULT_CLUSTER_PARAMS);
  const [result, setResult] = useState<ClusterResult | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setResult(null);
    setExpanded(new Set());
  }, [populasiMeta?.hashSha256]);

  function runDetection() {
    if (!populasi || populasi.length === 0) {
      toast.error("Upload populasi di Express dulu.");
      return;
    }
    setRunning(true);
    queueMicrotask(() => {
      try {
        const r = detectClusters(populasi, params);
        setResult(r);
        toast.success(
          `Deteksi selesai: ${r.clusters.length} cluster ditemukan dari ${r.markedRows} baris ber-marker.`,
        );
      } catch (e) {
        toast.error(`Deteksi gagal: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setRunning(false);
      }
    });
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportCsv() {
    if (!result) return;
    const header = [
      "cluster_id",
      "vendor",
      "opd",
      "pattern",
      "count",
      "total_nilai",
      "confidence",
      "split_flag",
      "from",
      "to",
      "no_sp2d",
      "tgl_sp2d",
      "nilai",
      "marker",
      "sequence",
      "snippet",
    ];
    const lines: string[] = [header.join(",")];
    result.clusters.forEach((c, ci) => {
      const cid = `C${String(ci + 1).padStart(4, "0")}`;
      for (const item of c.items) {
        const cells = [
          cid,
          quote(c.vendorLabel),
          quote(c.opd),
          quote(c.dominantPattern),
          c.count,
          c.totalNilai,
          c.confidence.toFixed(2),
          c.splitFlag,
          c.dateRange.from,
          c.dateRange.to,
          quote(item.row.no_sp2d),
          item.row.tgl_sp2d,
          item.row.nilai,
          item.marker,
          item.sequence ?? "",
          quote(item.snippet),
        ];
        lines.push(cells.join(","));
      }
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:T-]/g, "").slice(0, 13);
    a.href = url;
    a.download = `Capcipcup_Cluster_Report_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-10 flex items-center justify-between border-b border-[var(--color-border)] pb-5">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-ink)]"
          >
            <ArrowLeft className="h-4 w-4" /> Beranda
          </Link>
          <span className="text-[var(--color-border-strong)]">/</span>
          <span className="wordmark text-2xl text-[var(--color-ink)]">Cap Cip Cup</span>
          <span className="rounded-full border border-[var(--color-accent)] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Cluster Explorer
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
          <Link href="/express/new" className="transition hover:text-[var(--color-ink)]">Express</Link>
          <Link href="/risk-helper" className="transition hover:text-[var(--color-ink)]">Risk Helper</Link>
        </nav>
      </header>

      <section className="mb-10">
        <h1 className="serif mb-3 text-3xl font-medium tracking-[-0.015em] text-[var(--color-ink)]">
          Cluster Explorer
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-[var(--color-text-muted)]">
          Deteksi rangkaian SP2D yang kemungkinan satu kontrak — UM + Termyn + Pelunasan, atau
          Tahap I/II/III berurutan. Hasil <em className="italic">judgmental-only</em> (bukan
          sampling formal), surface kandidat audit lintas dokumen pembayaran.
        </p>
      </section>

      {!populasi && (
        <section className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <FileSpreadsheet className="mx-auto mb-3 h-8 w-8 text-[var(--color-text-subtle)]" />
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            Belum ada populasi. Upload Excel SP2D di Express dulu.
          </p>
          <Link
            href="/express/new"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-paper)] transition hover:bg-[var(--color-accent-ink)]"
          >
            Buka Express
          </Link>
        </section>
      )}

      {populasi && populasiMeta && (
        <>
          <section className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Window (hari)"
              value={params.windowDays}
              onChange={(v) => setParams((p) => ({ ...p, windowDays: Math.max(1, v) }))}
            />
            <Field
              label="Min SP2D per cluster"
              value={params.minSize}
              onChange={(v) => setParams((p) => ({ ...p, minSize: Math.max(2, v) }))}
            />
            <Field
              label="Min total nilai (Rp)"
              value={params.minTotalNilai}
              onChange={(v) => setParams((p) => ({ ...p, minTotalNilai: Math.max(0, v) }))}
              step={1_000_000}
            />
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                Vendor matching
              </div>
              <select
                value={params.vendorMatch}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    vendorMatch: e.target.value as ClusterParams["vendorMatch"],
                  }))
                }
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="npwp_first">NPWP dulu, fallback nama</option>
                <option value="npwp_only">NPWP saja</option>
                <option value="name_only">Nama saja</option>
              </select>
            </div>
          </section>

          <section className="mb-10 flex flex-wrap items-center gap-3">
            <button
              onClick={runDetection}
              disabled={running}
              className="flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-[var(--color-paper)] transition hover:bg-[var(--color-accent-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {running ? "Mendeteksi…" : "Jalankan Deteksi"}
            </button>
            {result && (
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
            <span className="ml-auto text-xs text-[var(--color-text-subtle)]">
              Populasi: {populasiMeta.count.toLocaleString("id-ID")} SP2D · hash{" "}
              <span className="mono">{populasiMeta.hashSha256.slice(0, 12)}…</span>
            </span>
          </section>

          {result && (
            <>
              <section className="mb-8 grid gap-3 sm:grid-cols-4">
                <Metric label="Cluster" value={result.clusters.length.toLocaleString("id-ID")} accent />
                <Metric label="Baris ber-marker" value={result.markedRows.toLocaleString("id-ID")} />
                <Metric
                  label="Total nilai cluster"
                  value={formatRupiah(result.clusters.reduce((s, c) => s + c.totalNilai, 0))}
                />
                <Metric
                  label="Split flag"
                  value={result.clusters.filter((c) => c.splitFlag).length.toLocaleString("id-ID")}
                  warn
                />
              </section>

              <section>
                <h2 className="serif mb-4 text-xl font-medium tracking-tight text-[var(--color-ink)]">
                  Cluster Candidates ({result.clusters.length})
                </h2>
                {result.clusters.length === 0 ? (
                  <p className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
                    Tidak ada cluster terdeteksi dengan parameter saat ini. Coba longgarkan
                    window atau turunkan min total nilai.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {result.clusters.slice(0, 50).map((c, ci) => {
                      const cid = `${c.vendorKey}-${ci}`;
                      const isOpen = expanded.has(cid);
                      return (
                        <div
                          key={cid}
                          className={`rounded border ${c.splitFlag ? "border-[var(--color-warn)]" : "border-[var(--color-border)]"} bg-[var(--color-paper)]`}
                        >
                          <button
                            onClick={() => toggleExpand(cid)}
                            className="flex w-full items-center gap-4 px-4 py-3 text-left"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[var(--color-ink)]">
                                  {c.vendorLabel}
                                </span>
                                <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
                                  · {c.opd}
                                </span>
                                {c.splitFlag && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded bg-[var(--color-warn)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--color-paper)]">
                                    <AlertTriangle className="h-3 w-3" /> SPLIT
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                                {c.count} SP2D · {c.dominantPattern} · {c.dateRange.from} → {c.dateRange.to}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="mono tnum font-medium text-[var(--color-ink)]">
                                {formatRupiah(c.totalNilai)}
                              </div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
                                conf {(c.confidence * 100).toFixed(0)}%
                              </div>
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-[var(--color-hairline)] bg-[var(--color-surface-2)] px-4 py-3">
                              <table className="w-full text-xs">
                                <thead className="text-[var(--color-text-subtle)]">
                                  <tr>
                                    <th className="px-2 py-1 text-left font-normal">No SP2D</th>
                                    <th className="px-2 py-1 text-left font-normal">Tanggal</th>
                                    <th className="px-2 py-1 text-right font-normal">Nilai</th>
                                    <th className="px-2 py-1 text-left font-normal">Marker</th>
                                    <th className="px-2 py-1 text-left font-normal">Snippet</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.items.map((it) => (
                                    <tr
                                      key={it.row.no_sp2d}
                                      className="border-t border-[var(--color-hairline)]"
                                    >
                                      <td className="mono px-2 py-1 text-[var(--color-text)]">
                                        {it.row.no_sp2d}
                                      </td>
                                      <td className="px-2 py-1 text-[var(--color-text-muted)]">
                                        {it.row.tgl_sp2d}
                                      </td>
                                      <td className="mono tnum px-2 py-1 text-right text-[var(--color-text)]">
                                        {formatRupiah(it.row.nilai, { withSymbol: false })}
                                      </td>
                                      <td className="mono px-2 py-1 text-[var(--color-text-muted)]">
                                        {it.marker}
                                        {it.sequence !== null && it.sequence < 99 && (
                                          <span className="ml-1 text-[var(--color-accent)]">
                                            #{it.sequence}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1 italic text-[var(--color-text-subtle)]">
                                        "{it.snippet}"
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {result.clusters.length > 50 && (
                  <p className="mt-4 text-xs text-[var(--color-text-subtle)]">
                    Menampilkan 50 cluster pertama. Total: {result.clusters.length}. Export CSV
                    buat lihat semua.
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}

      <footer className="mt-20 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-subtle)]">
        <div className="flex items-center justify-between">
          <span>Hasil judgmental-only · bukan sampling formal · untuk follow-up audit cross-SP2D.</span>
          <span className="mono uppercase tracking-[0.18em]">v{APP_VERSION}</span>
        </div>
      </footer>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mono tnum w-full rounded border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-right text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
  warn = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-paper)] p-4">
      <div className="mb-0.5 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div
        className={`mono tnum text-lg font-medium ${
          accent
            ? "text-[var(--color-accent-ink)]"
            : warn
              ? "text-[var(--color-warn)]"
              : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function quote(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}
