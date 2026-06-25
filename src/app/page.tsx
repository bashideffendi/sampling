import Link from "next/link";
import { ArrowUpRight, ShieldCheck, FileSpreadsheet, Layers } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-8 pb-24 pt-10">
      <Header />

      <Hero />

      <ActionPair />

      <MethodsBand />

      <Pillars />

      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="mb-20 flex flex-wrap items-baseline justify-between gap-y-4">
      <div className="flex items-baseline gap-3">
        <span className="wordmark text-3xl text-[var(--color-ink)]">Cap Cip Cup</span>
        <span className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-subtle)]">
          v0.1.0
        </span>
      </div>
      <nav className="flex items-center gap-8 text-sm text-[var(--color-text-muted)]">
        <Link href="/metode/mus" className="transition hover:text-[var(--color-ink)]">
          Metode
        </Link>
        <Link href="/risk-helper" className="transition hover:text-[var(--color-ink)]">
          Risk Helper
        </Link>
        <Link href="/tentang" className="transition hover:text-[var(--color-ink)]">
          Tentang
        </Link>
        <Link
          href="/express/new"
          className="whitespace-nowrap rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-[var(--color-paper)] transition hover:bg-[var(--color-accent-ink)] hover:border-[var(--color-accent-ink)]"
        >
          Mulai Sampling
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mb-20 max-w-3xl">
      <h1
        className="serif mb-7 whitespace-nowrap font-medium leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]"
        style={{ fontSize: "clamp(1.875rem, 3.6vw + 0.5rem, 3.25rem)" }}
      >
        Sampling pemeriksaan BPK.
      </h1>
      <p className="mb-10 max-w-2xl text-lg leading-relaxed text-[var(--color-text-muted)]">
        Tool sampling SP2D untuk auditor BPK RI — hasil reproducible dan
        defensible, siap dilampirkan ke Kertas Kerja Pemeriksaan.
      </p>
      <ul className="space-y-3 text-base leading-relaxed text-[var(--color-text)]">
        {HERO_POINTS.map((p, i) => (
          <li key={i} className="flex gap-4">
            <span className="mono mt-1 shrink-0 text-xs text-[var(--color-accent)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const HERO_POINTS = [
  "Lima metode statistik: Monetary Unit, Simple Random, Stratified, Judgmental, dan Attribute.",
  <>
    Formula merujuk <strong className="font-medium text-[var(--color-ink)]">AICPA</strong> (American Institute of Certified Public Accountants) Audit Guide.
  </>,
  "Pseudorandom seeded — sampel reproducible bit-for-bit per seed.",
  "Data SP2D diolah di peramban, tidak pernah diunggah ke server.",
  "Output Excel multi-sheet siap lampiran KKP + bundle JSON untuk replikasi.",
  "Risk Helper: 40 aturan deteksi anomali populasi sebagai input judgmental sampling.",
];

function ActionPair() {
  return (
    <section className="mb-24 grid gap-5 sm:grid-cols-2">
      <ActionCard
        href="/express/new"
        kicker="Primer"
        title="Mulai Lembar Sampling"
        body="Unggah Excel SP2D, pilih metode, atur parameter, unduh kertas kerja. Workflow tunggal halaman yang dipakai sehari-hari."
        primary
      />
      <ActionCard
        href="/metode/mus"
        kicker="Panduan"
        title="Telaah Metode"
        body="Penjelasan kapan tiap metode dipakai, formula, parameter input, dan rujukan sumber. Berguna kalau ditanya di forum AOI."
      />
    </section>
  );
}

function ActionCard({
  href,
  kicker,
  title,
  body,
  primary = false,
}: {
  href: string;
  kicker: string;
  title: string;
  body: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col gap-5 overflow-hidden rounded-[2px] border p-10 transition ${
        primary
          ? "border-[var(--color-accent)] bg-[var(--color-paper)]"
          : "border-[var(--color-border)] bg-[var(--color-paper)] hover:border-[var(--color-border-strong)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs uppercase tracking-[0.22em] ${
            primary ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"
          }`}
        >
          {kicker}
        </span>
        <ArrowUpRight
          className={`h-5 w-5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
            primary ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"
          }`}
        />
      </div>
      <h2
        className="serif font-medium tracking-[-0.015em] text-[var(--color-ink)]"
        style={{ fontSize: "clamp(1.5rem, 1.5vw + 0.9rem, 1.875rem)" }}
      >
        {title}
      </h2>
      <p className="text-base leading-relaxed text-[var(--color-text-muted)]">{body}</p>
      {primary && (
        <span
          aria-hidden
          className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--color-accent)] opacity-[0.06]"
        />
      )}
    </Link>
  );
}

function MethodsBand() {
  return (
    <section className="mb-24 border-y border-[var(--color-border)] py-10">
      <div className="mb-7 flex items-baseline justify-between">
        <h2 className="serif text-xl font-medium tracking-tight text-[var(--color-ink)]">
          Lima Metode
        </h2>
        <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
          v0.1
        </span>
      </div>
      <div className="grid gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
        {METHODS.map((m, idx) => (
          <Link
            key={m.slug}
            href={`/metode/${m.slug}`}
            className="group flex flex-col gap-2 border-t border-[var(--color-hairline)] pt-5"
          >
            <div className="flex items-baseline justify-between">
              <span className="mono text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-accent)]">
                {String(idx + 1).padStart(2, "0")} · {m.code}
              </span>
            </div>
            <div className="serif text-xl font-medium tracking-tight text-[var(--color-ink)] transition group-hover:text-[var(--color-accent-ink)]">
              {m.name}
            </div>
            <div className="text-sm leading-relaxed text-[var(--color-text-muted)]">
              {m.use}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Pillars() {
  return (
    <section className="mb-24 grid gap-12 sm:grid-cols-3">
      <Pillar
        icon={<ShieldCheck className="h-5 w-5" />}
        eyebrow="Defensible"
        title="Reproducible bit-for-bit"
        body="PRNG mulberry32 seeded. SHA-256 atas populasi. Tabel reliability factor merujuk AICPA Audit Guide. Bundle JSON terlampir untuk replikasi di forum review."
      />
      <Pillar
        icon={<FileSpreadsheet className="h-5 w-5" />}
        eyebrow="Privacy"
        title="Berjalan di peramban"
        body="Data SP2D di-parse dan diolah lokal. Tidak ada unggah ke server. Cache populasi tersimpan di IndexedDB peramban — bisa dihapus kapan saja."
      />
      <Pillar
        icon={<Layers className="h-5 w-5" />}
        eyebrow="Siap KKP"
        title="Empat lembar siap pakai"
        body="Excel multi-sheet: Ringkasan parameter, Daftar Sampel terformat, Narasi Metodologi siap-tempel, dan Audit Trail dengan seed serta hash."
      />
    </section>
  );
}

function Pillar({
  icon,
  eyebrow,
  title,
  body,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-accent)]">
          {icon}
        </span>
        <span className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
          {eyebrow}
        </span>
      </div>
      <h3 className="serif mb-3 text-xl font-medium tracking-tight text-[var(--color-ink)]">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{body}</p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] pt-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3 text-xs text-[var(--color-text-subtle)]">
        <div className="flex items-baseline gap-3">
          <span className="wordmark text-base text-[var(--color-ink)]">Cap Cip Cup</span>
          <span>· alat pemeriksaan independen · 2026</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="mono uppercase tracking-[0.22em]">capcipcup.masbash.id</span>
          <Link href="/tentang" className="hover:text-[var(--color-ink)]">
            Tentang
          </Link>
        </div>
      </div>
    </footer>
  );
}

const METHODS = [
  { slug: "mus", code: "MUS", name: "Monetary Unit", use: "Substantive test atas nilai. Probabilitas sebanding rupiah." },
  { slug: "srs", code: "SRS", name: "Simple Random", use: "Populasi homogen, peluang sama untuk tiap SP2D." },
  { slug: "stratified", code: "STR", name: "Stratified", use: "Variansi besar — bagi stratum, sampel per layer." },
  { slug: "judgmental", code: "JDG", name: "Judgmental", use: "Risk-based targeted. Wajib rationale auditor." },
  { slug: "attribute", code: "ATR", name: "Attribute", use: "Test of controls — tabel AICPA 90/95/99%." },
];
