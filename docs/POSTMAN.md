# Zero Degree → PostMan (KISEM report generator)

PostMan — the IIT Gandhinagar / KISEM energy-assessment report builder
(https://github.com/rdudr/PostMAN) — can take the *Air conditioning*,
*Chillers* and *Cooling towers* chapters straight from a workbook exported by
this app. Nothing is retyped.

> **Status:** this app writes the workbook and offers the *Send to PostMan*
> handoff. PostMan still needs an `importZeroDegree` reader for it (see
> *Keeping the two in step*). Until then the workbook's `… Summary` sheets
> can be pasted into the report by hand.

## Where the workbook comes from

*Report & Share → Team Data Exchange (Excel)*:

- **Export Data (Excel)** — saves the workbook (device *Documents* on Android,
  a download on the web).
- **Share with Team** (Android) — the same file through the share sheet.
- **Import Team Data (Excel)** — merges one or more teammates' files.
- **Send to PostMan** — shown only when PostMan opened this app
  (`?from=postman&origin=…&company=…&fy=…`); posts the same workbook, base64,
  to the opener with `{ kind: "kisem-data", format: "Zero Degree v1", company, workbook }`.
  Origins are checked against `lib/postman-handoff.ts` (same list as A-CMP).

The same workbook is attached, next to the PDF, to every report the app emails
(`/api/send-report`, `/api/sync/queue`). Writer: `lib/excel.ts` (`buildWorkbook`).

## The workbook

| Sheet | One row per | Notes |
|---|---|---|
| `Company Profile` | Field / Value | `Company Name`, `Area / Zone`, `District`, `State`, `Pincode`, `Overall Consumption (kWh/Month)`, `Exported By`, `Export Date`, `Format` = `Zero Degree v1`, unit counts. PostMan should refuse a company mismatch. |
| `AC Units` | air conditioner | columns = `AIR_FIELDS`; `unitType` SPLIT / WINDOW / PACKAGE / PACKAGE_MAKEUP |
| `AHU Units` | chiller AHU | same columns; `unitType` AHU / AHU_MAKEUP |
| `Chillers` | chiller | columns = `CHILLER_FIELDS`; `chillerType` VCS / VCS_CT / VAS |
| `Cooling Towers` | cooling tower | columns = `CT_FIELDS` |
| `AC Summary`, `AHU Summary`, `Chiller Summary`, `Cooling Tower Summary` | — | the workbooks' own "For Summary" tables, human-readable; ignored on import |

Data-sheet columns are the record's own field names (`lib/types.ts`), so a
file round-trips losslessly. Traverse readings (`velocities`,
`freshVelocities`, `fanVelocities`) are comma-separated m/s values.
`humidityMode` says whether `*Hum` columns are RH % or wet-bulb °C.
`recordedBy`, `createdAt`, `updatedAt` say who took each reading and when.

The `calc_*` columns after the record fields are the app's results, written
for PostMan's convenience and ignored on import (the app always re-works them):

- AC / AHU: `calc_flowCmh`, `calc_totalFlowCmh`, `calc_airDensity`, `calc_hReturn`,
  `calc_hSupply`, `calc_hFresh`, `calc_netTr`, `calc_netKcalHr`, `calc_kw`,
  `calc_kwPerTr`, `calc_eer`, `calc_capacityPct`, `calc_status`
- Chillers: `calc_trGenerated`, `calc_spcCompressor`, `calc_spcTotal`, `calc_sfc`,
  `calc_cop`, `calc_capacityPct`, `calc_hbHeatRejectedKw`, `calc_hbHeatGainKw`,
  `calc_hbPercent`, `calc_status`
- Cooling towers: `calc_fanFlowCmh`, `calc_airDensity`, `calc_lgRatio`, `calc_range`,
  `calc_approach`, `calc_effectiveness`, `calc_heatLoadKcalHr`, `calc_trGenerated`,
  `calc_evaporationCmh`, `calc_evaporationPct`, `calc_coc`, `calc_blowdownCmh`,
  `calc_makeupCmh`, `calc_status`

## Formulas (must stay identical on both sides)

All from the KISEM workbooks — `lib/calc.ts` notes the source cell of each.

- **AC / AHU:** Q = v̄ × A × 3600 m³/h; ρ = 273 × 1.293 / (273 + DBT_return);
  TR = Q × ρ × (h_return − h_supply) / (4.18 × 3024); with make-up air
  TR = [Q_f ρ_f (h_f − h_s) + Q_r ρ_r (h_r − h_s)] / (4.18 × 3024);
  kcal/h = TR × 3024; kW/TR = kW / TR; EER = 12 / (kW/TR).
  Enthalpy h = 1.006 t + W (2501 + 1.86 t) kJ/kg, W from DBT and RH or WBT
  (ASHRAE, 101.325 kPa). *The workbooks' own enthalpy lookup table is
  missing (`#REF!`); this replaces it.*
- **Chiller VCS / VAS:** TR = Q × (T_in − T_out) × Cp × 1000 / 3024;
  SPC = kW / TR (compressor and total); VAS SFC = fuel kg/h / TR.
- **Chiller VCS, condenser side:** TR = Q × (T_out − T_in) × Cp × 1000 / 3024 − 0.9 × kW_comp / 3.517.
- **Heat balance:** rejected = l/s × 4.19 × ΔT_cond; gain = l/s × 4.19 × ΔT_evap;
  % = 100 × (kW + gain − rejected) / rejected; ±5 % accepted.
- **Cooling tower:** fan flow = (P² − p²) × v̄ / (4 × 3.14) × 3600 (P = 3.14 × D);
  range = T_in − T_out; approach = T_out − WBT; effectiveness = range / (range + approach) × 100;
  L/G = water kg/h / (air m³/h × ρ); heat = Q × 1000 × range kcal/h; TR = heat / 3024;
  evaporation = 0.00085 × 1.8 × Q × range; COC = TDS_circ / TDS_makeup;
  blow-down = evaporation / (COC − 1); make-up = evaporation + blow-down.

## Merge rule

Equipment merges by **tag** (case, spaces and punctuation ignored), per sheet.
When both sides hold the same tag, the copy with the newer `updatedAt`
(falling back to `createdAt`) wins. PostMan should do the same, so the same
export twice, or two engineers' partial files, never duplicate a unit.

## Keeping the two in step

1. A sheet, column, unit or formula changed here (`lib/types.ts`,
   `lib/excel.ts`, `lib/calc.ts`) is changed in PostMan in the same sitting,
   and this page updated.
2. Push every repository touched (`rdudr/Zero-Degree` and `rdudr/PostMAN`),
   each commit naming the other.
