"use client";

import { useMemo, useState } from "react";
import { Search, Sigma } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CONSTANTS, FORMULA_GROUPS } from "@/lib/formulas";
import { cn } from "@/lib/utils";

export default function FormulasPage() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return FORMULA_GROUPS
      .filter((g) => group === "all" || g.id === group)
      .map((g) => ({
        ...g,
        formulas: needle
          ? g.formulas.filter((f) => [f.name, f.formula, f.source, f.note ?? "", f.unit ?? ""].join(" ").toLowerCase().includes(needle))
          : g.formulas,
      }))
      .filter((g) => g.formulas.length > 0);
  }, [q, group]);

  const total = FORMULA_GROUPS.reduce((s, g) => s + g.formulas.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Sigma className="size-6 text-sky-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">Formulas</h1>
            <p className="text-sm text-slate-400 mt-0.5">All {total} formulas the app uses, with the KISEM workbook cell each one comes from.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute z-10 left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search — e.g. enthalpy, approach, kW/TR, B45" className="h-10 pl-9" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: "all", title: "All" }, ...FORMULA_GROUPS].map((g) => (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs transition-colors",
                group === g.id ? "border-sky-500/30 bg-sky-500/15 text-sky-100" : "border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5",
              )}
            >
              {g.id === "all" ? "All" : g.title.split(" (")[0].split(" — ")[0]}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="text-sm text-slate-400">No formula matches “{q}”.</p>}

      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader>
            <CardTitle className="text-base">{g.title}</CardTitle>
            <CardDescription>{g.intro}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {g.formulas.map((f) => (
              <div key={f.name} className="rounded-lg border border-white/5 bg-slate-950/50 p-3 space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">{f.name}</span>
                  {f.unit && <span className="text-[10px] rounded bg-white/5 px-1.5 py-0.5 text-slate-400">{f.unit}</span>}
                </div>
                <div className="font-mono text-[13px] text-sky-300 break-words leading-relaxed">{f.formula}</div>
                <div className="text-[11px] text-slate-500 break-words">
                  <span className="text-slate-400">Source:</span> <span className="font-mono">{f.source}</span>
                </div>
                {f.note && <div className="text-[11px] text-slate-400">{f.note}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {group === "all" && !q && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Constants</CardTitle>
            <CardDescription>The fixed numbers in the formulas above, kept exactly as the workbooks use them.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10">
                    <th className="text-left px-2 py-2 font-medium">Value</th>
                    <th className="text-left px-2 py-2 font-medium">Unit</th>
                    <th className="text-left px-2 py-2 font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {CONSTANTS.map((c) => (
                    <tr key={c.symbol} className="border-t border-white/5">
                      <td className="px-2 py-2 font-mono text-sky-300">{c.symbol}</td>
                      <td className="px-2 py-2 text-slate-400">{c.value}</td>
                      <td className="px-2 py-2 text-slate-300">{c.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
