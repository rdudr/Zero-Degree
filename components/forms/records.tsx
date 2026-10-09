"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { findDuplicate } from "@/lib/merge";
import { savePhotoLocally, getFormattedDate, sanitizeName } from "@/lib/photo-capture";
import type { EquipmentKind, RecordBase } from "@/lib/types";
import { RecordedBy } from "@/components/forms/fields";
import { cn } from "@/lib/utils";

/**
 * Who / when for a record being saved. A new record is stamped with the
 * signed-in engineer; an edited one keeps its original recorder and creation
 * time and only moves `updatedAt` forward — that is what the team merge uses
 * to decide which copy is newer.
 */
export function recordMeta<T extends RecordBase>(editing: T | null | undefined) {
  const now = new Date().toISOString();
  const auth = useAuthStore.getState();
  if (editing) {
    return {
      id: editing.id,
      recordedBy: editing.recordedBy || auth.displayName || "Unknown",
      createdAt: editing.createdAt || now,
      createdById: editing.createdById ?? auth.userId ?? "local-user",
      updatedAt: now,
    };
  }
  return { id: crypto.randomUUID(), recordedBy: auth.displayName || "Unknown", createdAt: now, createdById: auth.userId ?? "local-user", updatedAt: now };
}

/**
 * Duplicate protection: refuses a tag that another record of the same kind
 * already carries, and says who recorded that one and when.
 */
export function rejectDuplicate<T extends RecordBase & { category?: string }>(kind: EquipmentKind, list: T[], candidate: { id: string; tag: string; category?: string }): boolean {
  const dup = findDuplicate(kind, list, candidate);
  if (!dup) return false;
  const at = new Date(dup.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  toast.error(`"${dup.tag}" is already recorded (by ${dup.recordedBy || "Unknown"}, ${at}). Open it from the list below to edit it, or use a different tag.`, { duration: 7000 });
  return true;
}

/** Saves a freshly captured photo as <tag>_<kind>_<ddmm>.jpg; returns the stored path (or the existing one). */
export async function persistPhoto(captured: string | null, existing: string | null, tag: string, kind: string): Promise<string | null> {
  if (!captured || !captured.startsWith("data:")) return existing;
  const fileName = `${sanitizeName(tag) || "unit"}_${sanitizeName(kind)}_${getFormattedDate()}`;
  return savePhotoLocally(captured, fileName);
}

export type Column<T> = { header: string; cell: (r: T) => React.ReactNode; className?: string };

/** Records list — tap a row to see the detail, then Edit or Delete. */
export function RecordsTable<T extends RecordBase>({
  title, description, items, columns, renderDetail, onEdit, onDelete, emptyText,
}: {
  title: string;
  description?: string;
  items: T[];
  columns: Column<T>[];
  renderDetail: (r: T) => React.ReactNode;
  onEdit: (r: T) => void;
  onDelete: (r: T) => void;
  emptyText: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title} <span className="text-slate-500 font-normal">({items.length})</span></CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-slate-400 text-sm">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  {columns.map((c) => (
                    <th key={c.header} className={cn("text-left px-2 py-2 font-medium whitespace-nowrap", c.className)}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="border-t border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {columns.map((c) => (
                        <td key={c.header} className={cn("px-2 py-3 align-top", c.className)}>{c.cell(r)}</td>
                      ))}
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-slate-900/50">
                        <td colSpan={columns.length} className="px-3 py-4 space-y-4">
                          {renderDetail(r)}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
                            <RecordedBy rec={r} />
                            <div className="flex gap-2">
                              <Button variant="secondary" size="sm" onClick={(ev) => { ev.stopPropagation(); onEdit(r); }}>Edit</Button>
                              <Button variant="destructive" size="sm" onClick={(ev) => { ev.stopPropagation(); onDelete(r); }}>Delete</Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
