"use client";

import React, { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentData, useAppStore } from "@/lib/store";
import { addSummaries, describeSummary, emptySummary, mergeDataSets } from "@/lib/merge";
import { parseWorkbook, readWorkbookFile } from "@/lib/excel";
import { toast } from "sonner";

/** Header "Upload Excel": merges one or more teammates' Zero Degree files into this device. */
export function UploadButton({ label = "Upload Excel", className }: { label?: string; className?: string }) {
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceData = useAppStore((s) => s.replaceData);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setImporting(true);
    try {
      let data = currentData();
      let summary = emptySummary();
      for (const file of files) {
        const parsed = parseWorkbook(await readWorkbookFile(file));
        const merged = mergeDataSets(data, parsed);
        data = merged.data;
        summary = addSummaries(summary, merged.summary);
      }
      replaceData(data);
      toast.success(`Merged ${files.length} file${files.length === 1 ? "" : "s"} ✓\n${describeSummary(summary)}`, { duration: 8000 });
    } catch (err) {
      console.error("[IMPORT]", err);
      toast.error(`Import failed: ${(err as Error).message || "Invalid Excel file"}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="inline-block">
      <input type="file" ref={fileInputRef} onChange={handleFiles} accept=".xlsx,.xls" multiple className="hidden" />
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        variant="secondary"
        size="sm"
        className={className ?? "gap-1.5 border border-white/10 hover:bg-sky-500/10 hover:text-sky-400"}
      >
        {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {importing ? "Importing..." : label}
      </Button>
    </div>
  );
}
