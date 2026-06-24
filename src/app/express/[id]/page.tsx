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
      <header className="mb-8 flex items-center justify-between border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <span className="text-[var(--color-text-subtle)]">/</span>
          <span className="mono text-lg font-semibold tracking-tight">cuplik</span>
          <span className="mono rounded border border-[var(--color-accent)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs uppercase tracking-wider text-[var(--color-accent)]">
            Express
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
          <Link href="/metode/mus" className="hover:text-[var(--color-text)]">Metode</Link>
          <Link href="/tentang" className="hover:text-[var(--color-text)]">Tentang</Link>
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

      <footer className="mt-16 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-subtle)]">
        <div className="flex items-center justify-between">
          <span>Data SP2D di-parse & olah di browser. Gak pernah upload server.</span>
          <span className="mono">v0.1.0</span>
        </div>
      </footer>
    </main>
  );
}
