import Link from "next/link";
import { ArrowRight, FileSpreadsheet, Layers, Calculator, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-16 flex items-baseline justify-between border-b border-[var(--color-border)] pb-6">
        <div className="flex items-baseline gap-3">
          <span className="mono text-2xl font-semibold tracking-tight">cuplik</span>
          <span className="mono text-xs text-[var(--color-text-subtle)]">v0.1.0</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-text-muted)]">
          <Link href="/metode/mus" className="hover:text-[var(--color-text)]">Metode</Link>
          <Link href="/risk-helper" className="hover:text-[var(--color-text)]">Risk Helper</Link>
          <Link href="/draft" className="hover:text-[var(--color-text)]">Draft</Link>
          <Link href="/tentang" className="hover:text-[var(--color-text)]">Tentang</Link>
        </nav>
      </header>

      <section className="mb-16">
        <h1 className="mb-4 text-4xl font-semibold tracking-tight">
          Sampling SP2D yang bisa dipertanggungjawabkan.
        </h1>
        <p className="max-w-2xl text-lg text-[var(--color-text-muted)]">
          Tool sampling pemeriksaan untuk auditor BPK RI. 5 metode statistik (MUS,
          Simple Random, Stratified, Judgmental, Attribute), formula AICPA terverifikasi,
          PRNG seeded reproducible, output Excel siap KKP.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/notebook/new"
            className="group flex flex-col gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between">
              <span className="mono text-xs uppercase tracking-wider text-[var(--color-accent)]">
                primary
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--color-text-subtle)] transition group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5" />
            </div>
            <h2 className="text-xl font-medium">Mulai Notebook</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Mode default. Cell-based per step (populasi → materialitas → metode → seleksi),
              tiap cell ber-rationale, audit trail lengkap, export utuh jadi lampiran KKP.
            </p>
          </Link>

          <Link
            href="/express/new"
            className="group flex flex-col gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between">
              <span className="mono text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                power user
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--color-text-subtle)] transition group-hover:text-[var(--color-text)] group-hover:translate-x-0.5" />
            </div>
            <h2 className="text-xl font-medium">Mode Express</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Satu halaman. Tab metode, semua parameter & hasil sekaligus. A/B compare cepat.
              Bisa di-promote ke notebook saat siap dokumentasi.
            </p>
          </Link>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="mb-6 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          5 metode statistik
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {METHODS.map((m) => (
            <Link
              key={m.slug}
              href={`/metode/${m.slug}`}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition hover:border-[var(--color-border-strong)]"
            >
              <div className="mono mb-1 text-xs text-[var(--color-text-subtle)]">{m.code}</div>
              <div className="mb-1 text-sm font-medium">{m.name}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{m.use}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-16 grid gap-6 border-t border-[var(--color-border)] pt-12 sm:grid-cols-3">
        <Feature
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Defensible"
          body="PRNG seeded mulberry32. SHA-256 hash populasi. Audit trail re-runnable. Tabel reliability factor sumber AICPA Audit Guide."
        />
        <Feature
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Privacy-first"
          body="Data SP2D parse & olah di browser, gak pernah upload server. IndexedDB lokal, hapus kapan aja."
        />
        <Feature
          icon={<Layers className="h-5 w-5" />}
          title="Siap KKP"
          body="Output Excel multi-sheet (Ringkasan/Sampel/Metodologi/Hash). JSON seed bundle buat reproducibility di forum review."
        />
      </section>

      <footer className="border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-subtle)]">
        <div className="flex items-center justify-between">
          <span>Cuplik · alat audit BPK RI · v0.1.0 · MIT</span>
          <span className="mono">cuplik.masbash.id</span>
        </div>
      </footer>
    </main>
  );
}

const METHODS = [
  { slug: "mus", code: "MUS", name: "Monetary Unit", use: "Substantive test nilai" },
  { slug: "srs", code: "SRS", name: "Simple Random", use: "Populasi homogen" },
  { slug: "stratified", code: "STR", name: "Stratified", use: "Variansi besar" },
  { slug: "judgmental", code: "JDG", name: "Judgmental", use: "Risk-based targeted" },
  { slug: "attribute", code: "ATR", name: "Attribute", use: "Test of controls" },
];

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
        {icon}
      </div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{body}</p>
    </div>
  );
}
