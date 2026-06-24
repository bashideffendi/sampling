"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, AlertTriangle, FileCheck2 } from "lucide-react";
import { UploadDropzone } from "@/components/shared/UploadDropzone";
import { PopulasiSummary } from "@/components/shared/PopulasiSummary";
import { MethodTabs } from "@/components/shared/MethodTabs";
import { DraftMetaForm } from "@/components/shared/DraftMeta";
import { ParamPanel } from "@/components/express/ParamPanel";
import { ResultPanel } from "@/components/express/ResultPanel";
import {
  SamplingUnitSelector,
  type AssertionKey,
  type SamplingUnit,
} from "@/components/sampling/SamplingUnitSelector";
import { useSamplingStore } from "@/store/samplingStore";
import type { SamplingMethod } from "@/types";

export default function ExpressPage() {
  const params = useParams<{ id: string }>();
  const populasi = useSamplingStore((s) => s.populasi);
  const populasiMeta = useSamplingStore((s) => s.populasiMeta);
  const parseExtras = useSamplingStore((s) => s.parseExtras);
  const loadCache = useSamplingStore((s) => s.loadPopulasiFromCache);
  const setDraftMeta = useSamplingStore((s) => s.setDraftMeta);
  const setMethod = useSamplingStore((s) => s.setMethod);

  const [assertion, setAssertion] = useState<AssertionKey | null>(null);
  const [suggestedUnit, setSuggestedUnit] = useState<SamplingUnit | null>(null);

  useEffect(() => {
    if (params?.id && params.id !== "new") {
      setDraftMeta({ draftId: params.id });
    }
    void loadCache();
  }, [params?.id, loadCache, setDraftMeta]);

  function handleAssertion(
    a: AssertionKey,
    suggested: { unit: SamplingUnit; method: SamplingMethod },
  ) {
    setAssertion(a);
    setSuggestedUnit(suggested.unit);
    setMethod(suggested.method);
  }

  const fingerprint = parseExtras?.fingerprint ?? null;
  const parserWarnings = parseExtras?.warnings ?? [];

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
            Express
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
          <Link href="/metode/mus" className="transition hover:text-[var(--color-ink)]">
            Metode
          </Link>
          <Link href="/tentang" className="transition hover:text-[var(--color-ink)]">
            Tentang
          </Link>
        </nav>
      </header>

      <section className="mb-8 space-y-4">
        <DraftMetaForm />
        {!populasi ? <UploadDropzone /> : <PopulasiSummary />}

        {populasi && fingerprint && (
          <div className="flex items-start gap-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
            <FileCheck2 className="mt-0.5 h-4 w-4 flex-none text-[var(--color-accent)]" />
            <div className="flex-1">
              <span className="font-medium text-[var(--color-ink)]">
                Format terdeteksi: {fingerprint.format}
              </span>
              <span className="ml-2 text-[var(--color-text-muted)]">
                · granularity {fingerprint.granularity} · confidence{" "}
                <span className="mono">{fingerprint.confidence.toFixed(2)}</span>
              </span>
              {fingerprint.confidence < 0.8 && (
                <span className="ml-2 text-[var(--color-warn)]">
                  · konfirmasi pemetaan kolom kalau ada yang meleset
                </span>
              )}
            </div>
          </div>
        )}

        {populasi && parserWarnings.length > 0 && (
          <div className="flex items-start gap-3 rounded border border-[var(--color-warn)] bg-[var(--color-surface)] p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[var(--color-warn)]" />
            <div className="flex-1">
              <span className="font-medium text-[var(--color-ink)]">
                {parserWarnings.length} peringatan parser
              </span>
              <span className="ml-2 text-[var(--color-text-muted)]">
                — detail lengkap ada di sheet <span className="mono">Peringatan</span> pada output Excel.
              </span>
            </div>
          </div>
        )}
      </section>

      {populasi && populasiMeta && (
        <section className="space-y-6">
          <SamplingUnitSelector
            onSelect={handleAssertion}
            populasiCount={populasiMeta.count}
            uniqueSp2dCount={populasiMeta.count}
          />
          {assertion && suggestedUnit && (
            <div className="rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-3 text-sm">
              <span className="text-[var(--color-text-muted)]">Saran: </span>
              <span className="font-medium text-[var(--color-ink)]">
                {suggestedUnit === "per_sp2d" ? "Per SP2D" : "Per Baris Akun"}
              </span>
              <span className="ml-2 text-[var(--color-text-muted)]">
                · metode di bawah sudah otomatis dipilih sesuai asersi.
              </span>
            </div>
          )}
          <MethodTabs />
          <div className="grid gap-6 lg:grid-cols-2">
            <ParamPanel />
            <ResultPanel />
          </div>
        </section>
      )}

      <footer className="mt-20 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-subtle)]">
        <div className="flex items-center justify-between">
          <span>Data SP2D diolah di peramban — tidak pernah diunggah ke server.</span>
          <span className="mono uppercase tracking-[0.18em]">v0.2.0</span>
        </div>
      </footer>
    </main>
  );
}
