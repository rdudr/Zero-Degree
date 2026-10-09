"use client";

import { useState } from "react";
import { Snowflake, Fan } from "lucide-react";
import { ChillerEditor } from "@/components/equipment/chiller-editor";
import { AirUnitEditor } from "@/components/equipment/air-unit-editor";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function ChillersPage() {
  const [tab, setTab] = useState<"chillers" | "ahu">("chillers");
  const chillerCount = useAppStore((s) => s.chillers.length);
  const ahuCount = useAppStore((s) => s.airUnits.filter((u) => u.category === "AHU").length);

  const tabs = [
    { id: "chillers" as const, label: "Chillers", icon: Snowflake, count: chillerCount },
    { id: "ahu" as const, label: "Air-handling units", icon: Fan, count: ahuCount },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-1.5 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors",
                tab === t.id ? "bg-sky-500/15 text-sky-100 border border-sky-500/30" : "text-slate-400 hover:text-slate-200 border border-transparent",
              )}
            >
              <Icon className="size-4" />
              {t.label}
              <span className="text-[10px] rounded bg-white/5 px-1.5 py-0.5 text-slate-400">{t.count}</span>
            </button>
          );
        })}
      </div>
      {tab === "chillers" ? <ChillerEditor /> : <AirUnitEditor category="AHU" />}
    </div>
  );
}
