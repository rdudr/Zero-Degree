"use client";

import React from "react";
import { Camera, Image as ImageIcon, Plus, X, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalcStep, Verdict } from "@/lib/calc";
import type { RecordBase } from "@/lib/types";

// ── form state helpers ──────────────────────────────────────────────────────

export type FormState = Record<string, string>;

/** "" → null, anything else → a finite number or null. */
export const toNum = (s: string | undefined | null): number | null => {
  if (s === undefined || s === null || String(s).trim() === "") return null;
  const n = Number(String(s).trim());
  return isFinite(n) ? n : null;
};
export const toStr = (s: string | undefined | null): string | null => (s && s.trim() ? s.trim() : null);
export const numStr = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
export const toPoints = (xs: string[]): number[] => xs.map(toNum).filter((n): n is number => n !== null);
export const fromPoints = (xs: number[] | null | undefined, min = 4): string[] => {
  const s = (xs ?? []).map(String);
  while (s.length < min) s.push("");
  return s;
};

// ── fields ──────────────────────────────────────────────────────────────────

export function Field({ label, unit, hint, required, className, children }: { label: string; unit?: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex items-baseline justify-between gap-2">
        <span>
          {label}
          {required && <span className="text-red-400"> *</span>}
        </span>
        {unit && <span className="text-[10px] font-normal text-slate-500">{unit}</span>}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-slate-500 leading-snug">{hint}</p>}
    </div>
  );
}

export function NumField({ label, unit, hint, required, value, onChange, placeholder, className }: { label: string; unit?: string; hint?: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <Field label={label} unit={unit} hint={hint} required={required} className={className}>
      <Input type="number" inputMode="decimal" step="any" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-10" />
    </Field>
  );
}

export function TextField({ label, hint, required, value, onChange, placeholder, className }: { label: string; hint?: string; required?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <Field label={label} hint={hint} required={required} className={className}>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-10" />
    </Field>
  );
}

export function SelectField({ label, hint, value, onChange, options, className }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: [string, string][]; className?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <select className="h-10 w-full rounded-md border border-white/10 bg-slate-950/50 px-2 text-sm text-slate-100" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </Field>
  );
}

/** Two-to-four way toggle — used for unit type, humidity mode and so on. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: [T, string][]; className?: string }) {
  return (
    <div className={cn("inline-flex flex-wrap rounded-lg border border-white/10 bg-slate-950/60 p-1 gap-1", className)}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === v ? "bg-sky-500/20 text-sky-100 border border-sky-500/30" : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** An anemometer traverse: one box per measuring point, add as many as were taken. */
export function PointsInput({ label, unit = "m/s", values, onChange, max = 30, hint }: { label: string; unit?: string; values: string[]; onChange: (v: string[]) => void; max?: number; hint?: string }) {
  const nums = toPoints(values);
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-[10px] text-slate-500">
          {nums.length} point{nums.length === 1 ? "" : "s"}{avg !== null ? ` · avg ${avg.toFixed(2)} ${unit}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
        {values.map((v, i) => (
          <div key={i} className="relative">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500">P{i + 1}</span>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              value={v}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-10 pl-7 pr-6 text-right"
            />
            {values.length > 1 && (
              <button type="button" aria-label={`Remove point ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))} className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-600 hover:text-red-400">
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
        {values.length < max && (
          <button type="button" onClick={() => onChange([...values, ""])} className="h-10 rounded-md border border-dashed border-white/15 text-slate-400 hover:text-sky-300 hover:border-sky-500/40 flex items-center justify-center gap-1 text-xs">
            <Plus className="size-3.5" /> Point
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

// ── results ─────────────────────────────────────────────────────────────────

const TONE_TEXT: Record<string, string> = {
  good: "text-emerald-400",
  warn: "text-amber-300",
  bad: "text-red-400",
  muted: "text-slate-400",
  accent: "text-sky-300",
};

export type ResultItem = { label: string; value: number | null | undefined; digits?: number; unit?: string; tone?: "good" | "warn" | "bad" | "muted" | "accent"; hint?: string };

export function ResultGrid({ items, verdict }: { items: ResultItem[]; verdict?: Verdict | null }) {
  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest font-semibold text-sky-300/80">Live calculation</div>
        {verdict && <VerdictBadge verdict={verdict} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg bg-slate-950/50 border border-white/5 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 leading-tight">{it.label}</div>
            <div className={cn("mt-1 text-xl font-bold tabular-nums", TONE_TEXT[it.tone ?? "accent"])}>
              {it.value === null || it.value === undefined || !isFinite(it.value) ? "—" : it.value.toFixed(it.digits ?? 2)}
              {it.unit && <span className="ml-1 text-[11px] font-medium text-slate-400">{it.unit}</span>}
            </div>
            {it.hint && <div className="text-[10px] text-slate-500 mt-0.5">{it.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const cls = {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    bad: "border-red-500/30 bg-red-500/10 text-red-200",
    muted: "border-white/10 bg-white/5 text-slate-400",
  }[verdict.tone];
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", cls, className)}>{verdict.label}</span>;
}

/** The formula, the numbers put into it, and the answer. */
export function StepsTable({ steps }: { steps: CalcStep[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 bg-slate-950/60">
            <th className="text-left px-3 py-2 font-medium">Quantity</th>
            <th className="text-left px-3 py-2 font-medium">Formula</th>
            <th className="text-left px-3 py-2 font-medium">Substitution</th>
            <th className="text-right px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} className="border-t border-white/5">
              <td className="px-3 py-2 text-slate-200 font-medium whitespace-nowrap">{s.quantity}</td>
              <td className="px-3 py-2 text-slate-500 font-mono text-[11px]">{s.formula}</td>
              <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{s.substitution}</td>
              <td className="px-3 py-2 text-right text-sky-300 font-semibold whitespace-nowrap">{s.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── photo & provenance ──────────────────────────────────────────────────────

export function PhotoField({ captured, existing, onCapture, onClear }: { captured: string | null; existing: string | null; onCapture: () => void; onClear: () => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Equipment photo (saved on this device)</Label>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCapture} className="flex-1 gap-2 h-10 text-xs">
          <Camera className="size-4" />
          Capture Photo
        </Button>
        {(captured || existing) && (
          <Button type="button" variant="ghost" onClick={onClear} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 h-10">
            Clear
          </Button>
        )}
      </div>
      {captured && (
        <div className="border border-sky-500/30 rounded-lg p-2 bg-slate-900 flex items-center gap-3">
          <img src={captured} alt="Preview" className="h-12 w-16 object-cover rounded bg-black" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-emerald-400 font-medium">New photo captured</p>
            <p className="text-[9px] text-slate-500 truncate">Will save on submit</p>
          </div>
        </div>
      )}
      {!captured && existing && (
        <div className="border border-white/10 rounded-lg p-2 bg-slate-900 flex items-center gap-3">
          <div className="h-12 w-16 rounded bg-slate-950 flex items-center justify-center text-slate-500 border border-white/5">
            <ImageIcon className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-sky-300 font-medium">Saved photo path:</p>
            <p className="text-[9px] text-slate-400 truncate font-mono" title={existing}>{existing}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const when = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—");

/** "Recorded by Rishabh · 09/10/2026, 11:30 · last saved …" */
export function RecordedBy({ rec, className }: { rec: Pick<RecordBase, "recordedBy" | "createdAt" | "updatedAt">; className?: string }) {
  const edited = rec.updatedAt && rec.updatedAt !== rec.createdAt;
  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] text-slate-500", className)}>
      <UserRound className="size-3" />
      <span className="text-slate-300">{rec.recordedBy || "Unknown"}</span>
      <span>· {when(rec.createdAt)}</span>
      {edited && <span>· last saved {when(rec.updatedAt)}</span>}
    </div>
  );
}
