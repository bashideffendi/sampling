import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TentangPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <h1 className="mb-3 text-3xl font-semibold tracking-tight">Tentang Cuplik</h1>
      <p className="mb-8 text-base text-[var(--color-text-muted)]">
        Tool sampling pemeriksaan SP2D buat auditor BPK RI.
        Independent open-source utility, gratis, gak konsumsi server.
      </p>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Privacy
        </h2>
        <p className="text-sm text-[var(--color-text)]">
          Data SP2D yang kamu upload <strong>tidak pernah meninggalkan browser</strong>.
          Parsing, sampling, dan export semua jalan di sisi client. Cache populasi
          tersimpan di IndexedDB lokal dan bisa kamu hapus kapan aja via tombol Reset.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Defensibilitas
        </h2>
        <ul className="space-y-2 text-sm text-[var(--color-text)]">
          <li>· PRNG <span className="mono">mulberry32</span> seeded — sampel reproducible bit-for-bit per seed.</li>
          <li>· Hash SHA-256 populasi terlampir di output.</li>
          <li>· Tabel Reliability Factor (MUS) bersumber AICPA Audit Guide.</li>
          <li>· Tabel Attribute (90/95/99% confidence) bersumber AICPA Appendix A.</li>
          <li>· Formula verifikasi unit-test (67 test) di lib/sampling/.</li>
          <li>· Output Excel multi-sheet termasuk Audit Trail (seed, hash, param JSON).</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Metode yang didukung
        </h2>
        <ul className="space-y-2 text-sm text-[var(--color-text)]">
          <li>· <Link href="/metode/mus" className="text-[var(--color-accent)] hover:underline">MUS</Link> — Monetary Unit Sampling (utama)</li>
          <li>· <Link href="/metode/srs" className="text-[var(--color-accent)] hover:underline">SRS</Link> — Simple Random Sampling</li>
          <li>· <Link href="/metode/stratified" className="text-[var(--color-accent)] hover:underline">Stratified</Link> — Neyman/Proportional + LRM</li>
          <li>· <Link href="/metode/judgmental" className="text-[var(--color-accent)] hover:underline">Judgmental</Link> — DSL kriteria, non-statistical</li>
          <li>· <Link href="/metode/attribute" className="text-[var(--color-accent)] hover:underline">Attribute</Link> — Test of Controls (AICPA table)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Roadmap
        </h2>
        <ul className="space-y-2 text-sm text-[var(--color-text)]">
          <li>· v0.1 (sekarang) — 5 metode + Express UI + Excel/JSON output</li>
          <li>· v0.2 — Notebook UI cell-based + Cell Evaluation (UML calc) + Word/PDF narasi</li>
          <li>· v0.3 — Risk Helper (40 rules deteksi anomali SP2D)</li>
          <li>· v0.4 — Classical Variables Sampling + Discovery Sampling</li>
        </ul>
      </section>

      <footer className="border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-subtle)]">
        <p>
          Cuplik · <span className="mono">v0.1.0</span> · Bashid Effendi · MIT
        </p>
        <p className="mt-1">
          Bukan produk resmi BPK. Independent open-source utility.
        </p>
      </footer>
    </main>
  );
}
