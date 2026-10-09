import * as XLSX from "xlsx";
import { Capacitor } from "@capacitor/core";
import type { AirUnit, Chiller, CompanyProfile, CoolingTower, DataSet } from "@/lib/types";
import { AIR_UNIT_LABEL, CHILLER_LABEL } from "@/lib/types";
import { calcAirUnit, calcChiller, calcCoolingTower } from "@/lib/calc";

// The Capacitor plugins are imported lazily so this module can also run on
// the server, where the email route attaches the same workbook.

// ─────────────────────────────────────────────────────────────────────────────
// Zero Degree team-exchange workbook (also what PostMan reads)
//
//   "Company Profile"         Field / Value pairs; PostMan checks "Company Name"
//   "AC Units"                one row per AC (split / window / package …)
//   "AHU Units"               one row per chiller AHU
//   "Chillers"                one row per chiller
//   "Cooling Towers"          one row per cooling tower
//   "… Summary" sheets        the workbooks' own "For Summary" tables, for
//                             people and for the report; ignored on import
//
// Data sheets use the record's own field names as column headers, so a file
// round-trips losslessly between team members. The calculated columns
// (prefixed "calc_") follow the record fields, are written for PostMan's
// convenience and ignored when a file is imported back — the app always
// re-works them from the readings.
//
// Keep these lists, docs/POSTMAN.md and PostMan's importer in step.
// ─────────────────────────────────────────────────────────────────────────────

export const ZD_FORMAT = "Zero Degree v1";
export const SHEET_PROFILE = "Company Profile";
export const SHEET_AC = "AC Units";
export const SHEET_AHU = "AHU Units";
export const SHEET_CHILLERS = "Chillers";
export const SHEET_CT = "Cooling Towers";

const BASE_FIELDS = ["id", "tag", "location", "makeModel"] as const;
const TAIL_FIELDS = ["description", "photoPath", "recordedBy", "createdAt", "updatedAt", "createdById"] as const;

export const AIR_FIELDS = [
  ...BASE_FIELDS, "category", "unitType", "ratedTr", "ratedKw", "starRating", "humidityMode",
  "velocities", "suctionArea", "returnDbt", "returnHum", "supplyDbt", "supplyHum",
  "noOfFilters", "damperOpenPct", "freshVelocities", "freshArea", "freshDbt", "freshHum",
  "phase", "voltage", "current", "pf", "kw", "kvar", "kva",
  ...TAIL_FIELDS,
] as const;

export const CHILLER_FIELDS = [
  ...BASE_FIELDS, "chillerType", "ratedTr", "refrigerant", "compressorKw", "totalKw", "fuelRate", "fuelCv",
  "waterFlowCmh", "inletTemp", "outletTemp", "specificHeat",
  "hbCondFlowLps", "hbCondIn", "hbCondOut", "hbEvapFlowLps", "hbEvapIn", "hbEvapOut", "hbCompKw",
  ...TAIL_FIELDS,
] as const;

export const CT_FIELDS = [
  ...BASE_FIELDS, "ratedTr", "ratedEffectiveness", "inletTemp", "outletTemp", "airDbt", "airWbt",
  "noOfCells", "cellsOnline", "waterFlowCmh", "fanVelocities", "fanSizeMode", "fanSize", "hubSize",
  "tdsMakeup", "tdsCirculating", "fanAirDbt", "fanAirWbt", "fanMaterial", "couplingType",
  ...TAIL_FIELDS,
] as const;

const STRING_FIELDS = new Set<string>([
  "id", "tag", "location", "makeModel", "description", "photoPath", "recordedBy", "createdAt", "updatedAt", "createdById",
  "category", "unitType", "starRating", "humidityMode", "chillerType", "refrigerant", "fanSizeMode", "fanMaterial", "couplingType",
]);
const ARRAY_FIELDS = new Set<string>(["velocities", "freshVelocities", "fanVelocities"]);

const PROFILE_ROWS: [string, keyof CompanyProfile][] = [
  ["Company Name", "companyName"],
  ["Area / Zone", "area"],
  ["District", "district"],
  ["State", "state"],
  ["Pincode", "pincode"],
  ["Overall Consumption (kWh/Month)", "overallConsumption"],
];

const r = (v: number | null, d = 4) => (v === null || !isFinite(v) ? "" : Number(v.toFixed(d)));

function airDerived(u: AirUnit) {
  const x = calcAirUnit(u);
  return {
    calc_avgVelocity: r(x.avgVelocity), calc_flowCmh: r(x.flowCmh, 2),
    calc_freshAvgVelocity: r(x.freshAvgVelocity), calc_freshFlowCmh: r(x.freshFlowCmh, 2), calc_totalFlowCmh: r(x.totalFlowCmh, 2),
    calc_airDensity: r(x.density), calc_hReturn: r(x.hReturn), calc_hSupply: r(x.hSupply), calc_hFresh: r(x.hFresh),
    calc_netTr: r(x.netTr), calc_netKcalHr: r(x.netKcalHr, 1), calc_kw: r(x.kwUsed), calc_kwPerTr: r(x.kwPerTr), calc_eer: r(x.eer),
    calc_capacityPct: r(x.capacityPct, 2), calc_status: x.verdict.label,
  };
}
function chillerDerived(c: Chiller) {
  const x = calcChiller(c);
  return {
    calc_trGenerated: r(x.trGenerated), calc_spcCompressor: r(x.spcCompressor), calc_spcTotal: r(x.spcTotal),
    calc_sfc: r(x.sfc), calc_cop: r(x.cop), calc_capacityPct: r(x.capacityPct, 2),
    calc_hbHeatRejectedKw: r(x.hbHeatRejected), calc_hbHeatGainKw: r(x.hbHeatGain), calc_hbPercent: r(x.hbPercent),
    calc_status: x.verdict.label,
  };
}
function ctDerived(t: CoolingTower) {
  const x = calcCoolingTower(t);
  return {
    calc_avgFanVelocity: r(x.avgFanVelocity), calc_fanFlowCmh: r(x.fanFlowCmh, 2), calc_airDensity: r(x.airDensity),
    calc_waterKgh: r(x.waterKgh, 1), calc_airKgh: r(x.airKgh, 1), calc_lgRatio: r(x.lgRatio), calc_range: r(x.range),
    calc_approach: r(x.approach), calc_effectiveness: r(x.effectiveness), calc_heatLoadKcalHr: r(x.heatLoadKcalHr, 1),
    calc_trGenerated: r(x.trGenerated), calc_evaporationCmh: r(x.evaporationCmh), calc_evaporationPct: r(x.evaporationPct),
    calc_coc: r(x.coc), calc_blowdownCmh: r(x.blowdownCmh), calc_makeupCmh: r(x.makeupCmh), calc_status: x.verdict.label,
  };
}

function rowOf(rec: object, fields: readonly string[]) {
  const row: Record<string, string | number | boolean> = {};
  for (const f of fields) {
    const v = (rec as Record<string, unknown>)[f];
    if (ARRAY_FIELDS.has(f)) row[f] = Array.isArray(v) ? v.join(", ") : "";
    else row[f] = v === null || v === undefined ? "" : (v as string | number | boolean);
  }
  return row;
}

function dataSheet<T extends object>(wb: XLSX.WorkBook, name: string, recs: T[], fields: readonly string[], derived: (t: T) => Record<string, unknown>) {
  const rows = recs.map((x) => ({ ...rowOf(x, fields), ...derived(x) }));
  const derivedHeads = recs.length ? Object.keys(derived(recs[0])) : [];
  const header = [...fields, ...derivedHeads];
  const sh = XLSX.utils.json_to_sheet(rows, { header });
  sh["!cols"] = header.map((h) => ({ wch: Math.max(11, Math.min(26, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, sh, name);
}

function summarySheet(wb: XLSX.WorkBook, name: string, head: string[], body: (string | number)[][]) {
  const sh = XLSX.utils.aoa_to_sheet([head, ...body]);
  sh["!cols"] = head.map((h) => ({ wch: Math.max(12, Math.min(34, h.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, sh, name);
}

export function buildWorkbook(data: DataSet, reporterName?: string | null): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const { profile } = data;
  const acs = data.airUnits.filter((u) => u.category === "AC");
  const ahus = data.airUnits.filter((u) => u.category === "AHU");

  const profileRows: (string | number)[][] = [["Field", "Value"]];
  for (const [label, key] of PROFILE_ROWS) profileRows.push([label, (profile?.[key] as string | number) ?? ""]);
  profileRows.push(["Exported By", reporterName || ""]);
  profileRows.push(["Export Date", new Date().toLocaleString("en-IN")]);
  profileRows.push(["Format", ZD_FORMAT]);
  profileRows.push(["AC Units", acs.length]);
  profileRows.push(["AHU Units", ahus.length]);
  profileRows.push(["Chillers", data.chillers.length]);
  profileRows.push(["Cooling Towers", data.coolingTowers.length]);
  const profSheet = XLSX.utils.aoa_to_sheet(profileRows);
  profSheet["!cols"] = [{ wch: 34 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, profSheet, SHEET_PROFILE);

  dataSheet(wb, SHEET_AC, acs, AIR_FIELDS, airDerived);
  dataSheet(wb, SHEET_AHU, ahus, AIR_FIELDS, airDerived);
  dataSheet(wb, SHEET_CHILLERS, data.chillers, CHILLER_FIELDS, chillerDerived);
  dataSheet(wb, SHEET_CT, data.coolingTowers, CT_FIELDS, ctDerived);

  // ── "For Summary" tables, as the workbooks lay them out ──
  const d = (v: number | null, n = 2) => (v === null || !isFinite(v) ? "" : Number(v.toFixed(n)));
  summarySheet(wb, "AC Summary",
    ["Sr No", "AC No (Name)", "Type", "Location", "kW", "Return DBT", "Return WBT/RH", "Supply DBT", "Supply WBT/RH", "Flow CMH", "Net Capacity TR", "kW/TR", "EER", "Status", "Recorded By", "Date"],
    acs.map((u, i) => {
      const x = calcAirUnit(u);
      return [i + 1, u.tag, AIR_UNIT_LABEL[u.unitType], u.location ?? "", d(x.kwUsed), u.returnDbt ?? "", u.returnHum ?? "", u.supplyDbt ?? "", u.supplyHum ?? "",
        d(x.totalFlowCmh, 0), d(x.netTr), d(x.kwPerTr, 3), d(x.eer), x.verdict.label, u.recordedBy ?? "", new Date(u.createdAt).toLocaleString("en-IN")];
    }));
  summarySheet(wb, "AHU Summary",
    ["Sr No", "AHU No (Name)", "Type", "Location", "Fan kW", "Return DBT", "Return WBT/RH", "Supply DBT", "Supply WBT/RH", "Flow CMH", "Net Capacity TR", "Net Capacity kcal/h", "Status", "Recorded By", "Date"],
    ahus.map((u, i) => {
      const x = calcAirUnit(u);
      return [i + 1, u.tag, AIR_UNIT_LABEL[u.unitType], u.location ?? "", d(x.kwUsed), u.returnDbt ?? "", u.returnHum ?? "", u.supplyDbt ?? "", u.supplyHum ?? "",
        d(x.totalFlowCmh, 0), d(x.netTr), d(x.netKcalHr, 0), x.verdict.label, u.recordedBy ?? "", new Date(u.createdAt).toLocaleString("en-IN")];
    }));
  summarySheet(wb, "Chiller Summary",
    ["Sr No", "Description", "Type", "TR Generated By Chiller (TR)", "SPC Considering Compressor Power kW/TR", "SPC Considering Total Power kW/TR", "SFC kg/TR·h", "% Heat Balance", "Status", "Recorded By", "Date"],
    data.chillers.map((c, i) => {
      const x = calcChiller(c);
      return [i + 1, c.tag, CHILLER_LABEL[c.chillerType], d(x.trGenerated), d(x.spcCompressor, 3), d(x.spcTotal, 3), d(x.sfc, 3), d(x.hbPercent), x.verdict.label, c.recordedBy ?? "", new Date(c.createdAt).toLocaleString("en-IN")];
    }));
  summarySheet(wb, "Cooling Tower Summary",
    ["Sr No", "Cooling Tower", "Range °C", "Approach °C", "% Effectiveness", "L/G", "TR Generated", "Evaporation Loss CMH", "COC", "Blowdown CMH", "Makeup CMH", "Status", "Recorded By", "Date"],
    data.coolingTowers.map((t, i) => {
      const x = calcCoolingTower(t);
      return [i + 1, t.tag, d(x.range), d(x.approach), d(x.effectiveness), d(x.lgRatio, 3), d(x.trGenerated), d(x.evaporationCmh, 3), d(x.coc), d(x.blowdownCmh, 3), d(x.makeupCmh, 3), x.verdict.label, t.recordedBy ?? "", new Date(t.createdAt).toLocaleString("en-IN")];
    }));

  return wb;
}

const safe = (s: string) => s.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");

export function getExcelFilename(profile: CompanyProfile | null, reporterName?: string | null): string {
  const today = new Date();
  const ddmm = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}`;
  const company = profile?.companyName ? safe(profile.companyName) : "Plant";
  const who = reporterName ? `_${safe(reporterName)}` : "";
  return `ZeroDegree_${company}${who}_${ddmm}.xlsx`;
}

export function buildExcelBase64(data: DataSet, reporterName?: string | null): { base64: string; filename: string } {
  const wb = buildWorkbook(data, reporterName);
  return { base64: XLSX.write(wb, { type: "base64", bookType: "xlsx" }), filename: getExcelFilename(data.profile, reporterName) };
}

/**
 * Android: writes the file to Documents (falls back to Cache) and returns its
 *          URI so the caller can hand it to the share sheet.
 * Web:     triggers a browser download and returns the file name.
 */
export async function exportExcel(data: DataSet, reporterName?: string | null): Promise<string | null> {
  const wb = buildWorkbook(data, reporterName);
  const filename = getExcelFilename(data.profile, reporterName);

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    for (const dir of [Directory.Documents, Directory.Cache]) {
      try {
        const result = await Filesystem.writeFile({ path: filename, data: base64, directory: dir, recursive: true });
        return result.uri;
      } catch (e) {
        console.warn(`[excel] write to ${dir} failed, trying next:`, e);
      }
    }
    return null;
  }
  XLSX.writeFile(wb, filename);
  return filename;
}

/** Opens the native share sheet (WhatsApp, Drive, mail…) with the exported file. Android only. */
export async function shareExcel(data: DataSet, reporterName?: string | null): Promise<boolean> {
  const uri = await exportExcel(data, reporterName);
  if (!uri || !Capacitor.isNativePlatform()) return false;
  const { Share } = await import("@capacitor/share");
  const n = data.airUnits.length + data.chillers.length + data.coolingTowers.length;
  await Share.share({
    title: `Zero Degree data — ${data.profile?.companyName || "Plant"}`,
    text: `HVAC & cooling audit data for ${data.profile?.companyName || "the plant"} (${n} unit${n === 1 ? "" : "s"}). Import it in Zero Degree to merge, or drop it into PostMan.`,
    url: uri,
    dialogTitle: "Share Zero Degree data",
  });
  return true;
}

// ── Import ──────────────────────────────────────────────────────────────────

const normKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function findSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const want = normKey(name);
  const hit = wb.SheetNames.find((n) => normKey(n) === want);
  return hit ? wb.Sheets[hit] : null;
}

export function isZeroDegreeWorkbook(wb: XLSX.WorkBook): boolean {
  return [SHEET_AC, SHEET_AHU, SHEET_CHILLERS, SHEET_CT].some((n) => {
    const sh = findSheet(wb, n);
    if (!sh) return false;
    const head = (XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1 })[0] || []).map(normKey);
    return head.includes("tag");
  });
}

function parseRow(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> | null {
  const tag = row.tag === undefined || row.tag === null ? "" : String(row.tag).trim();
  if (!tag) return null;
  const e: Record<string, unknown> = {};
  for (const f of fields) {
    const v = row[f];
    const empty = v === undefined || v === null || v === "";
    if (ARRAY_FIELDS.has(f)) {
      e[f] = empty ? [] : String(v).split(/[,;\s]+/).map((s) => Number(s)).filter((n) => isFinite(n));
    } else if (STRING_FIELDS.has(f)) {
      e[f] = empty ? null : String(v).trim();
    } else {
      const n = empty ? null : Number(v);
      e[f] = n !== null && isFinite(n) ? n : null;
    }
  }
  e.tag = tag;
  if (!e.id) e.id = crypto.randomUUID();
  if (!e.createdAt) e.createdAt = new Date().toISOString();
  if (!e.createdById) e.createdById = "local-user";
  return e;
}

function readSheet(wb: XLSX.WorkBook, name: string, fields: readonly string[]) {
  const sh = findSheet(wb, name);
  if (!sh) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "" })
    .map((row) => parseRow(row, fields))
    .filter((x): x is Record<string, unknown> => x !== null);
}

/** Reads a Zero Degree workbook back into records. Throws a readable error for any other file. */
export function parseWorkbook(wb: XLSX.WorkBook): Partial<DataSet> {
  if (!isZeroDegreeWorkbook(wb)) {
    throw new Error(`Not a Zero Degree data file — no "${SHEET_AC}", "${SHEET_CHILLERS}" or "${SHEET_CT}" sheet with a tag column (sheets: ${wb.SheetNames.join(", ")}).`);
  }
  const air = (cat: "AC" | "AHU") => readSheet(wb, cat === "AC" ? SHEET_AC : SHEET_AHU, AIR_FIELDS).map((e) => ({
    ...e,
    category: cat,
    unitType: e.unitType || (cat === "AC" ? "SPLIT" : "AHU"),
    humidityMode: e.humidityMode === "WBT" ? "WBT" : "RH",
    phase: e.phase === 1 ? 1 : e.phase === 3 ? 3 : null,
  }) as unknown as AirUnit);
  const chillers = readSheet(wb, SHEET_CHILLERS, CHILLER_FIELDS).map((e) => ({ ...e, chillerType: e.chillerType || "VCS" }) as unknown as Chiller);
  const coolingTowers = readSheet(wb, SHEET_CT, CT_FIELDS).map((e) => ({ ...e, fanSizeMode: e.fanSizeMode === "PERIPHERY" ? "PERIPHERY" : "DIAMETER" }) as unknown as CoolingTower);

  let profile: Partial<CompanyProfile> | null = null;
  const profSheet = findSheet(wb, SHEET_PROFILE);
  if (profSheet) {
    const imported: Record<string, unknown> = {};
    for (const row of XLSX.utils.sheet_to_json<unknown[]>(profSheet, { header: 1 }).slice(1)) {
      if (row && row[0] !== undefined && row[1] !== undefined && row[1] !== "") imported[normKey(row[0])] = row[1];
    }
    profile = {};
    for (const [label, key] of PROFILE_ROWS) {
      const v = imported[normKey(label)];
      if (v !== undefined) (profile as Record<string, unknown>)[key] = key === "overallConsumption" ? v : String(v);
    }
  }
  return { profile: profile as CompanyProfile | null, airUnits: [...air("AC"), ...air("AHU")], chillers, coolingTowers };
}

export function readWorkbookFile(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(XLSX.read(e.target?.result, { type: "array" }));
      } catch {
        reject(new Error("That file is not a readable workbook."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsArrayBuffer(file);
  });
}
