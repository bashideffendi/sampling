import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

interface MetodeContent {
  slug: string;
  name: string;
  code: string;
  tagline: string;
  kapan: string[];
  formula: string;
  param: Array<{ name: string; description: string; default: string }>;
  output: string[];
  catatan?: string;
  sumber: string;
}

const METODE: Record<string, MetodeContent> = {
  mus: {
    slug: "mus",
    name: "Monetary Unit Sampling",
    code: "MUS",
    tagline: "Metode utama substantive test BPK. Probabilitas sebanding nilai SP2D — transaksi besar otomatis lebih sering kepilih.",
    kapan: [
      "Substantive test atas nilai (overstatement)",
      "Populasi nilai sangat skewed (gap besar antar transaksi)",
      "Mau projection ke populasi (UML / projected misstatement)",
    ],
    formula: "n = ⌈BV × RF / (TM − EF × EM)⌉\ninterval J = TM / RF\ntop stratum threshold = J",
    param: [
      { name: "Book Value (BV)", description: "Total nilai populasi", default: "auto" },
      { name: "Tolerable Misstatement (TM)", description: "Batas atas salah saji yang masih bisa diterima", default: "50-75% dari PM" },
      { name: "Expected Misstatement (EM)", description: "Ekspektasi salah saji di populasi", default: "0 kalau gak ada baseline" },
      { name: "Confidence Level", description: "Tingkat keyakinan", default: "95%" },
      { name: "Seed PRNG", description: "Buat reproducibility", default: "42 (boleh ganti)" },
    ],
    output: [
      "Sample size n + sampling interval J",
      "Top stratum 100% inspect (item ≥ J)",
      "Daftar SP2D terpilih dengan hit value",
      "Reliability Factor + citation tabel sumber",
    ],
    catatan: "Item bernilai negatif idealnya 100% inspect (opt-in checkbox). Untuk evaluation post-audit (UML), pakai tainting % × J untuk item ≤ J.",
    sumber: "AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix C, Table C-1 (Poisson Reliability Factors).",
  },
  srs: {
    slug: "srs",
    name: "Simple Random Sampling",
    code: "SRS",
    tagline: "Setiap SP2D punya peluang sama. Cocok kalau populasi homogen dan tujuan spot-check sederhana.",
    kapan: [
      "Populasi nilai relatif homogen (gak ada outlier ekstrem)",
      "Tujuan spot-check / pengujian non-projection",
      "Pelengkap MUS buat verifikasi cepat",
    ],
    formula: "n = (Z² × p × (1−p)) / E² ; lalu adjust FPC: n_adj = n / (1 + (n−1)/N)",
    param: [
      { name: "Populasi (N)", description: "Jumlah SP2D", default: "auto" },
      { name: "Confidence Level", description: "Tingkat keyakinan", default: "95%" },
      { name: "Expected Deviation", description: "Tingkat penyimpangan diharapkan", default: "1%" },
      { name: "Tolerable Deviation", description: "Batas atas penyimpangan", default: "5%" },
    ],
    output: ["Sample size n (sudah FPC-adjusted)", "Daftar SP2D acak terpilih"],
    sumber: "Cochran W.G. (1977) Sampling Techniques, Bab 4.",
  },
  stratified: {
    slug: "stratified",
    name: "Stratified Random Sampling",
    code: "STR",
    tagline: "Bagi populasi per stratum nilai, sampel acak tiap stratum. Bagus buat populasi nilai bervariasi lebar.",
    kapan: [
      "Variansi nilai SP2D besar antar OPD / akun",
      "Mau coverage merata antar layer nilai",
      "Estimasi total salah saji rupiah",
    ],
    formula: "n_total = (Σ N_h × S_h)² / (V + Σ N_h × S_h²)\nNeyman allocation: n_h = n × N_h × S_h / Σ(N_i × S_i)\nLargest Remainder Method buat rounding alokasi.",
    param: [
      { name: "Batas Stratum", description: "Ambang nilai pemisah stratum", default: "10jt, 100jt, 500jt" },
      { name: "Certainty Threshold", description: "Item ≥ ambang ini 100% inspect", default: "1 M" },
      { name: "Total Tolerable Error", description: "Batas estimasi total salah saji", default: "500 jt" },
      { name: "Alokasi", description: "Neyman (optimal) vs Proportional", default: "Neyman" },
    ],
    output: ["Sample size per stratum (Σ = n_total)", "Certainty stratum 100% inspect", "Daftar SP2D per stratum"],
    sumber: "Cochran W.G. (1977) Sampling Techniques, Bab 5.",
  },
  judgmental: {
    slug: "judgmental",
    name: "Judgmental Sampling",
    code: "JDG",
    tagline: "Auditor cherry-pick item berdasarkan risiko (non-statistical). Wajib disertai rationale profesional.",
    kapan: [
      "Risk-based testing fokus",
      "Populasi terlalu kecil buat statistical sampling",
      "Tujuan deteksi kasus spesifik (fraud lead)",
    ],
    formula: "Tidak ada formula sample size statistik — auditor pilih berdasarkan kriteria.",
    param: [
      { name: "Rationale", description: "WAJIB diisi (min 10 char)", default: "—" },
      { name: "Kriteria", description: "Filter DSL: nilai >= 200jt, regex tgl, contains skpd, dll", default: "—" },
    ],
    output: ["Daftar SP2D yang match kriteria", "Catatan: tidak bisa diproyeksikan ke populasi"],
    catatan: "Pertimbangan profesional wajib terdokumentasi di KKP. Hasil pengujian hanya valid untuk item yang diuji.",
    sumber: "ISA 530 paragraf A19 (non-statistical sampling).",
  },
  attribute: {
    slug: "attribute",
    name: "Attribute Sampling",
    code: "ATR",
    tagline: "Buat test of controls — uji apakah pengendalian dipatuhi atau tidak (binary: deviasi atau tidak).",
    kapan: [
      "Uji kepatuhan SOP / pengendalian",
      "Tujuan: simpulkan tingkat keandalan kontrol",
      "Cocok untuk compliance audit",
    ],
    formula: "Lookup tabel AICPA Appendix A — Table A-1 (95%), A-2 (90%), complementary 99%.\nInput: TDR, EPDR.",
    param: [
      { name: "Confidence Level", description: "10% risk = 90% conf, dll", default: "95% (5% risk)" },
      { name: "Tolerable Deviation Rate", description: "Batas penyimpangan yang bisa diterima", default: "5%" },
      { name: "Expected Deviation Rate", description: "Penyimpangan diharapkan (harus < TDR)", default: "1%" },
    ],
    output: ["Sample size dari tabel AICPA", "Upper Deviation Rate post-test (Poisson approx)"],
    sumber: "AICPA Audit Guide: Audit Sampling (2024 ed.), Appendix A, Tables A-1 / A-2.",
  },
};

export function generateStaticParams() {
  return Object.keys(METODE).map((slug) => ({ slug }));
}

export default async function MetodeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const m = METODE[slug];
  if (!m) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="mb-2 mono text-xs uppercase tracking-wider text-[var(--color-accent)]">
          {m.code}
        </div>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight">{m.name}</h1>
        <p className="text-base text-[var(--color-text-muted)]">{m.tagline}</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Kapan dipake
        </h2>
        <ul className="space-y-1.5 text-sm text-[var(--color-text)]">
          {m.kapan.map((k, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--color-text-subtle)]">·</span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Formula
        </h2>
        <pre className="mono whitespace-pre-wrap rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]">
          {m.formula}
        </pre>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Parameter Input
        </h2>
        <div className="overflow-hidden rounded border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
              <tr>
                <th className="px-3 py-2 font-normal">Param</th>
                <th className="px-3 py-2 font-normal">Deskripsi</th>
                <th className="px-3 py-2 font-normal">Default</th>
              </tr>
            </thead>
            <tbody>
              {m.param.map((p, i) => (
                <tr key={i} className="border-t border-[var(--color-border)]">
                  <td className="mono px-3 py-2 text-[var(--color-text)]">{p.name}</td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">{p.description}</td>
                  <td className="mono px-3 py-2 text-[var(--color-text-muted)]">{p.default}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Output
        </h2>
        <ul className="space-y-1.5 text-sm text-[var(--color-text)]">
          {m.output.map((o, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--color-text-subtle)]">·</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </section>

      {m.catatan && (
        <section className="mb-10 rounded border border-[var(--color-warn)] bg-[var(--color-surface)] p-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--color-warn)]">
            Catatan
          </div>
          <p className="text-sm text-[var(--color-text)]">{m.catatan}</p>
        </section>
      )}

      <section className="mb-10 border-t border-[var(--color-border)] pt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wider text-[var(--color-text-subtle)]">
          Sumber Formula
        </h2>
        <p className="text-xs text-[var(--color-text-muted)]">{m.sumber}</p>
      </section>

      <Link
        href="/express/new"
        className="inline-flex items-center gap-2 rounded border border-[var(--color-accent)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-bg)]"
      >
        Coba metode ini →
      </Link>
    </main>
  );
}
