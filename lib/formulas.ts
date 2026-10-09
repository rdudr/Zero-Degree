// ─────────────────────────────────────────────────────────────────────────────
// Every formula Zero Degree uses, for the Formulas page. This is the
// reference copy for people; lib/calc.ts is what actually runs. Change the
// two together (and docs/POSTMAN.md).
// ─────────────────────────────────────────────────────────────────────────────

export type Formula = {
  name: string;
  formula: string;
  unit?: string;
  source: string; // workbook sheet and cell the formula comes from
  note?: string;
};

export type FormulaGroup = { id: string; title: string; intro: string; formulas: Formula[] };

export const CONSTANTS: { symbol: string; value: string; meaning: string }[] = [
  { symbol: "3024", value: "kcal/h", meaning: "Heat equal to 1 TR, as used in every KISEM sheet" },
  { symbol: "4.18", value: "kJ/kcal", meaning: "kJ → kcal in the AC / AHU capacity formulas" },
  { symbol: "4.19", value: "kJ/kg·°C", meaning: "Specific heat of water in the chiller heat balance" },
  { symbol: "3.517", value: "kW/TR", meaning: "Cooling kW in 1 TR (condenser-side chiller formula)" },
  { symbol: "1.293", value: "kg/m³", meaning: "Density of dry air at 0 °C" },
  { symbol: "3.14", value: "—", meaning: "π as the cooling-tower sheet uses it" },
  { symbol: "101.325", value: "kPa", meaning: "Atmospheric pressure for the psychrometric equations" },
  { symbol: "12", value: "—", meaning: "EER conversion: 12 000 BTU/h per TR ÷ 1000" },
];

export const FORMULA_GROUPS: FormulaGroup[] = [
  {
    id: "psychro",
    title: "Air properties (used by AC and AHU)",
    intro: "The AC and AHU sheets look the enthalpy up in a psychrometric table that is missing from the workbooks (#REF!). Zero Degree works it out with the ASHRAE equations, which is what that table held.",
    formulas: [
      { name: "Air density", formula: "ρ = 273 × 1.293 / (273 + DBT)", unit: "kg/m³", source: "AC sheets AJ5 / AL5, CT sheet B39", note: "Return-air DBT for AC/AHU; ambient DBT for the cooling tower." },
      { name: "Saturation vapour pressure", formula: "ln pws = C8/T + C9 + C10·T + C11·T² + C12·T³ + C13·ln T   (T in K)", unit: "Pa", source: "ASHRAE Fundamentals (Hyland–Wexler)", note: "Replaces the missing lookup table." },
      { name: "Humidity ratio from RH", formula: "W = 0.621945 × φ·pws / (P − φ·pws)", unit: "kg/kg dry air", source: "ASHRAE", note: "RH entered in %; a value of 1 or less is read as a fraction, as the sheet's …*RH*100/100 expects." },
      { name: "Humidity ratio from wet bulb", formula: "W = [(2501 − 2.326·WBT)·Ws* − 1.006·(DBT − WBT)] / (2501 + 1.86·DBT − 4.186·WBT)", unit: "kg/kg dry air", source: "ASHRAE eq. 33", note: "Ws* = saturation humidity ratio at the wet bulb." },
      { name: "Enthalpy of moist air", formula: "h = 1.006·DBT + W·(2501 + 1.86·DBT)", unit: "kJ/kg", source: "AC sheets AA5 / AB5 (=VLOOKUP(DBT,#REF!,7)+VLOOKUP(DBT,#REF!,6)*1000*RH*2.55)" },
    ],
  },
  {
    id: "ac",
    title: "Air conditioners — split, window, package",
    intro: "Sheets 'Split - Window AC' and 'PACKAGE AC' of AC Analysis.xlsx. One row per AC.",
    formulas: [
      { name: "Average velocity", formula: "v̄ = Σ v / n", unit: "m/s", source: "P5 / AC5 =AVERAGE(C5:G6)", note: "Blank points are ignored, as AVERAGE() does." },
      { name: "Air flow", formula: "Q = v̄ × A × 3600", unit: "m³/h", source: "AD5 =AC5*H5*3600" },
      { name: "Net capacity", formula: "TR = Q × ρ × (h_return − h_supply) / (4.18 × 3024)", unit: "TR", source: "AE5 =(AD5*AJ5*(AA5-AB5))/(4.18*3024)" },
      { name: "Net capacity (heat)", formula: "kcal/h = TR × 3024", unit: "kcal/h", source: "AF5 =AE5*3024" },
      { name: "Specific power", formula: "kW/TR = kW / TR", unit: "kW/TR", source: "AG5 =V5/AE5" },
      { name: "Energy efficiency ratio", formula: "EER = 12 / (kW/TR)", source: "AH5 =12/AG5" },
      { name: "Power when kW was not noted", formula: "kW = V × I × PF / 1000 (1-phase) · √3 × V × I × PF / 1000 (3-phase)", unit: "kW", source: "Added in the app", note: "Used only when the kW reading is blank." },
      { name: "Capacity vs rated", formula: "% = TR / rated TR × 100", unit: "%", source: "Added in the app" },
    ],
  },
  {
    id: "makeup",
    title: "Package AC / AHU with make-up air",
    intro: "Sheets 'PACKAGE-AC-WITH MAKE-UP AIR' and 'CHILLER-AHU-WITH MAKE-UP AIR'. The fresh-air and return-air streams are each taken down to the supply condition and added.",
    formulas: [
      { name: "Make-up air flow", formula: "Q_f = A_f × v̄_f × 3600", unit: "m³/h", source: "AL5 =J5*S5*3600" },
      { name: "Return air flow", formula: "Q_r = A_r × v̄_r × 3600", unit: "m³/h", source: "AM5 =K5*T5*3600" },
      { name: "Air densities", formula: "ρ_f = 273 × 1.293 / (273 + DBT_fresh) · ρ_r = 273 × 1.293 / (273 + DBT_return)", unit: "kg/m³", source: "AT5 / AU5" },
      { name: "Net capacity", formula: "TR = [Q_f·ρ_f·(h_f − h_s) + Q_r·ρ_r·(h_r − h_s)] / (4.18 × 3024)", unit: "TR", source: "AN5 =((AL5*AT5*(AI5-AK5))+(AM5*AU5*(AJ5-AK5)))/(4.18*3024)" },
      { name: "kcal/h, kW/TR, EER", formula: "as for the AC above", source: "AO5 · AP5 · AQ5", note: "kW/TR and EER for package AC only — the AHU sheets stop at capacity." },
    ],
  },
  {
    id: "ahu",
    title: "Chiller AHU",
    intro: "Sheet 'CHILLER AHU'. Same air-side method as the package AC; the kW is the fan's.",
    formulas: [
      { name: "Average velocity & flow", formula: "v̄ = Σ v / n · Q = v̄ × A × 3600", unit: "m³/h", source: "R5 / AE5 =AVERAGE(C5:I7) · AF5 =AE5*J5*3600" },
      { name: "Net capacity", formula: "TR = Q × ρ × (h_return − h_supply) / (4.18 × 3024)", unit: "TR", source: "AG5" },
      { name: "Net capacity (heat)", formula: "kcal/h = TR × 3024", unit: "kcal/h", source: "AH5" },
    ],
  },
  {
    id: "chiller",
    title: "Chillers",
    intro: "Sheets 'CHILLER-VCS', 'CHILLER-VCS_CT' and 'CHILLER-VAS' of Chiller Analysis.xlsx. Water flow comes from the pump analysis.",
    formulas: [
      { name: "TR — vapour compression, chilled-water side", formula: "TR = Q × (T_in − T_out) × Cp × 1000 / 3024", unit: "TR", source: "CHILLER-VCS C11 =C7*(C8-C9)*C10*1000/(3024)" },
      { name: "TR — vapour compression, condenser side", formula: "TR = Q × (T_out − T_in) × Cp × 1000 / 3024 − 0.9 × kW_comp / 3.517", unit: "TR", source: "CHILLER-VCS_CT C12 =(((C8*(C10-C9)*1*1000)/3024)-(0.9*C6)/3.517)", note: "Heat rejected at the condenser less 90 % of the compressor input." },
      { name: "SPC on compressor power", formula: "kW_comp / TR", unit: "kW/TR", source: "VCS C12 / VCS_CT C13" },
      { name: "SPC on total power", formula: "kW_total / TR", unit: "kW/TR", source: "VCS C13 / VCS_CT C14" },
      { name: "TR — vapour absorption", formula: "TR = Q × (T_in − T_out) × Cp × 1000 / 3024", unit: "TR", source: "CHILLER-VAS C11" },
      { name: "Specific fuel consumption", formula: "SFC = fuel kg/h / TR", unit: "kg/TR·h", source: "CHILLER-VAS C12 =C5/C11", note: "The sheet labels it KW/KCAL; the formula gives kg of fuel per TR-hour." },
      { name: "COP (thermal)", formula: "COP = TR × 3024 / (fuel kg/h × CV)", source: "Added in the app", note: "Uses the calorific value the VAS sheet records." },
      { name: "Capacity vs rated", formula: "% = TR / rated TR × 100", unit: "%", source: "Added in the app" },
    ],
  },
  {
    id: "hb",
    title: "Chiller heat balance",
    intro: "Sheet 'Chiller Heat Balance'. Compressor work plus the heat picked up in the evaporator should equal the heat rejected at the condenser.",
    formulas: [
      { name: "Heat rejected (condenser)", formula: "Q_rej = l/s × 4.19 × (T_out − T_in)", unit: "kW", source: "J20 =C20*4.19*(E20-D20)" },
      { name: "Heat gained (evaporator)", formula: "Q_gain = l/s × 4.19 × (T_in − T_out)", unit: "kW", source: "K20 =F20*4.19*(G20-H20)" },
      { name: "% heat balance", formula: "% = 100 × (kW_comp + Q_gain − Q_rej) / Q_rej", unit: "%", source: "L20 =100*(I20+K20-J20)/J20", note: "Within ±5 % is accepted (BEE)." },
    ],
  },
  {
    id: "ct",
    title: "Cooling towers",
    intro: "Sheet 'COOLING TOWER' of Cooling Tower Analysis.xlsx. One column per tower in the sheet; one record per tower in the app.",
    formulas: [
      { name: "Average fan velocity", formula: "v̄ = Σ v / n", unit: "m/s", source: "B11 =AVERAGE(B20:C29)" },
      { name: "Fan / hub periphery", formula: "P = 3.14 × D_fan · p = 3.14 × D_hub", unit: "m", source: "B12 =3.14*3 · B13 =0.45*3.14", note: "Or enter the periphery directly." },
      { name: "CT fan air flow", formula: "Q_air = (P² × v̄ / (4 × 3.14) − p² × v̄ / (4 × 3.14)) × 3600", unit: "m³/h", source: "B38" },
      { name: "Water flow (mass)", formula: "Q_w = Q × 1000", unit: "kg/h", source: "B40 =B37*1000" },
      { name: "Air flow (mass)", formula: "G = Q_air × ρ", unit: "kg/h", source: "B41 =B38*B39" },
      { name: "L/G ratio", formula: "L/G = Q_w / G", source: "B42 =B40/B41" },
      { name: "Range", formula: "Range = T_in − T_out", unit: "°C", source: "B43 =B31-B32" },
      { name: "Approach", formula: "Approach = T_out − WBT", unit: "°C", source: "B44 =B32-B34" },
      { name: "Effectiveness", formula: "% = Range × 100 / (Range + Approach)", unit: "%", source: "B45 =(B43*100)/(B43+B44)" },
      { name: "Heat load", formula: "kcal/h = Q × 1000 × Range", unit: "kcal/h", source: "B47 =B37*1000*B43" },
      { name: "TR generated", formula: "TR = heat load / 3024", unit: "TR", source: "B49 =B47/3024" },
      { name: "Evaporation loss", formula: "E = 0.00085 × 1.8 × Q × Range", unit: "m³/h", source: "B50 =0.00085*1.8*B37*(B43)" },
      { name: "Evaporation loss %", formula: "% = E × 100 / Q", unit: "%", source: "B51 =B50*100/B37" },
      { name: "Cycles of concentration", formula: "COC = TDS_circulating / TDS_make-up", source: "B52 =B15/B14" },
      { name: "Blow-down requirement", formula: "B = E / (COC − 1)", unit: "m³/h", source: "B53 =B50/(B52-1)", note: "Not worked when COC ≤ 1 (the sheet shows #DIV/0!)." },
      { name: "Make-up water requirement", formula: "M = E + B", unit: "m³/h", source: "B54 =B50+B53" },
    ],
  },
  {
    id: "bands",
    title: "Status bands (app's indicative limits)",
    intro: "Not in the workbooks — used only for the Good / Average / Poor label on screen and in the PDF. Edit BANDS in lib/calc.ts if KISEM sets different limits.",
    formulas: [
      { name: "AC specific power", formula: "≤ 1.2 kW/TR efficient · 1.2–1.6 average · > 1.6 poor", source: "Zero Degree" },
      { name: "Chiller total specific power", formula: "≤ 0.8 kW/TR efficient · 0.8–1.1 average · > 1.1 poor", source: "Zero Degree" },
      { name: "AHU / VAS capacity", formula: "≥ 90 % of rated OK · 75–90 % derated · < 75 % severely derated", source: "Zero Degree" },
      { name: "Cooling-tower effectiveness", formula: "within 5 points of rated = at design; with no rated value: ≥ 60 % good · 45–60 % fair · < 45 % poor", source: "Zero Degree" },
      { name: "Heat balance", formula: "within ±5 % balanced", source: "BEE guideline" },
    ],
  },
];
