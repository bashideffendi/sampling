"use client";

import { useSamplingStore } from "@/store/samplingStore";
import type { SamplingMethod } from "@/types";

const METHODS: Array<{ key: SamplingMethod; label: string; sub: string }> = [
  { key: "mus", label: "MUS", sub: "Monetary Unit" },
  { key: "srs", label: "SRS", sub: "Simple Random" },
  { key: "stratified", label: "STR", sub: "Stratified" },
  { key: "judgmental", label: "JDG", sub: "Judgmental" },
  { key: "attribute", label: "ATR", sub: "Attribute" },
];

export function MethodTabs() {
  const method = useSamplingStore((s) => s.method);
  const setMethod = useSamplingStore((s) => s.setMethod);
  return (
    <div className="flex flex-wrap gap-1.5">
      {METHODS.map((m) => {
        const active = method === m.key;
        return (
          <button
            key={m.key}
            onClick={() => setMethod(m.key)}
            className={`flex flex-col items-start gap-0.5 rounded border px-3 py-2 transition ${
              active
                ? "border-[var(--color-accent)] bg-[var(--color-surface-2)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            <span
              className={`mono text-xs font-semibold tracking-wider ${
                active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {m.label}
            </span>
            <span
              className={`text-xs ${active ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
            >
              {m.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}
