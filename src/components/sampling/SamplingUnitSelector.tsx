"use client";

import { useState } from "react";

export type AssertionKey =
  | "existence"
  | "completeness"
  | "valuation"
  | "classification"
  | "cutoff"
  | "compliance";

export type SamplingUnit = "per_sp2d" | "per_baris_akun";
export type SamplingMethod = "mus" | "srs" | "stratified" | "judgmental" | "attribute";

interface AssertionMeta {
  key: AssertionKey;
  title: string;
  subtitle: string;
  description: string;
  unit: SamplingUnit;
  method: SamplingMethod;
  hintLabel: string;
}

const METHOD_LABEL: Record<SamplingMethod, string> = {
  mus: "MUS",
  srs: "SRS",
  stratified: "Stratified",
  judgmental: "Judgmental",
  attribute: "Attribute",
};

const UNIT_LABEL: Record<SamplingUnit, string> = {
  per_sp2d: "Per SP2D",
  per_baris_akun: "Per Baris Akun",
};

const ASSERTIONS: AssertionMeta[] = [
  {
    key: "existence",
    title: "Existence / Occurrence",
    subtitle: "Memastikan pengeluaran SP2D benar-benar terjadi dan didukung bukti yang sah.",
    description:
      "Dipakai ketika menguji bahwa transaksi yang dicatat memang terjadi (overstatement) — misal verifikasi BAST, kwitansi, atau bukti serah-terima.",
    unit: "per_sp2d",
    method: "mus",
    hintLabel: "Saran: Per SP2D · MUS",
  },
  {
    key: "completeness",
    title: "Completeness",
    subtitle: "Memastikan seluruh transaksi yang seharusnya dicatat sudah tercatat (understatement).",
    description:
      "Dipakai untuk menelusuri populasi secara representatif tanpa skew terhadap nilai besar — misal cek apakah seluruh kontrak/BAST sudah ter-SP2D-kan.",
    unit: "per_sp2d",
    method: "srs",
    hintLabel: "Saran: Per SP2D · SRS",
  },
  {
    key: "valuation",
    title: "Valuation / Accuracy",
    subtitle: "Menguji ketepatan nilai realisasi per akun (partial tainting wajib).",
    description:
      "Pengujian akurasi nilai per baris akun: kelebihan bayar, salah hitung pajak, atau ketidaksesuaian harga. Unit ditarik per baris realisasi.",
    unit: "per_baris_akun",
    method: "mus",
    hintLabel: "Saran: Per Baris Akun · MUS",
  },
  {
    key: "classification",
    title: "Classification",
    subtitle: "Menguji ketepatan klasifikasi akun belanja sesuai BAS/SAP.",
    description:
      "Dipakai untuk menguji apakah belanja dimasukkan pada akun yang tepat (mis. modal vs barang/jasa). Unit terkecil = baris akun.",
    unit: "per_baris_akun",
    method: "attribute",
    hintLabel: "Saran: Per Baris Akun · Attribute",
  },
  {
    key: "cutoff",
    title: "Cutoff",
    subtitle: "Menguji ketepatan periode pengakuan belanja menjelang tutup tahun.",
    description:
      "Fokus pada SP2D di sekitar 31 Desember — perlu stratifikasi berdasarkan periode/tanggal untuk memastikan transaksi diakui pada tahun yang tepat.",
    unit: "per_sp2d",
    method: "stratified",
    hintLabel: "Saran: Per SP2D · Stratified",
  },
  {
    key: "compliance",
    title: "Compliance — Pengadaan",
    subtitle: "Menguji kepatuhan pelaksanaan pengadaan barang/jasa terhadap regulasi.",
    description:
      "Sampling kepatuhan pengadaan menggunakan judgmental + filter (nilai tertentu, paket spesifik). Pendekatan Per Kontrak ditiadakan — pengujian dilakukan langsung di level SP2D yang relevan.",
    unit: "per_sp2d",
    method: "judgmental",
    hintLabel: "Saran: Per SP2D · Judgmental",
  },
];

function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

interface SamplingUnitSelectorProps {
  onSelect: (
    assertion: AssertionKey,
    suggested: { unit: SamplingUnit; method: SamplingMethod },
  ) => void;
  populasiCount: number;
  uniqueSp2dCount: number;
}

export function SamplingUnitSelector({
  onSelect,
  populasiCount,
  uniqueSp2dCount,
}: SamplingUnitSelectorProps) {
  const [active, setActive] = useState<AssertionKey | null>(null);

  const activeMeta = active ? ASSERTIONS.find((a) => a.key === active) ?? null : null;

  function handleSelect(meta: AssertionMeta) {
    setActive(meta.key);
    onSelect(meta.key, { unit: meta.unit, method: meta.method });
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="serif text-2xl font-medium tracking-tight text-[var(--color-ink)]">
          Pilih asersi yang diuji
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Asersi audit menentukan unit sampling yang tepat. Pilih satu di bawah untuk
          mendapatkan saran metode dan unit secara otomatis.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ASSERTIONS.map((a) => {
          const isActive = active === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => handleSelect(a)}
              aria-pressed={isActive}
              className={`group relative flex flex-col gap-2 rounded border bg-[var(--color-surface)] p-4 text-left transition ${
                isActive
                  ? "border-[var(--color-accent)] border-l-2 bg-[var(--color-surface-2)] shadow-sm"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3
                  className={`serif text-lg font-medium tracking-tight ${
                    isActive ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]"
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  {a.title}
                </h3>
                <span
                  className={`mono shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] ${
                    isActive
                      ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-text-subtle)]"
                  }`}
                >
                  {METHOD_LABEL[a.method]}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)]">{a.subtitle}</p>
              <p className="text-xs leading-relaxed text-[var(--color-text-subtle)]">
                {a.description}
              </p>
              <div
                className={`mono mt-1 text-xs tracking-wide ${
                  isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"
                }`}
              >
                {"→"} {a.hintLabel}
              </div>
            </button>
          );
        })}
      </div>

      {activeMeta && (
        <div className="rounded border-l-2 border border-[var(--color-accent)] bg-[var(--color-surface)] p-4">
          <div className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Konfigurasi yang disarankan
          </div>
          <p className="mt-2 text-sm text-[var(--color-text)]">
            Populasi{" "}
            <span className="tnum mono text-[var(--color-ink)]">
              {formatNumber(populasiCount)}
            </span>{" "}
            baris {"→"}{" "}
            <span className="tnum mono text-[var(--color-ink)]">
              {formatNumber(uniqueSp2dCount)}
            </span>{" "}
            SP2D unik. Default sampling unit:{" "}
            <span className="mono text-[var(--color-ink)]">{UNIT_LABEL[activeMeta.unit]}</span>
            {" "}· Metode{" "}
            <span className="mono text-[var(--color-ink)]">{METHOD_LABEL[activeMeta.method]}</span>.
          </p>
          {activeMeta.unit === "per_baris_akun" && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Catatan: pengujian per baris akun memerlukan kolom kode rekening dan nilai
              realisasi per baris pada berkas populasi.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default SamplingUnitSelector;
