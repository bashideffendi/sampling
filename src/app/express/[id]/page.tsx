"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { UploadDropzone } from "@/components/shared/UploadDropzone";
import { PopulasiSummary } from "@/components/shared/PopulasiSummary";
import { MethodTabs } from "@/components/shared/MethodTabs";
import { DraftMetaForm } from "@/components/shared/DraftMeta";
import { ParamPanel } from "@/components/express/ParamPanel";
import { ResultPanel } from "@/components/express/ResultPanel";
import { useSamplingStore } from "@/store/samplingStore";

export default function ExpressPage() {
  const params = useParams<{ id: string }>();
  const populasi = useSamplingStore((s) => s.populasi);
  const loadCache = useSamplingStore((s) => s.loadPopulasiFromCache);
  const setDraftMeta = useSamplingStore((s) => s.setDraftMeta);

  useEffect(() => {
    if (params?.id && params.id !== "new") {
      setDraftMeta({ draftId: params.id });
    }
    void loadCache();
  }, [params?.id, loadCache, setDraftMeta]);

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
          <span className="wordmark text-2xl text-[var(--color-ink)]">Cuplik</span>
          <span className="rounded-full border border-[var(--color-accent)] px-3 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Express
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
          <Link href="/metode/mus" className="transition hover:text-[var(--color-ink)]">Metode</Link>
          <Link href="/tentang" className="transition hover:text-[var(--color-ink)]">Tentang</Link>
        </nav>
      </header>

      <section className="mb-8 space-y-4">
        <DraftMetaForm />
        {!populasi ? <UploadDropzone /> : <PopulasiSummary />}
      </section>

      {populasi && (
        <section className="space-y-6">
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
          <span className="mono uppercase tracking-[0.18em]">v0.1.0</span>
        </div>
      </footer>
    </main>
  );
}
