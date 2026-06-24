import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TentangPage() {
  return (
    <main className="mx-auto max-w-3xl px-8 pb-24 pt-12">
      <Link
        href="/"
        className="mb-12 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-4 w-4" /> Beranda
      </Link>

      <header className="mb-14">
        <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-[var(--color-accent)]">
          <span className="h-px w-8 bg-[var(--color-accent)]" />
          Catatan
        </div>
        <h1 className="serif mb-6 text-5xl font-medium leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]">
          Tentang Cap Cip Cup
        </h1>
        <p className="text-lg leading-relaxed text-[var(--color-text-muted)]">
          Alat sampling pemeriksaan SP2D untuk auditor BPK RI — utilitas
          sumber terbuka yang independen, tidak mengonsumsi server, dan tidak
          dibebani biaya berlangganan.
        </p>
      </header>

      <Section title="Privasi">
        <p className="text-base leading-relaxed text-[var(--color-text)]">
          Data SP2D yang Anda unggah <em className="serif italic text-[var(--color-accent-ink)]">tidak pernah meninggalkan peramban</em>.
          Parsing, sampling, dan ekspor semuanya berjalan di sisi klien. Cache
          populasi tersimpan di IndexedDB lokal dan dapat dihapus kapan saja
          melalui tombol Reset.
        </p>
      </Section>

      <Section title="Defensibilitas">
        <ul className="space-y-3 text-base leading-relaxed text-[var(--color-text)]">
          {DEFENSIBILITAS.map((d, i) => (
            <li key={i} className="flex gap-3">
              <span className="mono text-xs text-[var(--color-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Metode yang didukung">
        <ul className="space-y-3">
          {METODE.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/metode/${m.slug}`}
                className="group flex items-baseline justify-between border-b border-[var(--color-hairline)] pb-2 transition hover:border-[var(--color-accent)]"
              >
                <span className="serif text-lg font-medium tracking-tight text-[var(--color-ink)] transition group-hover:text-[var(--color-accent-ink)]">
                  {m.name}
                </span>
                <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
                  {m.code}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Peta jalan">
        <ul className="space-y-3 text-base leading-relaxed text-[var(--color-text)]">
          {ROADMAP.map((r, i) => (
            <li key={i} className="flex gap-3">
              <span className="mono text-xs text-[var(--color-accent)]">{r.v}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <footer className="border-t border-[var(--color-border)] pt-7 text-xs text-[var(--color-text-subtle)]">
        <p className="serif italic">
          Cap Cip Cup · <span className="mono not-italic">v0.1.0</span> · Bashid Effendi · MIT
        </p>
        <p className="mt-2">
          Bukan produk resmi BPK. Independen, sumber terbuka, dimaksudkan
          sebagai utilitas pemeriksaan.
        </p>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="serif mb-5 text-2xl font-medium tracking-[-0.015em] text-[var(--color-ink)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

const DEFENSIBILITAS = [
  "PRNG mulberry32 seeded — sampel reproducible bit-for-bit per seed.",
  "Hash SHA-256 atas populasi terlampir di setiap output.",
  "Tabel Reliability Factor (MUS) bersumber AICPA Audit Guide.",
  "Tabel Attribute (90/95/99% confidence) bersumber AICPA Appendix A.",
  "67 unit test memverifikasi formula di lib/sampling/.",
  "Excel output multi-sheet termasuk Audit Trail (seed, hash, parameter JSON).",
];

const METODE = [
  { slug: "mus", code: "MUS", name: "Monetary Unit Sampling" },
  { slug: "srs", code: "SRS", name: "Simple Random Sampling" },
  { slug: "stratified", code: "STR", name: "Stratified Random Sampling" },
  { slug: "judgmental", code: "JDG", name: "Judgmental Sampling" },
  { slug: "attribute", code: "ATR", name: "Attribute Sampling" },
];

const ROADMAP = [
  { v: "v0.1", text: "Lima metode + Express UI + Excel/JSON output. (Sekarang)" },
  { v: "v0.2", text: "Notebook UI cell-based + Cell Evaluation (UML calc) + Word/PDF narasi." },
  { v: "v0.3", text: "Risk Helper — empat puluh aturan deteksi anomali SP2D." },
  { v: "v0.4", text: "Classical Variables Sampling + Discovery Sampling." },
];
