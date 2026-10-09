// ─────────────────────────────────────────────────────────────────────────────
// Zero Degree — data model
//
// One record per piece of equipment, exactly as the field engineer reads it.
// Every derived figure (flow, enthalpy, TR, kW/TR, effectiveness …) is worked
// out by lib/calc.ts from these fields and is never stored, so a record that
// is edited, merged from a teammate or re-imported from Excel always shows
// the same answers the original Excel sheets would.
//
// The field names below are also the column names of the Excel workbook
// (lib/excel.ts) — PostMan and the team import rely on them, so rename with
// care and update docs/POSTMAN.md in the same change.
// ─────────────────────────────────────────────────────────────────────────────

export type CompanyProfile = {
  id: string;
  companyName: string;
  area: string;
  district: string;
  state: string;
  pincode: string;
  overallConsumption: string | number; // kWh / month
  updatedAt: string;
};

/** Fields every equipment record carries — who took the reading and when. */
export type RecordBase = {
  id: string;
  tag: string;               // equipment tag / name — the merge key
  location?: string | null;  // building, floor, room …
  makeModel?: string | null;
  description?: string | null;
  photoPath?: string | null;
  recordedBy?: string | null; // engineer who took the reading
  createdAt: string;
  updatedAt?: string | null;  // last save — newest wins on a team merge
  createdById?: string | null;
};

/** How the humidity of an air stream was read: wet-bulb temperature or relative humidity. */
export type HumidityMode = "RH" | "WBT";

// ── Air-side units (AC analysis workbook + the AHU sheets of the chiller workbook) ──

export type AirUnitType =
  | "SPLIT"           // Split - Window AC sheet
  | "WINDOW"          // Split - Window AC sheet
  | "PACKAGE"         // PACKAGE AC sheet
  | "PACKAGE_MAKEUP"  // PACKAGE-AC-WITH MAKE-UP AIR sheet
  | "AHU"             // CHILLER AHU sheet
  | "AHU_MAKEUP";     // CHILLER-AHU-WITH MAKE-UP AIR sheet

export type AirUnit = RecordBase & {
  category: "AC" | "AHU";
  unitType: AirUnitType;
  ratedTr?: number | null;
  ratedKw?: number | null;
  starRating?: string | null;
  humidityMode: HumidityMode;

  // Return (or the only) suction stream — "VELOCITY(Suction Area) m/s"
  velocities: number[];            // anemometer traverse, m/s
  suctionArea?: number | null;     // m²
  returnDbt?: number | null;       // °C
  returnHum?: number | null;       // WBT °C or RH %
  supplyDbt?: number | null;
  supplyHum?: number | null;

  // Make-up (fresh) air stream — the "WITH MAKE-UP AIR" sheets only
  noOfFilters?: number | null;
  damperOpenPct?: number | null;
  freshVelocities?: number[];
  freshArea?: number | null;
  freshDbt?: number | null;
  freshHum?: number | null;

  // Power — "POWER  V / I / PF / KW / KVAR / KVA"
  phase?: 1 | 3 | null;
  voltage?: number | null;
  current?: number | null;
  pf?: number | null;
  kw?: number | null;
  kvar?: number | null;
  kva?: number | null;
};

// ── Chillers (CHILLER-VCS, CHILLER-VCS_CT, CHILLER-VAS, Chiller Heat Balance) ──

export type ChillerType =
  | "VCS"     // vapour compression, measured on the chilled-water side
  | "VCS_CT"  // vapour compression, measured on the condenser / cooling-tower side
  | "VAS";    // vapour absorption

export type Chiller = RecordBase & {
  chillerType: ChillerType;
  ratedTr?: number | null;
  refrigerant?: string | null;
  compressorKw?: number | null;   // VCS / VCS_CT — measured
  totalKw?: number | null;        // total power of chiller with utilities
  fuelRate?: number | null;       // VAS — kg/h
  fuelCv?: number | null;         // VAS — kcal/kg
  waterFlowCmh?: number | null;   // chilled water / brine (VCS, VAS) or condenser water (VCS_CT)
  inletTemp?: number | null;      // °C
  outletTemp?: number | null;     // °C
  specificHeat?: number | null;   // kcal/kg·°C (1 for water)

  // Heat balance (optional) — "Chiller Heat Balance" sheet
  hbCondFlowLps?: number | null;
  hbCondIn?: number | null;
  hbCondOut?: number | null;
  hbEvapFlowLps?: number | null;
  hbEvapIn?: number | null;
  hbEvapOut?: number | null;
  hbCompKw?: number | null;
};

// ── Cooling towers (COOLING TOWER sheet) ──

export type FanSizeMode = "DIAMETER" | "PERIPHERY";

export type CoolingTower = RecordBase & {
  ratedTr?: number | null;
  ratedEffectiveness?: number | null; // %
  inletTemp?: number | null;          // hot water in, °C
  outletTemp?: number | null;         // cold water out, °C
  airDbt?: number | null;
  airWbt?: number | null;
  noOfCells?: number | null;
  cellsOnline?: number | null;
  waterFlowCmh?: number | null;       // total measured flow (from pump analysis)
  fanVelocities: number[];            // m/s over the fan stack
  fanSizeMode: FanSizeMode;
  fanSize?: number | null;            // m — diameter or periphery of the fan
  hubSize?: number | null;            // m — diameter or periphery of the fan motor / hub
  tdsMakeup?: number | null;          // ppm
  tdsCirculating?: number | null;     // ppm
  fanAirDbt?: number | null;
  fanAirWbt?: number | null;
  fanMaterial?: string | null;        // FRP / CI / Al …
  couplingType?: string | null;       // Direct / Belt / Gear
};

export type EquipmentKind = "airUnits" | "chillers" | "coolingTowers";

export type DataSet = {
  profile: CompanyProfile | null;
  airUnits: AirUnit[];
  chillers: Chiller[];
  coolingTowers: CoolingTower[];
};

export const AIR_UNIT_LABEL: Record<AirUnitType, string> = {
  SPLIT: "Split AC",
  WINDOW: "Window AC",
  PACKAGE: "Package AC",
  PACKAGE_MAKEUP: "Package AC + make-up air",
  AHU: "Chiller AHU",
  AHU_MAKEUP: "Chiller AHU + make-up air",
};

export const CHILLER_LABEL: Record<ChillerType, string> = {
  VCS: "Vapour compression (chilled-water side)",
  VCS_CT: "Vapour compression (condenser / CT side)",
  VAS: "Vapour absorption",
};

export const hasMakeup = (t: AirUnitType) => t === "PACKAGE_MAKEUP" || t === "AHU_MAKEUP";
