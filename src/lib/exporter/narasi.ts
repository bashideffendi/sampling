/**
 * Template narasi metodologi sampling siap-paste ke KKP / PKP.
 * Bahasa pemeriksaan formal pasif ala BPK.
 */

import type { SamplingResult, PopulasiMeta } from "@/types";
import { formatRupiah } from "@/lib/utils";

interface NarasiOpts {
  entitas?: string;
  tahun?: number;
}

export function narasiMetodologi(
  result: SamplingResult,
  populasi: PopulasiMeta,
  opts: NarasiOpts = {},
): string {
  switch (result.method) {
    case "mus":
      return mus(result, populasi, opts);
    case "srs":
      return srs(result, populasi, opts);
    case "stratified":
      return stratified(result, populasi, opts);
    case "judgmental":
      return judgmental(result, populasi, opts);
    case "attribute":
      return attribute(result, populasi, opts);
    case "classical":
      return classical(result, populasi, opts);
    case "discovery":
      return discovery(result, populasi, opts);
  }
}

function classical(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as { confidenceLevel: number; estimator: string; expectedStdev: number; tolerableMisstatement: number; expectedMisstatement: number; allowanceFraction: number };
  const conf = (param.confidenceLevel * 100).toFixed(0);
  return [
    header(opts),
    "",
    `Pengujian substantive atas ${"{akun_belanja}"} TA ${opts.tahun ?? "{tahun}"} dilakukan dengan metode Classical Variables Sampling (${param.estimator.toUpperCase()}). Populasi: ${p.count.toLocaleString("id-ID")} dokumen SP2D senilai ${formatRupiah(p.totalNilai)}.`,
    "",
    `Parameter: tingkat keyakinan ${conf}%, expected standard deviation σ = ${formatRupiah(param.expectedStdev)}, Tolerable Misstatement ${formatRupiah(param.tolerableMisstatement)}, Expected Misstatement ${formatRupiah(param.expectedMisstatement)}, allowance fraction ${param.allowanceFraction}.`,
    "",
    `Sample size dihitung dengan formula n = (Z × σ × N / A)² + FPC, dengan planned precision A = (TM − EM) × (1 − allowance) — bukan A = TM langsung. Hasil: ${r.sampleSize} SP2D dipilih acak menggunakan PRNG mulberry32 (seed: ${r.seed}).`,
    "",
    `Hash SHA-256 populasi: ${p.hashSha256.slice(0, 16)}…`,
  ].join("\n");
}

function discovery(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as { confidenceLevel: number; expectedOccurrenceRate: number };
  const conf = (param.confidenceLevel * 100).toFixed(0);
  return [
    header(opts),
    "",
    `Pengujian indikasi salah saji material/fraud atas SP2D ${opts.entitas ?? "{entitas}"} TA ${opts.tahun ?? "{tahun}"} dilakukan dengan metode Discovery Sampling. Populasi: ${p.count.toLocaleString("id-ID")} dokumen.`,
    "",
    `Parameter zero-defect: tingkat keyakinan ${conf}% (α = ${(1 - param.confidenceLevel).toFixed(3)}), expected occurrence rate p = ${(param.expectedOccurrenceRate * 100).toFixed(2)}%.`,
    "",
    `Sample size dihitung dengan formula Poisson approximation: n = ⌈ln(α) / ln(1 − p)⌉. Hasil: ${r.sampleSize} SP2D dipilih acak menggunakan PRNG mulberry32 (seed: ${r.seed}).`,
    "",
    `Kesimpulan: jika sampel pengujian menemukan ≥1 occurrence, indikasi ada fraud/salah saji material; auditor wajib expand sample. Jika 0 occurrence, dapat disimpulkan dengan confidence ${conf}% bahwa occurrence rate populasi < ${(param.expectedOccurrenceRate * 100).toFixed(2)}%.`,
    "",
    `Hash SHA-256 populasi: ${p.hashSha256.slice(0, 16)}…`,
  ].join("\n");
}

function header(opts: NarasiOpts): string {
  const ent = opts.entitas ?? "Entitas";
  const ta = opts.tahun ? ` TA ${opts.tahun}` : "";
  return `Pengujian atas SP2D Pemerintah ${ent}${ta} dilakukan sebagai berikut.`;
}

function mus(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as {
    bookValue: number;
    tolerableMisstatement: number;
    expectedMisstatement: number;
    confidenceLevel: number;
  };
  const conf = (param.confidenceLevel * 100).toFixed(0);
  return [
    header(opts),
    "",
    `Pemilihan sampel dilakukan dengan metode Monetary Unit Sampling (MUS). Populasi terdiri dari ${p.count.toLocaleString("id-ID")} dokumen SP2D dengan nilai total ${formatRupiah(p.totalNilai)} (hash SHA-256 populasi: ${p.hashSha256.slice(0, 16)}…).`,
    "",
    `Parameter perencanaan: tingkat keyakinan ${conf}%, Tolerable Misstatement ${formatRupiah(param.tolerableMisstatement)}, Expected Misstatement ${formatRupiah(param.expectedMisstatement)}. Reliability Factor (RF) = ${r.reliabilityFactor?.toFixed(2)} (sumber: ${r.rfSource ?? "AICPA Audit Guide"}).`,
    "",
    `Berdasarkan formula n = ceil(BV × RF / (TM − EF × EM)), diperoleh sample size sebanyak ${r.sampleSize} SP2D dengan sampling interval J = ${formatRupiah(r.selectionInterval ?? 0)}. Item dengan nilai ≥ J ditetapkan sebagai top stratum (${r.topStratumCount} SP2D senilai ${formatRupiah(r.topStratumNilai ?? 0)}) dan diuji 100%.`,
    "",
    `Pemilihan pool dilakukan secara systematic PPS menggunakan PRNG mulberry32 dengan seed ${r.seed}. Sampel dapat direproduksi penuh melalui bundle JSON terlampir. Daftar SP2D terpilih tersaji pada sheet "Daftar Sampel".`,
  ].join("\n");
}

function srs(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as { confidenceLevel: number; expectedDeviation: number; tolerableDeviation: number };
  const conf = (param.confidenceLevel * 100).toFixed(0);
  return [
    header(opts),
    "",
    `Pemilihan sampel dilakukan dengan metode Simple Random Sampling. Populasi terdiri dari ${p.count.toLocaleString("id-ID")} dokumen SP2D senilai ${formatRupiah(p.totalNilai)}.`,
    "",
    `Parameter: tingkat keyakinan ${conf}%, expected deviation ${(param.expectedDeviation * 100).toFixed(2)}%, tolerable deviation ${(param.tolerableDeviation * 100).toFixed(2)}%. Sample size dihitung dengan formula Normal-approximation n = (Z² × p × (1−p)) / E² disertai Finite Population Correction.`,
    "",
    `Hasil: sample size sebanyak ${r.sampleSize} SP2D. Pemilihan acak menggunakan PRNG mulberry32 deterministik (seed: ${r.seed}), sehingga sampel dapat direplikasi dengan memuat bundle JSON terlampir. Hash SHA-256 populasi: ${p.hashSha256.slice(0, 16)}…`,
  ].join("\n");
}

function stratified(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as { strataBoundaries: number[]; allocation: string; confidenceLevel: number; totalTolerableError: number };
  const conf = (param.confidenceLevel * 100).toFixed(0);
  const k = param.strataBoundaries.length + 1;
  return [
    header(opts),
    "",
    `Pemilihan sampel dilakukan dengan metode Stratified Random Sampling pada ${k} stratum, disusun berdasarkan distribusi nilai SP2D. Populasi: ${p.count.toLocaleString("id-ID")} dokumen, total ${formatRupiah(p.totalNilai)}.`,
    "",
    `Item dengan nilai ≥ certainty threshold dikelompokkan sebagai stratum kepastian (${r.topStratumCount} SP2D, ${formatRupiah(r.topStratumNilai ?? 0)}) dan diuji 100%.`,
    "",
    `Parameter: tingkat keyakinan ${conf}%, Total Tolerable Error ${formatRupiah(param.totalTolerableError)}. Sample size dihitung dengan formula Cochran (1977) untuk estimasi total: n = (Σ N_h × S_h)² / (V + Σ N_h × S_h²). Alokasi sampel per stratum menggunakan metode ${param.allocation === "neyman" ? "Neyman optimal" : "proportional"} dengan Largest Remainder Method.`,
    "",
    `Hasil: ${r.sampleSize} SP2D. Pemilihan acak per stratum menggunakan PRNG mulberry32 (seed: ${r.seed}). Hash populasi: ${p.hashSha256.slice(0, 16)}…`,
  ].join("\n");
}

function judgmental(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as { rationale: string; criteria: Array<{ label: string; enabled: boolean }> };
  const active = param.criteria.filter((c) => c.enabled).map((c) => c.label).join("; ");
  return [
    header(opts),
    "",
    `Pemilihan sampel dilakukan dengan metode Judgmental (Non-Statistical) Sampling. Populasi: ${p.count.toLocaleString("id-ID")} dokumen SP2D senilai ${formatRupiah(p.totalNilai)}.`,
    "",
    `Pertimbangan profesional: ${param.rationale}`,
    "",
    `Kriteria pemilihan: ${active}.`,
    "",
    `Hasil: ${r.sampleSize} SP2D terpilih sebagai sampel pengujian.`,
    "",
    `Catatan: Hasil pengujian sampel judgmental TIDAK dapat diproyeksikan secara statistik ke populasi. Kesimpulan hanya berlaku untuk item yang diuji. Pertimbangan profesional auditor terdokumentasi dalam Kertas Kerja Pemeriksaan.`,
  ].join("\n");
}

function attribute(r: SamplingResult, p: PopulasiMeta, opts: NarasiOpts): string {
  const param = r.param as { confidenceLevel: number; tolerableDeviationRate: number; expectedDeviationRate: number };
  const conf = (param.confidenceLevel * 100).toFixed(0);
  return [
    header(opts),
    "",
    `Pengujian Sistem Pengendalian Intern atas SP2D dilakukan dengan metode Attribute Sampling. Populasi: ${p.count.toLocaleString("id-ID")} dokumen.`,
    "",
    `Parameter: risk of overreliance ${(100 - parseInt(conf)).toString()}% (tingkat keyakinan ${conf}%), Tolerable Deviation Rate ${(param.tolerableDeviationRate * 100).toFixed(2)}%, Expected Population Deviation Rate ${(param.expectedDeviationRate * 100).toFixed(2)}%. Sample size diperoleh dari ${r.rfSource ?? "AICPA Audit Guide Appendix A"}, sebanyak ${r.sampleSize} item.`,
    "",
    `Pemilihan acak menggunakan PRNG mulberry32 dengan seed ${r.seed}. Hash SHA-256 populasi: ${p.hashSha256.slice(0, 16)}…`,
  ].join("\n");
}
