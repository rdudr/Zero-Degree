"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { calcChiller } from "@/lib/calc";
import { CHILLER_LABEL, type Chiller, type ChillerType } from "@/lib/types";
import { capturePhotoFromDevice } from "@/lib/photo-capture";
import { type FormState, NumField, PhotoField, ResultGrid, Segmented, StepsTable, TextField, VerdictBadge, numStr, toNum, toStr } from "@/components/forms/fields";
import { RecordsTable, persistPhoto, recordMeta, rejectDuplicate } from "@/components/forms/records";

const EMPTY: FormState = {
  tag: "", location: "", makeModel: "", ratedTr: "", refrigerant: "",
  compressorKw: "", totalKw: "", fuelRate: "", fuelCv: "",
  waterFlowCmh: "", inletTemp: "", outletTemp: "", specificHeat: "1",
  hbCondFlowLps: "", hbCondIn: "", hbCondOut: "", hbEvapFlowLps: "", hbEvapIn: "", hbEvapOut: "", hbCompKw: "",
  description: "",
};

const HB_KEYS = ["hbCondFlowLps", "hbCondIn", "hbCondOut", "hbEvapFlowLps", "hbEvapIn", "hbEvapOut", "hbCompKw"];

export function ChillerEditor() {
  const chillers = useAppStore((s) => s.chillers);
  const addChiller = useAppStore((s) => s.addChiller);
  const updateChiller = useAppStore((s) => s.updateChiller);
  const deleteChiller = useAppStore((s) => s.deleteChiller);

  const [chillerType, setChillerType] = useState<ChillerType>("VCS");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState<Chiller | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [showHb, setShowHb] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const vas = chillerType === "VAS";

  const draft: Chiller = useMemo(() => {
    const n = (k: string) => toNum(form[k]);
    return {
      id: editing?.id ?? "draft",
      tag: form.tag.trim(),
      chillerType,
      location: toStr(form.location),
      makeModel: toStr(form.makeModel),
      ratedTr: n("ratedTr"),
      refrigerant: toStr(form.refrigerant),
      compressorKw: vas ? null : n("compressorKw"),
      totalKw: vas ? null : n("totalKw"),
      fuelRate: vas ? n("fuelRate") : null,
      fuelCv: vas ? n("fuelCv") : null,
      waterFlowCmh: n("waterFlowCmh"),
      inletTemp: n("inletTemp"),
      outletTemp: n("outletTemp"),
      specificHeat: n("specificHeat"),
      ...Object.fromEntries(HB_KEYS.map((k) => [k, n(k)])),
      description: toStr(form.description),
      photoPath: existingPhoto,
      recordedBy: editing?.recordedBy ?? null,
      createdAt: editing?.createdAt ?? new Date(0).toISOString(),
    } as Chiller;
  }, [form, chillerType, vas, editing, existingPhoto]);
  const live = useMemo(() => calcChiller(draft), [draft]);

  function reset() {
    setEditing(null);
    setForm(EMPTY);
    setCaptured(null);
    setExistingPhoto(null);
  }

  function startEdit(c: Chiller) {
    setEditing(c);
    setChillerType(c.chillerType);
    const f: FormState = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) f[k] = numStr((c as unknown as Record<string, unknown>)[k]);
    if (!f.specificHeat) f.specificHeat = "1";
    setForm(f);
    setShowHb(HB_KEYS.some((k) => f[k] !== ""));
    setExistingPhoto(c.photoPath ?? null);
    setCaptured(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!draft.tag) return toast.error("Chiller tag / name is required");
    const meta = recordMeta(editing);
    if (rejectDuplicate("chillers", chillers, { id: meta.id, tag: draft.tag })) return;
    setSaving(true);
    try {
      let photoPath: string | null;
      try {
        photoPath = await persistPhoto(captured, existingPhoto, draft.tag, "chiller");
      } catch (e) {
        toast.error("Failed to save photo locally: " + (e as Error).message);
        return;
      }
      const record: Chiller = { ...draft, ...meta, photoPath };
      if (editing) {
        updateChiller(editing.id, record);
        toast.success(`${record.tag} updated`);
      } else {
        addChiller(record);
        toast.success(`${record.tag} saved on this device`);
      }
      reset();
    } finally {
      setSaving(false);
    }
  }

  function remove(c: Chiller) {
    if (!confirm(`Delete ${c.tag}?`)) return;
    deleteChiller(c.id);
    if (editing?.id === c.id) reset();
    toast.success(`${c.tag} deleted`);
  }

  const waterSide = chillerType === "VCS_CT" ? "Condenser (cooling-tower) water" : "Chilled water / brine";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{editing ? `Edit ${editing.tag}` : "Add a chiller"}</CardTitle>
              <CardDescription className="mt-1">{CHILLER_LABEL[chillerType]} — water flow from the pump analysis, inlet and outlet temperatures and the power or fuel drawn.</CardDescription>
            </div>
            <Segmented value={chillerType} onChange={setChillerType} options={[["VCS", "VCS · chilled water"], ["VCS_CT", "VCS · condenser side"], ["VAS", "VAS · absorption"]]} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <TextField label="Chiller tag / name" required value={form.tag} onChange={set("tag")} placeholder="e.g. CH-01" />
            <TextField label="Location" value={form.location} onChange={set("location")} />
            <TextField label="Make / model" value={form.makeModel} onChange={set("makeModel")} />
            <NumField label="Rated capacity" unit="TR" value={form.ratedTr} onChange={set("ratedTr")} />
            <TextField label="Refrigerant (gas)" value={form.refrigerant} onChange={set("refrigerant")} placeholder={vas ? "e.g. LiBr–water" : "e.g. R-134a"} />
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">{waterSide}</h4>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <NumField label="Water flow" unit="m³/h" value={form.waterFlowCmh} onChange={set("waterFlowCmh")} hint="From the pump analysis" />
              <NumField label="Inlet temperature" unit="°C" value={form.inletTemp} onChange={set("inletTemp")} />
              <NumField label="Outlet temperature" unit="°C" value={form.outletTemp} onChange={set("outletTemp")} />
              <NumField label="Specific heat" unit="kcal/kg·°C" value={form.specificHeat} onChange={set("specificHeat")} hint="1 for water" />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">{vas ? "Fuel" : "Power"}</h4>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {vas ? (
                <>
                  <NumField label="Fuel consumption" unit="kg/h" value={form.fuelRate} onChange={set("fuelRate")} />
                  <NumField label="Calorific value of fuel" unit="kcal/kg" value={form.fuelCv} onChange={set("fuelCv")} />
                </>
              ) : (
                <>
                  <NumField label="Compressor kW (measured)" unit="kW" value={form.compressorKw} onChange={set("compressorKw")} />
                  <NumField label="Total power with utilities" unit="kW" value={form.totalKw} onChange={set("totalKw")} />
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-3">
            <button type="button" onClick={() => setShowHb((s) => !s)} className="flex w-full items-center justify-between text-left">
              <span>
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-300/80">Heat balance (optional)</span>
                <span className="block text-[10px] text-slate-500">Condenser and evaporator water both measured — checks compressor kW + evaporator gain ≈ condenser rejection.</span>
              </span>
              {showHb ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
            </button>
            {showHb && (
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <NumField label="Condenser water flow" unit="l/s" value={form.hbCondFlowLps} onChange={set("hbCondFlowLps")} />
                <NumField label="Cooling water in" unit="°C" value={form.hbCondIn} onChange={set("hbCondIn")} />
                <NumField label="Cooling water out" unit="°C" value={form.hbCondOut} onChange={set("hbCondOut")} />
                <NumField label="Compressor kW" unit="kW" value={form.hbCompKw} onChange={set("hbCompKw")} hint="Blank uses the compressor kW above" />
                <NumField label="Evaporator water flow" unit="l/s" value={form.hbEvapFlowLps} onChange={set("hbEvapFlowLps")} />
                <NumField label="Chilled water in" unit="°C" value={form.hbEvapIn} onChange={set("hbEvapIn")} />
                <NumField label="Chilled water out" unit="°C" value={form.hbEvapOut} onChange={set("hbEvapOut")} />
              </div>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2 pt-2 border-t border-white/5">
            <div className="space-y-1.5">
              <Label>Observations</Label>
              <Textarea className="h-24" placeholder="Set-points, condenser condition, scaling, operating hours …" value={form.description} onChange={(e) => set("description")(e.target.value)} />
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
              { label: "TR generated", value: live.trGenerated, unit: "TR" },
              ...(vas
                ? [
                    { label: "Specific fuel cons.", value: live.sfc, digits: 3, unit: "kg/TR·h" },
                    { label: "COP (thermal)", value: live.cop, digits: 3 },
                  ]
                : [
                    { label: "SPC compressor", value: live.spcCompressor, digits: 3, unit: "kW/TR" },
                    { label: "SPC total", value: live.spcTotal, digits: 3, unit: "kW/TR", tone: live.verdict.tone === "muted" ? undefined : live.verdict.tone },
                  ]),
              ...(live.capacityPct !== null ? [{ label: "Of rated capacity", value: live.capacityPct, digits: 0, unit: "%" }] : []),
              ...(live.hbPercent !== null
                ? [
                    { label: "Heat rejected", value: live.hbHeatRejected, unit: "kW" },
                    { label: "Heat gained", value: live.hbHeatGain, unit: "kW" },
                    { label: "Heat balance", value: live.hbPercent, unit: "%", tone: live.hbVerdict?.tone === "good" ? ("good" as const) : ("bad" as const) },
                  ]
                : []),
            ]}
          />
          {live.hbVerdict && <VerdictBadge verdict={live.hbVerdict} />}

          <div>
            <button type="button" onClick={() => setShowSteps((s) => !s)} className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200">
              {showSteps ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {showSteps ? "Hide" : "Show"} worked calculation
            </button>
            {showSteps && <div className="mt-3"><StepsTable steps={live.steps} /></div>}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving} className="min-w-36">{editing ? "Update" : "Save chiller"}</Button>
            {editing && <Button variant="secondary" onClick={reset}>Cancel</Button>}
          </div>
        </CardContent>
      </Card>

      <RecordsTable<Chiller>
        title="Chillers recorded"
        description="Tap a row for the full working, then edit or delete."
        items={chillers}
        emptyText="No chiller recorded yet."
        columns={[
          { header: "Tag", cell: (c) => <><span className="block font-mono font-bold text-sky-300">{c.tag}</span><span className="text-[10px] text-slate-500">{c.chillerType.replace("_", " + ")}</span></> },
          { header: "TR", cell: (c) => <span className="text-sky-300 font-semibold">{calcChiller(c).trGenerated?.toFixed(2) ?? "—"}</span>, className: "text-right" },
          { header: "SPC comp.", cell: (c) => calcChiller(c).spcCompressor?.toFixed(3) ?? "—", className: "text-right" },
          { header: "SPC total", cell: (c) => calcChiller(c).spcTotal?.toFixed(3) ?? (calcChiller(c).sfc !== null ? `${calcChiller(c).sfc!.toFixed(3)} kg/TR·h` : "—"), className: "text-right" },
          { header: "Heat bal. %", cell: (c) => calcChiller(c).hbPercent?.toFixed(1) ?? "—", className: "text-right" },
          { header: "Status", cell: (c) => <VerdictBadge verdict={calcChiller(c).verdict} /> },
          { header: "Recorded by", cell: (c) => <span className="text-slate-400">{c.recordedBy || "Unknown"}</span> },
        ]}
        renderDetail={(c) => <StepsTable steps={calcChiller(c).steps} />}
        onEdit={startEdit}
        onDelete={remove}
      />
    </div>
  );
}
