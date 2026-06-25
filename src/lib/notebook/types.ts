/**
 * Notebook — cell-based audit workflow.
 *
 * Setiap notebook = sequence of cells per langkah audit:
 *   Markdown (notes auditor) → Populasi → Materialitas → Metode →
 *   Sampling → Evaluasi (UML post-fieldwork).
 *
 * Tiap cell punya rationale field wajib (audit defensibility) — auditor
 * dokumentasi WHY langkah dilakukan, bukan cuma WHAT hasilnya.
 *
 * Cell state minimal di sini (markdown content, rationale, collapsed flag).
 * Cell yang reuse data global (Populasi/Metode/Sampling) ngambil state dari
 * useSamplingStore — single source of truth, gak duplikat di notebook.
 */

export type CellType =
  | "markdown"
  | "populasi"
  | "materialitas"
  | "metode"
  | "sampling"
  | "evaluasi";

export type CellStatus = "idle" | "running" | "done" | "error";

export interface BaseCell {
  id: string;
  type: CellType;
  /** Audit defensibility narrative (auditor justifies langkah). */
  rationale: string;
  collapsed: boolean;
  status: CellStatus;
}

export interface MarkdownCell extends BaseCell {
  type: "markdown";
  content: string;
}

export interface PopulasiCell extends BaseCell {
  type: "populasi";
}

export interface MateralitasCell extends BaseCell {
  type: "materialitas";
  basisLabel: string;
  basisValue: number;
  pmPercent: number;
  tmRatioOfPm: number;
}

export interface MetodeCell extends BaseCell {
  type: "metode";
}

export interface SamplingCell extends BaseCell {
  type: "sampling";
}

export interface EvaluasiCell extends BaseCell {
  type: "evaluasi";
}

export type Cell =
  | MarkdownCell
  | PopulasiCell
  | MateralitasCell
  | MetodeCell
  | SamplingCell
  | EvaluasiCell;

export interface Notebook {
  draftId: string;
  cells: Cell[];
  createdAt: string;
  updatedAt: string;
}

/** Default cell stack untuk notebook baru. */
export function buildDefaultNotebook(draftId: string): Notebook {
  const now = new Date().toISOString();
  return {
    draftId,
    cells: [
      mkMarkdown("Catatan Pemeriksaan", "Tulis context entitas, ruang lingkup, dan tujuan pengujian SP2D di sini."),
      mkBase("populasi", "populasi", "Unggah file Excel SP2D dari BPKAD. Catat sumber data, tanggal cut-off, dan completeness check."),
      mkMateralitas(),
      mkBase("metode", "metode", "Pilih asersi audit yang diuji. Tool akan rekomendasiin metode + unit sampling."),
      mkBase("sampling", "sampling", "Jalanin sampling dengan parameter di Express tab. Hasil sampel akan muncul di sini."),
      mkBase("evaluasi", "evaluasi", "Setelah fieldwork: isi audit value tiap SP2D sample yang punya salah saji. UML otomatis dihitung."),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function mkBase(id: string, type: CellType, rationale: string): Cell {
  return {
    id,
    type,
    rationale,
    collapsed: false,
    status: "idle",
  } as Cell;
}

function mkMarkdown(id: string, content: string): MarkdownCell {
  return {
    id,
    type: "markdown",
    content,
    rationale: "",
    collapsed: false,
    status: "idle",
  };
}

function mkMateralitas(): MateralitasCell {
  return {
    id: "materialitas",
    type: "materialitas",
    rationale: "Tentukan Planning Materiality dan Tolerable Misstatement sebelum pilih metode. Reference SPKN BPK + ISA 320.",
    collapsed: false,
    status: "idle",
    basisLabel: "Total Belanja",
    basisValue: 0,
    pmPercent: 0.01,
    tmRatioOfPm: 0.75,
  };
}
