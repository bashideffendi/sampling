# Cap Cip Cup — Sampling SP2D BPK

Nama project diambil dari permainan anak Indonesia *"cap-cip-cup kembang kuncup"* — pemilihan acak yang dipakai anak-anak buat nentuin giliran. Pas banget sama fungsi sampling random di pemeriksaan.

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
- Zustand (param persist), idb-keyval (draft+populasi cache, key prefix `capcipcup:`)
- SheetJS (parse) + ExcelJS (write)
- Zod + react-hook-form
- TanStack Virtual (render 100k+ row)
- Vitest (formula tests WAJIB)

## Folder
```
src/
├── app/                Next.js routes
├── components/
│   ├── notebook/       Cell types (v0.2)
│   ├── express/        Calculator panels (default UI v0.1)
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

## Branding
- Display wordmark: **"Cap Cip Cup"** (3 kata, Fraunces italic) — editorial premium
- Slug / package: `capcipcup` (lowercase single word)
- Folder: `D:\Claude-Projects\1. Audit\Capcipcup\` (Title Case kompak)
- Repo GitHub: `bashideffendi/sampling` (slug ≠ folder, sesuai konvensi)
- Domain target: `capcipcup.masbash.id` interim
- Tagline: *"Sampling SP2D yang bisa dipertanggungjawabkan."*
- Signature playful line di hero: *"Cap, cip, cup — kembang kuncup. Mana yang nakal?"* — lirik asli + double meaning ("yang nakal" = transaksi anomali yang dicari auditor)

## Status temuan adversarial verify (sudah masuk impl, JANGAN regres)
- Attribute tabel ship 3 (90/95/99), TDR=7% EPDR=1% = 66 (BUKAN 88)
- MUS interval J = TM / RF (TM original, bukan adjusted)
- Stratified pakai Largest Remainder Method (BUKAN Math.ceil per stratum)
- Formula estimasi TOTAL (BUKAN MEAN) — Cochran 1977 eq 5.25
- Risk rule threshold Rp 200jt = Barang/PK/Jasa Lainnya (Jasa Konsultansi = Rp 100jt)
- NPWP: terima 15 ATAU 16 digit (PMK-112/2022)
- Split paket: rolling window SUM 7-day, BUKAN LAG 1 baris

## Desain
**Editorial Institutional Light** — Fraunces serif display + Inter body + JetBrains Mono figures. Palette: warm off-white `#f8f5ee` + paper `#fdfaf3` + navy ink `#0e1a2c` + warm gold accent `#b8842a`. Pattern signature: eyebrow "—— LABEL" gold + mono numbered list `01 · ITEM` + gold pill CTA + hairline tan divider. NO emoji, NO logo BPK (independent tool).

## Gotcha
- Screenshot preview hang di laptop kantor (Iris Xe iGPU) — verify pakai `preview_eval` cek `document.body.innerText` saja.
- `next start` perlu restart setelah rebuild signifikan.
