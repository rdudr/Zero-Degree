import type { AirUnit, Chiller, CoolingTower, HumidityMode } from "@/lib/types";
import { hasMakeup } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Zero Degree — calculations
//
// Each function reproduces a sheet of the KISEM analysis workbooks
// ("AC Analysis.xlsx", "Chiller Analysis.xlsx", "Cooling Tower Analysis.xlsx").
// The cell each line came from is noted beside it so the two can be checked
// against each other. The constants (3024 kcal/h per TR, 4.18 kJ/kcal,
// 1.293 kg/m³ air at 0 °C, 3.14 for π in the cooling-tower sheet …) are the
// workbooks' own and are kept as they are, so the app gives the same numbers
// the sheets do.
//
// The one place the workbooks could not be copied: every AC / AHU enthalpy
// cell looks up a psychrometric table that is no longer in the file
// (=VLOOKUP(DBT,#REF!,7)+VLOOKUP(DBT,#REF!,6)*1000*RH*2.55). It is replaced
// by the standard ASHRAE psychrometric equations below, which is what that
// table held: h = 1.006·t + W·(2501 + 1.86·t) kJ/kg dry air.
//
// PostMan mirrors these formulas — change them together (docs/POSTMAN.md).
// ─────────────────────────────────────────────────────────────────────────────

export const KCAL_PER_TR = 3024;      // kcal/h in one TR, as the sheets use
export const KJ_PER_KCAL = 4.18;      // AC sheets
export const KJ_PER_KCAL_HB = 4.19;   // heat-balance sheet
export const KW_PER_TR = 3.517;
export const P_ATM_KPA = 101.325;

export type CalcStep = { quantity: string; formula: string; substitution: string; result: string };
export type Tone = "good" | "warn" | "bad" | "muted";
export type Verdict = { label: string; tone: Tone };

// ── small helpers ───────────────────────────────────────────────────────────

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return isFinite(n) ? n : null;
};
const ok = (v: number | null | undefined): v is number => typeof v === "number" && isFinite(v);
/** AVERAGE() as Excel does it — blanks ignored, null when nothing was entered. */
export const average = (xs: (number | null | undefined)[] | null | undefined): number | null => {
  const v = (xs ?? []).map(num).filter(ok);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const div = (a: number | null, b: number | null): number | null =>
  ok(a) && ok(b) && b !== 0 ? a / b : null;
export const f = (v: number | null | undefined, d = 2, unit = ""): string =>
  ok(v) ? `${v.toFixed(d)}${unit ? ` ${unit}` : ""}` : "—";

// ── psychrometrics (replaces the missing lookup table) ─────────────────────

/** Saturation pressure of water vapour over liquid water, kPa (ASHRAE Hyland–Wexler). */
export function satPressureKPa(tC: number): number {
  const T = tC + 273.15;
  const ln =
    -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T * T - 1.4452093e-8 * T * T * T + 6.5459673 * Math.log(T);
  return Math.exp(ln) / 1000;
}

/** Humidity ratio, kg water / kg dry air. */
export function humidityRatio(dbt: number, hum: number, mode: HumidityMode, pKPa = P_ATM_KPA): number | null {
  if (mode === "RH") {
    // RH in %; a value of 1 or less is read as a fraction, which is how the
    // workbook's formula expects it (…*RH*100/100).
    const phi = hum <= 1 ? hum : hum / 100;
    if (phi < 0 || phi > 1.0001) return null;
    const pw = phi * satPressureKPa(dbt);
    return (0.621945 * pw) / (pKPa - pw);
  }
  // Wet-bulb (ASHRAE Fundamentals, eq. 33)
  if (hum > dbt + 1e-9) return null;
  const pws = satPressureKPa(hum);
  const wsStar = (0.621945 * pws) / (pKPa - pws);
  const w = ((2501 - 2.326 * hum) * wsStar - 1.006 * (dbt - hum)) / (2501 + 1.86 * dbt - 4.186 * hum);
  return w >= 0 ? w : 0;
}

/** Specific enthalpy of moist air, kJ/kg dry air. */
export function enthalpy(dbt: number | null | undefined, hum: number | null | undefined, mode: HumidityMode): number | null {
  const t = num(dbt), h = num(hum);
  if (t === null || h === null) return null;
  const w = humidityRatio(t, h, mode);
  if (w === null) return null;
  return 1.006 * t + w * (2501 + 1.86 * t);
}

/** Air density from dry-bulb, kg/m³ — "=(273*1.293)/(273+DBT)" in every sheet. */
export const airDensity = (dbt: number | null | undefined): number | null => {
  const t = num(dbt);
  return t === null ? null : (273 * 1.293) / (273 + t);
};

// ── verdict bands ───────────────────────────────────────────────────────────
// Indicative bands for the report's status column. They are not in the
// workbooks; adjust here if KISEM settles on different limits.

export const BANDS = {
  acKwPerTr: { good: 1.2, fair: 1.6 },       // split / window / package AC, kW/TR
  chillerKwPerTr: { good: 0.8, fair: 1.1 },  // total kW/TR
  capacityPct: { good: 90, fair: 75 },       // delivered vs rated TR
  ctEffectiveness: { good: 60, fair: 45 },   // % when no rated value is given
  heatBalancePct: 5,                         // ± % — BEE acceptance for a heat balance
};

function lowerIsBetter(v: number | null, b: { good: number; fair: number }, unit: string): Verdict {
  if (v === null) return { label: "Incomplete", tone: "muted" };
  if (v <= b.good) return { label: `Efficient (≤ ${b.good} ${unit})`, tone: "good" };
  if (v <= b.fair) return { label: `Average (${b.good}–${b.fair} ${unit})`, tone: "warn" };
  return { label: `Poor (> ${b.fair} ${unit})`, tone: "bad" };
}

function capacityVerdict(pct: number | null): Verdict | null {
  if (pct === null) return null;
  if (pct >= BANDS.capacityPct.good) return { label: `Delivering ${pct.toFixed(0)} % of rated`, tone: "good" };
  if (pct >= BANDS.capacityPct.fair) return { label: `Derated — ${pct.toFixed(0)} % of rated`, tone: "warn" };
  return { label: `Severely derated — ${pct.toFixed(0)} % of rated`, tone: "bad" };
}

// ── AC / AHU ────────────────────────────────────────────────────────────────

export type AirUnitResult = {
  avgVelocity: number | null;      // m/s (return / only stream)
  flowCmh: number | null;          // m³/h (return / only stream)
  freshAvgVelocity: number | null;
  freshFlowCmh: number | null;
  totalFlowCmh: number | null;
  density: number | null;          // at return air
  freshDensity: number | null;
  hReturn: number | null;          // kJ/kg
  hSupply: number | null;
  hFresh: number | null;
  netTr: number | null;
  netKcalHr: number | null;
  kwUsed: number | null;           // measured kW, or worked from V·I·PF
  kwComputed: boolean;
  kwPerTr: number | null;          // AC only
  eer: number | null;              // AC only — 12 / (kW/TR)
  capacityPct: number | null;
  verdict: Verdict;
  steps: CalcStep[];
};

export function calcAirUnit(u: AirUnit): AirUnitResult {
  const mk = hasMakeup(u.unitType);
  const isAc = u.category === "AC";
  const steps: CalcStep[] = [];

  // Avg velocity — P5 "=AVERAGE(C5:G6)"; flow — AD5 "=AC5*H5*3600"
  const avgVelocity = average(u.velocities);
  const area = num(u.suctionArea);
  const flowCmh = ok(avgVelocity) && ok(area) ? avgVelocity * area * 3600 : null;
  const freshAvgVelocity = mk ? average(u.freshVelocities) : null;
  const freshArea = num(u.freshArea);
  const freshFlowCmh = mk && ok(freshAvgVelocity) && ok(freshArea) ? freshAvgVelocity * freshArea * 3600 : null;
  const totalFlowCmh = mk ? (ok(flowCmh) || ok(freshFlowCmh) ? (flowCmh ?? 0) + (freshFlowCmh ?? 0) : null) : flowCmh;

  // Air density — AJ5 "=(273*1.293)/(273+W5)" (return-air DBT)
  const density = airDensity(u.returnDbt);
  const freshDensity = mk ? airDensity(u.freshDbt) : null;

  // Enthalpies — AA5 / AB5 (and AI5 for the fresh air)
  const hReturn = enthalpy(u.returnDbt, u.returnHum, u.humidityMode);
  const hSupply = enthalpy(u.supplyDbt, u.supplyHum, u.humidityMode);
  const hFresh = mk ? enthalpy(u.freshDbt, u.freshHum, u.humidityMode) : null;

  // Net capacity
  //   AE5 "=(AD5*AJ5*(AA5-AB5))/(4.18*3024)"
  //   make-up: AN5 "=((AL5*AT5*(AI5-AK5))+(AM5*AU5*(AJ5-AK5)))/(4.18*3024)"
  let netTr: number | null = null;
  if (mk) {
    const parts: number[] = [];
    if (ok(freshFlowCmh) && ok(freshDensity) && ok(hFresh) && ok(hSupply)) parts.push(freshFlowCmh * freshDensity * (hFresh - hSupply));
    if (ok(flowCmh) && ok(density) && ok(hReturn) && ok(hSupply)) parts.push(flowCmh * density * (hReturn - hSupply));
    netTr = parts.length ? parts.reduce((a, b) => a + b, 0) / (KJ_PER_KCAL * KCAL_PER_TR) : null;
  } else if (ok(flowCmh) && ok(density) && ok(hReturn) && ok(hSupply)) {
    netTr = (flowCmh * density * (hReturn - hSupply)) / (KJ_PER_KCAL * KCAL_PER_TR);
  }
  const netKcalHr = ok(netTr) ? netTr * KCAL_PER_TR : null; // AF5 "=AE5*3024"

  // Power — the sheets take kW from the meter; when it was not noted, work it out.
  let kwUsed = num(u.kw);
  let kwComputed = false;
  const v = num(u.voltage), i = num(u.current), pf = num(u.pf);
  if (kwUsed === null && ok(v) && ok(i) && ok(pf)) {
    kwUsed = ((u.phase === 1 ? 1 : Math.sqrt(3)) * v * i * pf) / 1000;
    kwComputed = true;
  }

  // AG5 "=V5/AE5" kW/TR ; AH5 "=12/AG5" EER (AC sheets only — the AHU sheets stop at capacity)
  const kwPerTr = isAc ? div(kwUsed, netTr && netTr > 0 ? netTr : null) : null;
  const eer = isAc ? div(12, kwPerTr) : null;
  const capacityPct = ok(netTr) && ok(num(u.ratedTr)) && num(u.ratedTr)! > 0 ? (netTr / num(u.ratedTr)!) * 100 : null;

  // ── worked steps, for the screen and the PDF ──
  const vel = (u.velocities ?? []).map(num).filter(ok);
  steps.push({
    quantity: mk ? "Avg return-air velocity" : "Avg suction velocity",
    formula: "Σ v / n",
    substitution: vel.length ? `(${vel.join(" + ")}) / ${vel.length}` : "no readings",
    result: f(avgVelocity, 2, "m/s"),
  });
  steps.push({ quantity: mk ? "Return-air flow" : "Air flow", formula: "v̄ × A × 3600", substitution: `${f(avgVelocity, 2)} × ${f(area, 3)} × 3600`, result: f(flowCmh, 0, "m³/h") });
  if (mk) {
    const fv = (u.freshVelocities ?? []).map(num).filter(ok);
    steps.push({ quantity: "Avg make-up air velocity", formula: "Σ v / n", substitution: fv.length ? `(${fv.join(" + ")}) / ${fv.length}` : "no readings", result: f(freshAvgVelocity, 2, "m/s") });
    steps.push({ quantity: "Make-up air flow", formula: "v̄ × A × 3600", substitution: `${f(freshAvgVelocity, 2)} × ${f(freshArea, 3)} × 3600`, result: f(freshFlowCmh, 0, "m³/h") });
  }
  steps.push({ quantity: "Air density (return)", formula: "273 × 1.293 / (273 + DBT)", substitution: `273 × 1.293 / (273 + ${f(num(u.returnDbt), 1)})`, result: f(density, 4, "kg/m³") });
  if (mk) steps.push({ quantity: "Air density (make-up)", formula: "273 × 1.293 / (273 + DBT)", substitution: `273 × 1.293 / (273 + ${f(num(u.freshDbt), 1)})`, result: f(freshDensity, 4, "kg/m³") });
  const humLbl = u.humidityMode === "RH" ? "RH" : "WBT";
  const humUnit = u.humidityMode === "RH" ? "%" : "°C";
  steps.push({ quantity: "Enthalpy, return air", formula: `h(DBT, ${humLbl})`, substitution: `${f(num(u.returnDbt), 1)} °C, ${f(num(u.returnHum), 1)} ${humUnit}`, result: f(hReturn, 2, "kJ/kg") });
  if (mk) steps.push({ quantity: "Enthalpy, make-up air", formula: `h(DBT, ${humLbl})`, substitution: `${f(num(u.freshDbt), 1)} °C, ${f(num(u.freshHum), 1)} ${humUnit}`, result: f(hFresh, 2, "kJ/kg") });
  steps.push({ quantity: "Enthalpy, supply air", formula: `h(DBT, ${humLbl})`, substitution: `${f(num(u.supplyDbt), 1)} °C, ${f(num(u.supplyHum), 1)} ${humUnit}`, result: f(hSupply, 2, "kJ/kg") });
  steps.push(
    mk
      ? {
          quantity: "Net capacity",
          formula: "[Qf·ρf·(hf − hs) + Qr·ρr·(hr − hs)] / (4.18 × 3024)",
          substitution: `[${f(freshFlowCmh, 0)}·${f(freshDensity, 3)}·(${f(hFresh, 1)} − ${f(hSupply, 1)}) + ${f(flowCmh, 0)}·${f(density, 3)}·(${f(hReturn, 1)} − ${f(hSupply, 1)})] / 12 640`,
          result: f(netTr, 2, "TR"),
        }
      : {
          quantity: "Net capacity",
          formula: "Q × ρ × (hr − hs) / (4.18 × 3024)",
          substitution: `${f(flowCmh, 0)} × ${f(density, 3)} × (${f(hReturn, 1)} − ${f(hSupply, 1)}) / 12 640`,
          result: f(netTr, 2, "TR"),
        },
  );
  steps.push({ quantity: "Net capacity (heat)", formula: "TR × 3024", substitution: `${f(netTr, 2)} × 3024`, result: f(netKcalHr, 0, "kcal/h") });
  if (kwComputed) {
    steps.push({ quantity: "Power (worked)", formula: u.phase === 1 ? "V × I × PF / 1000" : "√3 × V × I × PF / 1000", substitution: `${f(v, 1)} × ${f(i, 2)} × ${f(pf, 3)}`, result: f(kwUsed, 2, "kW") });
  }
  if (isAc) {
    steps.push({ quantity: "Specific power", formula: "kW / TR", substitution: `${f(kwUsed, 2)} / ${f(netTr, 2)}`, result: f(kwPerTr, 3, "kW/TR") });
    steps.push({ quantity: "Energy efficiency ratio", formula: "12 / (kW/TR)", substitution: `12 / ${f(kwPerTr, 3)}`, result: f(eer, 2) });
  }
  if (capacityPct !== null) steps.push({ quantity: "Capacity vs rated", formula: "TR / rated TR × 100", substitution: `${f(netTr, 2)} / ${f(num(u.ratedTr), 2)} × 100`, result: f(capacityPct, 1, "%") });

  let verdict: Verdict;
  if (netTr === null) verdict = { label: "Incomplete readings", tone: "muted" };
  else if (netTr <= 0) verdict = { label: "No cooling measured (supply not below return)", tone: "bad" };
  else if (isAc && kwPerTr !== null) verdict = lowerIsBetter(kwPerTr, BANDS.acKwPerTr, "kW/TR");
  else verdict = capacityVerdict(capacityPct) ?? { label: "Capacity measured", tone: "muted" };

  return { avgVelocity, flowCmh, freshAvgVelocity, freshFlowCmh, totalFlowCmh, density, freshDensity, hReturn, hSupply, hFresh, netTr, netKcalHr, kwUsed, kwComputed, kwPerTr, eer, capacityPct, verdict, steps };
}

// ── Chillers ────────────────────────────────────────────────────────────────

export type ChillerResult = {
  trGenerated: number | null;
  spcCompressor: number | null; // kW/TR
  spcTotal: number | null;      // kW/TR
  sfc: number | null;           // VAS — kg fuel per TR·h
  heatInputKcalHr: number | null;
  cop: number | null;           // VAS — cooling ÷ fuel heat
  capacityPct: number | null;
  hbHeatRejected: number | null; // kW
  hbHeatGain: number | null;     // kW
  hbPercent: number | null;
  hbVerdict: Verdict | null;
  verdict: Verdict;
  steps: CalcStep[];
};

export function calcChiller(c: Chiller): ChillerResult {
  const steps: CalcStep[] = [];
  const q = num(c.waterFlowCmh), tin = num(c.inletTemp), tout = num(c.outletTemp);
  const cp = num(c.specificHeat) ?? 1;
  const comp = num(c.compressorKw), total = num(c.totalKw);

  let trGenerated: number | null = null;
  if (ok(q) && ok(tin) && ok(tout)) {
    if (c.chillerType === "VCS_CT") {
      // CHILLER-VCS_CT C12 "=(((C8*(C10-C9)*1*1000)/3024)-(0.9*C6)/3.517)"
      // heat rejected at the condenser less 90 % of the compressor input
      trGenerated = (q * (tout - tin) * cp * 1000) / KCAL_PER_TR - (0.9 * (comp ?? 0)) / KW_PER_TR;
      steps.push({
        quantity: "TR generated",
        formula: "Q × (Tout − Tin) × Cp × 1000 / 3024 − 0.9 × kWcomp / 3.517",
        substitution: `${f(q, 1)} × (${f(tout, 1)} − ${f(tin, 1)}) × ${cp} × 1000 / 3024 − 0.9 × ${f(comp, 1)} / 3.517`,
        result: f(trGenerated, 2, "TR"),
      });
    } else {
      // CHILLER-VCS / CHILLER-VAS C11 "=C7*(C8-C9)*C10*1000/(3024)"
      trGenerated = (q * (tin - tout) * cp * 1000) / KCAL_PER_TR;
      steps.push({
        quantity: "TR generated",
        formula: "Q × (Tin − Tout) × Cp × 1000 / 3024",
        substitution: `${f(q, 1)} × (${f(tin, 1)} − ${f(tout, 1)}) × ${cp} × 1000 / 3024`,
        result: f(trGenerated, 2, "TR"),
      });
    }
  }
  const trPos = trGenerated !== null && trGenerated > 0 ? trGenerated : null;

  let spcCompressor: number | null = null, spcTotal: number | null = null, sfc: number | null = null;
  let heatInputKcalHr: number | null = null, cop: number | null = null;
  if (c.chillerType === "VAS") {
    // CHILLER-VAS C12 "=C5/C11" — fuel kg/h per TR (the sheet's label says KW/KCAL)
    const fuel = num(c.fuelRate), cv = num(c.fuelCv);
    sfc = div(fuel, trPos);
    steps.push({ quantity: "Specific fuel consumption", formula: "fuel kg/h / TR", substitution: `${f(fuel, 2)} / ${f(trGenerated, 2)}`, result: f(sfc, 3, "kg/TR·h") });
    if (ok(fuel) && ok(cv)) {
      heatInputKcalHr = fuel * cv;
      cop = div(trPos !== null ? trPos * KCAL_PER_TR : null, heatInputKcalHr);
      steps.push({ quantity: "COP (thermal)", formula: "TR × 3024 / (fuel × CV)", substitution: `${f(trGenerated, 2)} × 3024 / (${f(fuel, 2)} × ${f(cv, 0)})`, result: f(cop, 3) });
    }
  } else {
    // C13 "=C6/C12" ; C14 "=C7/C12"
    spcCompressor = div(comp, trPos);
    spcTotal = div(total, trPos);
    steps.push({ quantity: "SPC, compressor power", formula: "kW comp / TR", substitution: `${f(comp, 2)} / ${f(trGenerated, 2)}`, result: f(spcCompressor, 3, "kW/TR") });
    steps.push({ quantity: "SPC, total power", formula: "kW total / TR", substitution: `${f(total, 2)} / ${f(trGenerated, 2)}`, result: f(spcTotal, 3, "kW/TR") });
  }

  const rated = num(c.ratedTr);
  const capacityPct = trPos !== null && ok(rated) && rated > 0 ? (trPos / rated) * 100 : null;
  if (capacityPct !== null) steps.push({ quantity: "Capacity vs rated", formula: "TR / rated TR × 100", substitution: `${f(trGenerated, 2)} / ${f(rated, 1)} × 100`, result: f(capacityPct, 1, "%") });

  // Chiller Heat Balance — J20 "=C20*4.19*(E20-D20)", K20 "=F20*4.19*(G20-H20)", L20 "=100*(I20+K20-J20)/J20"
  const cf = num(c.hbCondFlowLps), ci = num(c.hbCondIn), co = num(c.hbCondOut);
  const ef = num(c.hbEvapFlowLps), ei = num(c.hbEvapIn), eo = num(c.hbEvapOut);
  const hbComp = num(c.hbCompKw) ?? comp;
  const hbHeatRejected = ok(cf) && ok(ci) && ok(co) ? cf * KJ_PER_KCAL_HB * (co - ci) : null;
  const hbHeatGain = ok(ef) && ok(ei) && ok(eo) ? ef * KJ_PER_KCAL_HB * (ei - eo) : null;
  const hbPercent = ok(hbHeatRejected) && hbHeatRejected !== 0 && ok(hbHeatGain) && ok(hbComp)
    ? (100 * (hbComp + hbHeatGain - hbHeatRejected)) / hbHeatRejected
    : null;
  let hbVerdict: Verdict | null = null;
  if (hbHeatRejected !== null || hbHeatGain !== null) {
    steps.push({ quantity: "Heat rejected (condenser)", formula: "LPS × 4.19 × (Tout − Tin)", substitution: `${f(cf, 2)} × 4.19 × (${f(co, 1)} − ${f(ci, 1)})`, result: f(hbHeatRejected, 2, "kW") });
    steps.push({ quantity: "Heat gained (evaporator)", formula: "LPS × 4.19 × (Tin − Tout)", substitution: `${f(ef, 2)} × 4.19 × (${f(ei, 1)} − ${f(eo, 1)})`, result: f(hbHeatGain, 2, "kW") });
    steps.push({ quantity: "Heat balance", formula: "100 × (kW + gain − rejected) / rejected", substitution: `100 × (${f(hbComp, 1)} + ${f(hbHeatGain, 2)} − ${f(hbHeatRejected, 2)}) / ${f(hbHeatRejected, 2)}`, result: f(hbPercent, 2, "%") });
    hbVerdict = hbPercent === null
      ? { label: "Incomplete", tone: "muted" }
      : Math.abs(hbPercent) <= BANDS.heatBalancePct
        ? { label: `Balanced (within ±${BANDS.heatBalancePct} %)`, tone: "good" }
        : { label: `Out of balance (${hbPercent.toFixed(1)} %) — re-check flows and temperatures`, tone: "bad" };
  }

  let verdict: Verdict;
  if (trGenerated === null) verdict = { label: "Incomplete readings", tone: "muted" };
  else if (trGenerated <= 0) verdict = { label: "No cooling measured — check temperatures", tone: "bad" };
  else if (c.chillerType !== "VAS" && spcTotal !== null) verdict = lowerIsBetter(spcTotal, BANDS.chillerKwPerTr, "kW/TR");
  else if (c.chillerType !== "VAS" && spcCompressor !== null) verdict = lowerIsBetter(spcCompressor, BANDS.chillerKwPerTr, "kW/TR");
  else verdict = capacityVerdict(capacityPct) ?? { label: "Capacity measured", tone: "muted" };

  return { trGenerated, spcCompressor, spcTotal, sfc, heatInputKcalHr, cop, capacityPct, hbHeatRejected, hbHeatGain, hbPercent, hbVerdict, verdict, steps };
}

// ── Cooling towers ──────────────────────────────────────────────────────────

export type CoolingTowerResult = {
  avgFanVelocity: number | null;
  fanPeriphery: number | null;
  hubPeriphery: number | null;
  fanFlowCmh: number | null;
  airDensity: number | null;
  waterKgh: number | null;
  airKgh: number | null;
  lgRatio: number | null;
  range: number | null;
  approach: number | null;
  effectiveness: number | null;
  heatLoadKcalHr: number | null;
  trGenerated: number | null;
  evaporationCmh: number | null;
  evaporationPct: number | null;
  coc: number | null;
  blowdownCmh: number | null;
  makeupCmh: number | null;
  capacityPct: number | null;
  verdict: Verdict;
  steps: CalcStep[];
};

const CT_PI = 3.14; // the sheet's own value of π

export function calcCoolingTower(t: CoolingTower): CoolingTowerResult {
  const steps: CalcStep[] = [];
  // B11 "=AVERAGE(B20:C29)"
  const avgFanVelocity = average(t.fanVelocities);
  // B12 "=3.14*3" (periphery = π·D), B13 "=0.45*3.14"
  const fs = num(t.fanSize), hs = num(t.hubSize);
  const toPeri = (x: number | null) => (x === null ? null : t.fanSizeMode === "PERIPHERY" ? x : CT_PI * x);
  const fanPeriphery = toPeri(fs), hubPeriphery = toPeri(hs) ?? 0;
  // B38 "=((B12*B12*B11/(4*3.14))-(B13*B13*B11/(4*3.14)))*3600"
  const fanFlowCmh = ok(fanPeriphery) && ok(avgFanVelocity)
    ? ((fanPeriphery * fanPeriphery * avgFanVelocity) / (4 * CT_PI) - (hubPeriphery * hubPeriphery * avgFanVelocity) / (4 * CT_PI)) * 3600
    : null;
  // B39 "=(273*1.293)/(273+B6)"
  const density = airDensity(t.airDbt);
  const flow = num(t.waterFlowCmh);
  const waterKgh = ok(flow) ? flow * 1000 : null;             // B40
  const airKgh = ok(fanFlowCmh) && ok(density) ? fanFlowCmh * density : null; // B41
  const lgRatio = div(waterKgh, airKgh);                       // B42
  const tin = num(t.inletTemp), tout = num(t.outletTemp), wbt = num(t.airWbt);
  const range = ok(tin) && ok(tout) ? tin - tout : null;       // B43
  const approach = ok(tout) && ok(wbt) ? tout - wbt : null;    // B44
  const effectiveness = ok(range) && ok(approach) && range + approach !== 0 ? (range * 100) / (range + approach) : null; // B45
  const heatLoadKcalHr = ok(flow) && ok(range) ? flow * 1000 * range : null;  // B47
  const trGenerated = ok(heatLoadKcalHr) ? heatLoadKcalHr / KCAL_PER_TR : null; // B49
  const evaporationCmh = ok(flow) && ok(range) ? 0.00085 * 1.8 * flow * range : null; // B50
  const evaporationPct = ok(evaporationCmh) && ok(flow) && flow !== 0 ? (evaporationCmh * 100) / flow : null; // B51
  const coc = div(num(t.tdsCirculating), num(t.tdsMakeup));    // B52
  const blowdownCmh = ok(evaporationCmh) && ok(coc) && coc > 1 ? evaporationCmh / (coc - 1) : null; // B53
  const makeupCmh = ok(evaporationCmh) && ok(blowdownCmh) ? evaporationCmh + blowdownCmh : null;    // B54
  const rated = num(t.ratedTr);
  const capacityPct = ok(trGenerated) && ok(rated) && rated > 0 ? (trGenerated / rated) * 100 : null;

  const vel = (t.fanVelocities ?? []).map(num).filter(ok);
  steps.push({ quantity: "Avg fan air velocity", formula: "Σ v / n", substitution: vel.length ? `(${vel.join(" + ")}) / ${vel.length}` : "no readings", result: f(avgFanVelocity, 3, "m/s") });
  if (t.fanSizeMode !== "PERIPHERY") {
    steps.push({ quantity: "Fan periphery", formula: "3.14 × D", substitution: `3.14 × ${f(fs, 2)}`, result: f(fanPeriphery, 3, "m") });
    steps.push({ quantity: "Hub periphery", formula: "3.14 × d", substitution: `3.14 × ${f(hs, 2)}`, result: f(hubPeriphery, 3, "m") });
  }
  steps.push({ quantity: "CT fan air flow", formula: "(P² − p²) × v̄ / (4 × 3.14) × 3600", substitution: `(${f(fanPeriphery, 3)}² − ${f(hubPeriphery, 3)}²) × ${f(avgFanVelocity, 3)} / 12.56 × 3600`, result: f(fanFlowCmh, 0, "m³/h") });
  steps.push({ quantity: "Air density", formula: "273 × 1.293 / (273 + DBT)", substitution: `273 × 1.293 / (273 + ${f(num(t.airDbt), 1)})`, result: f(density, 4, "kg/m³") });
  steps.push({ quantity: "Water flow (mass)", formula: "Q × 1000", substitution: `${f(flow, 1)} × 1000`, result: f(waterKgh, 0, "kg/h") });
  steps.push({ quantity: "Air flow (mass)", formula: "Q air × ρ", substitution: `${f(fanFlowCmh, 0)} × ${f(density, 4)}`, result: f(airKgh, 0, "kg/h") });
  steps.push({ quantity: "L/G ratio", formula: "water kg/h / air kg/h", substitution: `${f(waterKgh, 0)} / ${f(airKgh, 0)}`, result: f(lgRatio, 3) });
  steps.push({ quantity: "Range", formula: "Tin − Tout", substitution: `${f(tin, 1)} − ${f(tout, 1)}`, result: f(range, 2, "°C") });
  steps.push({ quantity: "Approach", formula: "Tout − WBT", substitution: `${f(tout, 1)} − ${f(wbt, 1)}`, result: f(approach, 2, "°C") });
  steps.push({ quantity: "Effectiveness", formula: "Range × 100 / (Range + Approach)", substitution: `${f(range, 2)} × 100 / (${f(range, 2)} + ${f(approach, 2)})`, result: f(effectiveness, 2, "%") });
  steps.push({ quantity: "Heat load", formula: "Q × 1000 × Range", substitution: `${f(flow, 1)} × 1000 × ${f(range, 2)}`, result: f(heatLoadKcalHr, 0, "kcal/h") });
  steps.push({ quantity: "TR generated", formula: "Heat load / 3024", substitution: `${f(heatLoadKcalHr, 0)} / 3024`, result: f(trGenerated, 2, "TR") });
  steps.push({ quantity: "Evaporation loss", formula: "0.00085 × 1.8 × Q × Range", substitution: `0.00085 × 1.8 × ${f(flow, 1)} × ${f(range, 2)}`, result: f(evaporationCmh, 3, "m³/h") });
  steps.push({ quantity: "Evaporation loss", formula: "Evap × 100 / Q", substitution: `${f(evaporationCmh, 3)} × 100 / ${f(flow, 1)}`, result: f(evaporationPct, 3, "%") });
  steps.push({ quantity: "Cycles of concentration", formula: "TDS circ / TDS make-up", substitution: `${f(num(t.tdsCirculating), 0)} / ${f(num(t.tdsMakeup), 0)}`, result: f(coc, 2) });
  steps.push({ quantity: "Blow-down requirement", formula: "Evap / (COC − 1)", substitution: `${f(evaporationCmh, 3)} / (${f(coc, 2)} − 1)`, result: coc !== null && coc <= 1 ? "— (COC ≤ 1)" : f(blowdownCmh, 3, "m³/h") });
  steps.push({ quantity: "Make-up water requirement", formula: "Evap + Blow-down", substitution: `${f(evaporationCmh, 3)} + ${f(blowdownCmh, 3)}`, result: f(makeupCmh, 3, "m³/h") });

  let verdict: Verdict;
  const ratedEff = num(t.ratedEffectiveness);
  if (effectiveness === null) verdict = { label: "Incomplete readings", tone: "muted" };
  else if (ratedEff !== null && ratedEff > 0) {
    const gap = effectiveness - ratedEff;
    verdict = gap >= -5
      ? { label: `At design (${effectiveness.toFixed(1)} % vs ${ratedEff} %)`, tone: "good" }
      : gap >= -15
        ? { label: `Below design by ${(-gap).toFixed(1)} points`, tone: "warn" }
        : { label: `Well below design by ${(-gap).toFixed(1)} points`, tone: "bad" };
  } else if (effectiveness >= BANDS.ctEffectiveness.good) verdict = { label: `Good (≥ ${BANDS.ctEffectiveness.good} %)`, tone: "good" };
  else if (effectiveness >= BANDS.ctEffectiveness.fair) verdict = { label: `Fair (${BANDS.ctEffectiveness.fair}–${BANDS.ctEffectiveness.good} %)`, tone: "warn" };
  else verdict = { label: `Poor (< ${BANDS.ctEffectiveness.fair} %)`, tone: "bad" };

  return {
    avgFanVelocity, fanPeriphery, hubPeriphery: hs === null ? null : hubPeriphery, fanFlowCmh, airDensity: density, waterKgh, airKgh, lgRatio,
    range, approach, effectiveness, heatLoadKcalHr, trGenerated, evaporationCmh, evaporationPct, coc, blowdownCmh, makeupCmh, capacityPct, verdict, steps,
  };
}
