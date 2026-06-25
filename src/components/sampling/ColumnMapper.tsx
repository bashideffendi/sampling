"use client";

import { useMemo, useState } from "react";
import { Check, AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";
import type {
  Format,
  Granularity,
  ResolvedColumnMapping,
} from "@/lib/parser/canonical-row";
import { CANONICAL_FIELDS_DISPLAY } from "@/lib/parser/header-map";
import type { CanonicalField } from "@/lib/parser/header-map";

interface ColumnMapperProps {
  detection: {
    format: Format;
    confidence: number;
    granularity: Granularity;
    reason?: string;
  };
  headers: string[];
  currentMapping: ResolvedColumnMapping;
  onChange: (mapping: ResolvedColumnMapping) => void;
  onConfirm: () => void;
}

type FieldStatus = "matched" | "fuzzy" | "unmapped";

function confidenceTone(confidence: number): {
  border: string;
  bg: string;
  text: string;
  label: string;
} {
  if (confidence > 0.8) {
    return {
      border: "var(--color-success, #2f855a)",
      bg: "color-mix(in srgb, var(--color-success, #2f855a) 7%, var(--color-surface))",
      text: "var(--color-success, #2f855a)",
      label: "Yakin",
    };
  }
  if (confidence >= 0.5) {
    return {
      border: "var(--color-warn, #b8860b)",
      bg: "color-mix(in srgb, var(--color-warn, #b8860b) 8%, var(--color-surface))",
      text: "var(--color-warn, #b8860b)",
      label: "Periksa kembali",
    };
  }
  return {
    border: "var(--color-danger, #c0392b)",
    bg: "color-mix(in srgb, var(--color-danger, #c0392b) 8%, var(--color-surface))",
    text: "var(--color-danger, #c0392b)",
    label: "Konfirmasi manual diperlukan",
  };
}

function StatusIcon({ status }: { status: FieldStatus }) {
  if (status === "matched") {
    return (
      <Check
        className="h-4 w-4"
        strokeWidth={2}
        style={{ color: "var(--color-success, #2f855a)" }}
        aria-label="matched"
      />
    );
  }
  if (status === "fuzzy") {
    return (
      <AlertTriangle
        className="h-4 w-4"
        strokeWidth={2}
        style={{ color: "var(--color-warn, #b8860b)" }}
        aria-label="fuzzy"
      />
    );
  }
  return (
    <X
      className="h-4 w-4"
      strokeWidth={2}
      style={{ color: "var(--color-danger, #c0392b)" }}
      aria-label="unmapped"
    />
  );
}

function granularityLabel(g: Granularity): string {
  return g === "line_item" ? "Per Baris Akun" : "Per SP2D";
}

export function ColumnMapper({
  detection,
  headers,
  currentMapping,
  onChange,
  onConfirm,
}: ColumnMapperProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = confidenceTone(detection.confidence);
  const confidencePct = Math.round(detection.confidence * 100);

  const fieldEntries = useMemo(
    () =>
      (Object.entries(CANONICAL_FIELDS_DISPLAY) as Array<
        [CanonicalField, { label: string; required: boolean }]
      >).map(([field, meta]) => {
        const colIdx = currentMapping[field];
        const header =
          colIdx !== undefined && colIdx >= 0 && colIdx < headers.length
            ? headers[colIdx]
            : undefined;
        let status: FieldStatus = "unmapped";
        if (header) {
          status = "matched";
        }
        return { field, meta, header, status };
      }),
    [currentMapping, headers],
  );

  const matchedCount = fieldEntries.filter((f) => f.status === "matched").length;
  const requiredUnmapped = fieldEntries.filter(
    (f) => f.meta.required && f.status !== "matched",
  );
  const canConfirm = requiredUnmapped.length === 0;

  function handleFieldChange(field: CanonicalField, value: string) {
    const next: ResolvedColumnMapping = { ...currentMapping };
    if (value === "") {
      delete next[field];
    } else {
      const idx = parseInt(value, 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < headers.length) {
        next[field] = idx;
      } else {
        delete next[field];
      }
    }
    onChange(next);
  }

  function columnLabel(i: number): string {
    // Excel-style column ref (A, B, C, ..., AA, AB, ...) buat disambiguasi
    // kolom-kolom yang header text-nya sama.
    let code = "";
    let n = i;
    do {
      code = String.fromCharCode(65 + (n % 26)) + code;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return code;
  }

  return (
    <section className="flex flex-col gap-4">
      <div
        className="rounded border p-4"
        style={{ borderColor: tone.border, backgroundColor: tone.bg }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className="mono text-[10px] uppercase tracking-[0.22em]"
                style={{ color: tone.text }}
              >
                {tone.label}
              </span>
            </div>
            <h3
              className="serif text-lg font-medium tracking-tight"
              style={{ color: "var(--color-ink)" }}
            >
              Format terdeteksi: {detection.format}{" "}
              <span className="mono tnum text-sm" style={{ color: tone.text }}>
                ({confidencePct}%)
              </span>
            </h3>
            {detection.reason && (
              <p className="text-xs text-[var(--color-text-muted)]">{detection.reason}</p>
            )}
          </div>
          <span
            className="mono rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
            style={{
              borderColor: "var(--color-accent)",
              color: "var(--color-accent)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            {granularityLabel(detection.granularity)}
          </span>
        </div>
      </div>

      <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-[var(--color-surface-2)]"
          aria-expanded={expanded}
        >
          <div className="flex flex-col gap-0.5">
            <span
              className="serif text-base font-medium tracking-tight"
              style={{ color: "var(--color-ink)" }}
            >
              Pemetaan kolom
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              <span className="tnum mono">{matchedCount}</span> dari{" "}
              <span className="tnum mono">{fieldEntries.length}</span> field terpetakan
              {requiredUnmapped.length > 0 && (
                <span style={{ color: "var(--color-danger, #c0392b)" }}>
                  {" "}· {requiredUnmapped.length} field wajib belum diisi
                </span>
              )}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--color-text-muted)]" strokeWidth={1.5} />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" strokeWidth={1.5} />
          )}
        </button>

        {expanded && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {fieldEntries.map(({ field, meta, header, status }) => (
                <li
                  key={field}
                  className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-2 md:w-1/2">
                    <StatusIcon status={status} />
                    <span className="text-sm text-[var(--color-text)]">{meta.label}</span>
                    {meta.required && (
                      <span
                        className="mono text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: "var(--color-danger, #c0392b)" }}
                      >
                        wajib
                      </span>
                    )}
                  </div>
                  <div className="md:w-1/2">
                    <select
                      value={currentMapping[field] !== undefined ? String(currentMapping[field]) : ""}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                    >
                      <option value="">— tidak dipetakan —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={String(i)}>
                          Kol {columnLabel(i)} · {h || "(kosong)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          Pastikan kolom wajib (Nomor SP2D, Tanggal SP2D, Nilai) sudah terpetakan dengan benar
          sebelum lanjut.
        </p>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={onConfirm}
          className="mono rounded-full px-5 py-2 text-xs uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: canConfirm ? "var(--color-accent)" : "var(--color-surface-2)",
            color: canConfirm ? "var(--color-paper, #fff)" : "var(--color-text-muted)",
            border: "1px solid var(--color-accent)",
          }}
        >
          Konfirmasi pemetaan
        </button>
      </div>
    </section>
  );
}

export default ColumnMapper;
