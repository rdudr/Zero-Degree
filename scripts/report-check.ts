// Builds the PDF and the Excel workbook from a sample plant with the app's own
// code, then imports the workbook back and merges it twice: nothing may be
// duplicated. Run: npx tsx scripts/report-check.ts <out-dir>
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { generateReportPDF } from "../lib/pdf";
import { buildWorkbook, parseWorkbook } from "../lib/excel";
import { mergeDataSets } from "../lib/merge";
import type { DataSet } from "../lib/types";

const out = process.argv[2] || ".";
const t0 = "2026-10-09T05:00:00.000Z";
const base = (tag: string, who: string) => ({ id: `${tag}-id`, tag, recordedBy: who, createdAt: t0, updatedAt: t0 });
const data: DataSet = {
  profile: { id: "p", companyName: "Shree Demo Textiles", area: "GIDC Phase 2", district: "Ahmedabad", state: "Gujarat", pincode: "382445", overallConsumption: 240000, updatedAt: t0 },
  airUnits: [
    { ...base("AC-01 Admin", "Rishabh"), category: "AC", unitType: "SPLIT", humidityMode: "RH", ratedTr: 1.5, velocities: [2, 2.2, 2.4, 2.1, 2.3], suctionArea: 0.08, returnDbt: 25, returnHum: 50, supplyDbt: 14, supplyHum: 90, phase: 1, voltage: 230, current: 7.4, pf: 0.94 },
    { ...base("AC-02 Lab", "Sagar"), category: "AC", unitType: "WINDOW", humidityMode: "WBT", ratedTr: 1.5, velocities: [3.1, 3.4, 2.9, 3.3], suctionArea: 0.09, returnDbt: 26, returnHum: 19, supplyDbt: 15, supplyHum: 13.5, kw: 1.7 },
    { ...base("PAC-01 Hall", "Abhay"), category: "AC", unitType: "PACKAGE", humidityMode: "RH", ratedTr: 8.5, velocities: [2.6, 2.8, 3, 2.7, 2.9, 3.1, 2.8], suctionArea: 0.6, returnDbt: 27, returnHum: 55, supplyDbt: 16, supplyHum: 88, kw: 9.4 },
    { ...base("PAC-02 Canteen", "Faizan"), category: "AC", unitType: "PACKAGE_MAKEUP", humidityMode: "RH", ratedTr: 11, velocities: [2.4, 2.6, 2.5, 2.7], suctionArea: 0.5, freshVelocities: [1.8, 2.0], freshArea: 0.2, freshDbt: 34, freshHum: 45, noOfFilters: 4, damperOpenPct: 30, returnDbt: 26, returnHum: 55, supplyDbt: 15, supplyHum: 90, kw: 12.5 },
    { ...base("AHU-01", "Rishabh"), category: "AHU", unitType: "AHU", humidityMode: "RH", ratedTr: 30, velocities: [3.2, 3.5, 3.1, 3.4, 3.3, 3.6], suctionArea: 1.4, returnDbt: 25, returnHum: 55, supplyDbt: 14, supplyHum: 92, kw: 7.5 },
    { ...base("AHU-02 OT", "Dhruvit"), category: "AHU", unitType: "AHU_MAKEUP", humidityMode: "RH", ratedTr: 25, velocities: [3, 3.2, 3.1], suctionArea: 1.0, freshVelocities: [2.2, 2.4], freshArea: 0.4, freshDbt: 34, freshHum: 50, returnDbt: 23, returnHum: 50, supplyDbt: 13, supplyHum: 92, kw: 5.5 },
  ],
  chillers: [
    { ...base("CH-01", "Abhay"), chillerType: "VCS", ratedTr: 200, refrigerant: "R-134a", waterFlowCmh: 95, inletTemp: 12, outletTemp: 7, specificHeat: 1, compressorKw: 112, totalKw: 140, hbCondFlowLps: 36, hbCondIn: 31.9, hbCondOut: 34, hbEvapFlowLps: 3.32, hbEvapIn: 4.5, hbEvapOut: 1.5, hbCompKw: 181 },
    { ...base("CH-02 Process", "Sagar"), chillerType: "VCS_CT", ratedTr: 150, waterFlowCmh: 120, inletTemp: 30, outletTemp: 35, compressorKw: 100, totalKw: 120 },
    { ...base("VAM-01", "Rahulpatel"), chillerType: "VAS", ratedTr: 100, refrigerant: "LiBr-water", waterFlowCmh: 55, inletTemp: 12, outletTemp: 7, specificHeat: 1, fuelRate: 30, fuelCv: 10000 },
  ],
  coolingTowers: [
    { ...base("CT-0(Press)", "Rishabh"), inletTemp: 34.5, outletTemp: 32.9, airDbt: 31.5, airWbt: 25.6, noOfCells: 1, cellsOnline: 1, waterFlowCmh: 116, fanVelocities: [1.2, 1.85, 10.5, 4.5, 5.87, 9.67, 8.45], fanSizeMode: "DIAMETER", fanSize: 3, hubSize: 0.45, tdsMakeup: 218, tdsCirculating: 218, fanAirDbt: 32.1, fanAirWbt: 30.4, fanMaterial: "FRP", couplingType: "Direct" },
    { ...base("CT-02 Furnace", "Faizan"), inletTemp: 37.7, outletTemp: 32.4, airDbt: 30.3, airWbt: 25.4, noOfCells: 1, cellsOnline: 1, waterFlowCmh: 203, fanVelocities: [2.47, 0.54, 0.66, 2.23, 5.62, 4.19], fanSizeMode: "DIAMETER", fanSize: 2.4, hubSize: 0.4, tdsMakeup: 218, tdsCirculating: 4000, fanAirDbt: 32.5, fanAirWbt: 30.6, fanMaterial: "FRP", couplingType: "Direct", description: "Fill partly choked; drift eliminators damaged on the east face." },
  ],
};

const logo = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, "../public/zero-degree-logo-sm.jpg")).toString("base64")}`;
fs.writeFileSync(path.join(out, "sample-report.pdf"), Buffer.from(generateReportPDF(data, "Rishabh Dangi", logo)));
const wb = buildWorkbook(data, "Rishabh Dangi");
XLSX.writeFile(wb, path.join(out, "sample-data.xlsx"));
console.log("sheets:", wb.SheetNames.join(" | "));

// round trip: read the written file back, merge into an empty device, then again
const back = parseWorkbook(XLSX.read(fs.readFileSync(path.join(out, "sample-data.xlsx"))));
const empty: DataSet = { profile: null, airUnits: [], chillers: [], coolingTowers: [] };
const first = mergeDataSets(empty, back);
const second = mergeDataSets(first.data, back);
console.log("first import:", JSON.stringify(first.summary));
console.log("second import:", JSON.stringify(second.summary));
const counts = (d: DataSet) => [d.airUnits.length, d.chillers.length, d.coolingTowers.length].join("/");
console.log("records after 1st / 2nd:", counts(first.data), counts(second.data), "company:", second.data.profile?.companyName);
// a teammate's newer copy of one tower must win
const newer = { ...back, coolingTowers: back.coolingTowers!.map((t) => t.tag === "CT-02 Furnace" ? { ...t, inletTemp: 38.5, updatedAt: "2026-10-09T09:00:00.000Z", recordedBy: "Faizan" } : t) };
const third = mergeDataSets(second.data, newer);
console.log("newer copy:", JSON.stringify(third.summary.coolingTowers), "CT-02 inlet now", third.data.coolingTowers.find((t) => t.tag === "CT-02 Furnace")?.inletTemp);
const lossless = JSON.stringify(data.airUnits[3].freshVelocities) === JSON.stringify(back.airUnits!.find((u) => u.tag === "PAC-02 Canteen")?.freshVelocities);
console.log("arrays round-trip:", lossless);
