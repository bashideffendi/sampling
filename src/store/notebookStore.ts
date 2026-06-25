"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import type { Cell, Notebook } from "@/lib/notebook/types";
import { buildDefaultNotebook } from "@/lib/notebook/types";
import { uid } from "@/lib/utils";

const NB_KEY = (id: string) => `capcipcup:notebook:${id}`;

interface NotebookStore {
  notebook: Notebook | null;
  loading: boolean;
  load: (id: string) => Promise<void>;
  createNew: () => Notebook;
  save: () => Promise<void>;
  updateCell: (cellId: string, patch: Partial<Cell>) => void;
  toggleCollapse: (cellId: string) => void;
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
        } else {
          // First open — bootstrap default notebook with given id.
          const fresh = buildDefaultNotebook(id);
          await idbSet(NB_KEY(id), fresh);
          set({ notebook: fresh, loading: false });
        }
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
        set({ notebook: next });
        void idbSet(NB_KEY(nb.draftId), next);
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
        void idbSet(NB_KEY(nb.draftId), next);
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
  await idbDel(NB_KEY(id));
}
