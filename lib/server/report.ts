import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { generateReportPDF, pdfFilename } from "@/lib/pdf";
import { buildExcelBase64 } from "@/lib/excel";
import { tagKey } from "@/lib/merge";
import type { DataSet } from "@/lib/types";

export const ADMIN_EMAILS = [
  "loriyasagar.b@iitgn.ac.in",
  "abhay.maurya@iitgn.ac.in",
  "md.faizan@iitgn.ac.in",
  "rishabh.dangi@iitgn.ac.in",
  "dhruvit.patel@iitgn.ac.in",
  "rahuljayantibhai.p@iitgn.ac.in",
  "iea@iitgn.ac.in",
];

// CORS headers for the Capacitor mobile app and any cross-origin caller
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** The same arrays the device holds, defensively defaulted. */
export function normalisePayload(body: Partial<DataSet>): DataSet {
  return {
    profile: body.profile ?? null,
    airUnits: Array.isArray(body.airUnits) ? body.airUnits : [],
    chillers: Array.isArray(body.chillers) ? body.chillers : [],
    coolingTowers: Array.isArray(body.coolingTowers) ? body.coolingTowers : [],
  };
}

export const companyKeyOf = (name?: string | null) => tagKey(name || "");

/** Upserts on jobId, so a retried offline job never creates a second row. Non-fatal. */
export async function saveSubmission(jobId: string, reporterName: string, data: DataSet): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "DATABASE_URL not configured" };
  try {
    const row = {
      companyName: data.profile?.companyName || "Unknown",
      companyKey: companyKeyOf(data.profile?.companyName),
      reporterName,
      acCount: data.airUnits.filter((u) => u.category === "AC").length,
      chillerCount: data.chillers.length,
      ctCount: data.coolingTowers.length,
      payload: data as unknown as object,
    };
    await prisma.submission.upsert({ where: { jobId }, create: { jobId, ...row }, update: row });
    return { ok: true };
  } catch (e) {
    console.error("[db] submission save failed (non-fatal):", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

function logoDataUrl(): string | null {
  try {
    const p = path.join(process.cwd(), "public", "zero-degree-logo-sm.jpg");
    return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Builds the PDF + the PostMan workbook and mails them. SMTP when configured, otherwise Resend. */
export async function mailReport(data: DataSet, reporterName: string, extraRecipients: string[] = []) {
  const { profile } = data;
  const engineer = reporterName || "Field Engineer";
  const company = profile?.companyName || "Company";
  const pdf = Buffer.from(generateReportPDF(data, engineer, logoDataUrl()));
  const excel = buildExcelBase64(data, engineer);
  const attachments = [
    { filename: pdfFilename(profile?.companyName), content: pdf },
    { filename: excel.filename, content: Buffer.from(excel.base64, "base64") },
  ];

  const address = [profile?.area, profile?.district, profile?.state, profile?.pincode].filter(Boolean).join(", ") || "N/A";
  const finalTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const acs = data.airUnits.filter((u) => u.category === "AC").length;
  const ahus = data.airUnits.filter((u) => u.category === "AHU").length;
  const subject = `HVAC & Cooling Assessment — ${company}`;
  const html = `<div style="font-family: sans-serif; color: #333; line-height: 1.6;">
  <h2 style="color: #0c4a6e;">Zero Degree — HVAC &amp; Cooling Data Report</h2>
  <p>Dear Auditing Team,</p>
  <p><strong>${engineer}</strong> has collected the air-conditioning, chiller and cooling-tower data for <strong>${company}</strong>, located at:</p>
  <p style="padding-left: 20px; color: #666;"><em>${address}</em></p>
  <p>Data collection completed on <strong>${finalTime}</strong>.</p>
  <ul style="color: #666;">
    <li>Air conditioners: ${acs}</li>
    <li>Chillers: ${data.chillers.length}</li>
    <li>Chiller AHUs: ${ahus}</li>
    <li>Cooling towers: ${data.coolingTowers.length}</li>
  </ul>
  <p>Attached: the PDF assessment report and the Excel workbook that drops straight into PostMan.</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
  <p style="font-size: 12px; color: #999;">Zero Degree — HVAC &amp; Cooling Auditing Platform<br>IITGN Kisem Laboratory</p>
</div>`;

  const recipients = [...new Set([...extraRecipients.filter((r) => r.includes("@")), ...ADMIN_EMAILS])];

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({ from: `"Zero Degree" <${process.env.SMTP_USER}>`, to: recipients.join(", "), subject, html, attachments });
    return { via: "SMTP", recipients };
  }

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const res = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Zero Degree <noreply@resend.dev>",
      to: recipients,
      subject,
      html,
      attachments,
    });
    if (res.error) throw new Error(res.error.message || "Failed to send email");
    return { via: "Resend", recipients };
  }

  throw new Error("Email service not configured. Add SMTP_USER / SMTP_PASS or RESEND_API_KEY to the Vercel environment variables.");
}
