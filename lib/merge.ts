import type { AirUnit, Chiller, CompanyProfile, CoolingTower, DataSet, EquipmentKind, RecordBase } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate protection and team merge
//
// The same rules everywhere a second copy of the data can arrive — a
// teammate's Excel file, the cloud "Pull team data", or a record typed twice:
//
// • A piece of equipment is identified by its TAG (per equipment type; an AC
//   and an AHU may share a tag). Case, spaces and punctuation are ignored, so
//   "AC-01", "ac 01" and "AC01" are the same unit.
// • When both sides hold the same tag, the copy saved most recently
//   (updatedAt, falling back to createdAt) wins; the other is kept as is.
//   Re-importing a file is therefore always safe and never duplicates.
// • The device keeps its own record id, so open edits stay attached.
// • Who took the reading (recordedBy) and when (createdAt) travel with the
//   record and are never overwritten by the person importing.
// • Company details only fill gaps on the importing device.
// ─────────────────────────────────────────────────────────────────────────────

/** The equipment tag as the duplicate check compares it: case, spaces and punctuation ignored. */
export const tagKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Air units share one list; an AC and an AHU may carry the same tag. */
export const recordKey = (kind: EquipmentKind, r: { tag: string; category?: string }) =>
  kind === "airUnits" ? `${r.category ?? "AC"}|${tagKey(r.tag)}` : tagKey(r.tag);

export type MergeCounts = { added: number; updated: number; keptOlder: number };
export type MergeSummary = {
  airUnits: MergeCounts;
  chillers: MergeCounts;
  coolingTowers: MergeCounts;
  profileFieldsFilled: number;
};

export const stamp = (r: { updatedAt?: string | null; createdAt?: string | null }) =>
  Date.parse(r.updatedAt || r.createdAt || "") || 0;

function mergeList<T extends RecordBase & { category?: string }>(kind: EquipmentKind, mine: T[], theirs: T[]): { list: T[]; counts: MergeCounts } {
  const list = [...mine];
  const counts: MergeCounts = { added: 0, updated: 0, keptOlder: 0 };
  const index = new Map<string, number>();
  list.forEach((r, i) => index.set(recordKey(kind, r), i));
  for (const r of theirs) {
    if (!r || !String(r.tag ?? "").trim()) continue;
    const key = recordKey(kind, r);
    const at = index.get(key);
    if (at === undefined) {
      list.push(r);
      index.set(key, list.length - 1);
      counts.added++;
    } else if (stamp(r) > stamp(list[at])) {
      list[at] = { ...r, id: list[at].id };
      counts.updated++;
    } else {
      counts.keptOlder++;
    }
  }
  return { list, counts };
}

const PROFILE_KEYS: (keyof CompanyProfile)[] = ["companyName", "area", "district", "state", "pincode", "overallConsumption"];

export function mergeProfile(mine: CompanyProfile | null, theirs: Partial<CompanyProfile> | null | undefined): { profile: CompanyProfile | null; filled: number } {
  if (!theirs) return { profile: mine, filled: 0 };
  let filled = 0;
  const p: CompanyProfile = mine
    ? { ...mine }
    : { id: crypto.randomUUID(), companyName: "", area: "", district: "", state: "", pincode: "", overallConsumption: "", updatedAt: new Date().toISOString() };
  for (const k of PROFILE_KEYS) {
    const cur = p[k];
    const inc = theirs[k];
    if ((cur === "" || cur === null || cur === undefined) && inc !== undefined && inc !== null && inc !== "") {
      (p as Record<string, unknown>)[k] = k === "overallConsumption" ? inc : String(inc);
      filled++;
    }
  }
  if (!mine && !p.companyName) return { profile: null, filled: 0 };
  if (filled) p.updatedAt = new Date().toISOString();
  return { profile: p, filled };
}

export function mergeDataSets(mine: DataSet, theirs: Partial<DataSet>): { data: DataSet; summary: MergeSummary } {
  const a = mergeList<AirUnit>("airUnits", mine.airUnits, theirs.airUnits ?? []);
  const c = mergeList<Chiller>("chillers", mine.chillers, theirs.chillers ?? []);
  const t = mergeList<CoolingTower>("coolingTowers", mine.coolingTowers, theirs.coolingTowers ?? []);
  const p = mergeProfile(mine.profile, theirs.profile);
  return {
    data: { profile: p.profile, airUnits: a.list, chillers: c.list, coolingTowers: t.list },
    summary: { airUnits: a.counts, chillers: c.counts, coolingTowers: t.counts, profileFieldsFilled: p.filled },
  };
}

export function emptySummary(): MergeSummary {
  const z = () => ({ added: 0, updated: 0, keptOlder: 0 });
  return { airUnits: z(), chillers: z(), coolingTowers: z(), profileFieldsFilled: 0 };
}

export function addSummaries(a: MergeSummary, b: MergeSummary): MergeSummary {
  const s = (x: MergeCounts, y: MergeCounts) => ({ added: x.added + y.added, updated: x.updated + y.updated, keptOlder: x.keptOlder + y.keptOlder });
  return {
    airUnits: s(a.airUnits, b.airUnits),
    chillers: s(a.chillers, b.chillers),
    coolingTowers: s(a.coolingTowers, b.coolingTowers),
    profileFieldsFilled: a.profileFieldsFilled + b.profileFieldsFilled,
  };
}

export function describeSummary(s: MergeSummary): string {
  const line = (label: string, c: MergeCounts) => `• ${label}: ${c.added} added, ${c.updated} updated (theirs newer), ${c.keptOlder} kept (yours newer)`;
  return [
    line("AC / AHU units", s.airUnits),
    line("Chillers", s.chillers),
    line("Cooling towers", s.coolingTowers),
    s.profileFieldsFilled ? `• ${s.profileFieldsFilled} company field(s) filled in` : "",
    "No duplicate records were created.",
  ].filter(Boolean).join("\n");
}

/**
 * Duplicate check for a record being saved on this device. Returns the
 * existing record with the same tag (another id), or null when the tag is free.
 */
export function findDuplicate<T extends RecordBase & { category?: string }>(kind: EquipmentKind, list: T[], candidate: { id: string; tag: string; category?: string }): T | null {
  const key = recordKey(kind, candidate);
  return list.find((r) => r.id !== candidate.id && recordKey(kind, r) === key) ?? null;
}
