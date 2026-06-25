/**
 * Risk Rules — kategori AKUN.
 *
 * Sinyal risiko berbasis kode_rekening + nilai. Sumber: pola temuan BPK
 * berulang di belanja bansos/hibah/modal/honor (LHP perwakilan 2019-2024).
 *
 * Severity & threshold sengaja konservatif (medium/low) karena ini SINYAL
 * triage, bukan vonis temuan.
 *
 * Adapted v0.3.2: filter signature → Foundation Rule.run pattern.
 */

import type { SP2DRow } from "@/types";
import type { Rule, RuleHit } from "../types";
import {
  isBansosAccount,
  isHibahAccount,
  isHonorAccount,
  isModalAccount,
} from "../kode-rek";

const BANSOS_THRESHOLD = 100_000_000;
const HIBAH_THRESHOLD = 100_000_000;
const MODAL_THRESHOLD = 500_000_000;
const HONOR_DOMINANT_THRESHOLD = 50_000_000;

function honorKey(row: SP2DRow): string | null {
  const vendor = (row.penyedia ?? "").trim().toLowerCase();
  const opd = (row.skpd ?? "").trim().toLowerCase();
  if (!vendor || !opd) return null;
  return `${vendor}||${opd}`;
}

function getHonorAgg(population: SP2DRow[]): Map<string, number> {
  const agg = new Map<string, number>();
  for (const r of population) {
    if (!isHonorAccount(r.kode_rek)) continue;
    const key = honorKey(r);
    if (!key) continue;
    const nilai = Number.isFinite(r.nilai) ? r.nilai : 0;
    if (nilai <= 0) continue;
    agg.set(key, (agg.get(key) ?? 0) + nilai);
  }
  return agg;
}

function mapHits(rows: SP2DRow[], predicate: (row: SP2DRow) => string | null, severity: RuleHit["severity"]): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const row of rows) {
    const reason = predicate(row);
    if (reason) {
      hits.push({ sp2dIdx: row._idx, reason, severity });
    }
  }
  return hits;
}

export const akunRawanBansos: Rule = {
  id: "akun_rawan_bansos",
  category: "akun",
  label: "Belanja Bansos Nilai Besar",
  severity: "medium",
  defaultOn: true,
  description:
    "SP2D belanja bantuan sosial (kode 5.7.xx) dengan nilai di atas Rp 100 juta. Akun rawan temuan BPK terkait penyaluran tidak sesuai sasaran, dokumen pertanggungjawaban tidak lengkap, atau penerima fiktif.",
  run: (ctx) =>
    mapHits(
      ctx.populasi,
      (row) =>
        isBansosAccount(row.kode_rek) && (row.nilai ?? 0) > BANSOS_THRESHOLD
          ? `Bansos (5.7.xx) nilai ${row.nilai.toLocaleString("id-ID")} > Rp 100 jt`
          : null,
      "medium",
    ),
};

export const akunRawanHibah: Rule = {
  id: "akun_rawan_hibah",
  category: "akun",
  label: "Belanja Hibah Nilai Besar",
  severity: "medium",
  defaultOn: true,
  description:
    "SP2D belanja hibah (kode 5.6.xx) dengan nilai di atas Rp 100 juta. Akun rawan temuan terkait NPHD tidak lengkap, penerima tidak memenuhi syarat, atau LPJ terlambat/tidak ada.",
  run: (ctx) =>
    mapHits(
      ctx.populasi,
      (row) =>
        isHibahAccount(row.kode_rek) && (row.nilai ?? 0) > HIBAH_THRESHOLD
          ? `Hibah (5.6.xx) nilai ${row.nilai.toLocaleString("id-ID")} > Rp 100 jt`
          : null,
      "medium",
    ),
};

export const akunRawanModal: Rule = {
  id: "akun_rawan_modal",
  category: "akun",
  label: "Belanja Modal Nilai Besar",
  severity: "medium",
  defaultOn: true,
  description:
    "SP2D belanja modal (kode 5.2.xx atau 5.3.xx) dengan nilai di atas Rp 500 juta. Akun rawan temuan terkait pekerjaan tidak sesuai kontrak, kekurangan volume, atau aset tidak dimanfaatkan.",
  run: (ctx) =>
    mapHits(
      ctx.populasi,
      (row) =>
        isModalAccount(row.kode_rek) && (row.nilai ?? 0) > MODAL_THRESHOLD
          ? `Belanja modal nilai ${row.nilai.toLocaleString("id-ID")} > Rp 500 jt`
          : null,
      "medium",
    ),
};

export const akunHonorDominant: Rule = {
  id: "akun_honor_dominant",
  category: "akun",
  label: "Honor Terkonsentrasi pada Satu Penerima",
  severity: "low",
  defaultOn: true,
  description:
    "Total honorarium (kode 5.1.02.xx) yang diterima satu penerima dari satu OPD dalam populasi di atas Rp 50 juta agregat. Sinyal potensi pemberian honor melampaui batas kewajaran atau rangkap jabatan tim.",
  run: (ctx) => {
    const agg = getHonorAgg(ctx.populasi);
    return mapHits(
      ctx.populasi,
      (row) => {
        if (!isHonorAccount(row.kode_rek)) return null;
        const key = honorKey(row);
        if (!key) return null;
        const total = agg.get(key) ?? 0;
        if (total <= HONOR_DOMINANT_THRESHOLD) return null;
        return `Honor agregat ${total.toLocaleString("id-ID")} dari (${row.penyedia} × ${row.skpd}) > Rp 50 jt`;
      },
      "low",
    );
  },
};

export const AKUN_RULES: Rule[] = [
  akunRawanBansos,
  akunRawanHibah,
  akunRawanModal,
  akunHonorDominant,
];
