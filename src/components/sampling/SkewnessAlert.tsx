"use client";

import { AlertTriangle } from "lucide-react";
import { formatRupiah } from "@/lib/utils";

interface SkewnessAlertProps {
  cv: number;
  maxOverMedian: number;
  topStratumCount: number;
  topStratumValue: number;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function formatRatio(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function SkewnessAlert({
  cv,
  maxOverMedian,
  topStratumCount,
  topStratumValue,
}: SkewnessAlertProps) {
  const trigger = cv > 2 || maxOverMedian > 100;
  if (!trigger) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded border border-[var(--color-warn,#b8860b)] bg-[var(--color-surface-2)] p-4"
      style={{
        borderColor: "var(--color-warn, #b8860b)",
        backgroundColor: "color-mix(in srgb, var(--color-warn, #b8860b) 8%, var(--color-surface))",
      }}
    >
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0"
        strokeWidth={1.5}
        style={{ color: "var(--color-warn, #b8860b)" }}
      />
      <div className="flex flex-col gap-1.5">
        <h4
          className="serif text-base font-medium tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          Skewness ekstrem terdeteksi
        </h4>
        <p className="text-sm text-[var(--color-text)]">
          Distribusi nilai populasi sangat skewed (CV ={" "}
          <span className="tnum mono">{cv.toFixed(2)}</span>, max/median ={" "}
          <span className="tnum mono">{formatRatio(maxOverMedian)}×</span>).
        </p>
        <p className="text-sm text-[var(--color-text)]">
          <span className="tnum mono text-[var(--color-ink)]">
            {formatNumber(topStratumCount)}
          </span>{" "}
          SP2D dengan nilai ≥ sampling interval (total{" "}
          <span className="tnum mono text-[var(--color-ink)]">
            {formatRupiah(topStratumValue)}
          </span>
          ) akan otomatis diperiksa 100% (top stratum).
        </p>
        <p className="text-sm text-[var(--color-text-muted)]">
          Sample size dihitung untuk sisa populasi.
        </p>
      </div>
    </div>
  );
}

export default SkewnessAlert;
