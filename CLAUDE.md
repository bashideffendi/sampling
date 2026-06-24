# Cuplik — Sampling SP2D BPK

Web app sampling pemeriksaan SP2D buat auditor BPK RI. Client-only (data SP2D **gak pernah** ke server). 5 metode statistik + risk helper. Output Excel + JSON seed bundle reproducibility.

## Aturan kerja

- **JANGAN `npm run dev`** — laptop 12 GB pernah crash. Verifikasi pakai `pnpm build`.
- pnpm (corepack). Konsisten portfolio.
- Tailwind 4 (CSS-only config di `globals.css` `@theme`). Gak ada `tailwind.config.js`.
- **PRNG wajib seeded** (mulberry32). JANGAN `Math.random` di sampling code — reproducibility = defensibility.
- **Formula audit wajib unit-tested** (Vitest) sebelum merge. Sumber RF: AICPA Audit Guide Sampling.

## Stack
- Next.js 16 App Router + React 19, TS strict
- Tailwind 4 + lucide-react + sonner
- Zustand (param persist), idb-keyval (draft+populasi cache)
- SheetJS (parse) + ExcelJS (write)
- Zod + react-hook-form
- TanStack Virtual (render 100k+ row)
- Vitest (formula tests WAJIB)

## Folder
```
src/
├── app/                Next.js routes
├── components/
│   ├── notebook/       Cell types
│   ├── express/        Calculator panels
│   └── shared/         Upload, mapper, table
├── lib/
│   ├── sampling/       5 metode (formula verified vs AICPA)
│   ├── prng/           mulberry32 seeded
│   ├── parser/         Excel SIPD/SIMDA detect
│   ├── exporter/       Excel + JSON seed bundle
│   └── risk/           Rule engine (v1)
├── store/              Zustand slices
├── types/              SP2DRow, SampleResult, etc
└── workers/            Web worker (parse + sampling)
```

## Status temuan adversarial verify (HARUS dipenuhi)

Formula koreksi yg sudah masuk impl:
- Attribute: ship 3 tabel AICPA (90/95/99), JANGAN hardcode 95
- AICPA TDR=7% EPDR=1% → n=77 (bukan 88)
- Classical Variables MPU: planned precision A = 0.5–0.7 × TM (BUKAN E=TM)
- Stratified Neyman: **largest remainder method** (bukan `Math.ceil` per stratum)
- Eksplisit bedain formula estimasi TOTAL vs MEAN
- UDR Poisson = approximation (kasih disclaimer)

Risk rules (v1):
- Threshold Rp 200jt = Barang/PK/Jasa Lainnya (Jasa Konsultansi = Rp 100jt)
- Hapus klaim Perpres untuk Rp 50jt — rename "Mendekati Batas SPK/Kuitansi"
- NPWP: terima 15 ATAU 16 digit (PMK-112/2022)
- Split paket: rolling window SUM 7-day (BUKAN LAG 1 baris)
- Round number rule: exclude akun 56xx/57xx/honor/perjadin
- Vendor repeat: naikkan threshold + tambah filter kategori
- 5 rule wajib v1: duplicate_payment, identical_amount, gap_nomor_sp2d, nilai_exceed_pagu, vendor_not_in_master
- Benford: opt-in, populasi ≥1000, exclude gaji/honor/threshold-regulasi

## Domain
`cuplik.masbash.id` interim → `cuplik.id` later
