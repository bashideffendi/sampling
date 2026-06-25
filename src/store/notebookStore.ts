"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Cell, Notebook } from "@/lib/notebook/types";
import { buildDefaultNotebook } from "@/lib/notebook/types";
import { uid } from "@/lib/utils";

const NB_KEY = (id: string) => `capcipcup:notebook:${id}`;
const FLUSH_DELAY_MS = 500;

interface NotebookStore {
  notebook: Notebook | null;
  loading: boolean;
  load: (id: string) => Promise<boolean>;
  createNew: () => Notebook;
  save: () => Promise<void>;
  updateCell: (cellId: string, patch: Partial<Cell>) => void;
  toggleCollapse: (cellId: string) => void;
}

// Debounce state for batching IDB writes from updateCell.
// Kept module-scoped (not inside store state) so it doesn't trigger re-renders.
let pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingFlushNotebook: Notebook | null = null;

function scheduleFlush(nb: Notebook) {
  pendingFlushNotebook = nb;
  if (pendingFlushTimer) {
    clearTimeout(pendingFlushTimer);
  }
  pendingFlushTimer = setTimeout(() => {
    const toWrite = pendingFlushNotebook;
    pendingFlushTimer = null;
    pendingFlushNotebook = null;
    if (toWrite) {
      void idbSet(NB_KEY(toWrite.draftId), toWrite);
    }
  }, FLUSH_DELAY_MS);
}

function flushNow() {
  if (pendingFlushTimer) {
    clearTimeout(pendingFlushTimer);
    pendingFlushTimer = null;
  }
  const toWrite = pendingFlushNotebook;
  pendingFlushNotebook = null;
  if (toWrite) {
    void idbSet(NB_KEY(toWrite.draftId), toWrite);
  }
}

export const useNotebookStore = create<NotebookStore>()(
  persist(
    (set, get) => ({
      notebook: null,
      loading: false,
      load: async (id) => {
        set({ loading: true });
        const nb = await idbGet<Notebook>(NB_KEY(id));
        if (nb) {
          set({ notebook: nb, loading: false });
          return true;
        }
        // Notebook ID gak ada di IDB — JANGAN bootstrap default.
        // Caller (notebook page) handle empty state + link ke /notebook/new.
        set({ notebook: null, loading: false });
        return false;
      },
      createNew: () => {
        const fresh = buildDefaultNotebook(uid());
        set({ notebook: fresh });
        void idbSet(NB_KEY(fresh.draftId), fresh);
        return fresh;
      },
      save: async () => {
        const nb = get().notebook;
        if (!nb) return;
        // Cancel pending debounced flush — kita tulis versi final sekarang.
        if (pendingFlushTimer) {
          clearTimeout(pendingFlushTimer);
          pendingFlushTimer = null;
          pendingFlushNotebook = null;
        }
        const stamped = { ...nb, updatedAt: new Date().toISOString() };
        await idbSet(NB_KEY(nb.draftId), stamped);
        set({ notebook: stamped });
      },
      updateCell: (cellId, patch) => {
        const nb = get().notebook;
        if (!nb) return;
        const next: Notebook = {
          ...nb,
          cells: nb.cells.map((c) =>
            c.id === cellId ? ({ ...c, ...patch } as Cell) : c,
          ),
          updatedAt: new Date().toISOString(),
        };
        // State Zustand sync — UI tetap responsif setiap keystroke.
        set({ notebook: next });
        // IDB write di-debounce 500ms — hindari 60Hz write storm.
        scheduleFlush(next);
      },
      toggleCollapse: (cellId) => {
        const nb = get().notebook;
        if (!nb) return;
        const next: Notebook = {
          ...nb,
          cells: nb.cells.map((c) =>
            c.id === cellId ? { ...c, collapsed: !c.collapsed } : c,
          ),
        };
        set({ notebook: next });
        // Collapse = aksi UX penting, flush IMMEDIATE (no debounce).
        // Flush dulu pending edits biar urutan tulis konsisten, lalu tulis state terkini.
        flushNow();
        void idbSet(NB_KEY(next.draftId), next);
      },
    }),
    {
      name: "capcipcup-notebook",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: () => ({}), // pure IDB persist, jangan duplikat di localStorage
    },
  ),
);

export async function deleteNotebook(id: string): Promise<void> {
  // Kalau yang dihapus lagi punya pending flush, batalkan biar gak nulis balik notebook yg udah dihapus.
  if (pendingFlushNotebook && pendingFlushNotebook.draftId === id) {
    if (pendingFlushTimer) {
      clearTimeout(pendingFlushTimer);
      pendingFlushTimer = null;
    }
    pendingFlushNotebook = null;
  }
  await idbDel(NB_KEY(id));
}
