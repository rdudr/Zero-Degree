"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { useAppStore } from "@/lib/store";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardExportBtn } from "@/components/dashboard/export-btn";
import { VerdictBadge } from "@/components/forms/fields";
import { BANDS, calcAirUnit, calcChiller, calcCoolingTower, type Tone } from "@/lib/calc";
import { AIR_UNIT_LABEL } from "@/lib/types";

const TONE_COLOR: Record<Tone, string> = { good: "#10b981", warn: "#f59e0b", bad: "#ef4444", muted: "#64748b" };
const TONE_NAME: Record<Tone, string> = { good: "Good", warn: "Average", bad: "Poor", muted: "Incomplete" };
const tooltipStyle = { backgroundColor: "#0f172a", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 };
const axis = { stroke: "#64748b", fontSize: 11 };

function Empty({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="m-auto text-center">
      <p className="text-xs text-slate-500">{text}</p>
      <Link href={href} className="text-xs text-sky-300 hover:text-sky-200">{cta} →</Link>
    </div>
  );
}

export default function DashboardPage() {
  const profile = useAppStore((s) => s.profile);
  const airUnits = useAppStore((s) => s.airUnits);
  const chillers = useAppStore((s) => s.chillers);
  const coolingTowers = useAppStore((s) => s.coolingTowers);

  const d = useMemo(() => {
    const acs = airUnits.filter((u) => u.category === "AC").map((u) => ({ r: u, x: calcAirUnit(u) }));
    const ahus = airUnits.filter((u) => u.category === "AHU").map((u) => ({ r: u, x: calcAirUnit(u) }));
    const chs = chillers.map((c) => ({ r: c, x: calcChiller(c) }));
    const cts = coolingTowers.map((t) => ({ r: t, x: calcCoolingTower(t) }));
    const pos = (v: number | null) => (v !== null && isFinite(v) && v > 0 ? v : 0);
    const acTr = acs.reduce((s, a) => s + pos(a.x.netTr), 0);
    const acKw = acs.reduce((s, a) => s + pos(a.x.kwUsed), 0);
    const chTr = chs.reduce((s, c) => s + pos(c.x.trGenerated), 0);
    const ahuTr = ahus.reduce((s, a) => s + pos(a.x.netTr), 0);
    const ctTr = cts.reduce((s, c) => s + pos(c.x.trGenerated), 0);
    const all = [...acs, ...ahus, ...chs, ...cts];
    const status = (["good", "warn", "bad", "muted"] as Tone[]).map((t) => ({ name: TONE_NAME[t], tone: t, value: all.filter((a) => a.x.verdict.tone === t).length })).filter((s) => s.value > 0);

    const contributions = new Map<string, { ac: number; ahu: number; ch: number; ct: number; last: number }>();
    const bump = (who: string | null | undefined, k: "ac" | "ahu" | "ch" | "ct", at: string) => {
      const name = who || "Unknown";
      const c = contributions.get(name) ?? { ac: 0, ahu: 0, ch: 0, ct: 0, last: 0 };
      c[k]++;
      c.last = Math.max(c.last, Date.parse(at) || 0);
      contributions.set(name, c);
    };
    acs.forEach((a) => bump(a.r.recordedBy, "ac", a.r.updatedAt || a.r.createdAt));
    ahus.forEach((a) => bump(a.r.recordedBy, "ahu", a.r.updatedAt || a.r.createdAt));
    chs.forEach((c) => bump(c.r.recordedBy, "ch", c.r.updatedAt || c.r.createdAt));
    cts.forEach((c) => bump(c.r.recordedBy, "ct", c.r.updatedAt || c.r.createdAt));

    const attention = all.filter((a) => a.x.verdict.tone === "bad").map((a) => ({
      id: a.r.id, tag: a.r.tag,
      kind: "unitType" in a.r ? AIR_UNIT_LABEL[a.r.unitType] : "chillerType" in a.r ? "Chiller" : "Cooling tower",
      verdict: a.x.verdict,
    }));

    return { acs, ahus, chs, cts, acTr, acKw, chTr, ahuTr, ctTr, status, contributions: [...contributions.entries()], attention, total: all.length };
  }, [airUnits, chillers, coolingTowers]);

  const acChart = d.acs.filter((a) => a.x.kwPerTr !== null).map((a) => ({ name: a.r.tag, value: Number(a.x.kwPerTr!.toFixed(3)), tone: a.x.verdict.tone }));
  const capacityChart = [
    ...d.acs.map((a) => ({ name: a.r.tag, group: "AC", value: a.x.netTr })),
    ...d.chs.map((c) => ({ name: c.r.tag, group: "Chiller", value: c.x.trGenerated })),
    ...d.ahus.map((a) => ({ name: a.r.tag, group: "AHU", value: a.x.netTr })),
  ].filter((c) => c.value !== null && c.value > 0).map((c) => ({ ...c, value: Number(c.value!.toFixed(2)) }));
  const ctChart = d.cts.filter((c) => c.x.effectiveness !== null).map((c) => ({ name: c.r.tag, value: Number(c.x.effectiveness!.toFixed(1)), tone: c.x.verdict.tone }));
  const groupColor: Record<string, string> = { AC: "#38bdf8", Chiller: "#818cf8", AHU: "#22d3ee" };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-4 border-b border-white/5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">Cooling Systems Overview</h1>
          <p className="text-sm text-slate-400 mt-1">{profile?.companyName ? `${profile.companyName} — ` : ""}live results from every reading on this device.</p>
        </div>
        <DashboardExportBtn hasCompany={!!profile?.companyName} />
      </div>

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Company" value={profile?.companyName ?? "Not set"} className="col-span-2 lg:col-span-1" />
        <KpiCard label="Equipment assessed" value={String(d.total)} hint={`${d.acs.length} AC · ${d.chs.length} chiller · ${d.ahus.length} AHU · ${d.cts.length} CT`} />
        <KpiCard label="AC cooling measured" value={`${d.acTr.toFixed(1)} TR`} hint={d.acTr > 0 && d.acKw > 0 ? `${(d.acKw / d.acTr).toFixed(3)} kW/TR overall` : undefined} />
        <KpiCard label="Chiller cooling" value={`${d.chTr.toFixed(1)} TR`} hint={d.ahuTr > 0 ? `AHUs deliver ${d.ahuTr.toFixed(1)} TR` : undefined} />
        <KpiCard label="Cooling-tower heat load" value={`${d.ctTr.toFixed(1)} TR`} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-400 font-semibold">AC specific power (kW/TR)</CardTitle></CardHeader>
          <CardContent className="h-64 flex">
            {acChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={acChart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <ReferenceLine y={BANDS.acKwPerTr.good} stroke="#10b981" strokeDasharray="4 4" label={{ value: `${BANDS.acKwPerTr.good}`, fill: "#10b981", fontSize: 10, position: "right" }} />
                  <Bar dataKey="value" name="kW/TR" radius={[4, 4, 0, 0]}>
                    {acChart.map((c, i) => <Cell key={i} fill={TONE_COLOR[c.tone]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty text="No air conditioner with power and capacity yet." href="/ac" cta="Add an AC" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-400 font-semibold">Cooling delivered (TR)</CardTitle></CardHeader>
          <CardContent className="h-64 flex">
            {capacityChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={capacityChart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v, _n, p) => [`${v} TR`, (p?.payload as { group?: string })?.group ?? ""]} />
                  <Bar dataKey="value" name="TR" radius={[4, 4, 0, 0]}>
                    {capacityChart.map((c, i) => <Cell key={i} fill={groupColor[c.group]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty text="No AC, chiller or AHU capacity worked out yet." href="/chillers" cta="Add a chiller" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-400 font-semibold">Cooling-tower effectiveness (%)</CardTitle></CardHeader>
          <CardContent className="h-64 flex">
            {ctChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ctChart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <ReferenceLine y={BANDS.ctEffectiveness.good} stroke="#10b981" strokeDasharray="4 4" />
                  <Bar dataKey="value" name="Effectiveness %" radius={[4, 4, 0, 0]}>
                    {ctChart.map((c, i) => <Cell key={i} fill={TONE_COLOR[c.tone]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty text="No cooling tower recorded yet." href="/cooling-towers" cta="Add a cooling tower" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm uppercase tracking-wider text-slate-400 font-semibold">Assessment status</CardTitle></CardHeader>
          <CardContent className="h-64 flex">
            {d.status.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.status} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {d.status.map((s, i) => <Cell key={i} fill={TONE_COLOR[s.tone]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} />
                  <Legend wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <Empty text="Nothing recorded yet." href="/ac" cta="Start with an AC" />}
          </CardContent>
        </Card>
      </section>

      {d.attention.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader><CardTitle>Needs attention ({d.attention.length})</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {d.attention.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-slate-900/50 p-3">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-sky-300 truncate">{a.tag}</p>
                  <p className="text-[10px] text-slate-500">{a.kind}</p>
                </div>
                <VerdictBadge verdict={a.verdict} className="text-right" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Data contribution by engineer</CardTitle></CardHeader>
        <CardContent>
          {d.contributions.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="text-left py-2 font-medium">Engineer</th>
                    <th className="text-center py-2 font-medium">AC</th>
                    <th className="text-center py-2 font-medium">Chillers</th>
                    <th className="text-center py-2 font-medium">AHUs</th>
                    <th className="text-center py-2 font-medium">Cooling towers</th>
                    <th className="text-right py-2 font-medium">Last reading</th>
                  </tr>
                </thead>
                <tbody>
                  {d.contributions.map(([name, c]) => (
                    <tr key={name} className="border-t border-white/5 hover:bg-white/5">
                      <td className="py-3 font-semibold text-slate-100">{name}</td>
                      <td className="text-center py-3">{c.ac}</td>
                      <td className="text-center py-3">{c.ch}</td>
                      <td className="text-center py-3">{c.ahu}</td>
                      <td className="text-center py-3">{c.ct}</td>
                      <td className="text-right py-3 text-slate-400">{c.last ? new Date(c.last).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No data recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
