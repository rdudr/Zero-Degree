import { NextResponse } from "next/server";
import { mailReport, normalisePayload, saveSubmission } from "@/lib/server/report";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = normalisePayload(body);
    if (!data.profile) return NextResponse.json({ error: "No company profile provided" }, { status: 400 });
    if (data.airUnits.length + data.chillers.length + data.coolingTowers.length === 0) {
      return NextResponse.json({ error: "No equipment recorded" }, { status: 400 });
    }
    const reporterName = String(body.reporterName || "Field Engineer");
    const recipients = Array.isArray(body.recipients) ? body.recipients : body.recipients ? [String(body.recipients)] : [];
    const jobId = String(body.jobId || crypto.randomUUID());

    const stored = await saveSubmission(jobId, reporterName, data);
    const sent = await mailReport(data, reporterName, recipients);
    return NextResponse.json({ ok: true, message: `Report sent via ${sent.via}`, recipients: sent.recipients, stored: stored.ok });
  } catch (err) {
    console.error("[SEND REPORT]", err);
    return NextResponse.json({ error: (err as Error).message || "Internal server error" }, { status: 500 });
  }
}
