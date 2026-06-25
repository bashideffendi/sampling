"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type {
  SP2DRow,
  PopulasiMeta,
  SamplingMethod,
  MUSParam,
  SRSParam,
  StratifiedParam,
  JudgmentalParam,
  AttributeParam,
  SamplingResult,
} from "@/types";
import type {
  CanonicalSP2DRow,
  BreakdownAkunRow,
  ParseWarning,
  ResolvedColumnMapping,
} from "@/lib/parser/canonical-row";
import type { FingerprintResult } from "@/lib/parser/canonical-row";
import { uid } from "@/lib/utils";

export interface ParseExtras {
  breakdown: BreakdownAkunRow[];
  populasiKoreksi: CanonicalSP2DRow[];
  warnings: ParseWarning[];
  fingerprint: FingerprintResult | null;
  /** Header labels (raw string) dari row deteksi — buat ColumnMapper UI. */
  headers: string[];
  /** Resolved mapping canonical→column index — buat ColumnMapper UI. */
  mapping: ResolvedColumnMapping;
}

interface DraftMeta {
  draftId: string;
  entitas: string;
  tahun: number;
  rationale: string;
  createdAt: string;
}

interface MethodParams {
  mus: MUSParam;
  srs: SRSParam;
  stratified: StratifiedParam;
  judgmental: JudgmentalParam;
  attribute: AttributeParam;
}

const DEFAULT_PARAMS: MethodParams = {
  mus: {
    bookValue: 0,
    tolerableMisstatement: 500_000_000,
    expectedMisstatement: 0,
    confidenceLevel: 0.95,
    seed: 42,
    includeNegativeAs100Pct: true,
  },
  srs: {
    populationSize: 0,
    confidenceLevel: 0.95,
    expectedDeviation: 0.01,
    tolerableDeviation: 0.05,
    seed: 42,
  },
  stratified: {
    strataBoundaries: [10_000_000, 100_000_000, 500_000_000],
    certaintyThreshold: 1_000_000_000,
    totalTolerableError: 500_000_000,
    confidenceLevel: 0.95,
    allocation: "neyman",
    seed: 42,
  },
  judgmental: {
    rationale: "",
    seed: 42,
    criteria: [
      {
        id: "near_pl",
        label: "Mendekati Batas PL Rp 200jt",
        filter: "nilai >= 180000000 && nilai <= 200000000",
        enabled: true,
      },
      {
        id: "year_end",
        label: "Cair Akhir Desember",
        filter: 'tgl_sp2d regex "^\\d{4}-12-(2[5-9]|3[01])"',
        enabled: true,
      },
      {
        id: "high_value",
        label: "Nilai > Rp 1 M",
        filter: "nilai >= 1000000000",
        enabled: false,
      },
    ],
  },
  attribute: {
    populationSize: 0,
    confidenceLevel: 0.95,
    tolerableDeviationRate: 0.05,
    expectedDeviationRate: 0.01,
    seed: 42,
  },
};

interface SamplingStore {
  draftId: string;
  draftMeta: DraftMeta;
  setDraftMeta: (m: Partial<DraftMeta>) => void;
  resetDraft: () => void;

  populasi: SP2DRow[] | null;
  populasiMeta: PopulasiMeta | null;
  parseExtras: ParseExtras | null;
  setPopulasi: (rows: SP2DRow[], meta: PopulasiMeta, extras?: ParseExtras) => Promise<void>;
  loadPopulasiFromCache: () => Promise<void>;
  clearPopulasi: () => Promise<void>;

  method: SamplingMethod;
  setMethod: (m: SamplingMethod) => void;

  params: MethodParams;
  setParam: <K extends SamplingMethod>(method: K, param: Partial<MethodParams[K]>) => void;

  result: SamplingResult | null;
  setResult: (r: SamplingResult | null) => void;
}

const initialDraftMeta = (): DraftMeta => ({
  draftId: uid(),
  entitas: "",
  tahun: new Date().getFullYear(),
  rationale: "",
  createdAt: new Date().toISOString(),
});

const POPULASI_KEY = (id: string) => `capcipcup:populasi:${id}`;
const META_KEY = (id: string) => `capcipcup:populasi-meta:${id}`;
const EXTRAS_KEY = (id: string) => `capcipcup:parse-extras:${id}`;

export const useSamplingStore = create<SamplingStore>()(
  persist(
    (set, get) => ({
      draftId: "",
      draftMeta: initialDraftMeta(),
      setDraftMeta: (m) =>
        set((s) => ({ draftMeta: { ...s.draftMeta, ...m } })),
      resetDraft: () => {
        const fresh = initialDraftMeta();
        set({
          draftId: fresh.draftId,
          draftMeta: fresh,
          populasi: null,
          populasiMeta: null,
          parseExtras: null,
          result: null,
          params: DEFAULT_PARAMS,
        });
      },

      populasi: null,
      populasiMeta: null,
      parseExtras: null,
      setPopulasi: async (rows, meta, extras) => {
        const id = get().draftMeta.draftId;
        await idbSet(POPULASI_KEY(id), rows);
        await idbSet(META_KEY(id), meta);
        if (extras) {
          await idbSet(EXTRAS_KEY(id), extras);
        } else {
          await idbDel(EXTRAS_KEY(id));
        }
        // Guard: cuma overwrite bookValue/populationSize kalau user belum
        // pernah edit (masih sama dengan default 0). Audit recommendation —
        // sebelumnya overwrite tanpa syarat = ngilangin custom user value.
        const cur = get().params;
        set({
          populasi: rows,
          populasiMeta: meta,
          parseExtras: extras ?? null,
          params: {
            ...cur,
            mus: { ...cur.mus, bookValue: cur.mus.bookValue === 0 ? meta.totalNilai : cur.mus.bookValue },
            srs: { ...cur.srs, populationSize: cur.srs.populationSize === 0 ? meta.count : cur.srs.populationSize },
            attribute: {
              ...cur.attribute,
              populationSize: cur.attribute.populationSize === 0 ? meta.count : cur.attribute.populationSize,
            },
          },
        });
      },
      loadPopulasiFromCache: async () => {
        const id = get().draftMeta.draftId;
        const rows = await idbGet<SP2DRow[]>(POPULASI_KEY(id));
        const meta = await idbGet<PopulasiMeta>(META_KEY(id));
        const extras = await idbGet<ParseExtras>(EXTRAS_KEY(id));
        if (rows && meta) {
          set({ populasi: rows, populasiMeta: meta, parseExtras: extras ?? null });
        }
      },
      clearPopulasi: async () => {
        const id = get().draftMeta.draftId;
        await idbDel(POPULASI_KEY(id));
        await idbDel(META_KEY(id));
        await idbDel(EXTRAS_KEY(id));
        set({ populasi: null, populasiMeta: null, parseExtras: null, result: null });
      },

      method: "mus",
      setMethod: (m) => set({ method: m }),

      params: DEFAULT_PARAMS,
      setParam: (method, param) =>
        set((s) => ({
          params: { ...s.params, [method]: { ...s.params[method], ...param } },
        })),

      result: null,
      setResult: (r) => set({ result: r }),
    }),
    {
      name: "capcipcup-sampling",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Only persist params + meta, not populasi (yang besar, di IndexedDB).
      partialize: (s) => ({
        draftId: s.draftId,
        draftMeta: s.draftMeta,
        method: s.method,
        params: s.params,
      }),
      migrate: (persistedState, version) => {
        // v1 → v2: parseExtras moved to IDB, no params change needed here.
        // Defensive: reset params kalau versi lama supaya tidak ada shape lama nyangkut.
        if (version < 2) {
          return {
            ...(persistedState as Record<string, unknown>),
            params: DEFAULT_PARAMS,
          };
        }
        return persistedState as Record<string, unknown>;
      },
    },
  ),
);
