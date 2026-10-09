"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { calcAirUnit } from "@/lib/calc";
import { AIR_UNIT_LABEL, hasMakeup, type AirUnit, type AirUnitType, type HumidityMode } from "@/lib/types";
import { capturePhotoFromDevice } from "@/lib/photo-capture";
import {
  type FormState, NumField, PhotoField, PointsInput, ResultGrid, Segmented, StepsTable, TextField, VerdictBadge,
  fromPoints, numStr, toNum, toPoints, toStr,
} from "@/components/forms/fields";
import { RecordsTable, persistPhoto, recordMeta, rejectDuplicate } from "@/components/forms/records";

const EMPTY: FormState = {
  tag: "", location: "", makeModel: "", ratedTr: "", ratedKw: "", starRating: "",
  suctionArea: "", returnDbt: "", returnHum: "", supplyDbt: "", supplyHum: "",
  noOfFilters: "", damperOpenPct: "", freshArea: "", freshDbt: "", freshHum: "",
  voltage: "", current: "", pf: "", kw: "", kvar: "", kva: "", description: "",
};

const AC_TYPES: [AirUnitType, string][] = [["SPLIT", "Split"], ["WINDOW", "Window"], ["PACKAGE", "Package"], ["PACKAGE_MAKEUP", "Package + make-up air"]];
const AHU_TYPES: [AirUnitType, string][] = [["AHU", "AHU"], ["AHU_MAKEUP", "AHU + make-up air"]];
const defaultPoints = (t: AirUnitType) => (t === "SPLIT" || t === "WINDOW" ? 5 : 7);
const defaultPhase = (t: AirUnitType): 1 | 3 => (t === "SPLIT" || t === "WINDOW" ? 1 : 3);

export function AirUnitEditor({ category }: { category: "AC" | "AHU" }) {
  const isAc = category === "AC";
  const allUnits = useAppStore((s) => s.airUnits);
  const addAirUnit = useAppStore((s) => s.addAirUnit);
  const updateAirUnit = useAppStore((s) => s.updateAirUnit);
  const deleteAirUnit = useAppStore((s) => s.deleteAirUnit);
  const units = allUnits.filter((u) => u.category === category);

  const [unitType, setUnitType] = useState<AirUnitType>(isAc ? "SPLIT" : "AHU");
  const [humidityMode, setHumidityMode] = useState<HumidityMode>("RH");
  const [phase, setPhase] = useState<1 | 3>(defaultPhase(isAc ? "SPLIT" : "AHU"));
  const [form, setForm] = useState<FormState>(EMPTY);
  const [velocities, setVelocities] = useState<string[]>(fromPoints([], defaultPoints(unitType)));
  const [freshVelocities, setFreshVelocities] = useState<string[]>(fromPoints([], 2));
  const [editing, setEditing] = useState<AirUnit | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [saving, setSaving] = useState(false);

  const mk = hasMakeup(unitType);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const humUnit = humidityMode === "RH" ? "% RH" : "°C WBT";
  const humLabel = humidityMode === "RH" ? "Relative humidity" : "Wet bulb";

  // The record exactly as it would be saved — the live results come from it.
  const draft: AirUnit = useMemo(() => ({
    id: editing?.id ?? "draft",
    tag: form.tag.trim(),
    category,
    unitType,
    humidityMode,
    phase,
    location: toStr(form.location),
    makeModel: toStr(form.makeModel),
    ratedTr: toNum(form.ratedTr),
    ratedKw: toNum(form.ratedKw),
    starRating: isAc ? toStr(form.starRating) : null,
    velocities: toPoints(velocities),
    suctionArea: toNum(form.suctionArea),
    returnDbt: toNum(form.returnDbt),
    returnHum: toNum(form.returnHum),
    supplyDbt: toNum(form.supplyDbt),
    supplyHum: toNum(form.supplyHum),
    noOfFilters: mk ? toNum(form.noOfFilters) : null,
    damperOpenPct: mk ? toNum(form.damperOpenPct) : null,
    freshVelocities: mk ? toPoints(freshVelocities) : [],
    freshArea: mk ? toNum(form.freshArea) : null,
    freshDbt: mk ? toNum(form.freshDbt) : null,
    freshHum: mk ? toNum(form.freshHum) : null,
    voltage: toNum(form.voltage),
    current: toNum(form.current),
    pf: toNum(form.pf),
    kw: toNum(form.kw),
    kvar: toNum(form.kvar),
    kva: toNum(form.kva),
    description: toStr(form.description),
    photoPath: existingPhoto,
    recordedBy: editing?.recordedBy ?? null,
    createdAt: editing?.createdAt ?? new Date(0).toISOString(),
  }), [form, velocities, freshVelocities, unitType, humidityMode, phase, category, isAc, mk, editing, existingPhoto]);
  const live = useMemo(() => calcAirUnit(draft), [draft]);

  function changeType(t: AirUnitType) {
    setUnitType(t);
    if (!editing) {
      setPhase(defaultPhase(t));
      if (toPoints(velocities).length === 0) setVelocities(fromPoints([], defaultPoints(t)));
    }
  }

  function reset() {
    setEditing(null);
    setForm(EMPTY);
    setVelocities(fromPoints([], defaultPoints(unitType)));
    setFreshVelocities(fromPoints([], 2));
    setPhase(defaultPhase(unitType));
    setCaptured(null);
    setExistingPhoto(null);
  }

  function startEdit(u: AirUnit) {
    setEditing(u);
    setUnitType(u.unitType);
    setHumidityMode(u.humidityMode ?? "RH");
    setPhase((u.phase as 1 | 3) ?? defaultPhase(u.unitType));
    const f: FormState = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) f[k] = numStr((u as unknown as Record<string, unknown>)[k]);
    setForm(f);
    setVelocities(fromPoints(u.velocities, 1));
    setFreshVelocities(fromPoints(u.freshVelocities, 1));
    setExistingPhoto(u.photoPath ?? null);
    setCaptured(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!draft.tag) return toast.error(`${isAc ? "AC" : "AHU"} tag / name is required`);
    const meta = recordMeta(editing);
    if (rejectDuplicate("airUnits", allUnits, { id: meta.id, tag: draft.tag, category })) return;
    setSaving(true);
    try {
      let photoPath: string | null;
      try {
        photoPath = await persistPhoto(captured, existingPhoto, draft.tag, category.toLowerCase());
      } catch (e) {
        toast.error("Failed to save photo locally: " + (e as Error).message);
        return;
      }
      const record: AirUnit = { ...draft, ...meta, photoPath };
      if (editing) {
        updateAirUnit(editing.id, record);
        toast.success(`${record.tag} updated`);
      } else {
        addAirUnit(record);
        toast.success(`${record.tag} saved on this device`);
      }
      reset();
    } finally {
      setSaving(false);
    }
  }

  function remove(u: AirUnit) {
    if (!confirm(`Delete ${u.tag}?`)) return;
    deleteAirUnit(u.id);
    if (editing?.id === u.id) reset();
    toast.success(`${u.tag} deleted`);
  }

  const types = isAc ? AC_TYPES : AHU_TYPES;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{editing ? `Edit ${editing.tag}` : isAc ? "Add an air conditioner" : "Add a chiller AHU"}</CardTitle>
              <CardDescription className="mt-1">
                {isAc
                  ? "Anemometer traverse across the suction (return) grille, return and supply air conditions, and the power reading."
                  : "Air flow across the AHU coil and the air conditions either side of it. With make-up air, record the fresh-air stream too."}
              </CardDescription>
            </div>
            <Segmented value={unitType} onChange={changeType} options={types} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextField label={isAc ? "AC tag / name" : "AHU tag / name"} required value={form.tag} onChange={set("tag")} placeholder={isAc ? "e.g. AC-01 Admin" : "e.g. AHU-03"} />
            <TextField label="Location" value={form.location} onChange={set("location")} placeholder="Building / floor / room" />
            <TextField label="Make / model" value={form.makeModel} onChange={set("makeModel")} />
            {isAc && <TextField label="Star rating" value={form.starRating} onChange={set("starRating")} placeholder="e.g. 3 star" />}
            <NumField label="Rated capacity" unit="TR" value={form.ratedTr} onChange={set("ratedTr")} />
            <NumField label={isAc ? "Rated power" : "Rated fan power"} unit="kW" value={form.ratedKw} onChange={set("ratedKw")} />
          </section>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-slate-950/40 p-3">
            <Label className="text-slate-400">Humidity read as</Label>
            <Segmented value={humidityMode} onChange={setHumidityMode} options={[["RH", "Relative humidity %"], ["WBT", "Wet bulb °C"]]} />
            <span className="text-[10px] text-slate-500">Applies to every air stream of this unit.</span>
          </div>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">{mk ? "Return air" : "Suction (return) air"}</h4>
            <PointsInput label="Air velocity across the grille" values={velocities} onChange={setVelocities} hint="One reading per point of the traverse — the average is used, as AVERAGE() does in the sheet." />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <NumField label={mk ? "Return-air area" : "Suction area"} unit="m²" value={form.suctionArea} onChange={set("suctionArea")} />
              <NumField label="Return air DBT" unit="°C" value={form.returnDbt} onChange={set("returnDbt")} />
              <NumField label={`Return air ${humLabel.toLowerCase()}`} unit={humUnit} value={form.returnHum} onChange={set("returnHum")} />
              <NumField label="Supply air DBT" unit="°C" value={form.supplyDbt} onChange={set("supplyDbt")} />
              <NumField label={`Supply air ${humLabel.toLowerCase()}`} unit={humUnit} value={form.supplyHum} onChange={set("supplyHum")} />
            </div>
          </section>

          {mk && (
            <section className="space-y-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300/80">Make-up (fresh) air</h4>
              <PointsInput label="Fresh-air velocity" values={freshVelocities} onChange={setFreshVelocities} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <NumField label="Fresh-air area" unit="m²" value={form.freshArea} onChange={set("freshArea")} />
                <NumField label="Outside air DBT" unit="°C" value={form.freshDbt} onChange={set("freshDbt")} />
                <NumField label={`Outside air ${humLabel.toLowerCase()}`} unit={humUnit} value={form.freshHum} onChange={set("freshHum")} />
                <NumField label="No. of filters" value={form.noOfFilters} onChange={set("noOfFilters")} />
                <NumField label="Fresh-air damper open" unit="%" value={form.damperOpenPct} onChange={set("damperOpenPct")} />
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">{isAc ? "Power" : "Fan power"}</h4>
              <Segmented value={String(phase) as "1" | "3"} onChange={(v) => setPhase(v === "1" ? 1 : 3)} options={[["1", "Single phase"], ["3", "Three phase"]]} />
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <NumField label="Voltage" unit="V" value={form.voltage} onChange={set("voltage")} />
              <NumField label="Current" unit="A" value={form.current} onChange={set("current")} />
              <NumField label="Power factor" value={form.pf} onChange={set("pf")} />
              <NumField label="kW" unit="kW" value={form.kw} onChange={set("kw")} hint={!form.kw && live.kwComputed ? `Worked from V·I·PF: ${live.kwUsed?.toFixed(2)} kW` : undefined} />
              <NumField label="kVAr" value={form.kvar} onChange={set("kvar")} />
              <NumField label="kVA" value={form.kva} onChange={set("kva")} />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 pt-2 border-t border-white/5">
            <div className="space-y-1.5">
              <Label>Observations</Label>
              <Textarea className="h-24" placeholder="Condition of filters, coil, insulation, set-point …" value={form.description} onChange={(e) => set("description")(e.target.value)} />
            </div>
            <PhotoField
              captured={captured}
              existing={existingPhoto}
              onCapture={async () => {
                try { setCaptured(await capturePhotoFromDevice()); toast.success("Photo captured"); } catch (e) { toast.error((e as Error).message || "Failed to capture photo"); }
              }}
              onClear={() => { setCaptured(null); setExistingPhoto(null); }}
            />
          </section>

          <ResultGrid
            verdict={live.verdict}
            items={[
              { label: mk ? "Total air flow" : "Air flow", value: live.totalFlowCmh, digits: 0, unit: "m³/h" },
              { label: "Enthalpy return", value: live.hReturn, unit: "kJ/kg" },
              { label: "Enthalpy supply", value: live.hSupply, unit: "kJ/kg" },
              ...(mk ? [{ label: "Enthalpy fresh air", value: live.hFresh, unit: "kJ/kg" }] : []),
              { label: "Net capacity", value: live.netTr, unit: "TR" },
              { label: "Net capacity", value: live.netKcalHr, digits: 0, unit: "kcal/h" },
              ...(isAc
                ? [
                    { label: "Specific power", value: live.kwPerTr, digits: 3, unit: "kW/TR", tone: live.verdict.tone === "muted" ? undefined : live.verdict.tone },
                    { label: "EER", value: live.eer, digits: 2 },
                  ]
                : [{ label: "Fan power", value: live.kwUsed, unit: "kW" }]),
              ...(live.capacityPct !== null ? [{ label: "Of rated capacity", value: live.capacityPct, digits: 0, unit: "%" }] : []),
            ]}
          />

          <div>
            <button type="button" onClick={() => setShowSteps((s) => !s)} className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200">
              {showSteps ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {showSteps ? "Hide" : "Show"} worked calculation
            </button>
            {showSteps && <div className="mt-3"><StepsTable steps={live.steps} /></div>}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving} className="min-w-36">{editing ? "Update" : isAc ? "Save AC" : "Save AHU"}</Button>
            {editing && <Button variant="secondary" onClick={reset}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      <RecordsTable<AirUnit>
        title={isAc ? "Air conditioners recorded" : "AHUs recorded"}
        description="Tap a row for the full working, then edit or delete."
        items={units}
        emptyText={isAc ? "No air conditioner recorded yet." : "No AHU recorded yet."}
        columns={[
          { header: "Tag", cell: (u) => <><span className="block font-mono font-bold text-sky-300">{u.tag}</span><span className="text-[10px] text-slate-500">{AIR_UNIT_LABEL[u.unitType]}</span></> },
          { header: "Location", cell: (u) => <span className="text-slate-300">{u.location || "—"}</span> },
          { header: "Flow m³/h", cell: (u) => calcAirUnit(u).totalFlowCmh?.toFixed(0) ?? "—", className: "text-right" },
          { header: "Net TR", cell: (u) => <span className="text-sky-300 font-semibold">{calcAirUnit(u).netTr?.toFixed(2) ?? "—"}</span>, className: "text-right" },
          isAc
            ? { header: "kW/TR", cell: (u) => calcAirUnit(u).kwPerTr?.toFixed(3) ?? "—", className: "text-right" }
            : { header: "kcal/h", cell: (u) => calcAirUnit(u).netKcalHr?.toFixed(0) ?? "—", className: "text-right" },
          { header: "Status", cell: (u) => <VerdictBadge verdict={calcAirUnit(u).verdict} /> },
          { header: "Recorded by", cell: (u) => <span className="text-slate-400">{u.recordedBy || "Unknown"}</span> },
        ]}
        renderDetail={(u) => <StepsTable steps={calcAirUnit(u).steps} />}
        onEdit={startEdit}
        onDelete={remove}
      />
    </div>
  );
}
