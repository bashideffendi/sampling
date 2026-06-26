"use client";

import Link from "next/link";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { useSamplingStore } from "@/store/samplingStore";
import { ALL_RULES } from "@/lib/risk";

/**
 * Banner kecil di halaman Express — muncul setelah populasi termuat.
 * Mengarahkan auditor buat cek 40 anomali rules sebelum/setelah sampling.
 */
export function RiskHelperLink() {
  const populasi = useSamplingStore((s) => s.populasi);
  const riskReport = useSamplingStore((s) => s.riskReport);

  if (!populasi || populasi.length === 0) return null;

  return (
    <Link
      href="/risk-helper"
      className="group relative flex items-center justify-between gap-5 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-paper)] px-5 py-4 transition hover:border-[var(--color-accent)]"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-accent)]">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <div className="flex items-center gap-3">
            <span className="serif text-base font-medium text-[var(--color-ink)] transition group-hover:text-[var(--color-accent-ink)]">
              Risk Helper — {ALL_RULES.length} aturan deteksi anomali
            </span>
            <span className="mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-accent)]">
              opsional
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
            Jalanin pemetaan anomali di populasi sebelum sampling judgmental, atau cross-check
            sampel hasil MUS/SRS dengan red-flag lain.
            {riskReport && (
              <>
                {" "}
                <span className="text-[var(--color-ink)]">
                  Run terakhir: {riskReport.uniqueFlagged.length.toLocaleString("id-ID")} baris ke-flag.
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <ArrowUpRight className="h-5 w-5 text-[var(--color-text-subtle)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
    </Link>
  );
}
