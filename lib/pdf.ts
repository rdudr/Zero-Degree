import { jsPDF } from "jspdf";
import autoTable, { type RowInput, type Styles, type UserOptions } from "jspdf-autotable";
import type { AirUnit, Chiller, CoolingTower, DataSet } from "@/lib/types";
import { AIR_UNIT_LABEL, CHILLER_LABEL, hasMakeup } from "@/lib/types";
import {
  BANDS, calcAirUnit, calcChiller, calcCoolingTower, num,
  type AirUnitResult, type CalcStep, type ChillerResult, type CoolingTowerResult, type Verdict,
} from "@/lib/calc";

// ─────────────────────────────────────────────────────────────────────────────
// Zero Degree — HVAC & Cooling Performance Assessment (PDF)
//
// Layout helpers follow A-CMP's report: every figure goes through autoTable
// cells (which wrap) rather than free text at fixed x/y, charts are drawn as
// vectors, and the same file is built in the browser (Report page) and on
// the server (email attachment).
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const M_LEFT = 14;
const M_RIGHT = 14;
const M_TOP = 24;
const M_BOTTOM = 18;
const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;

type RGB = [number, number, number];
const C = {
  primary: [12, 74, 110] as RGB,
  accent: [2, 132, 199] as RGB,
  ice: [56, 189, 248] as RGB,
  ink: [15, 23, 42] as RGB,
  muted: [100, 116, 139] as RGB,
  line: [203, 213, 225] as RGB,
  fill: [241, 245, 249] as RGB,
  fillSoft: [248, 250, 252] as RGB,
  good: [22, 128, 61] as RGB,
  goodBg: [220, 252, 231] as RGB,
  warn: [180, 83, 9] as RGB,
  warnBg: [254, 243, 199] as RGB,
  bad: [185, 28, 28] as RGB,
  badBg: [254, 226, 226] as RGB,
  white: [255, 255, 255] as RGB,
  night: [2, 6, 23] as RGB,
};

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

// jsPDF's built-in Helvetica only carries the WinAnsi characters; anything
// else (≤, ρ, Δ, √, the minus sign …) is drawn as junk and throws off the
// spacing of the whole line. Every string goes through this on its way in.
const PDF_SUBS: [RegExp, string][] = [
  [/≤/g, "<="], [/≥/g, ">="], [/[−‒]/g, "-"], [/≈/g, "~"], [/→/g, "->"], [/←/g, "<-"],
  [/Δ/g, "d"], [/ρ/g, "rho"], [/Σ/g, "sum"], [/√/g, "sqrt"], [/φ/g, "phi"], [/π/g, "pi"],
  [/v̄/g, "v_avg"], [/̄/g, ""], [/₂/g, "2"], [/ /g, " "],
];
export function pdfSafe(t: string): string {
  let out = t;
  for (const [re, rep] of PDF_SUBS) out = out.replace(re, rep);
  // anything still outside Latin-1 cannot be drawn by the standard fonts
  return out.replace(/[^\x00-\xFF–—‘’“”•…€]/g, "?");
}
const safeCells = { didParseCell: (d: { cell: { text: string[] } }) => { d.cell.text = d.cell.text.map(pdfSafe); } };

/** Routes every doc.text / splitTextToSize call through pdfSafe. */
function guardText(doc: Doc) {
  const text = doc.text.bind(doc);
  const split = doc.splitTextToSize.bind(doc);
  (doc as unknown as { text: unknown }).text = (t: string | string[], ...rest: unknown[]) =>
    (text as (...a: unknown[]) => jsPDF)(Array.isArray(t) ? t.map(pdfSafe) : pdfSafe(String(t)), ...rest);
  (doc as unknown as { splitTextToSize: unknown }).splitTextToSize = (t: string, w: number, o?: unknown) =>
    (split as (...a: unknown[]) => string[])(pdfSafe(String(t)), w, o);
}

const fmt = (v: unknown, d = 2, unit = ""): string => {
  const n = num(v);
  if (n === null) return "—";
  return `${n.toFixed(d)}${unit ? ` ${unit}` : ""}`;
};
const txt = (v: unknown, fallback = "—"): string => {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s === "" ? fallback : s;
};
const when = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—");

function toneStyle(tone: Verdict["tone"]): Partial<Styles> {
  switch (tone) {
    case "good": return { textColor: C.good, fillColor: C.goodBg, fontStyle: "bold" };
    case "warn": return { textColor: C.warn, fillColor: C.warnBg, fontStyle: "bold" };
    case "bad": return { textColor: C.bad, fillColor: C.badBg, fontStyle: "bold" };
    default: return { textColor: C.muted, fontStyle: "italic" };
  }
}

// ── page furniture ──────────────────────────────────────────────────────────

function drawChrome(doc: Doc, company: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 2; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...C.primary);
    doc.rect(0, 0, PAGE_W, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...C.white);
    doc.text("ZERO DEGREE  ·  HVAC & Cooling Performance Assessment", M_LEFT, 9);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(company, 80)[0] as string, PAGE_W - M_RIGHT, 9, { align: "right" });
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.2);
    doc.line(M_LEFT, PAGE_H - 12, PAGE_W - M_RIGHT, PAGE_H - 12);
    doc.setFontSize(7.5);
    doc.setTextColor(...C.muted);
    doc.text("KISEM Laboratory · IIT Gandhinagar · Energy Assessment Programme", M_LEFT, PAGE_H - 7.5);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M_RIGHT, PAGE_H - 7.5, { align: "right" });
  }
}

function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed > PAGE_H - M_BOTTOM) {
    doc.addPage();
    return M_TOP;
  }
  return y;
}

function sectionTitle(doc: Doc, y: number, title: string, subtitle?: string): number {
  y = ensureSpace(doc, y, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...C.primary);
  doc.text(title, M_LEFT, y + 4.5);
  doc.setDrawColor(...C.ice);
  doc.setLineWidth(0.6);
  doc.line(M_LEFT, y + 7, M_LEFT + 14, y + 7);
  y += 10;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    const lines = doc.splitTextToSize(subtitle, CONTENT_W) as string[];
    doc.text(lines, M_LEFT, y + 1);
    y += lines.length * 4 + 1;
  }
  return y + 1;
}

function subTitle(doc: Doc, y: number, title: string, need = 12): number {
  y = ensureSpace(doc, y, need);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...C.ink);
  doc.text(title.toUpperCase(), M_LEFT, y + 3.5);
  return y + 6.5;
}

function baseTable(doc: Doc, y: number, opts: UserOptions): number {
  autoTable(doc, {
    startY: y,
    margin: { left: M_LEFT, right: M_RIGHT, top: M_TOP, bottom: M_BOTTOM },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 1.8, bottom: 1.8, left: 2.2, right: 2.2 }, textColor: C.ink, lineColor: C.line, lineWidth: 0.15, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold", fontSize: 7.6, halign: "left" },
    footStyles: { fillColor: C.fill, textColor: C.ink, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.fillSoft },
    ...safeCells,
    ...opts,
  });
  return (doc.lastAutoTable?.finalY ?? y) + 5;
}

/** Label / value pairs, two per row — the name-plate style block. */
function kvTable(doc: Doc, y: number, pairs: [string, string][]): number {
  const body: RowInput[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i];
    const b = pairs[i + 1] ?? ["", ""];
    body.push([
      { content: a[0], styles: { fontStyle: "bold", textColor: C.muted, fillColor: C.fill } },
      { content: a[1] },
      { content: b[0], styles: { fontStyle: "bold", textColor: C.muted, fillColor: C.fill } },
      { content: b[1] },
    ]);
  }
  return baseTable(doc, y, {
    body,
    alternateRowStyles: {},
    pageBreak: body.length <= 8 ? "avoid" : "auto",
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 51 }, 2: { cellWidth: 40 }, 3: { cellWidth: 51 } },
  });
}

function paragraph(doc: Doc, y: number, label: string, text: string): number {
  return baseTable(doc, y, {
    body: [[{ content: label, styles: { fontStyle: "bold", textColor: C.muted, fillColor: C.fill } }, { content: text }]],
    alternateRowStyles: {},
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: CONTENT_W - 40 } },
  });
}

/** Formula, the numbers put into it, and the answer — so a reader can follow the sum. */
function calcSummary(doc: Doc, y: number, title: string, steps: CalcStep[]): number {
  y = subTitle(doc, y, title, 30);
  return baseTable(doc, y, {
    head: [["Quantity", "Formula", "Substitution", "Result"]],
    body: steps.map((s) => [
      { content: s.quantity, styles: { fontStyle: "bold" as const } },
      { content: s.formula, styles: { fontSize: 7, textColor: C.muted } },
      { content: s.substitution, styles: { fontSize: 7 } },
      { content: s.result, styles: { halign: "right" as const, fontStyle: "bold" as const, textColor: C.primary } },
    ]),
    styles: { fontSize: 7.6, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 52 }, 2: { cellWidth: 58 }, 3: { cellWidth: 32 } },
  });
}

function verdictLine(doc: Doc, y: number, v: Verdict, extra?: Verdict | null): number {
  const body: RowInput[] = [[
    { content: "Assessment", styles: { fontStyle: "bold", textColor: C.muted, fillColor: C.fill } },
    { content: v.label, styles: toneStyle(v.tone) },
  ]];
  if (extra) body.push([
    { content: "Heat balance", styles: { fontStyle: "bold", textColor: C.muted, fillColor: C.fill } },
    { content: extra.label, styles: toneStyle(extra.tone) },
  ]);
  return baseTable(doc, y, { body, alternateRowStyles: {}, columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: CONTENT_W - 40 } } });
}

// ── charts ──────────────────────────────────────────────────────────────────

function niceMax(v: number): number {
  if (!isFinite(v) || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function chartFrame(doc: Doc, x: number, y: number, w: number, h: number, title: string, unit?: string) {
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.ink);
  doc.text(title, x + 3, y + 5);
  if (unit) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text(unit, x + w - 3, y + 5, { align: "right" });
  }
}

/** Vertical bars with the value printed over each one. Optional per-bar colours and a reference line. */
function barChart(doc: Doc, x: number, y: number, w: number, h: number, o: { title: string; unit?: string; labels: string[]; values: number[]; colors?: RGB[]; refLine?: { value: number; label: string } }) {
  chartFrame(doc, x, y, w, h, o.title, o.unit);
  const px = x + 13, py = y + 9, pw = w - 17, ph = h - 19;
  const max = niceMax(Math.max(0, ...o.values, o.refLine?.value ?? 0));
  doc.setLineWidth(0.15);
  for (let i = 0; i <= 4; i++) {
    const gy = py + ph - (ph * i) / 4;
    doc.setDrawColor(...C.line);
    doc.line(px, gy, px + pw, gy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...C.muted);
    doc.text(((max * i) / 4).toFixed(max < 10 ? 1 : 0), px - 1.5, gy + 1, { align: "right" });
  }
  const slot = pw / Math.max(o.values.length, 1);
  const bw = Math.min(11, slot * 0.6);
  o.values.forEach((v, i) => {
    const cx = px + i * slot + slot / 2;
    const bh = max > 0 ? (Math.max(0, v) / max) * ph : 0;
    doc.setFillColor(...(o.colors?.[i] ?? C.accent));
    doc.rect(cx - bw / 2, py + ph - bh, bw, bh, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.6);
    doc.setTextColor(...C.ink);
    doc.text(v.toFixed(v < 10 ? 2 : 0), cx, py + ph - bh - 1.4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.setTextColor(...C.muted);
    const lbl = doc.splitTextToSize(o.labels[i] ?? String(i + 1), Math.max(slot - 1, 6))[0] as string;
    doc.text(lbl, cx, py + ph + 3.6, { align: "center" });
  });
  if (o.refLine && max > 0) {
    const ry = py + ph - (o.refLine.value / max) * ph;
    doc.setDrawColor(...C.bad);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(px, ry, px + pw, ry);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setTextColor(...C.bad);
    doc.text(o.refLine.label, px + pw, ry - 1, { align: "right" });
  }
}

const toneRGB = (t: Verdict["tone"]): RGB => (t === "good" ? C.good : t === "warn" ? C.warn : t === "bad" ? C.bad : C.muted);

// ── per-equipment blocks ────────────────────────────────────────────────────

function provenance(rec: { recordedBy?: string | null; createdAt: string; updatedAt?: string | null }): [string, string][] {
  return [
    ["Recorded by", txt(rec.recordedBy, "Unknown")],
    ["Recorded on", when(rec.createdAt)],
    ["Last saved", when(rec.updatedAt || rec.createdAt)],
    ["", ""],
  ];
}

function airUnitBlock(doc: Doc, y: number, u: AirUnit, x: AirUnitResult, idx: string): number {
  const mk = hasMakeup(u.unitType);
  const humUnit = u.humidityMode === "RH" ? "% RH" : "°C WBT";
  y = subTitle(doc, y, `${idx}  ${u.tag} — ${AIR_UNIT_LABEL[u.unitType]}`, 60);
  const pairs: [string, string][] = [
    ["Location", txt(u.location)],
    ["Make / model", txt(u.makeModel)],
    ["Rated capacity", fmt(u.ratedTr, 2, "TR")],
    ["Rated power", fmt(u.ratedKw, 2, "kW")],
    ...(u.starRating ? [["Star rating", txt(u.starRating)] as [string, string]] : []),
    [mk ? "Return-air area" : "Suction area", fmt(u.suctionArea, 3, "m²")],
    ["Return air", `${fmt(u.returnDbt, 1, "°C DBT")} · ${fmt(u.returnHum, 1, humUnit)}`],
    ["Supply air", `${fmt(u.supplyDbt, 1, "°C DBT")} · ${fmt(u.supplyHum, 1, humUnit)}`],
  ];
  if (mk) {
    pairs.push(["Make-up air", `${fmt(u.freshDbt, 1, "°C DBT")} · ${fmt(u.freshHum, 1, humUnit)}`]);
    pairs.push(["Make-up area", fmt(u.freshArea, 3, "m²")]);
    pairs.push(["Filters", txt(u.noOfFilters)]);
    pairs.push(["Fresh-air damper", fmt(u.damperOpenPct, 0, "% open")]);
  }
  pairs.push(["Power", `${fmt(u.voltage, 0, "V")} · ${fmt(u.current, 2, "A")} · PF ${fmt(u.pf, 3)}`]);
  pairs.push([u.category === "AHU" ? "Fan kW" : "kW", `${fmt(x.kwUsed, 2, "kW")}${x.kwComputed ? " (worked from V·I·PF)" : ""}`]);
  pairs.push(["kVAr / kVA", `${fmt(u.kvar, 2)} / ${fmt(u.kva, 2)}`]);
  pairs.push(...provenance(u));
  y = kvTable(doc, y, pairs);

  const vel = (u.velocities ?? []).map(num).filter((n): n is number => n !== null);
  if (vel.length >= 2) {
    y = ensureSpace(doc, y, 48);
    barChart(doc, M_LEFT, y, CONTENT_W, 44, { title: mk ? "Return-air velocity traverse" : "Suction velocity traverse", unit: "m/s", labels: vel.map((_, i) => `P${i + 1}`), values: vel });
    y += 49;
  }
  y = calcSummary(doc, y, "Worked calculation", x.steps);
  y = verdictLine(doc, y, x.verdict);
  if (u.description) y = paragraph(doc, y, "Observations", u.description);
  return y + 2;
}

function chillerBlock(doc: Doc, y: number, c: Chiller, x: ChillerResult, idx: string): number {
  y = subTitle(doc, y, `${idx}  ${c.tag} — ${CHILLER_LABEL[c.chillerType]}`, 60);
  const side = c.chillerType === "VCS_CT" ? "Condenser water" : "Chilled water / brine";
  const pairs: [string, string][] = [
    ["Location", txt(c.location)],
    ["Make / model", txt(c.makeModel)],
    ["Rated capacity", fmt(c.ratedTr, 1, "TR")],
    ["Refrigerant", txt(c.refrigerant)],
    [`${side} flow`, fmt(c.waterFlowCmh, 1, "m³/h")],
    ["Specific heat", fmt(c.specificHeat ?? 1, 2, "kcal/kg·°C")],
    ["Inlet temperature", fmt(c.inletTemp, 1, "°C")],
    ["Outlet temperature", fmt(c.outletTemp, 1, "°C")],
  ];
  if (c.chillerType === "VAS") {
    pairs.push(["Fuel consumption", fmt(c.fuelRate, 2, "kg/h")]);
    pairs.push(["Fuel calorific value", fmt(c.fuelCv, 0, "kcal/kg")]);
  } else {
    pairs.push(["Compressor power", fmt(c.compressorKw, 2, "kW")]);
    pairs.push(["Total power with utilities", fmt(c.totalKw, 2, "kW")]);
  }
  if (x.hbHeatRejected !== null || x.hbHeatGain !== null) {
    pairs.push(["Condenser water (HB)", `${fmt(c.hbCondFlowLps, 2, "l/s")} · ${fmt(c.hbCondIn, 1)} → ${fmt(c.hbCondOut, 1, "°C")}`]);
    pairs.push(["Evaporator water (HB)", `${fmt(c.hbEvapFlowLps, 2, "l/s")} · ${fmt(c.hbEvapIn, 1)} → ${fmt(c.hbEvapOut, 1, "°C")}`]);
  }
  pairs.push(...provenance(c));
  y = kvTable(doc, y, pairs);
  y = calcSummary(doc, y, "Worked calculation", x.steps);
  y = verdictLine(doc, y, x.verdict, x.hbVerdict);
  if (c.description) y = paragraph(doc, y, "Observations", c.description);
  return y + 2;
}

function ctBlock(doc: Doc, y: number, t: CoolingTower, x: CoolingTowerResult, idx: string): number {
  y = subTitle(doc, y, `${idx}  ${t.tag} — Cooling tower`, 60);
  const sizeLbl = t.fanSizeMode === "PERIPHERY" ? "periphery" : "diameter";
  const pairs: [string, string][] = [
    ["Location", txt(t.location)],
    ["Make / model", txt(t.makeModel)],
    ["Rated capacity", fmt(t.ratedTr, 1, "TR")],
    ["Rated effectiveness", fmt(t.ratedEffectiveness, 1, "%")],
    ["Hot water in", fmt(t.inletTemp, 1, "°C")],
    ["Cold water out", fmt(t.outletTemp, 1, "°C")],
    ["Ambient air", `${fmt(t.airDbt, 1, "°C DBT")} · ${fmt(t.airWbt, 1, "°C WBT")}`],
    ["Fan outlet air", `${fmt(t.fanAirDbt, 1, "°C DBT")} · ${fmt(t.fanAirWbt, 1, "°C WBT")}`],
    ["Cells (online / total)", `${txt(t.cellsOnline)} / ${txt(t.noOfCells)}`],
    ["Water flow", fmt(t.waterFlowCmh, 1, "m³/h")],
    [`Fan ${sizeLbl}`, fmt(t.fanSize, 2, "m")],
    [`Hub ${sizeLbl}`, fmt(t.hubSize, 2, "m")],
    ["Fan material", txt(t.fanMaterial)],
    ["Coupling", txt(t.couplingType)],
    ["TDS make-up / circulating", `${fmt(t.tdsMakeup, 0)} / ${fmt(t.tdsCirculating, 0, "ppm")}`],
    ["", ""],
    ...provenance(t),
  ];
  y = kvTable(doc, y, pairs);
  const vel = (t.fanVelocities ?? []).map(num).filter((n): n is number => n !== null);
  if (vel.length >= 2) {
    y = ensureSpace(doc, y, 48);
    barChart(doc, M_LEFT, y, CONTENT_W, 44, { title: "Fan-stack air velocity traverse", unit: "m/s", labels: vel.map((_, i) => `P${i + 1}`), values: vel });
    y += 49;
  }
  y = calcSummary(doc, y, "Worked calculation", x.steps);
  y = verdictLine(doc, y, x.verdict);
  if (t.description) y = paragraph(doc, y, "Observations", t.description);
  return y + 2;
}

// ── the report ──────────────────────────────────────────────────────────────

/**
 * @param logoDataUrl optional JPEG/PNG data URL of the Zero Degree logo for the cover.
 */
export function generateReportPDF(data: DataSet, reporterName: string, logoDataUrl?: string | null): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  guardText(doc);
  const { profile } = data;
  const company = txt(profile?.companyName, "Plant");
  const dateStr = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const acs = data.airUnits.filter((u) => u.category === "AC").map((u) => ({ u, x: calcAirUnit(u) }));
  const ahus = data.airUnits.filter((u) => u.category === "AHU").map((u) => ({ u, x: calcAirUnit(u) }));
  const chs = data.chillers.map((c) => ({ c, x: calcChiller(c) }));
  const cts = data.coolingTowers.map((t) => ({ t, x: calcCoolingTower(t) }));
  const total = acs.length + ahus.length + chs.length + cts.length;

  // ── Cover ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.night);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  if (logoDataUrl) {
    try {
      const fmtImg = logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(logoDataUrl, fmtImg, (PAGE_W - 120) / 2, 22, 120, 120);
    } catch (e) {
      console.warn("[pdf] logo skipped:", e);
    }
  }
  let y = 156;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...C.white);
  doc.text("HVAC & Cooling Performance", PAGE_W / 2, y, { align: "center" });
  y += 9;
  doc.text("Assessment Report", PAGE_W / 2, y, { align: "center" });
  y += 12;
  doc.setFontSize(14);
  doc.setTextColor(...C.ice);
  const cl = doc.splitTextToSize(company, CONTENT_W) as string[];
  doc.text(cl, PAGE_W / 2, y, { align: "center" });
  y += cl.length * 6.5;
  const address = [profile?.area, profile?.district, profile?.state, profile?.pincode].map((s) => txt(s, "")).filter(Boolean).join(", ");
  if (address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225);
    const al = doc.splitTextToSize(address, CONTENT_W) as string[];
    doc.text(al, PAGE_W / 2, y, { align: "center" });
    y += al.length * 5;
  }
  y += 10;
  autoTable(doc, {
    startY: y,
    margin: { left: 30, right: 30 },
    theme: "plain",
    ...safeCells,
    styles: { font: "helvetica", fontSize: 9, textColor: C.white, cellPadding: 2, halign: "center" },
    body: [
      [{ content: "Field engineer", styles: { textColor: [148, 163, 184] } }, { content: "Report date", styles: { textColor: [148, 163, 184] } }, { content: "Equipment assessed", styles: { textColor: [148, 163, 184] } }],
      [{ content: txt(reporterName, "Field Engineer"), styles: { fontStyle: "bold" } }, { content: dateStr, styles: { fontStyle: "bold" } }, { content: String(total), styles: { fontStyle: "bold" } }],
    ],
  });
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("KISEM Laboratory · IIT Gandhinagar · Energy Assessment Programme", PAGE_W / 2, PAGE_H - 14, { align: "center" });

  // ── 1. Plant profile & summary ────────────────────────────────────────────
  doc.addPage();
  y = M_TOP;
  y = sectionTitle(doc, y, "1. Plant profile");
  y = kvTable(doc, y, [
    ["Company", company],
    ["Area / zone", txt(profile?.area)],
    ["District", txt(profile?.district)],
    ["State", txt(profile?.state)],
    ["Pincode", txt(profile?.pincode)],
    ["Overall consumption", num(profile?.overallConsumption) !== null ? `${profile?.overallConsumption} kWh / month` : "—"],
  ]);

  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v !== null && isFinite(v) && v > 0 ? v : 0), 0);
  const acTr = sum(acs.map((a) => a.x.netTr));
  const acKw = sum(acs.map((a) => a.x.kwUsed));
  const chTr = sum(chs.map((c) => c.x.trGenerated));
  const ahuTr = sum(ahus.map((a) => a.x.netTr));
  const ctTr = sum(cts.map((c) => c.x.trGenerated));
  const flagged = [...acs, ...ahus, ...chs, ...cts].filter((r) => r.x.verdict.tone === "bad").length;

  y = sectionTitle(doc, y, "2. Summary", "What was measured on site and the headline result for each equipment group.");
  y = baseTable(doc, y, {
    body: [[
      { content: `${total}\nUnits assessed`, styles: { halign: "center", fontSize: 9 } },
      { content: `${acTr.toFixed(1)} TR\nAC cooling measured`, styles: { halign: "center", fontSize: 9 } },
      { content: `${chTr.toFixed(1)} TR\nChiller cooling measured`, styles: { halign: "center", fontSize: 9 } },
      { content: `${ctTr.toFixed(1)} TR\nCooling-tower heat load`, styles: { halign: "center", fontSize: 9 } },
      { content: `${flagged}\nNeed attention`, styles: { halign: "center", fontSize: 9, ...(flagged > 0 ? { textColor: C.bad, fontStyle: "bold" } : { textColor: C.good }) } },
    ]],
    alternateRowStyles: {},
    styles: { cellPadding: 3, fillColor: C.fillSoft },
    columnStyles: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, { cellWidth: CONTENT_W / 5 }])),
  });

  y = baseTable(doc, y, {
    head: [["Equipment group", "Units", "Key figure", "Good", "Average", "Poor", "Incomplete"]],
    body: [
      ["Air conditioners", acs, acKw > 0 && acTr > 0 ? `${(acKw / acTr).toFixed(3)} kW/TR overall` : "—"] as const,
      ["Chillers", chs, `${chTr.toFixed(1)} TR`] as const,
      ["Chiller AHUs", ahus, `${ahuTr.toFixed(1)} TR`] as const,
      ["Cooling towers", cts, cts.length ? `${(sum(cts.map((c) => c.x.effectiveness)) / Math.max(1, cts.filter((c) => c.x.effectiveness !== null).length)).toFixed(1)} % avg. effectiveness` : "—"] as const,
    ].map(([label, list, key]) => {
      const n = (tone: string) => String(list.filter((r) => r.x.verdict.tone === tone).length);
      return [label, String(list.length), key, n("good"), n("warn"), n("bad"), n("muted")];
    }),
    columnStyles: { 1: { halign: "right" }, 3: { halign: "right", textColor: C.good }, 4: { halign: "right", textColor: C.warn }, 5: { halign: "right", textColor: C.bad }, 6: { halign: "right", textColor: C.muted } },
  });

  // ── 3. Air conditioners ──────────────────────────────────────────────────
  let sec = 3;
  if (acs.length) {
    doc.addPage();
    y = sectionTitle(doc, M_TOP, `${sec}. Air conditioners`, "Cooling delivered is worked from the air flow across the coil and the enthalpy drop between return and supply air: TR = Q × ρ × (h return − h supply) / (4.18 × 3024). Specific power is the measured kW over that TR; EER = 12 / (kW/TR).");
    y = baseTable(doc, y, {
      head: [["#", "AC", "Type", "kW", "Flow m³/h", "Net TR", "kW/TR", "EER", "% rated", "Status"]],
      body: acs.map(({ u, x }, i) => [String(i + 1), u.tag, AIR_UNIT_LABEL[u.unitType], fmt(x.kwUsed, 2), fmt(x.totalFlowCmh, 0), fmt(x.netTr, 2), fmt(x.kwPerTr, 3), fmt(x.eer, 2), fmt(x.capacityPct, 0), { content: x.verdict.label, styles: toneStyle(x.verdict.tone) }]),
      columnStyles: { 0: { cellWidth: 7, halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { cellWidth: 38 } },
    });
    const withKwTr = acs.filter((a) => a.x.kwPerTr !== null);
    if (withKwTr.length) {
      y = ensureSpace(doc, y, 60);
      barChart(doc, M_LEFT, y, CONTENT_W, 56, {
        title: "Specific power by unit", unit: "kW/TR", labels: withKwTr.map((a) => a.u.tag), values: withKwTr.map((a) => a.x.kwPerTr!),
        colors: withKwTr.map((a) => toneRGB(a.x.verdict.tone)), refLine: { value: BANDS.acKwPerTr.good, label: `${BANDS.acKwPerTr.good} kW/TR` },
      });
      y += 61;
    }
    acs.forEach(({ u, x }, i) => { y = airUnitBlock(doc, y, u, x, `${sec}.${i + 1}`); });
    sec++;
  }

  // ── Chillers ─────────────────────────────────────────────────────────────
  if (chs.length) {
    doc.addPage();
    y = sectionTitle(doc, M_TOP, `${sec}. Chillers`, "TR generated from the water side: Q × ΔT × Cp × 1000 / 3024. On the condenser side 90 % of the compressor input is taken off the heat rejected. Specific power consumption (SPC) is kW per TR on compressor and on total power; the heat balance checks that compressor kW + evaporator gain ≈ condenser rejection.");
    y = baseTable(doc, y, {
      head: [["#", "Chiller", "Type", "TR generated", "SPC comp. kW/TR", "SPC total kW/TR", "SFC kg/TR·h", "% heat bal.", "Status"]],
      body: chs.map(({ c, x }, i) => [String(i + 1), c.tag, c.chillerType.replace("_", " + "), fmt(x.trGenerated, 2), fmt(x.spcCompressor, 3), fmt(x.spcTotal, 3), fmt(x.sfc, 3), fmt(x.hbPercent, 1), { content: x.verdict.label, styles: toneStyle(x.verdict.tone) }]),
      columnStyles: { 0: { cellWidth: 7, halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { cellWidth: 38 } },
    });
    chs.forEach(({ c, x }, i) => { y = chillerBlock(doc, y, c, x, `${sec}.${i + 1}`); });
    sec++;
  }

  // ── AHUs ─────────────────────────────────────────────────────────────────
  if (ahus.length) {
    doc.addPage();
    y = sectionTitle(doc, M_TOP, `${sec}. Chiller air-handling units`, "Cooling delivered by each AHU coil, worked the same way as for the air conditioners. With make-up air the fresh-air and return-air streams are each taken down to the supply condition and added.");
    y = baseTable(doc, y, {
      head: [["#", "AHU", "Type", "Fan kW", "Flow m³/h", "Net TR", "kcal/h", "% rated", "Status"]],
      body: ahus.map(({ u, x }, i) => [String(i + 1), u.tag, AIR_UNIT_LABEL[u.unitType], fmt(x.kwUsed, 2), fmt(x.totalFlowCmh, 0), fmt(x.netTr, 2), fmt(x.netKcalHr, 0), fmt(x.capacityPct, 0), { content: x.verdict.label, styles: toneStyle(x.verdict.tone) }]),
      columnStyles: { 0: { cellWidth: 7, halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { cellWidth: 38 } },
    });
    ahus.forEach(({ u, x }, i) => { y = airUnitBlock(doc, y, u, x, `${sec}.${i + 1}`); });
    sec++;
  }

  // ── Cooling towers ───────────────────────────────────────────────────────
  if (cts.length) {
    doc.addPage();
    y = sectionTitle(doc, M_TOP, `${sec}. Cooling towers`, "Range = hot-water in − cold-water out; approach = cold-water out − ambient wet bulb; effectiveness = range / (range + approach). Evaporation loss = 0.00085 × 1.8 × flow × range; blow-down = evaporation / (COC − 1).");
    y = baseTable(doc, y, {
      head: [["#", "Tower", "Range °C", "Approach °C", "Effect. %", "L/G", "TR", "Evap. m³/h", "COC", "Make-up m³/h", "Status"]],
      body: cts.map(({ t, x }, i) => [String(i + 1), t.tag, fmt(x.range, 2), fmt(x.approach, 2), fmt(x.effectiveness, 1), fmt(x.lgRatio, 2), fmt(x.trGenerated, 1), fmt(x.evaporationCmh, 3), fmt(x.coc, 2), fmt(x.makeupCmh, 3), { content: x.verdict.label, styles: toneStyle(x.verdict.tone) }]),
      styles: { fontSize: 7.4 },
      columnStyles: { 0: { cellWidth: 7, halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { cellWidth: 32 } },
    });
    const withEff = cts.filter((c) => c.x.effectiveness !== null);
    if (withEff.length) {
      y = ensureSpace(doc, y, 60);
      barChart(doc, M_LEFT, y, CONTENT_W, 56, {
        title: "Cooling-tower effectiveness", unit: "%", labels: withEff.map((c) => c.t.tag), values: withEff.map((c) => c.x.effectiveness!),
        colors: withEff.map((c) => toneRGB(c.x.verdict.tone)), refLine: { value: BANDS.ctEffectiveness.good, label: `${BANDS.ctEffectiveness.good} %` },
      });
      y += 61;
    }
    cts.forEach(({ t, x }, i) => { y = ctBlock(doc, y, t, x, `${sec}.${i + 1}`); });
    sec++;
  }

  // ── Data record ──────────────────────────────────────────────────────────
  doc.addPage();
  y = sectionTitle(doc, M_TOP, `${sec}. Data record`, "Who took each reading and when. Records from several engineers are merged by equipment tag; where two copies existed, the most recently saved one is the one reported.");
  const all = [
    ...acs.map(({ u }) => ({ tag: u.tag, kind: AIR_UNIT_LABEL[u.unitType], r: u })),
    ...ahus.map(({ u }) => ({ tag: u.tag, kind: AIR_UNIT_LABEL[u.unitType], r: u })),
    ...chs.map(({ c }) => ({ tag: c.tag, kind: `Chiller — ${c.chillerType.replace("_", " + ")}`, r: c })),
    ...cts.map(({ t }) => ({ tag: t.tag, kind: "Cooling tower", r: t })),
  ];
  const byEngineer = new Map<string, number>();
  all.forEach((a) => byEngineer.set(txt(a.r.recordedBy, "Unknown"), (byEngineer.get(txt(a.r.recordedBy, "Unknown")) ?? 0) + 1));
  y = baseTable(doc, y, {
    head: [["Engineer", "Records"]],
    body: [...byEngineer.entries()].map(([k, v]) => [k, String(v)]),
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: "right" } },
  });
  y = baseTable(doc, y, {
    head: [["Tag", "Equipment", "Recorded by", "Recorded on", "Last saved"]],
    body: all.map((a) => [a.tag, a.kind, txt(a.r.recordedBy, "Unknown"), when(a.r.createdAt), when(a.r.updatedAt || a.r.createdAt)]),
    styles: { fontSize: 7.4 },
  });
  y = paragraph(doc, y, "Method notes",
    "Calculations follow the KISEM AC, Chiller and Cooling Tower analysis workbooks. Air enthalpy is worked from dry bulb and wet bulb / relative humidity with the ASHRAE psychrometric equations at 101.325 kPa. " +
    `The status bands are indicative: AC ≤ ${BANDS.acKwPerTr.good} kW/TR efficient, > ${BANDS.acKwPerTr.fair} poor; chillers ≤ ${BANDS.chillerKwPerTr.good} kW/TR efficient, > ${BANDS.chillerKwPerTr.fair} poor; cooling towers ≥ ${BANDS.ctEffectiveness.good} % effectiveness good when no design value is given; a chiller heat balance within ±${BANDS.heatBalancePct} % is accepted.`);

  drawChrome(doc, company);
  return doc.output("arraybuffer");
}

export function pdfFilename(companyName?: string | null): string {
  const today = new Date();
  const ddmm = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}`;
  return `ZeroDegree_${(companyName || "report").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}_${ddmm}.pdf`;
}
