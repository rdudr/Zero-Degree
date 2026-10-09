// Checks lib/calc.ts against the numbers the KISEM workbooks themselves
// produce (their cached cell values). Run: npm test
import { calcAirUnit, calcChiller, calcCoolingTower, enthalpy } from "../lib/calc";
import type { AirUnit, Chiller, CoolingTower } from "../lib/types";

let failed = 0;
function expect(label: string, got: number | null, want: number, tol = 1e-6) {
  const pass = got !== null && Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!pass) failed++;
  console.log(`${pass ? "✓" : "✗"} ${label}: ${got} (sheet ${want})`);
}

// ── Cooling Tower Analysis.xlsx — column B "CT-0(Press)" and column F "CT-02 Furnace" ──
const base = { createdAt: new Date().toISOString(), fanSizeMode: "DIAMETER" as const };
const ct0: CoolingTower = {
  ...base, id: "ct0", tag: "CT-0(Press)", inletTemp: 34.5, outletTemp: 32.9, airDbt: 31.5, airWbt: 25.6,
  noOfCells: 1, cellsOnline: 1, waterFlowCmh: 116, fanVelocities: [1.2, 1.85, 10.5, 4.5, 5.87, 9.67, 8.45],
  fanSize: 3, hubSize: 0.45, tdsMakeup: 218, tdsCirculating: 218,
};
const r0 = calcCoolingTower(ct0);
expect("CT-0 B11 avg velocity", r0.avgFanVelocity, 6.005714285714286);
expect("CT-0 B38 fan flow CMH", r0.fanFlowCmh, 149312.47705714288);
expect("CT-0 B39 air density", r0.airDensity, 1.1592413793103447);
expect("CT-0 B41 air kg/h", r0.airKgh, 173089.2018519665);
expect("CT-0 B42 L/G", r0.lgRatio, 0.6701746773274067);
expect("CT-0 B43 range", r0.range, 1.6000000000000014);
expect("CT-0 B44 approach", r0.approach, 7.299999999999997);
expect("CT-0 B45 effectiveness", r0.effectiveness, 17.97752808988766);
expect("CT-0 B47 heat load", r0.heatLoadKcalHr, 185600.00000000017);
expect("CT-0 B49 TR", r0.trGenerated, 61.37566137566143);
expect("CT-0 B50 evaporation", r0.evaporationCmh, 0.2839680000000003);
expect("CT-0 B51 evaporation %", r0.evaporationPct, 0.24480000000000024);
expect("CT-0 B52 COC", r0.coc, 1);
console.log(`  B53 blow-down: ${r0.blowdownCmh} (sheet #DIV/0! — COC = 1)`);

const ct2: CoolingTower = {
  ...base, id: "ct2", tag: "CT-02 Furnace", inletTemp: 37.7, outletTemp: 32.4, airDbt: 30.3, airWbt: 25.4,
  noOfCells: 1, cellsOnline: 1, waterFlowCmh: 203, fanVelocities: [2.47, 0.54, 0.66, 2.23, 5.62, 4.19],
  fanSize: 2.4, hubSize: 0.4, tdsMakeup: 218, tdsCirculating: 4000,
};
const r2 = calcCoolingTower(ct2);
expect("CT-02 F11 avg velocity", r2.avgFanVelocity, 2.6183333333333336);
expect("CT-02 F38 fan flow CMH", r2.fanFlowCmh, 41436.696);
expect("CT-02 F42 L/G", r2.lgRatio, 4.209419001256782);
expect("CT-02 F45 effectiveness", r2.effectiveness, 43.08943089430897);
expect("CT-02 F49 TR", r2.trGenerated, 355.78703703703735);
expect("CT-02 F52 COC", r2.coc, 18.34862385321101);
expect("CT-02 F53 blow-down", r2.blowdownCmh, 0.09488516287678483);
expect("CT-02 F54 make-up", r2.makeupCmh, 1.741012162876786);

// Periphery entered directly gives the same answer as the diameter
const r2p = calcCoolingTower({ ...ct2, fanSizeMode: "PERIPHERY", fanSize: 7.536, hubSize: 1.256 });
expect("CT-02 periphery mode", r2p.fanFlowCmh, 41436.696);

// ── Chiller Analysis.xlsx — "Chiller Heat Balance" row 20 ──
const hb: Chiller = {
  id: "ch1", tag: "1", chillerType: "VCS", createdAt: base.createdAt,
  hbCondFlowLps: 36, hbCondIn: 31.9, hbCondOut: 34, hbEvapFlowLps: 3.32, hbEvapIn: 4.5, hbEvapOut: 1.5, hbCompKw: 181,
};
const rh = calcChiller(hb);
expect("HB J20 heat rejected kW", rh.hbHeatRejected, 316.764, 1e-4);
expect("HB K20 heat gain kW", rh.hbHeatGain, 41.7324, 1e-4);
expect("HB L20 % heat balance", rh.hbPercent, -29.6851, 1e-4);

// CHILLER-VCS C11..C13 — the workbook is a blank template, so the formula is checked by hand:
// 50 CMH × (12 − 7) × 1 × 1000 / 3024 = 82.672 TR ; 60 kW / 82.672 = 0.7258
const vcs = calcChiller({ id: "v", tag: "VCS-1", chillerType: "VCS", createdAt: base.createdAt, waterFlowCmh: 50, inletTemp: 12, outletTemp: 7, specificHeat: 1, compressorKw: 60, totalKw: 75 });
expect("VCS C11 TR", vcs.trGenerated, (50 * 5 * 1000) / 3024);
expect("VCS C12 SPC comp", vcs.spcCompressor, 60 / ((50 * 5 * 1000) / 3024));
expect("VCS C13 SPC total", vcs.spcTotal, 75 / ((50 * 5 * 1000) / 3024));
// CHILLER-VCS_CT C12 "=(((C8*(C10-C9)*1*1000)/3024)-(0.9*C6)/3.517)"
const vct = calcChiller({ id: "c", tag: "VCS-CT", chillerType: "VCS_CT", createdAt: base.createdAt, waterFlowCmh: 120, inletTemp: 30, outletTemp: 35, compressorKw: 100, totalKw: 120 });
expect("VCS_CT C12 TR", vct.trGenerated, (120 * 5 * 1000) / 3024 - (0.9 * 100) / 3.517);
const vas = calcChiller({ id: "a", tag: "VAS-1", chillerType: "VAS", createdAt: base.createdAt, waterFlowCmh: 100, inletTemp: 12, outletTemp: 7, specificHeat: 1, fuelRate: 30, fuelCv: 10000 });
expect("VAS C12 SFC", vas.sfc, 30 / ((100 * 5 * 1000) / 3024));

// ── Psychrometrics (replaces the missing lookup table) — ASHRAE reference points ──
expect("h(25 °C, 50 % RH)", enthalpy(25, 50, "RH"), 50.32, 6e-3);
expect("h(35 °C DBT, 25 °C WBT)", enthalpy(35, 25, "WBT"), 76.0, 1e-2);
expect("RH 0.5 read as 50 %", enthalpy(25, 0.5, "RH"), enthalpy(25, 50, "RH")!);

// ── AC: Split - Window AC row 5 chain, with hand values ──
const ac: AirUnit = {
  id: "ac", tag: "AC-1", category: "AC", unitType: "SPLIT", humidityMode: "RH", createdAt: base.createdAt,
  velocities: [2, 2.2, 2.4, 2.1, 2.3], suctionArea: 0.08, returnDbt: 25, returnHum: 50, supplyDbt: 14, supplyHum: 90, kw: 1.6,
};
const ra = calcAirUnit(ac);
const flow = 2.2 * 0.08 * 3600;
const rho = (273 * 1.293) / (273 + 25);
const tr = (flow * rho * (enthalpy(25, 50, "RH")! - enthalpy(14, 90, "RH")!)) / (4.18 * 3024);
expect("AC AD5 flow CMH", ra.flowCmh, flow);
expect("AC AJ5 density", ra.density, rho);
expect("AC AE5 net TR", ra.netTr, tr);
expect("AC AG5 kW/TR", ra.kwPerTr, 1.6 / tr);
expect("AC AH5 EER", ra.eer, 12 / (1.6 / tr));

// Make-up air: AN5 "=((AL5*AT5*(AI5-AK5))+(AM5*AU5*(AJ5-AK5)))/(4.18*3024)"
const mk = calcAirUnit({ ...ac, unitType: "PACKAGE_MAKEUP", freshVelocities: [1.5, 1.7], freshArea: 0.05, freshDbt: 33, freshHum: 45 });
const fFlow = 1.6 * 0.05 * 3600, fRho = (273 * 1.293) / (273 + 33);
const trMk = (fFlow * fRho * (enthalpy(33, 45, "RH")! - enthalpy(14, 90, "RH")!) + flow * rho * (enthalpy(25, 50, "RH")! - enthalpy(14, 90, "RH")!)) / (4.18 * 3024);
expect("Make-up AN5 net TR", mk.netTr, trMk);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks match the workbooks.");
process.exit(failed ? 1 : 0);
