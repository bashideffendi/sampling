"use client";

import { useSamplingStore } from "@/store/samplingStore";
import type { ConfidenceLevel } from "@/types";
import { formatRupiah } from "@/lib/utils";

export function ParamPanel() {
  const method = useSamplingStore((s) => s.method);
  if (method === "mus") return <MUSPanel />;
  if (method === "srs") return <SRSPanel />;
  if (method === "stratified") return <StratifiedPanel />;
  if (method === "judgmental") return <JudgmentalPanel />;
  if (method === "attribute") return <AttributePanel />;
  return null;
}

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-[var(--color-text)]">{label}</span>
        {unit && (
          <span className="mono text-xs text-[var(--color-text-subtle)]">{unit}</span>
        )}
      </div>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-right text-sm text-[var(--color-text)] tabular-nums focus:border-[var(--color-accent)] focus:outline-none"
      />
      {hint && <div className="mt-1 text-xs text-[var(--color-text-subtle)]">{hint}</div>}
    </label>
  );
}

function ConfidenceField({
  value,
  onChange,
}: {
  value: ConfidenceLevel;
  onChange: (v: ConfidenceLevel) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-[var(--color-text)]">Tingkat Keyakinan</div>
      <div className="flex gap-1.5">
        {[0.9, 0.95, 0.99].map((c) => (
          <button
            key={c}
            onClick={() => onChange(c as ConfidenceLevel)}
            className={`mono flex-1 rounded border px-3 py-1.5 text-sm transition ${
              value === c
                ? "border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            {(c * 100).toFixed(0)}%
          </button>
        ))}
      </div>
    </label>
  );
}

function MUSPanel() {
  const param = useSamplingStore((s) => s.params.mus);
  const setParam = useSamplingStore((s) => s.setParam);
  return (
    <PanelShell title="Parameter MUS">
      <NumberField
        label="Book Value (Total Populasi)"
        value={param.bookValue}
        onChange={(v) => setParam("mus", { bookValue: v })}
        unit="Rp"
        hint={`Auto-isi dari populasi: ${formatRupiah(param.bookValue)}`}
      />
      <NumberField
        label="Tolerable Misstatement (TM)"
        value={param.tolerableMisstatement}
        onChange={(v) => setParam("mus", { tolerableMisstatement: v })}
        unit="Rp"
        hint="Biasanya 50–75% dari Planning Materiality (PM)"
      />
      <NumberField
        label="Expected Misstatement (EM)"
        value={param.expectedMisstatement}
        onChange={(v) => setParam("mus", { expectedMisstatement: v })}
        unit="Rp"
        hint="Set 0 kalau gak ada ekspektasi salah saji"
      />
      <ConfidenceField
        value={param.confidenceLevel}
        onChange={(v) => setParam("mus", { confidenceLevel: v })}
      />
      <NumberField
        label="Seed PRNG"
        value={param.seed}
        onChange={(v) => setParam("mus", { seed: Math.floor(v) })}
        hint="Seed deterministik — sample bisa di-replicate"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={param.includeNegativeAs100Pct}
          onChange={(e) => setParam("mus", { includeNegativeAs100Pct: e.target.checked })}
        />
        <span className="text-[var(--color-text)]">
          Sertakan SP2D negatif sebagai 100% inspect
        </span>
      </label>
    </PanelShell>
  );
}

function SRSPanel() {
  const param = useSamplingStore((s) => s.params.srs);
  const setParam = useSamplingStore((s) => s.setParam);
  return (
    <PanelShell title="Parameter SRS">
      <NumberField
        label="Populasi"
        value={param.populationSize}
        onChange={(v) => setParam("srs", { populationSize: Math.floor(v) })}
        hint="Auto-isi dari upload populasi"
      />
      <ConfidenceField
        value={param.confidenceLevel}
        onChange={(v) => setParam("srs", { confidenceLevel: v })}
      />
      <NumberField
        label="Expected Deviation"
        value={param.expectedDeviation}
        onChange={(v) => setParam("srs", { expectedDeviation: v })}
        step={0.001}
        unit="proporsi 0-1"
        hint="Mis 0.01 = 1% expected error"
      />
      <NumberField
        label="Tolerable Deviation"
        value={param.tolerableDeviation}
        onChange={(v) => setParam("srs", { tolerableDeviation: v })}
        step={0.001}
        unit="proporsi 0-1"
        hint="Mis 0.05 = 5% tolerable error"
      />
      <NumberField
        label="Seed PRNG"
        value={param.seed}
        onChange={(v) => setParam("srs", { seed: Math.floor(v) })}
      />
    </PanelShell>
  );
}

function StratifiedPanel() {
  const param = useSamplingStore((s) => s.params.stratified);
  const setParam = useSamplingStore((s) => s.setParam);
  return (
    <PanelShell title="Parameter Stratified">
      <NumberField
        label="Total Tolerable Error"
        value={param.totalTolerableError}
        onChange={(v) => setParam("stratified", { totalTolerableError: v })}
        unit="Rp"
      />
      <NumberField
        label="Certainty Threshold (100% inspect)"
        value={param.certaintyThreshold}
        onChange={(v) => setParam("stratified", { certaintyThreshold: v })}
        unit="Rp"
        hint="Item ≥ ambang ini otomatis 100% diperiksa"
      />
      <label className="block">
        <div className="mb-1 text-sm text-[var(--color-text)]">Batas Stratum (Rp, koma-pisah)</div>
        <input
          type="text"
          value={param.strataBoundaries.join(",")}
          onChange={(e) =>
            setParam("stratified", {
              strataBoundaries: e.target.value
                .split(",")
                .map((s) => parseFloat(s.trim()))
                .filter((n) => !Number.isNaN(n) && n > 0),
            })
          }
          className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <div className="mt-1 text-xs text-[var(--color-text-subtle)]">
          Contoh: 10000000,100000000,500000000 → 4 stratum
        </div>
      </label>
      <ConfidenceField
        value={param.confidenceLevel}
        onChange={(v) => setParam("stratified", { confidenceLevel: v })}
      />
      <label className="block">
        <div className="mb-1 text-sm text-[var(--color-text)]">Alokasi Sampel per Stratum</div>
        <div className="flex gap-1.5">
          {(["neyman", "proportional"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setParam("stratified", { allocation: a })}
              className={`flex-1 rounded border px-3 py-1.5 text-sm transition ${
                param.allocation === a
                  ? "border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]"
              }`}
            >
              {a === "neyman" ? "Neyman" : "Proportional"}
            </button>
          ))}
        </div>
      </label>
      <NumberField
        label="Seed PRNG"
        value={param.seed}
        onChange={(v) => setParam("stratified", { seed: Math.floor(v) })}
      />
    </PanelShell>
  );
}

function JudgmentalPanel() {
  const param = useSamplingStore((s) => s.params.judgmental);
  const setParam = useSamplingStore((s) => s.setParam);
  return (
    <PanelShell title="Parameter Judgmental">
      <label className="block">
        <div className="mb-1 text-sm text-[var(--color-text)]">Rationale (Wajib, min 10 char)</div>
        <textarea
          value={param.rationale}
          onChange={(e) => setParam("judgmental", { rationale: e.target.value })}
          rows={3}
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          placeholder="Mis: Fokus risiko akhir tahun + vendor berulang + paket mendekati batas PL..."
        />
      </label>
      <div className="space-y-2">
        <div className="text-sm text-[var(--color-text)]">Kriteria Aktif</div>
        {param.criteria.map((c, i) => (
          <div
            key={c.id}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
          >
            <label className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={(e) => {
                  const next = [...param.criteria];
                  next[i] = { ...c, enabled: e.target.checked };
                  setParam("judgmental", { criteria: next });
                }}
              />
              <span className="text-sm font-medium text-[var(--color-text)]">{c.label}</span>
            </label>
            <input
              type="text"
              value={c.filter}
              onChange={(e) => {
                const next = [...param.criteria];
                next[i] = { ...c, filter: e.target.value };
                setParam("judgmental", { criteria: next });
              }}
              className="mono w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
        <div className="mb-1 mono text-[var(--color-text-subtle)]">DSL syntax</div>
        <code className="mono">
          {`nilai >= 200000000 && skpd contains "DPUPR"
tgl_sp2d regex "^2025-12"
penyedia in "CV ABC","PT XYZ"`}
        </code>
      </div>
    </PanelShell>
  );
}

function AttributePanel() {
  const param = useSamplingStore((s) => s.params.attribute);
  const setParam = useSamplingStore((s) => s.setParam);
  return (
    <PanelShell title="Parameter Attribute (Test of Controls)">
      <ConfidenceField
        value={param.confidenceLevel}
        onChange={(v) => setParam("attribute", { confidenceLevel: v })}
      />
      <NumberField
        label="Tolerable Deviation Rate"
        value={param.tolerableDeviationRate}
        onChange={(v) => setParam("attribute", { tolerableDeviationRate: v })}
        step={0.005}
        unit="proporsi 0-1"
        hint="2%-20% (AICPA table); mis 0.05 = 5%"
      />
      <NumberField
        label="Expected Population Deviation Rate"
        value={param.expectedDeviationRate}
        onChange={(v) => setParam("attribute", { expectedDeviationRate: v })}
        step={0.0025}
        unit="proporsi 0-1"
        hint="0%-7% (harus < TDR)"
      />
      <NumberField
        label="Seed PRNG"
        value={param.seed}
        onChange={(v) => setParam("attribute", { seed: Math.floor(v) })}
      />
    </PanelShell>
  );
}
