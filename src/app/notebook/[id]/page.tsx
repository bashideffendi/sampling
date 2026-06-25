"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { useNotebookStore } from "@/store/notebookStore";
import { useSamplingStore } from "@/store/samplingStore";
import { CellShell } from "@/components/notebook/CellShell";
import { MarkdownCellRender } from "@/components/notebook/MarkdownCellRender";
import { PopulasiCellRender } from "@/components/notebook/PopulasiCellRender";
import { MaterialitasCellRender } from "@/components/notebook/MaterialitasCellRender";
import { MetodeCellRender } from "@/components/notebook/MetodeCellRender";
import { SamplingCellRender } from "@/components/notebook/SamplingCellRender";
import { EvaluasiCellRender } from "@/components/notebook/EvaluasiCellRender";
import { DraftMetaForm } from "@/components/shared/DraftMeta";
import { APP_VERSION } from "@/lib/constants";
import type { Cell } from "@/lib/notebook/types";

const TITLES: Record<Cell["type"], string> = {
  markdown: "Catatan Pemeriksaan",
  populasi: "Populasi SP2D",
  materialitas: "Materialitas",
  metode: "Pemilihan Metode",
  sampling: "Sampling Run",
  evaluasi: "Evaluasi UML",
};

const DESCRIPTIONS: Partial<Record<Cell["type"], string>> = {
  populasi: "Unggah Excel SP2D dari BPKAD. Parsing + fingerprint format otomatis.",
  materialitas: "Tentukan Planning Materiality (PM) dan Tolerable Misstatement (TM).",
  metode: "Pilih asersi audit → tool rekomen metode + unit sampling.",
  sampling: "Jalanin sampling. Parameter di kiri, hasil di kanan.",
  evaluasi: "Post-fieldwork: isi audit value tiap sample → UML otomatis.",
};

export default function NotebookPage() {
  const params = useParams<{ id: string }>();
  const notebook = useNotebookStore((s) => s.notebook);
  const loading = useNotebookStore((s) => s.loading);
  const load = useNotebookStore((s) => s.load);
  const loadPopulasiCache = useSamplingStore((s) => s.loadPopulasiFromCache);

  useEffect(() => {
    if (params?.id) {
      void load(params.id);
      void loadPopulasiCache();
    }
  }, [params?.id, load, loadPopulasiCache]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
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
            Notebook
          </span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
          <Link
            href="/express/new"
            className="flex items-center gap-1 transition hover:text-[var(--color-ink)]"
          >
            <Zap className="h-3.5 w-3.5" /> Express
          </Link>
          <Link href="/risk-helper" className="transition hover:text-[var(--color-ink)]">
            Risk Helper
          </Link>
        </nav>
      </header>

      <section className="mb-8">
        <h1 className="serif mb-2 text-3xl font-medium tracking-[-0.015em] text-[var(--color-ink)]">
          Notebook Pemeriksaan
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">
          Mode kerja per-cell. Tiap langkah punya rationale field — audit defensibility
          terdokumentasi sambil kerja. Data populasi + parameter di-share dengan Express
          (atomic switch via toggle).
        </p>
      </section>

      <section className="mb-8">
        <DraftMetaForm />
      </section>

      {loading && (
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">
          Memuat notebook…
        </div>
      )}

      {!loading && notebook && (
        <section className="space-y-4">
          {notebook.cells.map((cell) => (
            <CellShell
              key={cell.id}
              cell={cell}
              title={TITLES[cell.type]}
              description={DESCRIPTIONS[cell.type]}
            >
              {renderCell(cell)}
            </CellShell>
          ))}
        </section>
      )}

      <footer className="mt-20 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-subtle)]">
        <div className="flex items-center justify-between">
          <span>Notebook tersimpan otomatis di IndexedDB lokal. Tidak ke server.</span>
          <span className="mono uppercase tracking-[0.18em]">v{APP_VERSION}</span>
        </div>
      </footer>
    </main>
  );
}

function renderCell(cell: Cell) {
  switch (cell.type) {
    case "markdown":
      return <MarkdownCellRender cell={cell} />;
    case "populasi":
      return <PopulasiCellRender cell={cell} />;
    case "materialitas":
      return <MaterialitasCellRender cell={cell} />;
    case "metode":
      return <MetodeCellRender cell={cell} />;
    case "sampling":
      return <SamplingCellRender cell={cell} />;
    case "evaluasi":
      return <EvaluasiCellRender cell={cell} />;
  }
}
