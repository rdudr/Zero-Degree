"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { calcCoolingTower } from "@/lib/calc";
import type { CoolingTower, FanSizeMode } from "@/lib/types";
import { capturePhotoFromDevice } from "@/lib/photo-capture";
import {
  type FormState, NumField, PhotoField, PointsInput, ResultGrid, Segmented, SelectField, StepsTable, TextField, VerdictBadge,
  fromPoints, numStr, toNum, toPoints, toStr,
} from "@/components/forms/fields";
import { RecordsTable, persistPhoto, recordMeta, rejectDuplicate } from "@/components/forms/records";

const EMPTY: FormState = {
  tag: "", location: "", makeModel: "", ratedTr: "", ratedEffectiveness: "",
  inletTemp: "", outletTemp: "", airDbt: "", airWbt: "", noOfCells: "1", cellsOnline: "1", waterFlowCmh: "",
  fanSize: "", hubSize: "", tdsMakeup: "", tdsCirculating: "", fanAirDbt: "", fanAirWbt: "",
  fanMaterial: "FRP", couplingType: "Direct", description: "",
};

export function CoolingTowerEditor() {
  const towers = useAppStore((s) => s.coolingTowers);
  const addCoolingTower = useAppStore((s) => s.addCoolingTower);
  const updateCoolingTower = useAppStore((s) => s.updateCoolingTower);
  const deleteCoolingTower = useAppStore((s) => s.deleteCoolingTower);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [fanSizeMode, setFanSizeMode] = useState<FanSizeMode>("DIAMETER");
  const [velocities, setVelocities] = useState<string[]>(fromPoints([], 8));
  const [editing, setEditing] = useState<CoolingTower | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const draft: CoolingTower = useMemo(() => {
    const n = (k: string) => toNum(form[k]);
    return {
      id: editing?.id ?? "draft",
      tag: form.tag.trim(),
      location: toStr(form.location),
      makeModel: toStr(form.makeModel),
      ratedTr: n("ratedTr"),
      ratedEffectiveness: n("ratedEffectiveness"),
      inletTemp: n("inletTemp"),
      outletTemp: n("outletTemp"),
      airDbt: n("airDbt"),
      airWbt: n("airWbt"),
      noOfCells: n("noOfCells"),
      cellsOnline: n("cellsOnline"),
      waterFlowCmh: n("waterFlowCmh"),
      fanVelocities: toPoints(velocities),
      fanSizeMode,
      fanSize: n("fanSize"),
      hubSize: n("hubSize"),
      tdsMakeup: n("tdsMakeup"),
      tdsCirculating: n("tdsCirculating"),
      fanAirDbt: n("fanAirDbt"),
      fanAirWbt: n("fanAirWbt"),
      fanMaterial: toStr(form.fanMaterial),
      couplingType: toStr(form.couplingType),
      description: toStr(form.description),
      photoPath: existingPhoto,
      recordedBy: editing?.recordedBy ?? null,
      createdAt: editing?.createdAt ?? new Date(0).toISOString(),
    };
  }, [form, velocities, fanSizeMode, editing, existingPhoto]);
  const live = useMemo(() => calcCoolingTower(draft), [draft]);

  function reset() {
    setEditing(null);
    setForm(EMPTY);
    setVelocities(fromPoints([], 8));
    setCaptured(null);
    setExistingPhoto(null);
  }

  function startEdit(t: CoolingTower) {
    setEditing(t);
    setFanSizeMode(t.fanSizeMode ?? "DIAMETER");
    const f: FormState = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) f[k] = numStr((t as unknown as Record<string, unknown>)[k]);
    setForm(f);
    setVelocities(fromPoints(t.fanVelocities, 1));
    setExistingPhoto(t.photoPath ?? null);
    setCaptured(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!draft.tag) return toast.error("Cooling tower tag / name is required");
    const meta = recordMeta(editing);
    if (rejectDuplicate("coolingTowers", towers, { id: meta.id, tag: draft.tag })) return;
    setSaving(true);
    try {
      let photoPath: string | null;
      try {
        photoPath = await persistPhoto(captured, existingPhoto, draft.tag, "ct");
      } catch (e) {
        toast.error("Failed to save photo locally: " + (e as Error).message);
        return;
      }
      const record: CoolingTower = { ...draft, ...meta, photoPath };
      if (editing) {
        updateCoolingTower(editing.id, record);
        toast.success(`${record.tag} updated`);
      } else {
        addCoolingTower(record);
        toast.success(`${record.tag} saved on this device`);
      }
      reset();
    } finally {
      setSaving(false);
    }
  }

  function remove(t: CoolingTower) {
    if (!confirm(`Delete ${t.tag}?`)) return;
    deleteCoolingTower(t.id);
    if (editing?.id === t.id) reset();
    toast.success(`${t.tag} deleted`);
  }

  const sizeWord = fanSizeMode === "DIAMETER" ? "diameter" : "periphery";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? `Edit ${editing.tag}` : "Add a cooling tower"}</CardTitle>
          <CardDescription>Water temperatures and flow, ambient wet bulb, the fan-stack velocity traverse and the water TDS.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <TextField label="Cooling tower tag / name" required value={form.tag} onChange={set("tag")} placeholder="e.g. CT-01 Press" />
            <TextField label="Location" value={form.location} onChange={set("location")} />
            <TextField label="Make / model" value={form.makeModel} onChange={set("makeModel")} />
            <NumField label="Rated capacity" unit="TR" value={form.ratedTr} onChange={set("ratedTr")} />
            <NumField label="Rated effectiveness" unit="%" value={form.ratedEffectiveness} onChange={set("ratedEffectiveness")} />
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">Water &amp; air</h4>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <NumField label="Inlet (hot) water" unit="°C" value={form.inletTemp} onChange={set("inletTemp")} />
              <NumField label="Outlet (cold) water" unit="°C" value={form.outletTemp} onChange={set("outletTemp")} />
              <NumField label="Ambient air DBT" unit="°C" value={form.airDbt} onChange={set("airDbt")} />
              <NumField label="Ambient air WBT" unit="°C" value={form.airWbt} onChange={set("airWbt")} />
              <NumField label="Total water flow" unit="m³/h" value={form.waterFlowCmh} onChange={set("waterFlowCmh")} hint="From the pump analysis" />
              <NumField label="No. of cells" value={form.noOfCells} onChange={set("noOfCells")} />
              <NumField label="Cells online" value={form.cellsOnline} onChange={set("cellsOnline")} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">CT fan</h4>
              <Segmented value={fanSizeMode} onChange={setFanSizeMode} options={[["DIAMETER", "Enter diameter"], ["PERIPHERY", "Enter periphery"]]} />
            </div>
            <PointsInput label="Air velocity over the fan stack" values={velocities} onChange={setVelocities} max={40} />
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <NumField label={`Fan ${sizeWord}`} unit="m" value={form.fanSize} onChange={set("fanSize")} hint={fanSizeMode === "DIAMETER" ? "Periphery = 3.14 × D, as in the sheet" : undefined} />
              <NumField label={`Fan motor / hub ${sizeWord}`} unit="m" value={form.hubSize} onChange={set("hubSize")} />
              <NumField label="Fan outlet air DBT" unit="°C" value={form.fanAirDbt} onChange={set("fanAirDbt")} />
              <NumField label="Fan outlet air WBT" unit="°C" value={form.fanAirWbt} onChange={set("fanAirWbt")} />
              <SelectField label="Fan material" value={form.fanMaterial} onChange={set("fanMaterial")} options={[["FRP", "FRP"], ["CI", "CI"], ["Al", "Aluminium"], ["Other", "Other"]]} />
              <SelectField label="Coupling" value={form.couplingType} onChange={set("couplingType")} options={[["Direct", "Direct"], ["Belt", "Belt"], ["Gear", "Gear"]]} />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">Water quality</h4>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <NumField label="TDS of make-up water" unit="ppm" value={form.tdsMakeup} onChange={set("tdsMakeup")} />
              <NumField label="TDS of circulating water" unit="ppm" value={form.tdsCirculating} onChange={set("tdsCirculating")} />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 pt-2 border-t border-white/5">
            <div className="space-y-1.5">
              <Label>Observations</Label>
              <Textarea className="h-24" placeholder="Fill condition, nozzles, drift eliminators, fan blade angle …" value={form.description} onChange={(e) => set("description")(e.target.value)} />
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
              { label: "Range", value: live.range, unit: "°C" },
              { label: "Approach", value: live.approach, unit: "°C" },
              { label: "Effectiveness", value: live.effectiveness, unit: "%", tone: live.verdict.tone === "muted" ? undefined : live.verdict.tone },
              { label: "Fan air flow", value: live.fanFlowCmh, digits: 0, unit: "m³/h" },
              { label: "L/G ratio", value: live.lgRatio, digits: 3 },
              { label: "TR generated", value: live.trGenerated, unit: "TR" },
              { label: "Evaporation loss", value: live.evaporationCmh, digits: 3, unit: "m³/h" },
              { label: "COC", value: live.coc, digits: 2 },
              { label: "Blow-down", value: live.blowdownCmh, digits: 3, unit: "m³/h", hint: live.coc !== null && live.coc <= 1 ? "COC ≤ 1 — no blow-down" : undefined },
              { label: "Make-up water", value: live.makeupCmh, digits: 3, unit: "m³/h" },
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
            <Button onClick={() => void save()} disabled={saving} className="min-w-36">{editing ? "Update" : "Save cooling tower"}</Button>
            {editing && <Button variant="secondary" onClick={reset}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      <RecordsTable<CoolingTower>
        title="Cooling towers recorded"
        description="Tap a row for the full working, then edit or delete."
        items={towers}
        emptyText="No cooling tower recorded yet."
        columns={[
          { header: "Tag", cell: (t) => <span className="font-mono font-bold text-sky-300">{t.tag}</span> },
          { header: "Range °C", cell: (t) => calcCoolingTower(t).range?.toFixed(2) ?? "—", className: "text-right" },
          { header: "Approach °C", cell: (t) => calcCoolingTower(t).approach?.toFixed(2) ?? "—", className: "text-right" },
          { header: "Effect. %", cell: (t) => <span className="text-sky-300 font-semibold">{calcCoolingTower(t).effectiveness?.toFixed(1) ?? "—"}</span>, className: "text-right" },
          { header: "TR", cell: (t) => calcCoolingTower(t).trGenerated?.toFixed(1) ?? "—", className: "text-right" },
          { header: "Status", cell: (t) => <VerdictBadge verdict={calcCoolingTower(t).verdict} /> },
          { header: "Recorded by", cell: (t) => <span className="text-slate-400">{t.recordedBy || "Unknown"}</span> },
        ]}
        renderDetail={(t) => <StepsTable steps={calcCoolingTower(t).steps} />}
        onEdit={startEdit}
        onDelete={remove}
      />
    </div>
  );
}
