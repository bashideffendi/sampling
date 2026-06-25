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
  classical: {
    slug: "classical",
    name: "Classical Variables Sampling",
    code: "CV",
    tagline: "Estimasi nilai populasi dari sampel — Mean-per-Unit, Ratio, atau Difference estimator.",
    kapan: [
      "Substantive test atas nilai dengan estimasi populasi",
      "Populasi cukup homogen (σ tidak ekstrem)",
      "Alternatif MUS kalau auditor butuh confidence interval estimasi total",
    ],
    formula: "n = (Z × σ × N / A)² dengan FPC adjustment\nA = (TM − EM) × (1 − allowanceFraction)",
    param: [
      { name: "Estimator", description: "MPU / Ratio / Difference", default: "MPU" },
      { name: "Expected Std Dev", description: "σ populasi (dari pilot)", default: "harus auditor estimate" },
      { name: "Tolerable Misstatement", description: "Batas atas salah saji", default: "50-75% PM" },
      { name: "Expected Misstatement", description: "Ekspektasi salah saji", default: "0 atau dari historical" },
      { name: "Allowance Fraction", description: "Buat planned precision A", default: "0.5-0.7" },
    ],
    output: ["Sample size (FPC adjusted)", "Daftar SP2D acak terpilih"],
    catatan: "KOREKSI audit: planned precision A < (TM − EM). JANGAN A = TM langsung — under-sampling parah, gak detect material misstatement di confidence claim. v0.3.6 ship MPU formula only; Ratio/Difference projection defer ke v0.4 (butuh pilot data).",
    sumber: "AICPA Audit Guide: Audit Sampling (2024 ed.), Classical Variables Sampling.",
  },
  discovery: {
    slug: "discovery",
    name: "Discovery Sampling",
    code: "DSC",
    tagline: "Zero-defect tolerance — deteksi minimal 1 occurrence dengan confidence tertentu. Buat fraud detection.",
    kapan: [
      "Pengujian indikasi fraud / kecurangan",
      "Pengujian kontrol kritikal (zero defect required)",
      "Compliance dengan tolerable deviation = 0",
    ],
    formula: "n = ceil(ln(α) / ln(1 − p))\nα = 1 − confidence, p = expected occurrence rate",
    param: [
      { name: "Confidence Level", description: "Tingkat keyakinan deteksi", default: "95%" },
      { name: "Expected Occurrence Rate", description: "p baseline (mis. 0.005 = 0.5%)", default: "0.5% (fraud baseline)" },
    ],
    output: ["Sample size (Poisson approximation)", "Daftar SP2D acak terpilih"],
    catatan: "Edge case: p sangat kecil → n bisa sangat besar (asymptotic). Kalau n ≥ 50% populasi, app kasih warning — pertimbangkan substantive test biasa.",
    sumber: "AICPA Audit Guide: Audit Sampling, Discovery Sampling chapter.",
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
    <main className="mx-auto max-w-3xl px-8 pb-24 pt-12">
      <header className="mb-14">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="h-4 w-4" /> Beranda
        </Link>
        <div className="mb-5 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-[var(--color-accent)]">
          <span className="h-px w-8 bg-[var(--color-accent)]" />
          {m.code}
        </div>
        <h1 className="serif mb-6 text-5xl font-medium leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]">
          {m.name}
        </h1>
        <p className="text-lg leading-relaxed text-[var(--color-text-muted)]">{m.tagline}</p>
      </header>

      <Section title="Kapan dipakai">
        <ul className="space-y-2 text-base leading-relaxed text-[var(--color-text)]">
          {m.kapan.map((k, i) => (
            <li key={i} className="flex gap-3">
              <span className="mono text-xs text-[var(--color-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Formula">
        <pre className="mono whitespace-pre-wrap rounded-[2px] border border-[var(--color-border)] bg-[var(--color-paper)] p-6 text-sm leading-relaxed text-[var(--color-ink)]">
          {m.formula}
        </pre>
      </Section>

      <Section title="Parameter input">
        <div className="overflow-hidden rounded-[2px] border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
              <tr>
                <th className="px-4 py-3 font-medium">Param</th>
                <th className="px-4 py-3 font-medium">Deskripsi</th>
                <th className="px-4 py-3 font-medium">Default</th>
              </tr>
            </thead>
            <tbody>
              {m.param.map((p, i) => (
                <tr key={i} className="border-t border-[var(--color-hairline)] bg-[var(--color-paper)]">
                  <td className="mono px-4 py-3 text-[var(--color-ink)]">{p.name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.description}</td>
                  <td className="mono px-4 py-3 text-[var(--color-text-muted)]">{p.default}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Output">
        <ul className="space-y-2 text-base leading-relaxed text-[var(--color-text)]">
          {m.output.map((o, i) => (
            <li key={i} className="flex gap-3">
              <span className="mono text-xs text-[var(--color-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </Section>

      {m.catatan && (
        <section className="mb-12 rounded-[2px] border-l-2 border-[var(--color-accent)] bg-[var(--color-paper)] px-6 py-5">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Catatan
          </div>
          <p className="text-base leading-relaxed text-[var(--color-text)]">{m.catatan}</p>
        </section>
      )}

      <section className="mb-14 border-t border-[var(--color-border)] pt-6">
        <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
          Sumber formula
        </div>
        <p className="serif text-base italic leading-relaxed text-[var(--color-text-muted)]">
          {m.sumber}
        </p>
      </section>

      <Link
        href="/express/new"
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-6 py-3 text-sm font-medium text-[var(--color-paper)] transition hover:bg-[var(--color-accent-ink)] hover:border-[var(--color-accent-ink)]"
      >
        Coba metode ini →
      </Link>
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
